import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { actorOf, authenticate, hashPassword, issueSession, login, COOKIE, requireAuth, requireRole, validatePassword } from './auth/auth.js';
import { LAYOUTS } from './layouts/definitions.js';
import { cancelImport, confirmImport, createImport, discardImport, getImport, ImportError, reprocessImport } from './imports/service.js';
import { gunzipToTemp, readOriginal, removeTemp } from './imports/storage.js';
import { flowsForFileType, listFlows, runAllFlows, runFlow } from './reconciliation/index.js';
import { audit } from './services/audit.js';
import { carteiraCrmRouter } from './routes/carteira-crm.js';
import { getDashboard } from './services/dashboard.js';
import { contractDetail, searchContracts } from './services/contracts.js';
import { clientDetail } from './services/clients.js';
import { CATEGORY_LABELS } from './services/divergences.js';
import { sendExport, type Column } from './services/export.js';
import { SIC_RESOURCES, SicError, sicConsulta, sicStatus, type SicResource } from './integrations/sic.js';
import { getSetting, setSetting, SETTING_REJEICAO, validateUnstructuredConfig } from './services/settings.js';

type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

const int = (v: unknown, def: number, max = 1000) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
/** Lista separada por vírgula (filtros rápidos combinam vários valores do mesmo campo). */
const csv = (v: unknown) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const MAX_EXPORT = 200_000;

/** Reexecuta os fluxos afetados por um tipo de arquivo (após confirmação, cancelamento ou reprocessamento). */
async function rerunFlows(fileType: string, req: Request) {
  const out = [];
  for (const code of flowsForFileType(fileType)) out.push(await runFlow(code, actorOf(req)));
  return out.map((r) => ({ flow: r.flow, total: r.total, divergences: r.divergences }));
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] } } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(authenticate);

  const uploadDir = join(tmpdir(), 'crm-uploads');
  mkdirSync(uploadDir, { recursive: true });
  const upload = multer({ dest: uploadDir, limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

  const api = express.Router();

  // ---------------------------------------------------------------- Autenticação
  api.post('/auth/login', h(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Informe usuário e senha.' });
    const u = await login(username, password, req.ip ?? '');
    if (u && 'blocked' in u) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    if (!u) {
      await audit({ id: null, username, ip: req.ip }, 'LOGIN_FALHOU', 'user', null);
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }
    issueSession(res, u);
    await audit({ id: u.id, username: u.username, ip: req.ip }, 'LOGIN', 'user', u.id);
    res.json({ user: u });
  }));
  api.post('/auth/logout', h(async (req, res) => {
    if (req.user) await audit(actorOf(req), 'LOGOUT', 'user', req.user.id);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  }));
  api.get('/auth/me', (req, res) => (req.user ? res.json({ user: req.user, authEnabled: config.authEnabled }) : res.status(401).json({ error: 'Não autenticado.' })));

  api.use(requireAuth);

  // ---------------------------------------------------------------- Dicionário de layouts
  api.get('/layouts', (_req, res) => {
    res.json(LAYOUTS.map((l) => ({ ...l, filenameRegex: l.filenameRegex.source })));
  });

  // ---------------------------------------------------------------- Importações
  api.post('/imports', requireRole('OPERADOR'), upload.single('file'), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo.' });
    // O navegador envia o nome em latin1 no multipart; normaliza para UTF-8.
    const converted = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const originalName = converted.includes('\uFFFD') ? req.file.originalname : converted;
    // O navegador envia o arquivo compactado (gzip) para respeitar limites de tamanho de requisição.
    let raw: string | null = null;
    try {
      if (req.body?.encoding === 'gzip') {
        try {
          raw = await gunzipToTemp(req.file.path);
        } catch {
          return res.status(400).json({ error: 'Não foi possível descompactar o arquivo enviado.' });
        }
      }
      const imp = await createImport({ tempPath: raw ?? req.file.path, originalName, manualType: str(req.body?.fileType) ?? null, actor: actorOf(req) });
      res.status(201).json(imp);
    } finally {
      await rm(req.file.path, { force: true });
      await removeTemp(raw);
    }
  }));

  api.get('/imports', h(async (req, res) => {
    const p: unknown[] = [];
    const w: string[] = [];
    if (str(req.query.status)) w.push(`i.status = $${p.push(req.query.status)}`);
    if (str(req.query.fileType)) w.push(`i.file_type = $${p.push(req.query.fileType)}`);
    if (str(req.query.q)) w.push(`i.original_name ILIKE $${p.push(`%${String(req.query.q).replace(/[%_]/g, '')}%`)}`);
    if (str(req.query.from)) w.push(`i.uploaded_at::date >= $${p.push(req.query.from)}`);
    if (str(req.query.to)) w.push(`i.uploaded_at::date <= $${p.push(req.query.to)}`);
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    const sql = `SELECT i.id, i.file_type, i.type_detection, i.original_name, i.size_bytes, i.status, i.processing_result, i.generation_date,
        i.file_name_date, i.sequence_number, i.total_lines, i.data_records, i.valid_records, i.rejected_records, i.duplicate_records,
        i.trailer_count_match, i.uploaded_at, i.confirmed_at, i.reprocess_count, u.name AS uploaded_by_name, c.name AS confirmed_by_name,
        (SELECT count(DISTINCT rr.source_record_id) FROM reconciliation_results rr JOIN records r ON r.id = rr.source_record_id
          WHERE r.import_id = i.id AND rr.status = 'CONCILIADO')::int AS conciliated_records,
        (SELECT count(*) FROM divergences d WHERE (d.import_id = i.id OR d.record_id IN (SELECT id FROM records WHERE import_id = i.id))
          AND d.status IN ('ABERTA','EM_ANALISE'))::int AS open_divergences
      FROM imports i LEFT JOIN users u ON u.id = i.uploaded_by LEFT JOIN users c ON c.id = i.confirmed_by ${where}
      ORDER BY i.id DESC`;
    if (str(req.query.format)) {
      const rows = (await pool.query(`${sql} LIMIT ${MAX_EXPORT}`, p)).rows;
      const cols: Column[] = [
        { key: 'id', header: 'ID' }, { key: 'original_name', header: 'Arquivo', width: 50 }, { key: 'file_type', header: 'Tipo' },
        { key: 'uploaded_at', header: 'Data/hora importação', width: 24 }, { key: 'uploaded_by_name', header: 'Usuário' },
        { key: 'total_lines', header: 'Linhas' }, { key: 'data_records', header: 'Registros recebidos' }, { key: 'valid_records', header: 'Processados' },
        { key: 'conciliated_records', header: 'Conciliados' }, { key: 'open_divergences', header: 'Divergências abertas' },
        { key: 'rejected_records', header: 'Rejeitados' }, { key: 'status', header: 'Situação' }, { key: 'processing_result', header: 'Resultado', width: 60 },
      ];
      await audit(actorOf(req), 'EXPORTACAO', 'imports', null, { format: req.query.format, rows: rows.length });
      return sendExport(res, String(req.query.format), 'historico_importacoes', cols, rows);
    }
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    const total = (await pool.query(`SELECT count(*)::int n FROM imports i ${where}`, p)).rows[0].n;
    const rows = (await pool.query(`${sql} LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    res.json({ total, page, pageSize: size, rows });
  }));

  api.get('/imports/:id', h(async (req, res) => {
    const imp = await getImport(int(req.params.id, 0, 2 ** 31 - 1));
    const issues = await pool.query(`SELECT line_number, record_type, field, value, message, severity FROM import_issues WHERE import_id = $1 AND line_number IS NULL ORDER BY id`, [imp.id]);
    res.json({ ...imp, fileIssues: issues.rows });
  }));

  api.get('/imports/:id/records', h(async (req, res) => {
    const id = int(req.params.id, 0, 2 ** 31 - 1);
    const p: unknown[] = [id];
    const w = ['import_id = $1'];
    if (str(req.query.recordType)) w.push(`record_type = $${p.push(req.query.recordType)}`);
    if (req.query.onlyInvalid === 'true') w.push('NOT valid');
    if (str(req.query.q)) w.push(`(contract_ref = $${p.push(String(req.query.q).trim())} OR cpf = $${p.length})`);
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 200);
    const total = (await pool.query(`SELECT count(*)::int n FROM records WHERE ${w.join(' AND ')}`, p)).rows[0].n;
    const rows = (await pool.query(
      `SELECT id::text, line_number, record_type, valid, contract_ref, cpf, ahid_ref::text AS ahid, event_date, amount::text, dup_in_file, errors, fields
       FROM records WHERE ${w.join(' AND ')} ORDER BY line_number LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    res.json({ total, page, pageSize: size, rows });
  }));

  api.get('/imports/:id/issues', h(async (req, res) => {
    const id = int(req.params.id, 0, 2 ** 31 - 1);
    const p: unknown[] = [id];
    let w = 'import_id = $1';
    if (str(req.query.severity)) w += ` AND severity = $${p.push(req.query.severity)}`;
    const rows = (await pool.query(`SELECT line_number, record_type, field, value, message, severity FROM import_issues WHERE ${w} ORDER BY line_number NULLS FIRST, id LIMIT 2000`, p)).rows;
    const imp = await getImport(id);
    res.json({ counts: imp.issue_counts, rows });
  }));

  /**
   * Confirmação em lote. Cada arquivo é confirmado na sua própria transação (uma falha não desfaz os demais),
   * em ordem de data de geração. Os batimentos rodam uma única vez para os tipos afetados (runFlowsFor),
   * o que permite ao navegador enviar o lote em partes e pedir os batimentos só na última.
   */
  api.post('/imports/confirm-batch', requireRole('OPERADOR'), h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
    if (ids.length > 50) return res.status(400).json({ error: 'Envie no máximo 50 arquivos por lote.' });
    const ordered = ids.length
      ? (await pool.query(`SELECT id FROM imports WHERE id = ANY($1::int[]) ORDER BY COALESCE(generation_date, file_name_date) NULLS LAST, id`, [ids])).rows.map((r) => r.id as number)
      : [];
    const results: { id: number; ok: boolean; file_type?: string; name?: string; error?: string }[] = [];
    for (const id of ordered) {
      try {
        const imp = await confirmImport(id, actorOf(req));
        results.push({ id, ok: true, file_type: imp.file_type, name: imp.original_name });
      } catch (e) {
        results.push({ id, ok: false, error: (e as Error).message });
      }
    }
    const types = new Set<string>([...(Array.isArray(req.body?.runFlowsFor) ? req.body.runFlowsFor.map(String) : [])]);
    const codes = new Set<string>();
    for (const t of types) for (const c of flowsForFileType(t)) codes.add(c);
    const flows = [];
    for (const code of codes) {
      const r = await runFlow(code, actorOf(req));
      flows.push({ flow: r.flow, total: r.total, divergences: r.divergences });
    }
    res.json({ results, flows });
  }));
  api.post('/imports/:id/confirm', requireRole('OPERADOR'), h(async (req, res) => {
    const imp = await confirmImport(int(req.params.id, 0, 2 ** 31 - 1), actorOf(req));
    const flows = await rerunFlows(imp.file_type, req);
    res.json({ import: imp, flows });
  }));
  api.post('/imports/:id/discard', requireRole('OPERADOR'), h(async (req, res) => {
    res.json(await discardImport(int(req.params.id, 0, 2 ** 31 - 1), actorOf(req), str(req.body?.reason) ?? null));
  }));
  api.post('/imports/:id/cancel', requireRole('ADMIN'), h(async (req, res) => {
    const imp = await cancelImport(int(req.params.id, 0, 2 ** 31 - 1), actorOf(req), String(req.body?.reason ?? ''));
    res.json({ import: imp, flows: await rerunFlows(imp.file_type, req) });
  }));
  api.post('/imports/:id/reprocess', requireRole('ADMIN'), h(async (req, res) => {
    const imp = await reprocessImport(int(req.params.id, 0, 2 ** 31 - 1), actorOf(req));
    res.json({ import: imp, flows: imp.status === 'CONFIRMADO' ? await rerunFlows(imp.file_type, req) : [] });
  }));
  api.get('/imports/:id/download', requireRole('OPERADOR'), h(async (req, res) => {
    const imp = await getImport(int(req.params.id, 0, 2 ** 31 - 1));
    const buf = await readOriginal(pool, imp.id);
    if (!buf) return res.status(404).json({ error: 'Arquivo original não encontrado no armazenamento.' });
    await audit(actorOf(req), 'DOWNLOAD_ORIGINAL', 'import', imp.id);
    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.setHeader('Content-Disposition', `attachment; filename="${String(imp.original_name).replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.send(buf);
  }));

  // ---------------------------------------------------------------- Batimentos
  api.get('/reconciliation/flows', h(async (_req, res) => {
    const runs = await pool.query(`SELECT DISTINCT ON (flow) flow, id, status, started_at, finished_at, summary, message FROM reconciliation_runs ORDER BY flow, id DESC`);
    const by = new Map(runs.rows.map((r) => [r.flow, r]));
    res.json(listFlows().map((f) => ({ code: f.code, title: f.title, description: f.description, sources: f.sources, rules: f.rules, lastRun: by.get(f.code) ?? null })));
  }));
  api.post('/reconciliation/run', requireRole('OPERADOR'), h(async (req, res) => {
    const flow = str(req.body?.flow);
    res.json(flow ? [await runFlow(flow, actorOf(req))] : await runAllFlows(actorOf(req)));
  }));
  api.get('/reconciliation/results', h(async (req, res) => {
    const p: unknown[] = [];
    const w: string[] = [];
    if (str(req.query.flow)) w.push(`rr.flow = $${p.push(req.query.flow)}`);
    if (str(req.query.status)) w.push(`rr.status = ANY($${p.push(csv(req.query.status))}::text[])`);
    if (str(req.query.rule)) w.push(`rr.rule = $${p.push(req.query.rule)}`);
    if (str(req.query.q)) {
      const q = String(req.query.q).trim();
      w.push(`(rr.contract_key = $${p.push(q)} OR rr.key_value = $${p.length} OR rr.ahid::text = ltrim($${p.length}, '0') OR ltrim(regexp_replace(rr.cpf, '\\D', '', 'g'), '0') = ltrim(regexp_replace($${p.length}, '\\D', '', 'g'), '0'))`);
    }
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    const sql = `SELECT rr.id::text, rr.flow, rr.rule, rr.status, rr.key_name, rr.key_value, rr.contract_key, rr.cpf, rr.ahid::text, rr.source_type,
        si.original_name AS source_file, rr.target_type, ti.original_name AS target_file, rr.field, rr.value_received, rr.value_expected, rr.reason, rr.event_date
      FROM reconciliation_results rr
      LEFT JOIN records sr ON sr.id = rr.source_record_id LEFT JOIN imports si ON si.id = sr.import_id
      LEFT JOIN records tr ON tr.id = rr.target_record_id LEFT JOIN imports ti ON ti.id = tr.import_id
      ${where} ORDER BY rr.id`;
    if (str(req.query.format)) {
      const rows = (await pool.query(`${sql} LIMIT ${MAX_EXPORT}`, p)).rows;
      const cols: Column[] = [
        { key: 'flow', header: 'Fluxo' }, { key: 'rule', header: 'Regra', width: 28 }, { key: 'status', header: 'Resultado' },
        { key: 'key_name', header: 'Chave' }, { key: 'key_value', header: 'Valor da chave', width: 28 }, { key: 'contract_key', header: 'Contrato' },
        { key: 'cpf', header: 'CPF/CNPJ' }, { key: 'ahid', header: 'Acordo (AHID)' }, { key: 'source_type', header: 'Origem' },
        { key: 'source_file', header: 'Arquivo origem', width: 40 }, { key: 'target_type', header: 'Destino' }, { key: 'target_file', header: 'Arquivo destino', width: 40 },
        { key: 'field', header: 'Campo' }, { key: 'value_received', header: 'Valor recebido' }, { key: 'value_expected', header: 'Valor esperado' },
        { key: 'reason', header: 'Motivo', width: 70 },
      ];
      await audit(actorOf(req), 'EXPORTACAO', 'reconciliation_results', null, { format: req.query.format, rows: rows.length, filters: req.query });
      return sendExport(res, String(req.query.format), 'resultados_batimento', cols, rows);
    }
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    const total = (await pool.query(`SELECT count(*)::int n FROM reconciliation_results rr ${where}`, p)).rows[0].n;
    const rows = (await pool.query(`${sql} LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    res.json({ total, page, pageSize: size, rows });
  }));

  // ---------------------------------------------------------------- Pendências de batimento
  const divWhere = (q: Request['query'], p: unknown[]) => {
    const w: string[] = [];
    if (str(q.category)) w.push(`d.category = ANY($${p.push(csv(q.category))}::text[])`);
    if (str(q.status)) w.push(q.status === 'ABERTAS' ? `d.status IN ('ABERTA','EM_ANALISE')` : `d.status = $${p.push(q.status)}`);
    if (str(q.flow)) w.push(`d.flow = $${p.push(q.flow)}`);
    if (str(q.from)) w.push(`d.last_detected_at::date >= $${p.push(q.from)}`);
    if (str(q.to)) w.push(`d.last_detected_at::date <= $${p.push(q.to)}`);
    if (str(q.q)) {
      const t = String(q.q).trim();
      w.push(`(d.contract_key = $${p.push(t)} OR d.ahid::text = ltrim($${p.length}, '0') OR ltrim(regexp_replace(d.cpf, '\\D', '', 'g'), '0') = ltrim(regexp_replace($${p.length}, '\\D', '', 'g'), '0') OR d.id::text = $${p.length})`);
    }
    return w.length ? `WHERE ${w.join(' AND ')}` : '';
  };
  api.get('/divergences/summary', h(async (_req, res) => {
    const r = await pool.query(`SELECT category, status, count(*)::int n FROM divergences GROUP BY 1,2`);
    res.json({ labels: CATEGORY_LABELS, rows: r.rows });
  }));
  api.get('/divergences', h(async (req, res) => {
    const p: unknown[] = [];
    const where = divWhere(req.query, p);
    const sql = `SELECT d.id::text, d.category, d.flow, d.rule, d.contract_key, d.cpf, d.ahid::text, d.source_file, d.field, d.value_received,
        d.value_expected, d.description, d.occurrences, d.status, d.resolution_note, d.first_detected_at, d.last_detected_at, d.resolved_at, u.name AS resolved_by_name
      FROM divergences d LEFT JOIN users u ON u.id = d.resolved_by ${where} ORDER BY d.last_detected_at DESC, d.id DESC`;
    if (str(req.query.format)) {
      const rows = (await pool.query(`${sql} LIMIT ${MAX_EXPORT}`, p)).rows.map((r) => ({ ...r, category_label: CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS] }));
      const cols: Column[] = [
        { key: 'id', header: 'Identificador' }, { key: 'category_label', header: 'Tipo de divergência', width: 28 }, { key: 'contract_key', header: 'Contrato' },
        { key: 'cpf', header: 'CPF/CNPJ' }, { key: 'ahid', header: 'Acordo (AHID)' }, { key: 'source_file', header: 'Arquivo de origem', width: 44 },
        { key: 'flow', header: 'Fluxo' }, { key: 'rule', header: 'Regra', width: 26 }, { key: 'field', header: 'Campo divergente' },
        { key: 'value_received', header: 'Valor recebido' }, { key: 'value_expected', header: 'Valor esperado' }, { key: 'occurrences', header: 'Ocorrências' },
        { key: 'description', header: 'Descrição', width: 70 }, { key: 'first_detected_at', header: 'Data da ocorrência', width: 24 },
        { key: 'status', header: 'Status da resolução' }, { key: 'resolution_note', header: 'Observação', width: 50 },
      ];
      await audit(actorOf(req), 'EXPORTACAO', 'divergences', null, { format: req.query.format, rows: rows.length, filters: req.query });
      return sendExport(res, String(req.query.format), 'pendencias_batimento', cols, rows);
    }
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    const total = (await pool.query(`SELECT count(*)::int n FROM divergences d ${where}`, p)).rows[0].n;
    const rows = (await pool.query(`${sql} LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    res.json({ total, page, pageSize: size, rows, labels: CATEGORY_LABELS });
  }));
  // Fontes do campo "source_file" quando a pendência vem do motor: preenchido a partir do registro.
  api.patch('/divergences/:id', requireRole('OPERADOR'), h(async (req, res) => {
    const status = String(req.body?.status ?? '');
    const note = str(req.body?.note) ?? null;
    if (!['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'JUSTIFICADA'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    if ((status === 'RESOLVIDA' || status === 'JUSTIFICADA') && !note) return res.status(400).json({ error: 'Informe a observação da resolução.' });
    const r = await pool.query(
      `UPDATE divergences SET status = $2, resolution_note = COALESCE($3, resolution_note),
         resolved_by = CASE WHEN $2 IN ('RESOLVIDA','JUSTIFICADA') THEN $4::int ELSE NULL END,
         resolved_at = CASE WHEN $2 IN ('RESOLVIDA','JUSTIFICADA') THEN now() ELSE NULL END
       WHERE id = $1 RETURNING id, status`,
      [req.params.id, status, note, req.user!.id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Pendência não encontrada.' });
    await audit(actorOf(req), 'PENDENCIA_ATUALIZADA', 'divergence', req.params.id, { status, note });
    res.json(r.rows[0]);
  }));

  // ---------------------------------------------------------------- Dashboard e contratos
  api.get('/dashboard', h(async (req, res) => {
    res.json(await getDashboard({
      from: str(req.query.from), to: str(req.query.to), procFrom: str(req.query.procFrom), procTo: str(req.query.procTo),
      fileType: str(req.query.fileType), contract: str(req.query.contract), cpf: str(req.query.cpf), status: str(req.query.status),
    }));
  }));
  api.get('/clientes/:cpf', h(async (req, res) => {
    const d = await clientDetail(req.params.cpf);
    if (!d) return res.status(404).json({ error: 'Nenhum contrato com este CPF/CNPJ nos arquivos importados.' });
    await audit(actorOf(req), 'CONSULTA_CLIENTE', 'cliente', d.cpf);
    res.json(d);
  }));
  api.get('/contracts/search', h(async (req, res) => res.json(await searchContracts(String(req.query.q ?? '')))));
  api.get('/contracts/:key', h(async (req, res) => {
    const d = await contractDetail(req.params.key);
    if (!d) return res.status(404).json({ error: 'Contrato não encontrado nos arquivos importados.' });
    await audit(actorOf(req), 'CONSULTA_CONTRATO', 'contract', req.params.key);
    res.json(d);
  }));

  // ---------------------------------------------------------------- Auditoria
  api.get('/audit', requireRole('OPERADOR'), h(async (req, res) => {
    const p: unknown[] = [];
    const w: string[] = [];
    if (str(req.query.action)) w.push(`action = $${p.push(req.query.action)}`);
    if (str(req.query.user)) w.push(`username ILIKE $${p.push(`%${String(req.query.user).replace(/[%_]/g, '')}%`)}`);
    if (str(req.query.from)) w.push(`created_at::date >= $${p.push(req.query.from)}`);
    if (str(req.query.to)) w.push(`created_at::date <= $${p.push(req.query.to)}`);
    const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    const total = (await pool.query(`SELECT count(*)::int n FROM audit_log ${where}`, p)).rows[0].n;
    const rows = (await pool.query(`SELECT id::text, username, action, entity, entity_id, details, ip, created_at FROM audit_log ${where} ORDER BY id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    const actions = (await pool.query(`SELECT DISTINCT action FROM audit_log ORDER BY 1`)).rows.map((r) => r.action);
    res.json({ total, page, pageSize: size, rows, actions });
  }));

  // ---------------------------------------------------------------- Usuários (ADMIN)
  api.get('/users', requireRole('ADMIN'), h(async (_req, res) => {
    res.json((await pool.query(`SELECT id, username, name, role, active, created_at, last_login_at FROM users ORDER BY name`)).rows);
  }));
  api.post('/users', requireRole('ADMIN'), h(async (req, res) => {
    const { username, name, role, password } = req.body ?? {};
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(username ?? '')) return res.status(400).json({ error: 'Usuário inválido (3-40 caracteres: letras, números, . _ -).' });
    if (!str(name)) return res.status(400).json({ error: 'Informe o nome.' });
    if (!['ADMIN', 'OPERADOR', 'CONSULTA'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
    const pe = validatePassword(password);
    if (pe) return res.status(400).json({ error: pe });
    try {
      const r = await pool.query(`INSERT INTO users (username, name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, username, name, role, active`, [username, name.trim(), role, await hashPassword(password)]);
      await audit(actorOf(req), 'USUARIO_CRIADO', 'user', r.rows[0].id, { username, role });
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return res.status(409).json({ error: 'Usuário já existe.' });
      throw e;
    }
  }));
  api.patch('/users/:id', requireRole('ADMIN'), h(async (req, res) => {
    const id = int(req.params.id, 0, 2 ** 31 - 1);
    const { name, role, active, password } = req.body ?? {};
    if (id === req.user!.id && (active === false || (role && role !== 'ADMIN'))) return res.status(400).json({ error: 'Não é permitido remover o próprio acesso de administrador.' });
    if (role !== undefined && !['ADMIN', 'OPERADOR', 'CONSULTA'].includes(role)) return res.status(400).json({ error: 'Perfil inválido.' });
    let hash: string | null = null;
    if (password) {
      const pe = validatePassword(password);
      if (pe) return res.status(400).json({ error: pe });
      hash = await hashPassword(password);
    }
    const r = await pool.query(
      `UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role), active = COALESCE($4, active), password_hash = COALESCE($5, password_hash)
       WHERE id = $1 RETURNING id, username, name, role, active`,
      [id, str(name) ?? null, role ?? null, typeof active === 'boolean' ? active : null, hash],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });
    await audit(actorOf(req), 'USUARIO_ALTERADO', 'user', id, { name, role, active, passwordChanged: !!hash });
    res.json(r.rows[0]);
  }));

  // ---------------------------------------------------------------- Configurações
  // ---------------------------------------------------------------- Integração API SIC (somente leitura)
  api.get('/integracoes/sic/status', requireRole('ADMIN'), h(async (req, res) => {
    const st = await sicStatus();
    await audit(actorOf(req), 'INTEGRACAO_SIC_TESTE', 'integracao', 'sic', { conectado: st.conectado, erro: st.erro });
    res.json({ ...st, recursos: SIC_RESOURCES, consulta_liberada: config.authEnabled });
  }));
  api.get('/integracoes/sic/:recurso/:id', requireRole('OPERADOR'), h(async (req, res) => {
    // Dados pessoais do banco de cobrança: só com login ativo, para não expor a base a qualquer pessoa com o endereço.
    if (!config.authEnabled) return res.status(403).json({ error: 'Consulta ao SIC disponível somente com o login ativado (AUTH_ENABLED=true).' });
    const recurso = req.params.recurso as SicResource;
    if (!SIC_RESOURCES.includes(recurso)) return res.status(400).json({ error: 'Recurso do SIC não liberado.' });
    const data = await sicConsulta(recurso, req.params.id);
    await audit(actorOf(req), 'CONSULTA_SIC', 'sic', `${recurso}/${req.params.id}`, { encontrado: data !== null });
    res.json({ recurso, id: req.params.id, encontrado: data !== null, data });
  }));

  api.get('/settings/rejeicao', h(async (_req, res) => res.json({ value: await getSetting(SETTING_REJEICAO) })));
  api.put('/settings/rejeicao', requireRole('ADMIN'), h(async (req, res) => {
    const v = req.body?.value === null ? null : validateUnstructuredConfig(req.body?.value);
    await setSetting(SETTING_REJEICAO, v, req.user!.id);
    await audit(actorOf(req), 'CONFIGURACAO_ALTERADA', 'settings', SETTING_REJEICAO, v);
    res.json({ value: v });
  }));

  // Carteira classificada e conciliação com o CRM externo
  api.use(carteiraCrmRouter());

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // Frontend compilado (produção)
  if (existsSync(config.webDistDir)) {
    app.use(express.static(config.webDistDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(config.webDistDir, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SicError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ImportError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Arquivo excede ${config.maxUploadMb} MB.` : err.message });
    if (err instanceof Error && /^(Modo|Delimitador|Índice|contract|Posição|Fluxo desconhecido)/.test(err.message)) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erro interno. A ocorrência foi registrada.' });
  });
  return app;
}
