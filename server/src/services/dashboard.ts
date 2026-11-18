import { pool } from '../db/pool.js';
import { listFlows } from '../reconciliation/index.js';

export interface DashboardFilters {
  from?: string; // período (data do evento do registro)
  to?: string;
  procFrom?: string; // data de processamento (confirmação da importação)
  procTo?: string;
  fileType?: string;
  contract?: string;
  cpf?: string;
  status?: string; // status do batimento
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Monta o filtro de registros ativos (importações confirmadas) a partir dos filtros da tela. */
function recordFilter(f: DashboardFilters, params: unknown[]): string {
  const w = [`i.status = 'CONFIRMADO'`, 'r.valid'];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.from && ISO.test(f.from)) w.push(`COALESCE(r.event_date, i.generation_date, i.file_name_date) >= ${p(f.from)}`);
  if (f.to && ISO.test(f.to)) w.push(`COALESCE(r.event_date, i.generation_date, i.file_name_date) <= ${p(f.to)}`);
  if (f.procFrom && ISO.test(f.procFrom)) w.push(`i.confirmed_at::date >= ${p(f.procFrom)}`);
  if (f.procTo && ISO.test(f.procTo)) w.push(`i.confirmed_at::date <= ${p(f.procTo)}`);
  if (f.fileType) w.push(`r.file_type = ${p(f.fileType)}`);
  if (f.contract) w.push(`r.contract_key = ${p(f.contract.trim())}`);
  if (f.cpf) w.push(`ltrim(regexp_replace(r.cpf, '\\D', '', 'g'), '0') = ltrim(regexp_replace(${p(f.cpf)}, '\\D', '', 'g'), '0')`);
  return w.join(' AND ');
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function getDashboard(f: DashboardFilters) {
  const params: unknown[] = [];
  const where = recordFilter(f, params);
  const recs = `SELECT r.* FROM records r JOIN imports i ON i.id = r.import_id WHERE ${where}`;

  const kpi = await pool.query(
    `WITH recs AS (${recs})
     SELECT
       (SELECT count(DISTINCT contract_key) FROM recs WHERE contract_key IS NOT NULL)::int AS contratos_recebidos,
       (SELECT count(DISTINCT contract_key) FROM recs WHERE file_type = 'REM_CONTRATOS')::int AS contratos_distribuidos,
       (SELECT count(DISTINCT contract_key) FROM recs WHERE file_type IN ('RET_DISTRIBUICAO','RET_CARTEIRA'))::int AS contratos_retirados,
       (SELECT count(*) FROM contracts c WHERE c.status = 'ATIVO' AND c.contract_key IN (SELECT contract_key FROM recs))::int AS contratos_ativos,
       (SELECT count(DISTINCT ahid) FROM recs WHERE file_type = 'ACORDO_ASSESSORIA')::int AS acordos_realizados,
       (SELECT COALESCE(sum(a.total_amount), 0) FROM agreements a WHERE a.ahid IN (SELECT ahid FROM recs WHERE file_type = 'ACORDO_ASSESSORIA'))::text AS valor_negociado,
       (SELECT count(DISTINCT record_hash) FROM recs WHERE file_type = 'REPASSE')::int AS pagamentos_identificados,
       (SELECT COALESCE(sum(amount), 0) FROM (SELECT DISTINCT ON (record_hash) amount FROM recs WHERE file_type = 'REPASSE') x)::text AS valor_recebido,
       (SELECT count(DISTINCT ahid) FROM recs WHERE file_type = 'QUEBRA_ACORDO')::int AS acordos_quebrados`,
    params,
  );
  const k = kpi.rows[0];

  // Reconhecimento dos acordos pelo banco (fluxo B, regra ACORDO_X_BAT_ACORDO)
  const batAcordo = await pool.query(`SELECT 1 FROM imports WHERE file_type='BAT_ACORDO' AND status='CONFIRMADO' LIMIT 1`);
  let reconhecidos: number | null = null;
  let divergentes: number | null = null;
  if (batAcordo.rowCount) {
    const p2 = [...params];
    const r = await pool.query(
      `WITH recs AS (${recs})
       SELECT count(DISTINCT ahid) FILTER (WHERE status = 'CONCILIADO')::int AS ok,
              count(DISTINCT ahid) FILTER (WHERE status IN ('DIVERGENTE','SOMENTE_ORIGEM'))::int AS div
       FROM reconciliation_results WHERE flow = 'B_ACORDOS' AND rule = 'ACORDO_X_BAT_ACORDO'
         AND ahid IN (SELECT ahid FROM recs WHERE file_type = 'ACORDO_ASSESSORIA')`,
      p2,
    );
    reconhecidos = r.rows[0].ok;
    divergentes = r.rows[0].div;
  }

  // Pendências abertas (filtros de contrato/CPF/período de detecção)
  const dp: unknown[] = [];
  const dw = [`status IN ('ABERTA','EM_ANALISE')`];
  if (f.contract) {
    dp.push(f.contract.trim());
    dw.push(`contract_key = $${dp.length}`);
  }
  if (f.cpf) {
    dp.push(f.cpf);
    dw.push(`ltrim(regexp_replace(cpf, '\\D', '', 'g'), '0') = ltrim(regexp_replace($${dp.length}, '\\D', '', 'g'), '0')`);
  }
  if (f.fileType) {
    dp.push(f.fileType);
    dw.push(`(source_file IN (SELECT original_name FROM imports WHERE file_type = $${dp.length}) OR record_id IN (SELECT id FROM records WHERE file_type = $${dp.length}))`);
  }
  const pend = await pool.query(`SELECT category, count(*)::int AS n FROM divergences WHERE ${dw.join(' AND ')} GROUP BY category ORDER BY n DESC`, dp);
  const pendentes = pend.rows.reduce((s, r) => s + r.n, 0);

  // Percentual de conciliação por etapa
  const rp: unknown[] = [];
  const rw: string[] = [];
  if (f.contract) {
    rp.push(f.contract.trim());
    rw.push(`contract_key = $${rp.length}`);
  }
  if (f.status) {
    rp.push(f.status);
    rw.push(`status = $${rp.length}`);
  }
  const byFlow = await pool.query(
    `SELECT flow, status, count(*)::int AS n FROM reconciliation_results ${rw.length ? 'WHERE ' + rw.join(' AND ') : ''} GROUP BY flow, status`,
    rp,
  );
  const lastRuns = await pool.query(
    `SELECT DISTINCT ON (flow) flow, id, status, finished_at, summary FROM reconciliation_runs ORDER BY flow, id DESC`,
  );
  const runBy = new Map(lastRuns.rows.map((r) => [r.flow, r]));
  const etapas = listFlows().map((fl) => {
    const counts: Record<string, number> = {};
    for (const r of byFlow.rows.filter((x) => x.flow === fl.code)) counts[r.status] = r.n;
    const ok = counts.CONCILIADO ?? 0;
    const compared = ok + (counts.DIVERGENTE ?? 0) + (counts.SOMENTE_ORIGEM ?? 0) + (counts.SOMENTE_DESTINO ?? 0) + (counts.DUPLICADO ?? 0);
    const run = runBy.get(fl.code);
    return {
      flow: fl.code,
      title: fl.title,
      counts,
      compared,
      conciliated: ok,
      percent: pct(ok, compared),
      lastRun: run ? { id: run.id, status: run.status, finishedAt: run.finished_at, notes: run.summary?.notes ?? [] } : null,
    };
  });

  // Evolução: recebimentos por data de pagamento
  const evol = await pool.query(
    `WITH recs AS (${recs})
     SELECT event_date AS d, count(*)::int AS n, sum(amount)::text AS v
     FROM (SELECT DISTINCT ON (record_hash) event_date, amount FROM recs WHERE file_type = 'REPASSE') x
     WHERE event_date IS NOT NULL GROUP BY event_date ORDER BY event_date DESC LIMIT 31`,
    params,
  );

  return {
    kpis: { ...k, acordos_reconhecidos: reconhecidos, acordos_divergentes: divergentes, pendentes },
    pendenciasPorCategoria: pend.rows,
    etapas,
    evolucaoRecebimentos: evol.rows.reverse(),
    filtros: f,
  };
}
