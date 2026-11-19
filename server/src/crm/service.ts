/**
 * CONCILIAÇÃO EM MASSA COM O CRM EXTERNO
 *
 * - A exportação do CRM é armazenada (original compactado + linhas) e nunca alterada.
 * - O confronto cobre 100% das contas do escopo escolhido e 100% das linhas do CRM.
 * - Situações: CONFORME, NÃO IMPORTADO, DIVERGENTE e, à parte, NÃO CONSTA NA BASE
 *   (linha do CRM sem conta correspondente na base original — fora das três situações pedidas).
 * - Nada é escrito no CRM oficial.
 */
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { pool, withTransaction } from '../db/pool.js';
import { audit, type Actor } from '../services/audit.js';
import { getSetting, setSetting } from '../services/settings.js';
import { ImportError } from '../imports/service.js';
import { BASE_ATTRIBUTES, getPortfolioCached, type PortfolioRow } from '../portfolio/portfolio.js';
import { FLAG_LABELS } from '../portfolio/rules.js';
import { equivalent, normKey, normText, type Kind } from './compare.js';
import { parseCrmExport } from './parse.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export const SETTING_CRM_PROFILE = 'crm_perfil_conciliacao';

export interface Comparison {
  crmColumn: string;
  baseAttribute: keyof PortfolioRow;
  kind?: Kind;
  /** Equivalências de valores: valor no CRM -> valor na base (ex.: "Em dia" -> "ATIVO"). */
  equivalences?: { crm: string; base: string }[];
}
export interface CrmProfile {
  keyColumn: string;
  key: { stripLeadingZeros: boolean; digitsOnly: boolean };
  comparisons: Comparison[];
}
export type Scope = 'ATIVOS' | 'COM_CADASTRO' | 'TODOS';
export const SCOPES: Record<Scope, string> = {
  ATIVOS: 'Carteira ativa (contratos com situação ATIVO)',
  COM_CADASTRO: 'Contratos com cadastro (REM/BAT_CONTRATOS), inclusive retirados',
  TODOS: 'Todos os contratos presentes em qualquer arquivo importado',
};

const ATTR = new Map(BASE_ATTRIBUTES.map((a) => [a.key, a]));

export function validateProfile(p: unknown): CrmProfile {
  const v = p as CrmProfile;
  if (!v || typeof v.keyColumn !== 'string' || !v.keyColumn.trim()) throw new ImportError('Informe a coluna do CRM que contém o número do contrato (chave).');
  if (!Array.isArray(v.comparisons)) throw new ImportError('Lista de campos a comparar inválida.');
  for (const c of v.comparisons) {
    if (!c.crmColumn || !ATTR.has(c.baseAttribute)) throw new ImportError(`Campo de comparação inválido: ${c.crmColumn} x ${String(c.baseAttribute)}`);
    if (c.kind && !['text', 'number', 'date'].includes(c.kind)) throw new ImportError(`Tipo de comparação inválido em ${c.crmColumn}.`);
  }
  return {
    keyColumn: v.keyColumn,
    key: { stripLeadingZeros: v.key?.stripLeadingZeros !== false, digitsOnly: !!v.key?.digitsOnly },
    comparisons: v.comparisons.map((c) => ({ ...c, equivalences: (c.equivalences ?? []).filter((e) => e && String(e.crm).trim() !== '') })),
  };
}

export const getProfile = () => getSetting<CrmProfile>(SETTING_CRM_PROFILE);
export async function saveProfile(p: unknown, actor: Actor) {
  const v = validateProfile(p);
  await setSetting(SETTING_CRM_PROFILE, v, actor.id);
  await audit(actor, 'CRM_PERFIL_ALTERADO', 'settings', SETTING_CRM_PROFILE, v);
  return v;
}

// ---------------------------------------------------------------- Exportações do CRM
export async function createSnapshot(buf: Buffer, originalName: string, actor: Actor) {
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const dup = await pool.query(`SELECT id FROM crm_snapshots WHERE sha256 = $1 AND status = 'ATIVO'`, [sha256]);
  if (dup.rows[0]) throw new ImportError(`Esta exportação do CRM já foi carregada (carga #${dup.rows[0].id}).`, 409, { snapshotId: dup.rows[0].id });
  let t;
  try {
    t = await parseCrmExport(buf, originalName);
  } catch (e) {
    throw new ImportError(`Não foi possível ler a exportação do CRM: ${(e as Error).message}`);
  }
  if (!t.rows.length) throw new ImportError('A exportação do CRM não contém linhas de dados.');
  const id = await withTransaction(async (db) => {
    const r = await db.query<{ id: number }>(
      `INSERT INTO crm_snapshots (original_name, sha256, size_bytes, format, delimiter, encoding, headers, rows_count, warnings, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [originalName, sha256, buf.length, t.format, t.delimiter, t.encoding, JSON.stringify(t.headers), t.rows.length, JSON.stringify(t.warnings), actor.id],
    );
    const sid = r.rows[0].id;
    await db.query(`INSERT INTO crm_snapshot_files (snapshot_id, content) VALUES ($1, $2)`, [sid, await gzip(buf)]);
    for (let i = 0; i < t.rows.length; i += 2000) {
      await db.query(
        `INSERT INTO crm_snapshot_rows (snapshot_id, row_number, data)
         SELECT $1, (x.n)::int, x.d FROM jsonb_to_recordset($2::jsonb) AS x(n int, d jsonb)`,
        [sid, JSON.stringify(t.rows.slice(i, i + 2000).map((d, j) => ({ n: i + j + 2, d })))],
      );
    }
    await audit(actor, 'CRM_EXPORTACAO_CARREGADA', 'crm_snapshot', sid, { file: originalName, rows: t.rows.length, format: t.format }, db);
    return sid;
  });
  return getSnapshot(id);
}

export async function getSnapshot(id: number) {
  const r = await pool.query(
    `SELECT s.id, s.original_name, s.sha256, s.size_bytes, s.format, s.delimiter, s.encoding, s.headers, s.rows_count, s.warnings, s.status,
       s.uploaded_at, u.name AS uploaded_by_name FROM crm_snapshots s LEFT JOIN users u ON u.id = s.uploaded_by WHERE s.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new ImportError('Exportação do CRM não encontrada.', 404);
  const sample = await pool.query(`SELECT row_number, data FROM crm_snapshot_rows WHERE snapshot_id = $1 ORDER BY row_number LIMIT 20`, [id]);
  return { ...r.rows[0], sample: sample.rows };
}

export async function readSnapshotFile(id: number): Promise<Buffer | null> {
  const r = await pool.query<{ content: Buffer }>(`SELECT content FROM crm_snapshot_files WHERE snapshot_id = $1`, [id]);
  return r.rows[0] ? gunzip(r.rows[0].content) : null;
}

/** Sugestão de mapeamento pelo nome das colunas (o usuário revisa e confirma antes de salvar). */
export function suggestProfile(headers: string[]): CrmProfile {
  const h = headers.map((x) => ({ x, n: normText(x) }));
  const find = (...re: RegExp[]) => h.find(({ n }) => re.some((r) => r.test(n)))?.x;
  const key = find(/^(CONTRATO|NUMERO DO CONTRATO|N CONTRATO|NR CONTRATO|DMACCT|CONTA|NUMERO DA CONTA)$/, /CONTRATO/, /CONTA/) ?? headers[0];
  const comparisons: Comparison[] = [];
  const add = (col: string | undefined, attr: keyof PortfolioRow) => col && col !== key && comparisons.push({ crmColumn: col, baseAttribute: attr, kind: ATTR.get(attr)!.kind, equivalences: [] });
  add(find(/^(CPF|CNPJ|CPF\/CNPJ|CPF CNPJ|DOCUMENTO|DMSSNUM)$/, /CPF/), 'cpf');
  add(find(/^STATUS$/, /STATUS/, /SITUACAO/), 'status_contrato');
  add(find(/PARCELA/), 'parcelas');
  add(find(/CANAL/), 'canal_acordo');
  add(find(/AHCOLLID/), 'origem_ahcollid');
  add(find(/DIAS/, /ATRASO/), 'dias_atraso');
  add(find(/RANKING/), 'ranking');
  add(find(/FAIXA/), 'faixa_codigo');
  add(find(/PRODUTO/), 'produto');
  return { keyColumn: key, key: { stripLeadingZeros: true, digitsOnly: false }, comparisons };
}

// ---------------------------------------------------------------- Execução da conciliação
const BASE_SNAPSHOT_FIELDS: (keyof PortfolioRow)[] = [
  'cpf', 'nome', 'status_contrato', 'produto', 'origem', 'origem_ahcollid', 'grupo', 'ranking', 'faixa_codigo', 'dias_atraso', 'saldo_risco',
  'acordo_id', 'acordo_status', 'parcelas', 'canal_acordo', 'ultimo_pagamento_codigo', 'comissao_linhas', 'comissao_valor_recebido', 'comissao_remuneracao_bruta',
];

export async function runReconciliation(snapshotId: number, scope: Scope, actor: Actor) {
  if (!SCOPES[scope]) throw new ImportError('Escopo inválido.');
  const profile = await getProfile();
  if (!profile) throw new ImportError('Configure o mapeamento de colunas do CRM antes de executar a conciliação.', 409);
  const snap = await getSnapshot(snapshotId);
  if (snap.status !== 'ATIVO') throw new ImportError('Esta exportação do CRM foi cancelada.', 409);
  const headers = snap.headers as string[];
  const missing = [profile.keyColumn, ...profile.comparisons.map((c) => c.crmColumn)].filter((c) => !headers.includes(c));
  if (missing.length) throw new ImportError(`Colunas do mapeamento não encontradas nesta exportação: ${missing.join(', ')}.`, 422);

  const { rows: portfolio, settings } = await getPortfolioCached();
  const run = await pool.query<{ id: number }>(
    `INSERT INTO crm_recon_runs (snapshot_id, scope, profile, rules, status, started_by) VALUES ($1,$2,$3,$4,'EXECUTANDO',$5) RETURNING id`,
    [snapshotId, scope, JSON.stringify(profile), JSON.stringify({ carteira: settings }), actor.id],
  );
  const runId = run.rows[0].id;
  try {
    const t0 = Date.now();
    const crmRows = await pool.query<{ row_number: number; data: Record<string, string> }>(`SELECT row_number, data FROM crm_snapshot_rows WHERE snapshot_id = $1 ORDER BY row_number`, [snapshotId]);
    const ko = profile.key;
    const crmBy = new Map<string, { row_number: number; data: Record<string, string> }[]>();
    let blankKeys = 0;
    for (const r of crmRows.rows) {
      const k = normKey(r.data[profile.keyColumn], ko);
      if (!k) {
        blankKeys++;
        continue;
      }
      const l = crmBy.get(k);
      if (l) l.push(r);
      else crmBy.set(k, [r]);
    }
    const inScope = portfolio.filter((p) => scope === 'TODOS' || (scope === 'ATIVOS' ? p.status_contrato === 'ATIVO' : p.fonte_cadastro !== null));
    const allBy = new Map(portfolio.map((p) => [normKey(p.contrato, ko), p]));
    const baseKeys = new Set<string>();
    const equivMaps = profile.comparisons.map((c) => new Map((c.equivalences ?? []).map((e) => [normText(e.crm), String(e.base)])));

    const items: Record<string, unknown>[] = [];
    const fieldCounts: Record<string, number> = {};
    let duplicated = 0;
    const baseSnap = (p: PortfolioRow) => Object.fromEntries(BASE_SNAPSHOT_FIELDS.map((k) => [k, p[k]]));

    for (const p of inScope) {
      const k = normKey(p.contrato, ko);
      if (baseKeys.has(k)) {
        // duas contas da base com a mesma chave normalizada (ex.: zeros à esquerda)
        items.push({ contrato: p.contrato, situacao: 'DIVERGENTE', motivo: 'Chave duplicada na base original após normalização', duplicado: true, base: baseSnap(p) });
        continue;
      }
      baseKeys.add(k);
      const found = crmBy.get(k);
      if (!found) {
        items.push({ contrato: p.contrato, situacao: 'NAO_IMPORTADO', motivo: 'Conta da base original não localizada no CRM', base: baseSnap(p) });
        continue;
      }
      const div: { campo: string; atributo: string; coluna_crm: string; base: unknown; crm: unknown }[] = [];
      if (found.length > 1) {
        duplicated++;
        div.push({ campo: 'REGISTRO DUPLICADO NO CRM', atributo: 'contrato', coluna_crm: profile.keyColumn, base: 1, crm: found.length });
      }
      const c0 = found[0].data;
      profile.comparisons.forEach((c, i) => {
        const attr = ATTR.get(c.baseAttribute)!;
        const kind = c.kind ?? attr.kind;
        const bv = p[c.baseAttribute];
        // Em duplicidades, todas as linhas do CRM são confrontadas.
        for (const r of found) {
          const cv = r.data[c.crmColumn];
          if (!equivalent(kind, bv, cv, equivMaps[i])) {
            div.push({ campo: attr.label, atributo: String(c.baseAttribute), coluna_crm: c.crmColumn, base: bv ?? null, crm: cv ?? null });
            fieldCounts[attr.label] = (fieldCounts[attr.label] ?? 0) + 1;
            break;
          }
        }
      });
      items.push({
        contrato: p.contrato,
        situacao: div.length ? 'DIVERGENTE' : 'CONFORME',
        motivo: div.length ? `${div.length} inconsistência(s)` : 'Todos os campos conferem',
        duplicado: found.length > 1,
        crm_rows: found.map((r) => r.row_number),
        divergencias: div.length ? div : null,
        base: baseSnap(p),
        crm: c0,
      });
    }
    // Linhas do CRM sem conta correspondente no escopo da base
    let foraEscopo = 0;
    let semBase = 0;
    for (const [k, list] of crmBy) {
      if (baseKeys.has(k)) continue;
      const p = allBy.get(k);
      if (p) foraEscopo++;
      else semBase++;
      items.push({
        contrato: p?.contrato ?? list[0].data[profile.keyColumn],
        situacao: 'NAO_CONSTA_NA_BASE',
        motivo: p
          ? `Conta existe na base original, mas fora do escopo (situação ${p.status_contrato})`
          : 'Conta do CRM não localizada em nenhum arquivo importado da base original',
        duplicado: list.length > 1,
        crm_rows: list.map((r) => r.row_number),
        base: p ? baseSnap(p) : null,
        crm: list[0].data,
      });
    }

    const count = (s: string) => items.filter((i) => i.situacao === s).length;
    // Comissão: referência de remuneração — contas com comissão e sua situação no CRM.
    const comissao = { contas: 0, linhas: 0, valor_recebido: 0, nao_importadas: 0, valor_nao_importado: 0, divergentes: 0 };
    for (const it of items) {
      const b = it.base as Record<string, number> | null;
      if (!b || !b.comissao_linhas) continue;
      comissao.contas++;
      comissao.linhas += b.comissao_linhas;
      comissao.valor_recebido += b.comissao_valor_recebido;
      if (it.situacao === 'NAO_IMPORTADO') {
        comissao.nao_importadas++;
        comissao.valor_nao_importado += b.comissao_valor_recebido;
      }
      if (it.situacao === 'DIVERGENTE') comissao.divergentes++;
    }
    const flagCounts: Record<string, number> = {};
    for (const p of inScope) for (const f of p.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;

    const summary = {
      escopo: SCOPES[scope],
      base_contas: inScope.length,
      crm_linhas: crmRows.rows.length,
      crm_contas: crmBy.size,
      crm_linhas_sem_chave: blankKeys,
      conforme: count('CONFORME'),
      nao_importado: count('NAO_IMPORTADO'),
      divergente: count('DIVERGENTE'),
      nao_consta_na_base: count('NAO_CONSTA_NA_BASE'),
      nao_consta_fora_do_escopo: foraEscopo,
      nao_consta_sem_base: semBase,
      duplicados_no_crm: [...crmBy.values()].filter((l) => l.length > 1).length,
      divergencias_por_campo: fieldCounts,
      comissao,
      alertas_regras: Object.fromEntries(Object.entries(flagCounts).map(([k, v]) => [FLAG_LABELS[k as keyof typeof FLAG_LABELS] ?? k, v])),
      duracao_ms: 0,
    };

    await withTransaction(async (db) => {
      for (let i = 0; i < items.length; i += 2000) {
        await db.query(
          `INSERT INTO crm_recon_items (run_id, contrato, situacao, motivo, duplicado, crm_rows, divergencias, base, crm)
           SELECT $1, x.contrato, x.situacao, x.motivo, COALESCE(x.duplicado, false), x.crm_rows, x.divergencias, x.base, x.crm
           FROM jsonb_to_recordset($2::jsonb) AS x(contrato text, situacao text, motivo text, duplicado boolean, crm_rows int[], divergencias jsonb, base jsonb, crm jsonb)`,
          [runId, JSON.stringify(items.slice(i, i + 2000))],
        );
      }
      summary.duracao_ms = Date.now() - t0;
      await db.query(`UPDATE crm_recon_runs SET status='CONCLUIDO', finished_at=now(), summary=$2 WHERE id=$1`, [runId, JSON.stringify(summary)]);
      await audit(actor, 'CRM_CONCILIACAO_EXECUTADA', 'crm_recon_run', runId, { snapshotId, scope, conforme: summary.conforme, nao_importado: summary.nao_importado, divergente: summary.divergente }, db);
    });
    return { runId, ...summary };
  } catch (e) {
    await pool.query(`UPDATE crm_recon_runs SET status='ERRO', finished_at=now(), message=$2 WHERE id=$1`, [runId, (e as Error).message]);
    throw e;
  }
}
