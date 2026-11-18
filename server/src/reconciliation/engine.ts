/**
 * MOTOR DE BATIMENTO
 *
 * Cada fluxo lê somente registros válidos de importações CONFIRMADAS, aplica as
 * chaves de relacionamento definidas nos layouts e grava:
 *   - um resultado individual por registro (origem, destino, chave, motivo);
 *   - pendências persistentes (fingerprint) para o controle de divergências.
 * Fluxos cujas fontes não foram importadas são marcados como AGUARDANDO_ARQUIVOS,
 * sem gerar resultados simulados.
 */
import type pg from 'pg';
import { pool, withTransaction } from '../db/pool.js';
import { audit, type Actor } from '../services/audit.js';
import { autoResolveMissing, upsertDivergences, type DivergenceCategory, type DivergenceInput } from '../services/divergences.js';

export type ResultStatus =
  | 'CONCILIADO'
  | 'SOMENTE_ORIGEM'
  | 'SOMENTE_DESTINO'
  | 'DIVERGENTE'
  | 'DUPLICADO'
  | 'INFORMATIVO'
  | 'PENDENTE_CONFIGURACAO'
  | 'AGUARDANDO_ARQUIVO';

export interface ResultInput {
  rule: string;
  status: ResultStatus;
  key_name: string;
  key_value: string | null;
  contract_key?: string | null;
  cpf?: string | null;
  ahid?: string | null;
  source_type?: string | null;
  source_record_id?: string | null;
  target_type?: string | null;
  target_record_id?: string | null;
  field?: string | null;
  value_received?: string | null;
  value_expected?: string | null;
  reason?: string | null;
  event_date?: string | null;
}

export interface FlowNote {
  level: 'INFO' | 'ALERTA' | 'AGUARDANDO';
  text: string;
}

export class FlowContext {
  results: ResultInput[] = [];
  divergences: DivergenceInput[] = [];
  notes: FlowNote[] = [];
  constructor(
    public db: pg.PoolClient,
    public flow: string,
    public runId: number,
  ) {}

  result(r: ResultInput) {
    this.results.push(r);
  }

  /** Registra resultado e a pendência correspondente. */
  divergence(r: ResultInput, category: DivergenceCategory, fingerprintKey: string, extra: Partial<DivergenceInput> = {}) {
    this.results.push(r);
    this.divergences.push({
      fingerprint: `${this.flow}|${r.rule}|${fingerprintKey}${r.field ? '|' + r.field : ''}`,
      category,
      flow: this.flow,
      rule: r.rule,
      contract_key: r.contract_key ?? null,
      cpf: r.cpf ?? null,
      ahid: r.ahid ?? null,
      record_id: r.source_record_id ?? r.target_record_id ?? null,
      field: r.field ?? null,
      value_received: r.value_received ?? null,
      value_expected: r.value_expected ?? null,
      description: r.reason ?? null,
      ...extra,
    });
  }

  note(level: FlowNote['level'], text: string) {
    this.notes.push({ level, text });
  }
}

export interface FlowDef {
  code: string;
  title: string;
  description: string;
  sources: string[];
  /** Regras de relacionamento aplicadas (exibidas na tela de batimentos). */
  rules: string[];
  run(ctx: FlowContext): Promise<void>;
}

const registry: FlowDef[] = [];
export function registerFlow(f: FlowDef) {
  registry.push(f);
}
export function listFlows(): FlowDef[] {
  return registry;
}

async function insertResults(db: pg.PoolClient, runId: number, flow: string, results: ResultInput[]) {
  const CHUNK = 5000;
  for (let i = 0; i < results.length; i += CHUNK) {
    await db.query(
      `INSERT INTO reconciliation_results (run_id, flow, rule, status, key_name, key_value, contract_key, cpf, ahid, source_type,
         source_record_id, target_type, target_record_id, field, value_received, value_expected, reason, event_date)
       SELECT $2, $3, x.rule, x.status, x.key_name, x.key_value, x.contract_key, x.cpf, x.ahid, x.source_type,
         x.source_record_id, x.target_type, x.target_record_id, x.field, x.value_received, x.value_expected, x.reason, x.event_date
       FROM jsonb_to_recordset($1::jsonb) AS x(rule text, status text, key_name text, key_value text, contract_key text, cpf text,
         ahid bigint, source_type text, source_record_id bigint, target_type text, target_record_id bigint, field text,
         value_received text, value_expected text, reason text, event_date date)`,
      [JSON.stringify(results.slice(i, i + CHUNK)), runId, flow],
    );
  }
}

function summarize(ctx: FlowContext) {
  const byStatus: Record<string, number> = {};
  const byRule: Record<string, Record<string, number>> = {};
  for (const r of ctx.results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    (byRule[r.rule] ??= {})[r.status] = (byRule[r.rule][r.status] ?? 0) + 1;
  }
  return { total: ctx.results.length, byStatus, byRule, divergences: new Set(ctx.divergences.map((d) => d.fingerprint)).size, notes: ctx.notes };
}

/** Executa um fluxo de batimento de forma atômica (resultados anteriores do fluxo são substituídos). */
export async function runFlow(code: string, actor: Actor) {
  const flow = registry.find((f) => f.code === code);
  if (!flow) throw new Error(`Fluxo desconhecido: ${code}`);
  const run = await pool.query<{ id: number }>(
    `INSERT INTO reconciliation_runs (flow, status, started_by) VALUES ($1, 'EXECUTANDO', $2) RETURNING id`,
    [code, actor.id],
  );
  const runId = run.rows[0].id;
  try {
    const summary = await withTransaction(async (db) => {
      // Serializa execuções concorrentes do mesmo fluxo.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recon:${code}`]);
      const ctx = new FlowContext(db, code, runId);
      await flow.run(ctx);
      await db.query(`DELETE FROM reconciliation_results WHERE flow = $1`, [code]);
      await insertResults(db, runId, code, ctx.results);
      // Uma pendência por fingerprint (a mesma ocorrência pode ser detectada por mais de um registro).
      const unique = [...new Map(ctx.divergences.map((d) => [d.fingerprint, d])).values()];
      await upsertDivergences(db, unique, runId);
      const autoResolved = await autoResolveMissing(db, code, runId);
      const s = { ...summarize(ctx), autoResolved };
      const waiting = ctx.notes.some((n) => n.level === 'AGUARDANDO');
      const status = waiting && ctx.results.length === 0 ? 'AGUARDANDO_ARQUIVOS' : 'CONCLUIDO';
      await db.query(`UPDATE reconciliation_runs SET status=$2, finished_at=now(), summary=$3 WHERE id=$1`, [runId, status, JSON.stringify(s)]);
      await audit(actor, 'BATIMENTO_EXECUTADO', 'reconciliation_run', runId, { flow: code, total: s.total, divergences: s.divergences }, db);
      return s;
    });
    return { runId, flow: code, ...summary };
  } catch (e) {
    await pool.query(`UPDATE reconciliation_runs SET status='ERRO', finished_at=now(), message=$2 WHERE id=$1`, [runId, (e as Error).message]);
    throw e;
  }
}

/** Executa todos os fluxos na ordem de dependência (status de contratos/acordos primeiro). */
export async function runAllFlows(actor: Actor) {
  const out = [];
  for (const f of registry) out.push(await runFlow(f.code, actor));
  return out;
}
