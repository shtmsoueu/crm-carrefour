import type pg from 'pg';

export interface Rec {
  id: string;
  import_id: number;
  import_name: string;
  file_type: string;
  record_type: string;
  line_number: number;
  contract_key: string | null;
  cpf: string | null;
  ahid: string | null;
  event_date: string | null;
  amount: string | null;
  record_hash: string;
  dup_in_file: boolean;
  /** Data de referência do arquivo: data de geração do header, ou data do nome do arquivo. */
  file_date: string | null;
  fields: Record<string, string | null>;
}

const SELECT = `SELECT r.id::text, r.import_id, i.original_name AS import_name, r.file_type, r.record_type, r.line_number,
  r.contract_key, r.cpf, r.ahid::text AS ahid, r.event_date, r.amount::text AS amount, r.record_hash, r.dup_in_file,
  COALESCE(i.generation_date, i.file_name_date) AS file_date, r.fields`;

const BASE = `FROM records r JOIN imports i ON i.id = r.import_id AND i.status = 'CONFIRMADO'`;

/** Todos os registros válidos de importações confirmadas de um tipo. */
export async function loadAll(db: pg.PoolClient, fileType: string, recordType?: string): Promise<Rec[]> {
  const r = await db.query<Rec>(
    `${SELECT} ${BASE} WHERE r.file_type = $1 AND r.valid ${recordType ? 'AND r.record_type = $2' : ''}
     ORDER BY COALESCE(i.generation_date, i.file_name_date), i.id, r.line_number`,
    recordType ? [fileType, recordType] : [fileType],
  );
  return r.rows;
}

/** Registros válidos da importação confirmada mais recente de um tipo (fotografia vigente). */
export async function loadLatestImport(db: pg.PoolClient, fileType: string, recordType?: string): Promise<{ importId: number | null; fileDate: string | null; rows: Rec[] }> {
  const imp = await db.query<{ id: number; file_date: string | null }>(
    `SELECT id, COALESCE(generation_date, file_name_date) AS file_date FROM imports
     WHERE file_type = $1 AND status = 'CONFIRMADO' ORDER BY COALESCE(generation_date, file_name_date) DESC NULLS LAST, id DESC LIMIT 1`,
    [fileType],
  );
  if (!imp.rows[0]) return { importId: null, fileDate: null, rows: [] };
  const r = await db.query<Rec>(
    `${SELECT} ${BASE} WHERE r.import_id = $1 AND r.valid ${recordType ? 'AND r.record_type = $2' : ''} ORDER BY r.line_number`,
    recordType ? [imp.rows[0].id, recordType] : [imp.rows[0].id],
  );
  return { importId: imp.rows[0].id, fileDate: imp.rows[0].file_date, rows: r.rows };
}

/**
 * Para arquivos-fotografia (ACORDO_ASSESSORIA, BAT_ACORDO, BAT_ACORDO_PGTO): todos os
 * registros de um AHID provenientes da importação mais recente que contém aquele AHID.
 */
export async function loadLatestPerAhid(db: pg.PoolClient, fileType: string): Promise<Map<string, Rec[]>> {
  const r = await db.query<Rec>(
    `WITH latest AS (
       SELECT DISTINCT ON (r.ahid) r.ahid, r.import_id ${BASE}
       WHERE r.file_type = $1 AND r.valid AND r.ahid IS NOT NULL
       ORDER BY r.ahid, COALESCE(i.generation_date, i.file_name_date) DESC NULLS LAST, i.id DESC)
     ${SELECT} ${BASE} JOIN latest l ON l.ahid = r.ahid AND l.import_id = r.import_id
     WHERE r.valid ORDER BY r.ahid, r.line_number`,
    [fileType],
  );
  const m = new Map<string, Rec[]>();
  for (const row of r.rows) {
    const list = m.get(row.ahid!) ?? [];
    list.push(row);
    m.set(row.ahid!, list);
  }
  return m;
}

/** Registro mais recente por contrato. */
export async function loadLatestPerContract(db: pg.PoolClient, fileType: string, dateExpr = 'COALESCE(r.event_date, i.generation_date, i.file_name_date)'): Promise<Map<string, Rec & { ref_date: string | null }>> {
  const r = await db.query<Rec & { ref_date: string | null }>(
    `SELECT DISTINCT ON (r.contract_key) ${SELECT.replace('SELECT ', '')}, ${dateExpr} AS ref_date ${BASE}
     WHERE r.file_type = $1 AND r.valid AND r.contract_key IS NOT NULL
     ORDER BY r.contract_key, ${dateExpr} DESC NULLS LAST, i.id DESC, r.line_number DESC`,
    [fileType],
  );
  return new Map(r.rows.map((x) => [x.contract_key!, x]));
}

/** Registro mais recente por contrato com data de referência até a data de corte (situação na data do batimento). */
export async function loadLatestPerContractUntil(db: pg.PoolClient, fileType: string, dateExpr = 'COALESCE(r.event_date, i.generation_date, i.file_name_date)', cutoff: string | null = null): Promise<Map<string, Rec & { ref_date: string | null }>> {
  const r = await db.query<Rec & { ref_date: string | null }>(
    `SELECT DISTINCT ON (r.contract_key) ${SELECT.replace('SELECT ', '')}, ${dateExpr} AS ref_date ${BASE}
     WHERE r.file_type = $1 AND r.valid AND r.contract_key IS NOT NULL AND ($2::date IS NULL OR ${dateExpr} IS NULL OR ${dateExpr} <= $2::date)
     ORDER BY r.contract_key, ${dateExpr} DESC NULLS LAST, i.id DESC, r.line_number DESC`,
    [fileType, cutoff],
  );
  return new Map(r.rows.map((x) => [x.contract_key!, x]));
}

/** Data mais antiga de arquivo confirmado de um tipo (início do histórico importado). */
export async function earliestFileDate(db: pg.PoolClient, fileType: string): Promise<string | null> {
  const r = await db.query<{ d: string | null }>(
    `SELECT MIN(COALESCE(generation_date, file_name_date)) AS d FROM imports WHERE file_type = $1 AND status = 'CONFIRMADO'`,
    [fileType],
  );
  return r.rows[0]?.d ?? null;
}

export async function hasConfirmed(db: pg.PoolClient, fileType: string): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM imports WHERE file_type = $1 AND status = 'CONFIRMADO' LIMIT 1`, [fileType]);
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Comparação de valores
// ---------------------------------------------------------------------------

export const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();
/** CPF/CNPJ: compara apenas dígitos, desconsiderando zeros à esquerda (campos com tamanhos diferentes entre layouts). */
export const normDoc = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^0+/, '');
export const numEq = (a: string | null | undefined, b: string | null | undefined) =>
  a !== null && a !== undefined && b !== null && b !== undefined && Number(a) === Number(b);

export function fmtMoney(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return Number(v).toFixed(2);
}
