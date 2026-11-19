import type pg from 'pg';
import { pool, withTransaction } from '../db/pool.js';
import { getLayout, LAYOUT_BY_CODE } from '../layouts/definitions.js';
import { identifyByFilename } from '../layouts/identify.js';
import type { FileTypeCode, LayoutDef } from '../layouts/types.js';
import { fileLines, parseLines, parseUnstructured, type ParsedRecord, type ParseResult, type UnstructuredConfig } from '../parsing/parser.js';
import { config } from '../config.js';
import { audit, type Actor } from '../services/audit.js';
import { getSetting, SETTING_REJEICAO } from '../services/settings.js';
import { upsertDivergences, type DivergenceInput } from '../services/divergences.js';
import { hashFile, materializeOriginal, removeTemp, saveOriginal } from './storage.js';

export class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}

const REJECTION_TYPES: FileTypeCode[] = ['REJ_CAMPANHA_EXT', 'REJ_CAMPANHA_INT'];
const ACTIVE_STATUSES = ['PRE_VISUALIZACAO', 'CONFIRMADO', 'VAZIO', 'SEM_LAYOUT', 'INVALIDO'];

class RecordBatcher {
  private buf: ParsedRecord[] = [];
  inserted = 0;
  constructor(
    private db: pg.PoolClient,
    private importId: number,
    private fileType: string,
  ) {}
  async add(r: ParsedRecord) {
    this.buf.push(r);
    if (this.buf.length >= config.insertBatchSize) await this.flush();
  }
  async flush() {
    if (!this.buf.length) return;
    const rows = this.buf;
    this.buf = [];
    const cols = 16;
    const values: unknown[] = [];
    const ph: string[] = [];
    rows.forEach((r, i) => {
      const b = i * cols;
      ph.push(`(${Array.from({ length: cols }, (_, k) => `$${b + k + 1}`).join(',')})`);
      values.push(
        this.importId,
        this.fileType,
        r.lineNumber,
        r.recordType,
        r.valid,
        r.contractKey,
        r.ahid,
        r.cpf,
        r.name,
        r.eventDate,
        r.amount,
        r.hash,
        r.isDuplicate,
        JSON.stringify(r.fields),
        r.raw,
        r.errors.length ? r.errors : null,
      );
    });
    await this.db.query(
      `INSERT INTO records (import_id, file_type, line_number, record_type, valid, contract_ref, ahid_ref, cpf, holder_name,
         event_date, amount, record_hash, dup_in_file, fields, raw, errors) VALUES ${ph.join(',')}`,
      values,
    );
    this.inserted += rows.length;
  }
}

async function parseStored(
  layout: LayoutDef,
  absPath: string,
  sink: (r: ParsedRecord) => Promise<void>,
  db: pg.PoolClient,
): Promise<ParseResult | null> {
  if (layout.layoutAvailable) return parseLines(fileLines(absPath, layout.encoding), layout, sink);
  if (REJECTION_TYPES.includes(layout.code)) {
    const cfg = await getSetting<UnstructuredConfig>(SETTING_REJEICAO, db);
    return parseUnstructured(fileLines(absPath, layout.encoding), layout, cfg, sink);
  }
  return null; // layout não fornecido: somente armazenamento
}

function decideStatus(layout: LayoutDef, res: ParseResult | null): { status: string; result: string } {
  if (!res) return { status: 'SEM_LAYOUT', result: 'Layout oficial não disponível no pacote: arquivo armazenado para auditoria, sem interpretação.' };
  if (res.empty) return { status: 'VAZIO', result: 'Arquivo vazio: nenhuma informação recebida. Não considerado processamento concluído.' };
  if (res.fileErrors > 0) return { status: 'INVALIDO', result: 'Arquivo fora do padrão do layout (header/trailer). Não pode ser confirmado.' };
  void layout;
  return { status: 'PRE_VISUALIZACAO', result: 'Interpretado. Aguardando conferência e confirmação.' };
}

async function saveIssues(db: pg.PoolClient, importId: number, res: ParseResult) {
  if (!res.issues.length) return;
  await db.query(
    `INSERT INTO import_issues (import_id, line_number, record_type, field, value, message, severity)
     SELECT $1, x.line, x."recordType", x.field, x.value, x.message, x.severity
     FROM jsonb_to_recordset($2::jsonb) AS x(line int, "recordType" text, field text, value text, message text, severity text)`,
    [importId, JSON.stringify(res.issues)],
  );
}

function statsParams(res: ParseResult | null) {
  return [
    res?.generationDate ?? null,
    res?.sequenceNumber ?? null,
    res?.headerVariant ?? null,
    res ? JSON.stringify(res.header.fields) : null,
    res ? JSON.stringify(res.trailer.fields) : null,
    res?.trailerCount ?? null,
    res?.trailerCountMatches ?? null,
    res?.totalLines ?? 0,
    res?.blankLines ?? 0,
    res?.dataLines ?? 0,
    res?.validRecords ?? 0,
    res?.rejectedRecords ?? 0,
    res?.duplicateRecords ?? 0,
    res ? JSON.stringify(res.byRecordType) : null,
    res ? JSON.stringify(res.issueCounts) : null,
    res?.fileErrors ?? 0,
  ];
}

/** Pendências de nível de arquivo (vazio, inválido, quantidade do trailer). */
async function fileLevelDivergences(db: pg.PoolClient, importId: number, fileType: string, name: string, status: string, res: ParseResult | null) {
  const items: DivergenceInput[] = [];
  const base = { flow: 'IMPORTACAO', import_id: importId, source_file: name };
  // Arquivo vazio não é pendência: a situação fica registrada na importação (status VAZIO),
  // pois a ausência de registros no dia é uma condição normal de operação.
  if (status === 'INVALIDO' && res) {
    const msgs = res.issues.filter((i) => i.severity === 'ERRO' && i.line === null).map((i) => i.message);
    items.push({ ...base, fingerprint: `IMP|${importId}|INVALIDO`, category: 'ARQUIVO_INVALIDO', rule: 'ESTRUTURA_ARQUIVO', description: msgs.join(' ') });
  }
  if (res?.trailerCountMatches === 'NAO_CONFERE') {
    items.push({
      ...base,
      fingerprint: `IMP|${importId}|TRAILER`,
      category: 'ARQUIVO_INVALIDO',
      rule: 'QUANTIDADE_TRAILER',
      field: 'TRAILER.QUANTIDADE',
      value_received: String(res.dataLines),
      value_expected: res.trailerCount === null ? null : String(res.trailerCount),
      description: 'Quantidade de registros do trailer não confere com o conteúdo do arquivo.',
    });
  }
  if (items.length) await upsertDivergences(db, items, null);
}

export interface CreateImportInput {
  tempPath: string;
  originalName: string;
  manualType?: string | null;
  actor: Actor;
}

export async function createImport(input: CreateImportInput) {
  const { tempPath, originalName, actor } = input;
  const ident = identifyByFilename(originalName);
  let code: FileTypeCode;
  let detection: 'AUTOMATICA' | 'MANUAL';
  const warnings: string[] = [...(ident?.warnings ?? [])];
  if (input.manualType) {
    if (!LAYOUT_BY_CODE.has(input.manualType as FileTypeCode)) throw new ImportError(`Tipo de arquivo inválido: ${input.manualType}`);
    code = input.manualType as FileTypeCode;
    detection = 'MANUAL';
    if (ident && ident.code !== code) warnings.push(`Tipo selecionado manualmente (${code}) difere do identificado pela nomenclatura (${ident.code}).`);
    if (!ident) warnings.push('Nome do arquivo fora da nomenclatura oficial do De-Para; tipo definido manualmente.');
  } else if (ident) {
    code = ident.code;
    detection = 'AUTOMATICA';
  } else {
    throw new ImportError('Não foi possível identificar o tipo do arquivo pela nomenclatura oficial. Selecione o tipo manualmente.', 422);
  }
  if (config.agencyCode && ident?.agency && ident.agency.toUpperCase() !== config.agencyCode.toUpperCase()) {
    warnings.push(`Código da assessoria no nome (${ident.agency}) difere do configurado (${config.agencyCode}).`);
  }

  const layout = getLayout(code);
  const { sha256, size } = await hashFile(tempPath);
  // Arquivos vazios têm o mesmo hash: a duplicidade é verificada pelo nome original + tipo.
  const dup =
    size > 0
      ? await pool.query(`SELECT id, original_name, status FROM imports WHERE sha256 = $1 AND size_bytes > 0 AND status = ANY($2) LIMIT 1`, [sha256, ACTIVE_STATUSES])
      : await pool.query(`SELECT id, original_name, status FROM imports WHERE size_bytes = 0 AND file_type = $1 AND original_name = $2 AND status = ANY($3) LIMIT 1`, [code, originalName, ACTIVE_STATUSES]);
  if (dup.rows[0]) {
    throw new ImportError(`Arquivo já importado (importação #${dup.rows[0].id}, ${dup.rows[0].original_name}, situação ${dup.rows[0].status}). Importação duplicada bloqueada.`, 409, { importId: dup.rows[0].id });
  }

  const importId = await withTransaction(async (db) => {
    // Serializa importações do mesmo conteúdo: um envio simultâneo do mesmo arquivo aguarda o
    // primeiro e então é bloqueado como duplicado (índice único em sha256 garante a integridade).
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`import:${sha256}`]);
    const again = size > 0
      ? await db.query(`SELECT id, original_name, status FROM imports WHERE sha256 = $1 AND size_bytes > 0 AND status = ANY($2) LIMIT 1`, [sha256, ACTIVE_STATUSES])
      : await db.query(`SELECT id, original_name, status FROM imports WHERE size_bytes = 0 AND file_type = $1 AND original_name = $2 AND status = ANY($3) LIMIT 1`, [code, originalName, ACTIVE_STATUSES]);
    if (again.rows[0]) {
      throw new ImportError(`Arquivo já importado (importação #${again.rows[0].id}, ${again.rows[0].original_name}, situação ${again.rows[0].status}). Importação duplicada bloqueada.`, 409, { importId: again.rows[0].id });
    }
    const ins = await db.query<{ id: number }>(
      `INSERT INTO imports (file_type, type_detection, original_name, stored_path, sha256, size_bytes, agency_code, file_name_date, status, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PRE_VISUALIZACAO',$9) RETURNING id`,
      [code, detection, originalName, 'db:import_files', sha256, size, ident?.agency ?? null, ident?.fileDate ?? null, actor.id],
    );
    const id = ins.rows[0].id;
    await saveOriginal(db, id, tempPath);
    const batcher = new RecordBatcher(db, id, code);
    const res = await parseStored(layout, tempPath, (r) => batcher.add(r), db);
    await batcher.flush();
    for (const w of warnings) res?.issues.unshift({ line: null, recordType: null, field: null, value: null, message: w, severity: 'ALERTA' });

    // Duplicidade por controle do header (mesmo tipo + data de geração + sequência)
    if (res?.sequenceNumber && res.generationDate) {
      const seqDup = await db.query(
        `SELECT id FROM imports WHERE file_type = $1 AND sequence_number = $2 AND generation_date = $3 AND id <> $4 AND status = ANY($5) LIMIT 1`,
        [code, res.sequenceNumber, res.generationDate, id, ACTIVE_STATUSES],
      );
      if (seqDup.rows[0]) {
        throw new ImportError(
          `Arquivo com mesma sequência (${res.sequenceNumber}) e data de geração já importado (importação #${seqDup.rows[0].id}). Importação duplicada bloqueada.`,
          409,
          { importId: seqDup.rows[0].id },
        );
      }
    }

    const st = decideStatus(layout, res);
    await db.query(
      `UPDATE imports SET generation_date=$2, sequence_number=$3, header_variant=$4, header=$5, trailer=$6, trailer_count=$7,
         trailer_count_match=$8, total_lines=$9, blank_lines=$10, data_records=$11, valid_records=$12, rejected_records=$13,
         duplicate_records=$14, by_record_type=$15, issue_counts=$16, file_errors=$17, status=$18, processing_result=$19
       WHERE id=$1`,
      [id, ...statsParams(res), st.status, st.result],
    );
    if (res) await saveIssues(db, id, res);
    await fileLevelDivergences(db, id, code, originalName, st.status, res);
    await audit(actor, 'IMPORTACAO_ENVIADA', 'import', id, { file: originalName, type: code, detection, status: st.status, sha256 }, db);
    return id;
  });
  return getImport(importId);
}

export async function getImport(id: number) {
  const r = await pool.query(
    `SELECT i.*, u.name AS uploaded_by_name, c.name AS confirmed_by_name
     FROM imports i LEFT JOIN users u ON u.id = i.uploaded_by LEFT JOIN users c ON c.id = i.confirmed_by WHERE i.id = $1`,
    [id],
  );
  if (!r.rows[0]) throw new ImportError('Importação não encontrada', 404);
  return r.rows[0];
}

/** Vincula registros às entidades de domínio (contratos e acordos) — idempotente. */
async function linkDomain(db: pg.PoolClient, importId: number) {
  await db.query(
    `INSERT INTO contracts (contract_key, cpf, name, first_import_id)
     SELECT DISTINCT ON (contract_ref) contract_ref, cpf, holder_name, import_id
     FROM records WHERE import_id = $1 AND contract_ref IS NOT NULL
     ORDER BY contract_ref, (cpf IS NULL), (holder_name IS NULL), line_number
     ON CONFLICT (contract_key) DO UPDATE SET
       cpf = COALESCE(contracts.cpf, EXCLUDED.cpf), name = COALESCE(contracts.name, EXCLUDED.name), updated_at = now()`,
    [importId],
  );
  await db.query(
    `INSERT INTO agreements (ahid, contract_key)
     SELECT DISTINCT ON (ahid_ref) ahid_ref, contract_ref FROM records
     WHERE import_id = $1 AND ahid_ref IS NOT NULL ORDER BY ahid_ref, (contract_ref IS NULL), line_number
     ON CONFLICT (ahid) DO UPDATE SET contract_key = COALESCE(agreements.contract_key, EXCLUDED.contract_key), updated_at = now()`,
    [importId],
  );
  await db.query(`UPDATE records SET contract_key = contract_ref, ahid = ahid_ref WHERE import_id = $1`, [importId]);
}

/** Pendências "Outros erros de layout" para registros rejeitados. */
async function recordLevelDivergences(db: pg.PoolClient, importId: number, fileType: string, name: string) {
  const rej = await db.query(
    `SELECT id, line_number, contract_ref, cpf, ahid_ref, errors, record_type FROM records WHERE import_id = $1 AND NOT valid`,
    [importId],
  );
  const items: DivergenceInput[] = rej.rows.map((r) => ({
    fingerprint: `IMP|${importId}|L${r.line_number}`,
    category: 'ERRO_LAYOUT',
    flow: 'IMPORTACAO',
    rule: 'REGISTRO_REJEITADO',
    contract_key: r.contract_ref,
    cpf: r.cpf,
    ahid: r.ahid_ref,
    import_id: importId,
    source_file: name,
    record_id: r.id,
    field: (r.errors as string[] | null)?.map((e) => e.split(':')[0]).join(', ') ?? null,
    description: `${fileType} linha ${r.line_number} (registro tipo ${r.record_type}) rejeitada: ${(r.errors ?? []).join('; ')}`,
  }));
  if (items.length) await upsertDivergences(db, items, null);
}

export async function confirmImport(id: number, actor: Actor) {
  await withTransaction(async (db) => {
    const r = await db.query(`SELECT * FROM imports WHERE id = $1 FOR UPDATE`, [id]);
    const imp = r.rows[0];
    if (!imp) throw new ImportError('Importação não encontrada', 404);
    if (imp.status !== 'PRE_VISUALIZACAO') throw new ImportError(`Importação na situação ${imp.status} não pode ser confirmada.`, 409);
    await linkDomain(db, id);
    await recordLevelDivergences(db, id, imp.file_type, imp.original_name);
    const result =
      imp.rejected_records > 0
        ? `Confirmado com ${imp.valid_records} registro(s) válido(s) e ${imp.rejected_records} rejeitado(s).`
        : `Confirmado: ${imp.valid_records} registro(s) válido(s).`;
    await db.query(`UPDATE imports SET status='CONFIRMADO', confirmed_by=$2, confirmed_at=now(), processing_result=$3 WHERE id=$1`, [id, actor.id, result]);
    await audit(actor, 'IMPORTACAO_CONFIRMADA', 'import', id, { valid: imp.valid_records, rejected: imp.rejected_records }, db);
  });
  return getImport(id);
}

export async function discardImport(id: number, actor: Actor, reason: string | null) {
  await withTransaction(async (db) => {
    const r = await db.query(`SELECT * FROM imports WHERE id = $1 FOR UPDATE`, [id]);
    const imp = r.rows[0];
    if (!imp) throw new ImportError('Importação não encontrada', 404);
    if (!['PRE_VISUALIZACAO', 'INVALIDO', 'VAZIO', 'SEM_LAYOUT'].includes(imp.status)) {
      throw new ImportError(`Importação na situação ${imp.status} não pode ser descartada. Utilize o cancelamento.`, 409);
    }
    // Registros de pré-visualização nunca foram processados; o arquivo original e o log permanecem.
    const del = await db.query(`DELETE FROM records WHERE import_id = $1`, [id]);
    await db.query(
      `UPDATE imports SET status='DESCARTADO', cancelled_by=$2, cancelled_at=now(), cancel_reason=$3,
         processing_result = 'Descartado na pré-visualização (' || $4::text || ' registro(s) interpretado(s) não processados).' WHERE id=$1`,
      [id, actor.id, reason, del.rowCount ?? 0],
    );
    await db.query(`UPDATE divergences SET status='RESOLVIDA_AUTOMATICAMENTE', resolved_at=now(), resolution_note='Importação descartada' WHERE import_id=$1 AND status IN ('ABERTA','EM_ANALISE')`, [id]);
    await audit(actor, 'IMPORTACAO_DESCARTADA', 'import', id, { reason, previewRecords: del.rowCount }, db);
  });
  return getImport(id);
}

export async function cancelImport(id: number, actor: Actor, reason: string) {
  if (!reason?.trim()) throw new ImportError('Informe o motivo do cancelamento.');
  await withTransaction(async (db) => {
    const r = await db.query(`SELECT * FROM imports WHERE id = $1 FOR UPDATE`, [id]);
    const imp = r.rows[0];
    if (!imp) throw new ImportError('Importação não encontrada', 404);
    if (imp.status !== 'CONFIRMADO') throw new ImportError('Somente importações confirmadas podem ser canceladas.', 409);
    // Registros permanecem armazenados (rastreabilidade), mas deixam de compor batimentos e indicadores.
    await db.query(
      `UPDATE imports SET status='CANCELADO', cancelled_by=$2, cancelled_at=now(), cancel_reason=$3,
         processing_result = 'Cancelado: registros mantidos para auditoria e excluídos dos batimentos.' WHERE id=$1`,
      [id, actor.id, reason],
    );
    await db.query(`UPDATE divergences SET status='RESOLVIDA_AUTOMATICAMENTE', resolved_at=now(), resolution_note='Importação cancelada' WHERE import_id=$1 AND status IN ('ABERTA','EM_ANALISE')`, [id]);
    await audit(actor, 'IMPORTACAO_CANCELADA', 'import', id, { reason }, db);
  });
  return getImport(id);
}

/**
 * Reprocessamento controlado: reinterpreta o arquivo original armazenado com as
 * definições vigentes, substituindo os registros DA PRÓPRIA importação (sem duplicar).
 */
export async function reprocessImport(id: number, actor: Actor) {
  const before = await getImport(id);
  if (!['PRE_VISUALIZACAO', 'CONFIRMADO', 'INVALIDO'].includes(before.status)) {
    throw new ImportError(`Importação na situação ${before.status} não pode ser reprocessada.`, 409);
  }
  await withTransaction(async (db) => {
    await db.query(`SELECT id FROM imports WHERE id = $1 FOR UPDATE`, [id]);
    const layout = getLayout(before.file_type);
    await db.query(`DELETE FROM reconciliation_results WHERE source_record_id IN (SELECT id FROM records WHERE import_id=$1) OR target_record_id IN (SELECT id FROM records WHERE import_id=$1)`, [id]);
    const del = await db.query(`DELETE FROM records WHERE import_id = $1`, [id]);
    await db.query(`DELETE FROM import_issues WHERE import_id = $1`, [id]);
    const batcher = new RecordBatcher(db, id, before.file_type);
    const original = await materializeOriginal(db, id);
    if (!original) throw new ImportError('Arquivo original não encontrado no armazenamento.', 404);
    let res: ParseResult | null;
    try {
      res = await parseStored(layout, original, (r) => batcher.add(r), db);
    } finally {
      await removeTemp(original);
    }
    await batcher.flush();
    let status = decideStatus(layout, res).status;
    if (before.status === 'CONFIRMADO' && status === 'PRE_VISUALIZACAO') status = 'CONFIRMADO';
    await db.query(
      `UPDATE imports SET generation_date=$2, sequence_number=$3, header_variant=$4, header=$5, trailer=$6, trailer_count=$7,
         trailer_count_match=$8, total_lines=$9, blank_lines=$10, data_records=$11, valid_records=$12, rejected_records=$13,
         duplicate_records=$14, by_record_type=$15, issue_counts=$16, file_errors=$17, status=$18,
         reprocess_count = reprocess_count + 1,
         processing_result = 'Reprocessado em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ': ' || $19
       WHERE id=$1`,
      [id, ...statsParams(res), status, `${res?.validRecords ?? 0} válido(s), ${res?.rejectedRecords ?? 0} rejeitado(s).`],
    );
    if (res) await saveIssues(db, id, res);
    if (status === 'CONFIRMADO') {
      await linkDomain(db, id);
      // Linhas que deixaram de ser rejeitadas têm a pendência encerrada; as que persistem são reabertas pelo upsert.
      await db.query(
        `UPDATE divergences SET status='RESOLVIDA_AUTOMATICAMENTE', resolved_at=now(), resolution_note='Registro válido após reprocessamento'
         WHERE import_id=$1 AND rule='REGISTRO_REJEITADO' AND status IN ('ABERTA','EM_ANALISE')`,
        [id],
      );
      await recordLevelDivergences(db, id, before.file_type, before.original_name);
    }
    await audit(actor, 'IMPORTACAO_REPROCESSADA', 'import', id, { previousRecords: del.rowCount, newRecords: batcher.inserted, status }, db);
  });
  return getImport(id);
}
