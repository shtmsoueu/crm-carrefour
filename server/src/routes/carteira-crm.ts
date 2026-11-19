import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCb } from 'node:zlib';
import { actorOf, requireRole } from '../auth/auth.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { sendExport, type Column } from '../services/export.js';
import { setSetting } from '../services/settings.js';
import { ImportError } from '../imports/service.js';
import { AGREEMENT_ATTRIBUTES, BASE_ATTRIBUTES, buildAgreementView, buildPersonView, DEFAULT_CARTEIRA, getPortfolioCached, PERSON_ATTRIBUTES, SETTING_CARTEIRA, type PortfolioRow } from '../portfolio/portfolio.js';
import { FAIXAS, faixaLabel, FLAG_LABELS, SALDO_LIMITE } from '../portfolio/rules.js';
import { createSnapshot, getProfile, getSnapshot, PILLARS, readSnapshotFile, runReconciliation, saveProfile, SCOPES, suggestProfile, type Scope } from '../crm/service.js';

const gunzip = promisify(gunzipCb);
type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const int = (v: unknown, def: number, max = 1000) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
};

const PORTFOLIO_COLUMNS: Column[] = [
  { key: 'contrato', header: 'Contrato' }, { key: 'cpf', header: 'CPF/CNPJ' }, { key: 'nome', header: 'Nome', width: 30 },
  { key: 'status_contrato', header: 'Status do contrato' }, { key: 'produto_codigo', header: 'Código produto (U1PRODUTO)' },
  { key: 'produto', header: 'Produto Carrefour' }, { key: 'dias_atraso', header: 'Dias de atraso' }, { key: 'saldo_risco', header: 'Saldo de risco' },
  { key: 'grupo', header: 'Grupo' }, { key: 'ranking', header: 'Ranking' }, { key: 'faixa', header: 'Faixa de atraso', width: 28 },
  { key: 'origem', header: 'Origem' }, { key: 'origem_ahcollid', header: 'AHCOLLID' }, { key: 'origem_fonte', header: 'Fonte da origem' },
  { key: 'acordo_id', header: 'Acordo (AHID)' }, { key: 'acordo_status', header: 'Status do acordo' }, { key: 'parcelas', header: 'Parcelas (AHPRD)' },
  { key: 'canal_acordo', header: 'Canal do acordo' }, { key: 'pagamentos_qtde', header: 'Pagamentos' }, { key: 'pagamentos_valor', header: 'Valor pago' },
  { key: 'ultimo_pagamento_codigo', header: 'Último pagamento: código' }, { key: 'comissao_linhas', header: 'Comissão: linhas' },
  { key: 'comissao_valor_recebido', header: 'Comissão: valor recebido (todas as linhas)' },
  { key: 'comissao_linhas_distintas', header: 'Comissão: linhas distintas' }, { key: 'comissao_valor_linhas_distintas', header: 'Comissão: valor (linhas distintas)' }, { key: 'comissao_remuneracao_bruta', header: 'Comissão: remuneração (bruto)' },
  { key: 'alertas', header: 'Alertas de regra', width: 60 },
];

function filterPortfolio(rows: PortfolioRow[], q: Request['query']) {
  const scope = str(q.scope) ?? 'ATIVOS';
  let out = rows.filter((p) => scope === 'TODOS' || (scope === 'ATIVOS' ? p.status_contrato === 'ATIVO' : p.fonte_cadastro !== null));
  const eq = (k: keyof PortfolioRow, v?: string) => {
    if (!v) return;
    out = out.filter((p) => (v === '__VAZIO__' ? p[k] === null : String(p[k]) === v));
  };
  eq('produto', str(q.produto));
  eq('ranking', str(q.ranking));
  eq('faixa_codigo', str(q.faixa));
  eq('origem', str(q.origem));
  eq('grupo', str(q.grupo));
  const flag = str(q.flag);
  if (flag) out = out.filter((p) => p.flags.includes(flag as never));
  if (q.comissao === 'true') out = out.filter((p) => p.comissao_linhas > 0);
  const t = str(q.q);
  if (t) {
    const d = t.replace(/\D/g, '').replace(/^0+/, '');
    out = out.filter((p) => p.contrato === t || (d && (p.cpf ?? '').replace(/\D/g, '').replace(/^0+/, '') === d));
  }
  return { scope, rows: out };
}

/** Soma em centavos para evitar acúmulo de erro de ponto flutuante em totais financeiros. */
const round2 = (v: number) => Math.round(v * 100) / 100;

function summarize(rows: PortfolioRow[]) {
  const by = (k: keyof PortfolioRow) => {
    const m: Record<string, { contas: number; saldo: number }> = {};
    for (const p of rows) {
      const v = p[k] === null ? '__VAZIO__' : String(p[k]);
      const e = (m[v] ??= { contas: 0, saldo: 0 });
      e.contas++;
      e.saldo += p.saldo_risco ?? 0;
    }
    return m;
  };
  // Matriz: ranking x faixa (contas e saldo de risco)
  const matriz: Record<string, Record<string, { contas: number; saldo: number }>> = {};
  for (const p of rows) {
    const r = p.ranking ?? '__VAZIO__';
    const f = p.faixa_codigo ?? '__VAZIO__';
    const e = ((matriz[r] ??= {})[f] ??= { contas: 0, saldo: 0 });
    e.contas++;
    e.saldo += p.saldo_risco ?? 0;
  }
  const produtoRanking: Record<string, Record<string, number>> = {};
  for (const p of rows) {
    const a = p.produto ?? '__VAZIO__';
    const b = p.ranking ?? '__VAZIO__';
    produtoRanking[a] ??= {};
    produtoRanking[a][b] = (produtoRanking[a][b] ?? 0) + 1;
  }
  const flags: Record<string, { label: string; contas: number }> = {};
  for (const p of rows) for (const f of p.flags) (flags[f] ??= { label: FLAG_LABELS[f], contas: 0 }).contas++;
  const comissaoPorOrigem: Record<string, { contas: number; linhas: number; valor_recebido: number; remuneracao_bruta: number; linhas_distintas: number; valor_linhas_distintas: number }> = {};
  for (const p of rows.filter((x) => x.comissao_linhas > 0)) {
    const e = (comissaoPorOrigem[p.origem ?? '__VAZIO__'] ??= { contas: 0, linhas: 0, valor_recebido: 0, remuneracao_bruta: 0, linhas_distintas: 0, valor_linhas_distintas: 0 });
    e.contas++;
    e.linhas += p.comissao_linhas;
    e.valor_recebido = round2(e.valor_recebido + p.comissao_valor_recebido);
    e.remuneracao_bruta += p.comissao_remuneracao_bruta;
    e.linhas_distintas += p.comissao_linhas_distintas;
    e.valor_linhas_distintas = round2(e.valor_linhas_distintas + p.comissao_valor_linhas_distintas);
  }
  const produtoCodigos: Record<string, { produto: string | null; contas: number }> = {};
  for (const p of rows) {
    const k = p.produto_codigo ?? '__VAZIO__';
    (produtoCodigos[k] ??= { produto: p.produto, contas: 0 }).contas++;
  }
  return {
    contas: rows.length,
    saldo_risco: round2(rows.reduce((s, p) => s + Math.round((p.saldo_risco ?? 0) * 100), 0) / 100),
    clientes_unicos: new Set(rows.map((p) => (p.cpf ?? '').replace(/\D/g, '').replace(/^0+/, '')).filter(Boolean)).size,
    acordos_distintos: new Set(rows.map((p) => p.acordo_id).filter(Boolean)).size,
    porProduto: by('produto'),
    porOrigem: by('origem'),
    porRanking: by('ranking'),
    porFaixa: by('faixa_codigo'),
    matriz,
    produtoRanking,
    produtoCodigos,
    flags,
    comissaoPorOrigem,
  };
}

export function carteiraCrmRouter() {
  const r = express.Router();
  const upload = multer({ dest: join(tmpdir(), 'crm-uploads'), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 } });

  // ---------------------------------------------------------------- Carteira classificada
  r.get('/carteira/regras', h(async (_req, res) => {
    const { settings } = await getPortfolioCached();
    res.json({
      settings,
      faixas: FAIXAS.map((f) => ({ ...f, label: faixaLabel(f) })),
      saldoLimite: SALDO_LIMITE,
      flags: FLAG_LABELS,
      atributos: BASE_ATTRIBUTES,
      escopos: SCOPES,
    });
  }));
  r.put('/carteira/regras', requireRole('ADMIN'), h(async (req, res) => {
    const saldoCampo = req.body?.saldoCampo;
    if (!['DMAMTDLQ', 'DMCURBAL'].includes(saldoCampo)) throw new ImportError('Campo de saldo de risco inválido.');
    const v = { ...DEFAULT_CARTEIRA, saldoCampo };
    await setSetting(SETTING_CARTEIRA, v, req.user!.id);
    await audit(actorOf(req), 'CARTEIRA_REGRAS_ALTERADAS', 'settings', SETTING_CARTEIRA, v);
    res.json(v);
  }));
  r.get('/carteira', h(async (req, res) => {
    const { rows } = await getPortfolioCached();
    const f = filterPortfolio(rows, req.query);
    if (str(req.query.format)) {
      const data = f.rows.map((p) => ({ ...p, alertas: p.flags.map((x) => FLAG_LABELS[x]).join(' | ') }));
      await audit(actorOf(req), 'EXPORTACAO', 'carteira', null, { format: req.query.format, rows: data.length, filters: req.query });
      return sendExport(res, String(req.query.format), 'carteira_classificada', PORTFOLIO_COLUMNS, data as unknown as Record<string, unknown>[]);
    }
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    res.json({ scope: f.scope, summary: summarize(f.rows), total: f.rows.length, page, pageSize: size, rows: f.rows.slice((page - 1) * size, page * size) });
  }));

  // ---------------------------------------------------------------- CRM externo
  r.get('/crm/perfil', h(async (_req, res) =>
    res.json({ profile: await getProfile(), atributos: BASE_ATTRIBUTES, atributosPorPilar: { CONTRATO: BASE_ATTRIBUTES, ACORDO: AGREEMENT_ATTRIBUTES, CPF: PERSON_ATTRIBUTES }, pilares: PILLARS, escopos: SCOPES })));

  // Totais independentes das três visões de identificação (não se misturam contas, contratos e clientes).
  r.get('/carteira/pilares', h(async (req, res) => {
    const { rows } = await getPortfolioCached();
    const { rows: scoped } = filterPortfolio(rows, req.query);
    const ag = await buildAgreementView();
    const scopedCts = new Set(scoped.map((p) => p.contrato));
    const agScoped = ag.filter((a) => a.contrato && scopedCts.has(a.contrato));
    const people = buildPersonView(scoped);
    const agPorContrato = new Map<string, number>();
    for (const a of agScoped) agPorContrato.set(a.contrato!, (agPorContrato.get(a.contrato!) ?? 0) + 1);
    const integ = await pool.query(
      `SELECT rule, status, count(*)::int n FROM reconciliation_results WHERE flow = 'I_INTEGRIDADE' GROUP BY 1, 2`,
    );
    const ig = (rule: string, st: string) => integ.rows.find((x) => x.rule === rule && x.status === st)?.n ?? 0;
    res.json({
      escopo: str(req.query.scope) ?? 'ATIVOS',
      pilar1_acordo: {
        acordos_distintos_no_escopo: agScoped.length,
        acordos_distintos_todos_arquivos: ag.length,
        acordos_sem_contrato_no_escopo: ag.length - agScoped.length,
        por_origem: agScoped.reduce((m: Record<string, number>, a) => ((m[a.origem ?? 'Sem AHCOLLID'] = (m[a.origem ?? 'Sem AHCOLLID'] ?? 0) + 1), m), {}),
        integridade_acordo_um_contrato: ig('PILAR1_ACORDO_CONTRATO', 'CONCILIADO'),
        acordos_com_mais_de_um_contrato: ig('PILAR1_ACORDO_CONTRATO', 'DIVERGENTE'),
      },
      pilar2_contrato: {
        contratos_no_escopo: scoped.length,
        contratos_com_acordo: agPorContrato.size,
        contratos_com_mais_de_um_acordo: [...agPorContrato.values()].filter((n) => n > 1).length,
        tamanhos_da_chave: scoped.reduce((m: Record<string, number>, p) => ((m[`${p.contrato.length} posições`] = (m[`${p.contrato.length} posições`] ?? 0) + 1), m), {}),
        integridade_contrato_um_cpf: ig('PILAR2_CONTRATO_CPF', 'CONCILIADO'),
        contratos_com_mais_de_um_cpf: ig('PILAR2_CONTRATO_CPF', 'DIVERGENTE'),
      },
      pilar3_cpf: {
        clientes_unicos: people.people.length,
        contratos_sem_cpf: people.semCpf,
        clientes_com_mais_de_um_contrato: people.people.filter((x) => x.contratos_qtde > 1).length,
        maximo_contratos_por_cliente: people.people.reduce((m, x) => Math.max(m, x.contratos_qtde), 0),
        soma_contratos_dos_clientes: people.people.reduce((m, x) => m + x.contratos_qtde, 0),
      },
      // Prova de fechamento: contratos com CPF + contratos sem CPF = contratos do escopo.
      fechamento_ok: people.people.reduce((m, x) => m + x.contratos_qtde, 0) + people.semCpf === scoped.length,
    });
  }));
  r.put('/crm/perfil', requireRole('OPERADOR'), h(async (req, res) => res.json(await saveProfile(req.body?.profile, actorOf(req)))));

  r.post('/crm/snapshots', requireRole('OPERADOR'), upload.single('file'), h(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecione a exportação do CRM (CSV ou XLSX).' });
    try {
      let buf = await readFile(req.file.path);
      if (req.body?.encoding === 'gzip') buf = await gunzip(buf);
      const converted = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      const name = converted.includes('�') ? req.file.originalname : converted;
      const snap = await createSnapshot(buf, name, actorOf(req));
      res.status(201).json({ ...snap, suggestion: suggestProfile(snap.headers) });
    } finally {
      await rm(req.file.path, { force: true });
    }
  }));
  r.get('/crm/snapshots', h(async (_req, res) => {
    const q = await pool.query(
      `SELECT s.id, s.original_name, s.format, s.rows_count, s.status, s.uploaded_at, u.name AS uploaded_by_name,
         (SELECT count(*)::int FROM crm_recon_runs r WHERE r.snapshot_id = s.id) AS runs
       FROM crm_snapshots s LEFT JOIN users u ON u.id = s.uploaded_by ORDER BY s.id DESC LIMIT 100`,
    );
    res.json(q.rows);
  }));
  r.get('/crm/snapshots/:id', h(async (req, res) => {
    const s = await getSnapshot(int(req.params.id, 0, 2 ** 31 - 1));
    res.json({ ...s, suggestion: suggestProfile(s.headers) });
  }));
  r.get('/crm/snapshots/:id/download', requireRole('OPERADOR'), h(async (req, res) => {
    const id = int(req.params.id, 0, 2 ** 31 - 1);
    const s = await getSnapshot(id);
    const buf = await readSnapshotFile(id);
    if (!buf) return res.status(404).json({ error: 'Arquivo original não encontrado.' });
    await audit(actorOf(req), 'DOWNLOAD_ORIGINAL', 'crm_snapshot', id);
    res.setHeader('Content-Disposition', `attachment; filename="${String(s.original_name).replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buf);
  }));
  r.post('/crm/snapshots/:id/conciliar', requireRole('OPERADOR'), h(async (req, res) => {
    const scope = (str(req.body?.scope) ?? 'ATIVOS') as Scope;
    res.json(await runReconciliation(int(req.params.id, 0, 2 ** 31 - 1), scope, actorOf(req)));
  }));

  r.get('/crm/execucoes', h(async (_req, res) => {
    const q = await pool.query(
      `SELECT r.id, r.snapshot_id, s.original_name, r.scope, r.status, r.summary, r.message, r.started_at, r.finished_at, u.name AS started_by_name
       FROM crm_recon_runs r JOIN crm_snapshots s ON s.id = r.snapshot_id LEFT JOIN users u ON u.id = r.started_by ORDER BY r.id DESC LIMIT 100`,
    );
    res.json(q.rows);
  }));
  r.get('/crm/execucoes/:id', h(async (req, res) => {
    const q = await pool.query(
      `SELECT r.*, s.original_name, s.rows_count, u.name AS started_by_name FROM crm_recon_runs r JOIN crm_snapshots s ON s.id = r.snapshot_id
       LEFT JOIN users u ON u.id = r.started_by WHERE r.id = $1`,
      [int(req.params.id, 0, 2 ** 31 - 1)],
    );
    if (!q.rows[0]) return res.status(404).json({ error: 'Execução não encontrada.' });
    res.json(q.rows[0]);
  }));
  r.get('/crm/execucoes/:id/itens', h(async (req, res) => {
    const id = int(req.params.id, 0, 2 ** 31 - 1);
    const p: unknown[] = [id];
    const w = ['run_id = $1'];
    if (str(req.query.situacao)) w.push(`situacao = $${p.push(req.query.situacao)}`);
    if (str(req.query.campo)) w.push(`divergencias @> $${p.push(JSON.stringify([{ campo: req.query.campo }]))}::jsonb`);
    if (req.query.duplicado === 'true') w.push('duplicado');
    if (req.query.comissao === 'true') w.push(`COALESCE((base->>'comissao_linhas')::int, 0) > 0`);
    for (const k of ['produto', 'ranking', 'origem'] as const) if (str(req.query[k])) w.push(`base->>'${k}' = $${p.push(req.query[k])}`);
    if (str(req.query.q)) w.push(`(contrato = $${p.push(String(req.query.q).trim())} OR base->>'cpf' = $${p.length})`);
    const where = w.join(' AND ');
    if (str(req.query.format)) {
      const q = await pool.query(`SELECT contrato, situacao, motivo, duplicado, crm_rows, divergencias, base FROM crm_recon_items WHERE ${where} ORDER BY situacao, contrato LIMIT 300000`, p);
      // Uma linha por campo divergente (registro, campo, valor da base original, valor no CRM).
      const flat: Record<string, unknown>[] = [];
      for (const it of q.rows) {
        const base = it.base ?? {};
        const common = {
          contrato: it.contrato, situacao: it.situacao, motivo: it.motivo, linhas_crm: (it.crm_rows ?? []).join(', '),
          cpf: base.cpf, produto: base.produto, origem: base.origem, ranking: base.ranking, faixa: base.faixa_codigo,
          comissao_valor: base.comissao_valor_recebido,
        };
        if (it.divergencias?.length) for (const d of it.divergencias) flat.push({ ...common, campo: d.campo, coluna_crm: d.coluna_crm, valor_base: d.base, valor_crm: d.crm });
        else flat.push(common);
      }
      const cols: Column[] = [
        { key: 'contrato', header: 'Contrato' }, { key: 'situacao', header: 'Situação' }, { key: 'campo', header: 'Campo inconsistente', width: 30 },
        { key: 'coluna_crm', header: 'Coluna no CRM' }, { key: 'valor_base', header: 'Valor na base original', width: 24 }, { key: 'valor_crm', header: 'Valor no CRM', width: 24 },
        { key: 'motivo', header: 'Motivo', width: 50 }, { key: 'linhas_crm', header: 'Linha(s) no arquivo do CRM' }, { key: 'cpf', header: 'CPF/CNPJ' },
        { key: 'produto', header: 'Produto' }, { key: 'origem', header: 'Origem' }, { key: 'ranking', header: 'Ranking' }, { key: 'faixa', header: 'Faixa' },
        { key: 'comissao_valor', header: 'Comissão: valor recebido' },
      ];
      await audit(actorOf(req), 'EXPORTACAO', 'crm_recon_items', id, { format: req.query.format, rows: flat.length, filters: req.query });
      return sendExport(res, String(req.query.format), `conciliacao_crm_${id}`, cols, flat);
    }
    const page = int(req.query.page, 1);
    const size = int(req.query.pageSize, 50, 500);
    const total = (await pool.query(`SELECT count(*)::int n FROM crm_recon_items WHERE ${where}`, p)).rows[0].n;
    const rows = (await pool.query(`SELECT id::text, contrato, situacao, motivo, duplicado, crm_rows, divergencias, base, crm FROM crm_recon_items WHERE ${where} ORDER BY situacao, contrato LIMIT ${size} OFFSET ${(page - 1) * size}`, p)).rows;
    res.json({ total, page, pageSize: size, rows });
  }));
  return r;
}
