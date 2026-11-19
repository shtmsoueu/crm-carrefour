/**
 * TESTES DE AUDITORIA INDEPENDENTES
 *
 * - Arquivos montados por um formatador próprio, com posições transcritas da planilha
 *   oficial (NÃO usa server/src/layouts/definitions.ts), para detectar erros de posição.
 * - Valores esperados são constantes calculadas à mão, não pela lógica do sistema.
 * - Totais conferidos por caminhos diferentes: banco, API, exportação CSV.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://crm:crm_dev_password@localhost:5432/crm_test';
process.env.AUTH_ENABLED = 'false';

const { pool } = await import('../src/db/pool.js');
const { migrate } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const app = createApp();
const api = request(app);

/** Formatador independente: [início(1-based), fim, valor, 'A' | 'N']. */
function fw(len: number, parts: [number, number, string | number, 'A' | 'N'][]) {
  const b = Array(len).fill(' ');
  for (const [ini, fim, v, t] of parts) {
    const size = fim - ini + 1;
    let s = String(v);
    s = t === 'N' ? s.padStart(size, '0') : s.padEnd(size, ' ');
    if (s.length !== size) throw new Error(`valor ${v} não cabe em ${ini}-${fim}`);
    for (let i = 0; i < size; i++) b[ini - 1 + i] = s[i];
  }
  return b.join('');
}

// Comissão — Layout_Comissao_Cyber_Assessoria_V3 (Registro 1: 130 posições)
const comLine = (contrato: string, cpf: string, centavos: number, dataMMDDAAAA = '11072026') =>
  fw(130, [
    [1, 1, '1', 'A'], [2, 9, dataMMDDAAAA, 'A'], [10, 41, 'CLIENTE TESTE', 'A'], [42, 55, cpf, 'A'], [56, 56, '1', 'A'],
    [57, 81, contrato, 'A'], [82, 89, '07112026', 'A'], [90, 97, '07112026', 'A'], [98, 99, 'A', 'A'], [102, 104, 0, 'N'],
    [105, 105, 0, 'N'], [106, 117, centavos, 'N'], [119, 121, 2, 'N'], [122, 130, Math.round(centavos * 0.02), 'N'],
  ]);
function comFile(lines: string[]) {
  const H = '0' + '20261117' + '053402';
  const T = '9' + '17112026' + '053402' + String(lines.length + 2).padStart(8, '0');
  return [H, ...lines, T].join('\r\n') + '\r\n';
}

// Quebra — Layout_Quebra_Acordos_V2 (73 posições)
const qbLine = (ahid: number, contrato: string) =>
  fw(73, [[1, 13, ahid, 'N'], [14, 21, 'LEALCO', 'A'], [22, 29, 'F31 1+0', 'A'], [30, 37, '02032026', 'A'], [38, 40, 0, 'N'], [41, 48, '16032026', 'A'], [49, 73, contrato, 'A']]);

const parseCsv = (t: string) => t.replace(/^﻿/, '').trim().split(/\r\n/).map((l) => l.split(';'));
const toCents = (v: string) => Math.round(Number(v) * 100);

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => undefined);
});
afterAll(async () => {
  await pool.end();
});

describe('comissão: integridade dos valores por caminhos independentes', () => {
  // Valores escolhidos à mão. Total de todas as linhas = 1.234.618,44; linhas distintas = 1.234.598,24.
  const lines = [
    comLine('20000000001', '11111111111', 1010),
    comLine('20000000001', '11111111111', 2020),
    comLine('20000000001', '11111111111', 2020), // linha idêntica à anterior
    comLine('20000000002', '22222222222', 5),
    comLine('20000000003', '33333333333', 123456789),
  ];
  const file = comFile(lines);
  let id: number;

  it('importa e confirma 5 linhas, sem rejeição', async () => {
    const r = await api.post('/api/imports').attach('file', Buffer.from(file, 'latin1'), '20261117_053402_comissao_LEALCO_out.txt').expect(201);
    expect([r.body.data_records, r.body.valid_records, r.body.rejected_records, r.body.duplicate_records]).toEqual([5, 5, 0, 1]);
    expect(r.body.trailer_count_match).toBe('TOTAL_LINHAS');
    id = r.body.id;
    await api.post(`/api/imports/${id}/confirm`).expect(200);
  });

  it('banco: soma exata em centavos', async () => {
    const q = await pool.query(`SELECT count(*)::int n, sum(amount)::text v FROM records WHERE file_type='COMISSAO' AND valid`);
    expect(q.rows[0]).toEqual({ n: 5, v: '1234618.44' });
  });

  it('painel: total de todas as linhas e de linhas distintas', async () => {
    const k = (await api.get('/api/dashboard').expect(200)).body.kpis;
    expect([k.comissao_linhas, k.comissao_valor_linhas, k.comissao_linhas_distintas, k.comissao_valor_distinto]).toEqual([5, '1234618.44', 4, '1234598.24']);
  });

  it('carteira: soma por origem fecha com o arquivo (sem multiplicar por acordos/pagamentos)', async () => {
    const s = (await api.get('/api/carteira?scope=TODOS').expect(200)).body.summary;
    const tot = Object.values(s.comissaoPorOrigem as Record<string, any>).reduce((a: any, v: any) => ({ l: a.l + v.linhas, c: a.c + toCents(v.valor_recebido), d: a.d + toCents(v.valor_linhas_distintas) }), { l: 0, c: 0, d: 0 });
    expect(tot).toEqual({ l: 5, c: 123461844, d: 123459824 });
  });

  it('exportação CSV da carteira preserva os valores (soma das linhas exportadas = arquivo)', async () => {
    const csv = (await api.get('/api/carteira?scope=TODOS&format=csv').expect(200)).text;
    const [h, ...rows] = parseCsv(csv);
    const col = h.indexOf('Comissão: valor recebido (todas as linhas)');
    expect(col).toBeGreaterThan(-1);
    expect(rows.reduce((s, r) => s + toCents(r[col] || '0'), 0)).toBe(123461844);
    expect(rows.length).toBe(3); // 3 contratos
  });

  it('reimportação do mesmo arquivo é bloqueada e o reprocessamento não altera os totais', async () => {
    await api.post('/api/imports').attach('file', Buffer.from(file, 'latin1'), 'copia.txt').field('fileType', 'COMISSAO').expect(409);
    await api.post(`/api/imports/${id}/reprocess`).expect(200);
    const q = await pool.query(`SELECT count(*)::int n, sum(amount)::text v FROM records WHERE file_type='COMISSAO'`);
    expect(q.rows[0]).toEqual({ n: 5, v: '1234618.44' });
  });

  it('duplicidade da comissão vira pendência com a quantidade de ocorrências', async () => {
    const d = (await api.get('/api/divergences?category=DUPLICIDADE').expect(200)).body.rows;
    expect(d.length).toBe(1);
    expect(d[0]).toMatchObject({ contract_key: '20000000001', occurrences: 2 });
  });
});

describe('Pilar 1: nenhum registro de quebra é perdido quando o mesmo acordo vem com dois contratos', () => {
  it('as duas linhas geram resultado e a integridade aponta o conflito', async () => {
    const f = [qbLine(30000001, '40000000001'), qbLine(30000001, '40000000002'), qbLine(30000002, '40000000003')].join('\r\n') + '\r\n';
    const r = await api.post('/api/imports').attach('file', Buffer.from(f, 'latin1'), 'QUEBRA_ACORDO_LEALCO_20261117_053345.txt').expect(201);
    expect(r.body.valid_records).toBe(3);
    await api.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const e = (await api.get('/api/reconciliation/results?flow=E_QUEBRA&pageSize=50').expect(200)).body;
    expect(e.total).toBe(3); // sem ACORDO_ASSESSORIA: um resultado "aguardando arquivo" por registro, nenhum omitido
    expect(e.rows.every((x: any) => x.status === 'AGUARDANDO_ARQUIVO')).toBe(true);
    expect(new Set(e.rows.map((x: any) => x.contract_key))).toEqual(new Set(['40000000001', '40000000002', '40000000003']));
    const i = (await api.get('/api/reconciliation/results?flow=I_INTEGRIDADE&rule=PILAR1_ACORDO_CONTRATO&status=DIVERGENTE').expect(200)).body;
    expect(i.total).toBe(1);
    expect(i.rows[0].value_received).toBe('40000000001, 40000000002');
  });
});

describe('Pilar 3: multiplicidade natural não é duplicidade', () => {
  it('um CPF com dois contratos é contado como 1 cliente e 2 contratos', async () => {
    const f = comFile([comLine('50000000001', '55555555555', 100), comLine('50000000002', '55555555555', 200)]);
    const r = await api.post('/api/imports').attach('file', Buffer.from(f, 'latin1'), '20261118_010101_comissao_LEALCO_out.txt').expect(201);
    await api.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const p = (await api.get('/api/carteira/pilares?scope=TODOS').expect(200)).body;
    // CPFs: 111, 222, 333, 555 = 4 clientes; contratos com CPF: 20000000001..3 + 50000000001..2 = 5
    expect(p.pilar3_cpf.clientes_unicos).toBe(4);
    expect(p.pilar3_cpf.clientes_com_mais_de_um_contrato).toBe(1);
    expect(p.fechamento_ok).toBe(true);
    const dup = (await api.get('/api/divergences?category=DUPLICIDADE').expect(200)).body.rows;
    expect(dup.some((x: any) => x.cpf === '55555555555')).toBe(false);
  });
});

describe('concorrência e reexecução', () => {
  it('dois envios simultâneos do mesmo arquivo: um aceito, o outro bloqueado como duplicado (409)', async () => {
    const f = comFile([comLine('60000000001', '66666666666', 999)]);
    const send = () => api.post('/api/imports').attach('file', Buffer.from(f, 'latin1'), '20261119_010101_comissao_LEALCO_out.txt');
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('batimentos executados em paralelo não duplicam resultados', async () => {
    await api.post('/api/reconciliation/run').send({}).expect(200);
    const one = await pool.query(`SELECT count(*)::int n FROM reconciliation_results`);
    await Promise.all([api.post('/api/reconciliation/run').send({}), api.post('/api/reconciliation/run').send({})]);
    const two = await pool.query(`SELECT count(*)::int n FROM reconciliation_results`);
    expect(two.rows[0].n).toBe(one.rows[0].n);
  });
});

describe('CRM: três pilares e rastreabilidade de 100% das linhas', () => {
  it('Pilar 3 (CPF): chave com máscara e zeros, agregação por pessoa e linha sem chave listada', async () => {
    const csv = ['CPF;Contratos', '555.555.555-55;2', '00011111111111;1', ';9'].join('\r\n');
    const s = await api.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_cpf.csv').expect(201);
    await api.put('/api/crm/perfil').send({ profile: { pillar: 'CPF', keyColumn: 'CPF', comparisons: [{ crmColumn: 'Contratos', baseAttribute: 'contratos_qtde', kind: 'number' }] } }).expect(200);
    const r = (await api.post(`/api/crm/snapshots/${s.body.id}/conciliar`).send({ scope: 'TODOS' }).expect(200)).body;
    // Base: CPFs 111, 222, 333, 555 = 4 (o arquivo do teste de concorrência não foi confirmado).
    // CRM: 555 (2 contratos ok), 111 (1 ok), linha sem chave.
    expect(r.base_contas).toBe(4);
    expect(r.conforme).toBe(2);
    expect(r.nao_importado).toBe(2);
    expect(r.crm_linhas_sem_chave).toBe(1);
    const itens = (await api.get(`/api/crm/execucoes/${r.runId}/itens?situacao=NAO_CONSTA_NA_BASE`).expect(200)).body.rows;
    expect(itens.length).toBe(1);
    expect(itens[0].motivo).toMatch(/sem valor na coluna-chave/);
    // Fechamento: cada linha do CRM aparece em exatamente um item.
    const all = (await api.get(`/api/crm/execucoes/${r.runId}/itens?pageSize=500`).expect(200)).body.rows;
    const crmRows = all.flatMap((x: any) => x.crm_rows ?? []);
    expect(crmRows.sort()).toEqual([2, 3, 4]);
  });

  it('Pilar 1 (acordo): AHID com zeros à esquerda no CRM e conformes sem confronto são explicitados', async () => {
    const csv = ['Acordo;Status', '0000030000001;QUEBRADO', '30000002;'].join('\r\n');
    const s = await api.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_acordo.csv').expect(201);
    await api.put('/api/crm/perfil').send({ profile: { pillar: 'ACORDO', keyColumn: 'Acordo', comparisons: [{ crmColumn: 'Status', baseAttribute: 'acordo_status' }] } }).expect(200);
    const r = (await api.post(`/api/crm/snapshots/${s.body.id}/conciliar`).send({ scope: 'TODOS' }).expect(200)).body;
    expect(r.base_contas).toBe(2); // 30000001 e 30000002 (QUEBRA)
    // Os dois acordos estão QUEBRADO na base; no CRM o segundo veio sem status -> divergente (CRM sem o dado).
    expect([r.conforme, r.divergente, r.nao_importado]).toEqual([1, 1, 0]);
  });

  it('sem nenhum campo mapeado, CONFORME significa apenas existência e isso é informado', async () => {
    const csv = ['Contrato', '20000000001'].join('\r\n');
    const s = await api.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_existencia.csv').expect(201);
    await api.put('/api/crm/perfil').send({ profile: { keyColumn: 'Contrato', comparisons: [] } }).expect(200);
    const r = (await api.post(`/api/crm/snapshots/${s.body.id}/conciliar`).send({ scope: 'TODOS' }).expect(200)).body;
    const it = (await api.get(`/api/crm/execucoes/${r.runId}/itens?situacao=CONFORME`).expect(200)).body.rows[0];
    expect(it.motivo).toMatch(/somente existência/);
  });
});

describe('CRM visão CPF: cliente com vários contratos não é duplicidade', () => {
  it('2 linhas no CRM para um CPF com 2 contratos = conforme; 3 linhas = divergente', async () => {
    // Base: CPF 55555555555 tem 2 contratos (50000000001 e 50000000002).
    await api.put('/api/crm/perfil').send({ profile: { pillar: 'CPF', keyColumn: 'CPF', comparisons: [] } }).expect(200);
    const ok = ['CPF;Contrato', '55555555555;50000000001', '55555555555;50000000002'].join('\r\n');
    const s1 = await api.post('/api/crm/snapshots').attach('file', Buffer.from(ok, 'utf8'), 'crm_cpf_multi_ok.csv').expect(201);
    const r1 = (await api.post(`/api/crm/snapshots/${s1.body.id}/conciliar`).send({ scope: 'TODOS' }).expect(200)).body;
    const it1 = (await api.get(`/api/crm/execucoes/${r1.runId}/itens?q=55555555555`).expect(200)).body.rows[0];
    expect(it1.situacao).toBe('CONFORME');
    expect(it1.duplicado).toBe(false);
    expect(r1.duplicados_no_crm).toBe(0);
    const mais = ok + '\r\n55555555555;50000000002';
    const s2 = await api.post('/api/crm/snapshots').attach('file', Buffer.from(mais, 'utf8'), 'crm_cpf_multi_mais.csv').expect(201);
    const r2 = (await api.post(`/api/crm/snapshots/${s2.body.id}/conciliar`).send({ scope: 'TODOS' }).expect(200)).body;
    const it2 = (await api.get(`/api/crm/execucoes/${r2.runId}/itens?q=55555555555`).expect(200)).body.rows[0];
    expect(it2.situacao).toBe('DIVERGENTE');
    expect(it2.divergencias[0]).toMatchObject({ campo: 'LINHAS DO CPF NO CRM x CONTRATOS NA BASE', base: 2, crm: 3 });
  });
});
