import type { Db } from '../db/pool.js';

export type DivergenceCategory =
  | 'NAO_LOCALIZADO_BANCO'
  | 'NAO_LOCALIZADO_ASSESSORIA'
  | 'DIVERGENCIA_CADASTRAL'
  | 'DIVERGENCIA_VALOR'
  | 'DIVERGENCIA_DATA'
  | 'DUPLICIDADE'
  | 'PAGAMENTO_NAO_IDENTIFICADO'
  | 'ACORDO_NAO_RECONHECIDO'
  | 'CONTRATO_NAO_RECONHECIDO'
  | 'ARQUIVO_INVALIDO'
  | 'ERRO_LAYOUT';

export const CATEGORY_LABELS: Record<DivergenceCategory, string> = {
  NAO_LOCALIZADO_BANCO: 'Não localizado no banco',
  NAO_LOCALIZADO_ASSESSORIA: 'Não localizado na assessoria',
  DIVERGENCIA_CADASTRAL: 'Divergência cadastral',
  DIVERGENCIA_VALOR: 'Divergência de valor',
  DIVERGENCIA_DATA: 'Divergência de data',
  DUPLICIDADE: 'Duplicidade',
  PAGAMENTO_NAO_IDENTIFICADO: 'Pagamento não identificado',
  ACORDO_NAO_RECONHECIDO: 'Acordo não reconhecido',
  CONTRATO_NAO_RECONHECIDO: 'Contrato não reconhecido',
  ARQUIVO_INVALIDO: 'Arquivo inválido',
  ERRO_LAYOUT: 'Outros erros de layout',
};

export interface DivergenceInput {
  fingerprint: string;
  category: DivergenceCategory;
  flow?: string | null;
  rule?: string | null;
  contract_key?: string | null;
  cpf?: string | null;
  ahid?: string | null;
  import_id?: number | null;
  source_file?: string | null;
  record_id?: string | number | null;
  field?: string | null;
  value_received?: string | null;
  value_expected?: string | null;
  description?: string | null;
  occurrences?: number;
}

const COLS = `fingerprint text, category text, flow text, rule text, contract_key text, cpf text, ahid bigint,
  import_id int, source_file text, record_id bigint, field text, value_received text, value_expected text,
  description text, occurrences int`;

/**
 * Registra (ou atualiza) pendências identificadas por fingerprint.
 * Uma pendência resolvida que volta a ser detectada é reaberta; justificadas são mantidas.
 */
export async function upsertDivergences(db: Db, items: DivergenceInput[], runId: number | null): Promise<void> {
  const CHUNK = 2000;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK).map((d) => ({ occurrences: 1, ...d }));
    await db.query(
      `INSERT INTO divergences (fingerprint, category, flow, rule, contract_key, cpf, ahid, import_id, source_file, record_id,
         field, value_received, value_expected, description, occurrences, last_run_id)
       SELECT x.fingerprint, x.category, x.flow, x.rule, x.contract_key, x.cpf, x.ahid, x.import_id, x.source_file, x.record_id,
         x.field, x.value_received, x.value_expected, x.description, COALESCE(x.occurrences, 1), $2
       FROM jsonb_to_recordset($1::jsonb) AS x(${COLS})
       ON CONFLICT (fingerprint) DO UPDATE SET
         category = EXCLUDED.category, rule = EXCLUDED.rule, contract_key = EXCLUDED.contract_key, cpf = EXCLUDED.cpf,
         ahid = EXCLUDED.ahid, import_id = EXCLUDED.import_id, source_file = EXCLUDED.source_file, record_id = EXCLUDED.record_id,
         value_received = EXCLUDED.value_received, value_expected = EXCLUDED.value_expected,
         description = EXCLUDED.description, occurrences = EXCLUDED.occurrences,
         last_detected_at = now(), last_run_id = EXCLUDED.last_run_id,
         status = CASE WHEN divergences.status IN ('RESOLVIDA', 'RESOLVIDA_AUTOMATICAMENTE') THEN 'ABERTA' ELSE divergences.status END,
         resolution_note = CASE WHEN divergences.status IN ('RESOLVIDA', 'RESOLVIDA_AUTOMATICAMENTE')
           THEN COALESCE(divergences.resolution_note || ' | ', '') || 'Reaberta: ocorrência detectada novamente em ' || to_char(now(), 'DD/MM/YYYY HH24:MI')
           ELSE divergences.resolution_note END`,
      [JSON.stringify(chunk), runId],
    );
  }
}

/** Encerra automaticamente pendências do fluxo que não foram mais detectadas na execução vigente. */
export async function autoResolveMissing(db: Db, flow: string, runId: number): Promise<number> {
  const r = await db.query(
    `UPDATE divergences SET status = 'RESOLVIDA_AUTOMATICAMENTE', resolved_at = now(),
       resolution_note = COALESCE(resolution_note || ' | ', '') || 'Não detectada na execução #' || $2::text || ' do batimento'
     WHERE flow = $1 AND status IN ('ABERTA', 'EM_ANALISE') AND (last_run_id IS DISTINCT FROM $2)`,
    [flow, runId],
  );
  return r.rowCount ?? 0;
}
