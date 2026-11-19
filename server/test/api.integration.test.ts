/**
 * Teste de integração ponta a ponta (API + PostgreSQL) com arquivos sintéticos
 * gerados a partir das definições oficiais de layout.
 * Requer TEST_DATABASE_URL (padrão: banco local crm_test). O schema é recriado.
 */
import { gzipSync } from 'node:zlib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { head, line, rec, trail } from './helpers.js';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://crm:crm_dev_password@localhost:5432/crm_test';
process.env.AUTH_ENABLED = 'true';
process.env.STATUS_REF_DATE = '2026-11-19';

const { pool } = await import('../src/db/pool.js');
const { migrate } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { hashPassword } = await import('../src/auth/auth.js');

const app = createApp();
const admin = request.agent(app);
const viewer = request.agent(app);

// ------------------------------------------------------------------ Arquivos sintéticos
const ACC = ['10000000001', '10000000002', '10000000003'];
const CPF = ['00000000191', '00000000272', '00000000353'];

function acordoFile(code: 'ACORDO_ASSESSORIA' | 'BAT_ACORDO', valorAcordo2: number, seq: number) {
  const H = line(head(code), { TIPO: '0', DATA_GERACAO: code === 'ACORDO_ASSESSORIA' ? '20261117' : '11172026', TIPO_FORMULARIO: '01', SEQUENCIA_ARQUIVO: seq, SEQ_REG: 1 });
  const rows: string[] = [];
  const add = (i: number, ahid: number, venc: string, valor: number, total: number) =>
    rows.push(line(rec(code), {
      DMACCTG: '1', DMACCT: ACC[i], DMSSNUM: CPF[i], AHDT: '20261110', APDUEDT_PROX: venc, AHTOTPMT: total, VALOR_ENTRADA: valor,
      APDUEDT: venc, AHPRD: 1, AHTYPE: 'A01 1+1', AHCOLLID: 'LEALCO', APAMT: valor, AHID: ahid, SEQ_REG: rows.length + 2,
      DMAMTDLQ: 0, U1ATUJUR: 0, U1IOF: 0, AHVDESC: 0, AHPDESCP: 0, APTAXAMT: 0,
    }));
  add(0, 5001, '20261117', 10000, 20000);
  add(0, 5001, '20261217', 10000, 20000);
  add(1, 5002, '20261120', 5000, valorAcordo2);
  const T = line(trail(code), { TIPO: '9', TOTAL_REGISTROS: rows.length, TOTAL_CARTAS: rows.length, SEQ_REG: rows.length + 2 });
  return [H, ...rows, T].join('\r\n') + '\r\n';
}

function repasseFile() {
  const H = line(head('REPASSE', 1), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REPASSE PAGAMENTO', TIPO_ENVIO: 'D', DATA_GERACAO: '11182026', SEQUENCIA_ARQUIVO: 4154 });
  const pay = (i: number, ahid: number, amt: number, ahcollid: string) =>
    line(rec('REPASSE'), { PMACCTG: '1', PMACCT: ACC[i].padStart(25, ' '), PMTDATE_TRANSACAO: '11172026', DMSSNUM: CPF[i], PMTCODE: 'PX', PMTDATE: '11172026', PMEDATE: '11172026', PMAMT: amt, PMBATCH: '00', AHID: ahid, AHCOLLID: ahcollid, DMAMTDLQ: 0 });
  const rows = [pay(0, 5001, 10000, 'LEALCO'), pay(2, 9999, 7000, 'APP')];
  const T = line(trail('REPASSE', 1), { TIPO: 'T', DATA_GERACAO: '11182026', QTD_REGISTROS: rows.length + 2, SEQUENCIA_ARQUIVO: 4154 });
  return [H, ...rows, T].join('\r\n') + '\r\n';
}

const upload = (agent: request.Agent, name: string, content: string) => agent.post('/api/imports').attach('file', Buffer.from(content, 'latin1'), name);

beforeAll(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => undefined);
  await pool.query(`INSERT INTO users (username, name, role, password_hash) VALUES ('adm', 'Admin Teste', 'ADMIN', $1), ('leitor', 'Leitor', 'CONSULTA', $1)`, [await hashPassword('Senha12345x')]);
  await admin.post('/api/auth/login').send({ username: 'adm', password: 'Senha12345x' }).expect(200);
  await viewer.post('/api/auth/login').send({ username: 'leitor', password: 'Senha12345x' }).expect(200);
});
afterAll(async () => {
  await pool.end();
});

describe('autenticação e perfis', () => {
  it('rejeita acesso sem sessão', async () => {
    await request(app).get('/api/dashboard').expect(401);
  });
  it('senha errada não autentica', async () => {
    await request(app).post('/api/auth/login').send({ username: 'adm', password: 'errada' }).expect(401);
  });
  it('perfil consulta não importa arquivos', async () => {
    await upload(viewer, 'ACORDO_ASSESSORIA_LEALCO_20261117_000001.txt', acordoFile('ACORDO_ASSESSORIA', 5000, 1)).expect(403);
  });
});

describe('importação, batimento e auditoria', () => {
  let acordoId: number;
  let batId: number;

  it('importa ACORDO_ASSESSORIA em pré-visualização sem afetar a base', async () => {
    const r = await upload(admin, 'ACORDO_ASSESSORIA_LEALCO_20261117_000001.txt', acordoFile('ACORDO_ASSESSORIA', 5000, 1)).expect(201);
    expect(r.body.status).toBe('PRE_VISUALIZACAO');
    expect(r.body.valid_records).toBe(3);
    expect(r.body.trailer_count_match).toBe('DADOS');
    acordoId = r.body.id;
    const d = await admin.get('/api/dashboard').expect(200);
    expect(d.body.kpis.acordos_realizados).toBe(0);
    const recs = await admin.get(`/api/imports/${acordoId}/records`).expect(200);
    expect(recs.body.total).toBe(3);
    expect(recs.body.rows[0].fields.AHTOTPMT).toBe('200.00');
  });

  it('bloqueia importação duplicada (mesmo conteúdo)', async () => {
    const r = await upload(admin, 'ACORDO_ASSESSORIA_LEALCO_20261117_000002.txt', acordoFile('ACORDO_ASSESSORIA', 5000, 1)).expect(409);
    expect(r.body.error).toMatch(/duplicada/);
  });

  it('confirma e calcula indicadores a partir dos registros', async () => {
    const r = await admin.post(`/api/imports/${acordoId}/confirm`).expect(200);
    expect(r.body.import.status).toBe('CONFIRMADO');
    // Arquivo operacional: atualiza o status, sem batimento.
    expect(r.body.flows).toEqual([]);
    expect(r.body.batimento).toBe('SOMENTE_STATUS');
    expect(r.body.status.acordos.por_status).toEqual({ PROMESSA_EM_ATRASO: 1, PROMESSA_ATIVA: 1 });
    expect((await admin.get('/api/reconciliation/results?flow=B_ACORDOS').expect(200)).body.total).toBe(0);
    const d = await admin.get('/api/dashboard').expect(200);
    expect(d.body.kpis.acordos_realizados).toBe(2);
    expect(Number(d.body.kpis.valor_negociado)).toBe(250);
    expect(d.body.kpis.acordos_reconhecidos).toBeNull(); // sem BAT_ACORDO: nada é simulado
  });

  it('repasse: marca a entrada como paga e o acordo passa a ACORDO, sem confronto diário', async () => {
    const r = await upload(admin, 'REPASSE_LEALCO_17112026.txt', repasseFile()).expect(201);
    expect(r.body.header_variant).toBe('CYBER_HT');
    const c = await admin.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    expect(c.body.flows).toEqual([]);
    const a = await admin.get('/api/acordos/5001').expect(200);
    expect(a.body.acordo.status).toBe('ACORDO');
    expect(a.body.acordo.status_source).toBe('REPASSE');
    expect(a.body.acordo.status_file).toBe('REPASSE_LEALCO_17112026.txt');
    expect(a.body.parcelas.map((p: any) => [p.numero, p.status])).toEqual([[0, 'PAGA'], [1, 'A_VENCER']]);
    expect(a.body.parcelas[0].payment_file).toBe('REPASSE_LEALCO_17112026.txt');
    expect((await admin.get('/api/reconciliation/results?flow=C_PAGAMENTOS').expect(200)).body.total).toBe(0);
    expect((await admin.get('/api/divergences?category=PAGAMENTO_NAO_IDENTIFICADO').expect(200)).body.total).toBe(0);
    // Sem BAT confirmado, a execução manual do batimento é recusada.
    await admin.post('/api/reconciliation/run').send({}).expect(409);
  });

  it('batimento mensal: confirmar BAT executa o motor e os confrontos', async () => {
    const r = await upload(admin, 'BAT_ACORDO_LEALCO_20261117_000003.txt', acordoFile('BAT_ACORDO', 7777, 3)).expect(201);
    batId = r.body.id;
    const c = await admin.post(`/api/imports/${batId}/confirm`).expect(200);
    expect(c.body.batimento).toBe('EXECUTADO');
    expect(c.body.flows.length).toBeGreaterThan(0);
    const res = await admin.get('/api/reconciliation/results?flow=C_PAGAMENTOS&rule=REPASSE_X_ACORDO').expect(200);
    const by = Object.fromEntries(res.body.rows.map((x: any) => [x.contract_key, x.status]));
    expect(by[ACC[0]]).toBe('CONCILIADO');
    expect(by[ACC[2]]).toBe('SOMENTE_ORIGEM');
    const p = await admin.get('/api/divergences?category=PAGAMENTO_NAO_IDENTIFICADO').expect(200);
    expect(p.body.total).toBe(1);
    expect(p.body.rows[0].contract_key).toBe(ACC[2]);
  });

  it('BAT_ACORDO: reconhece acordos e aponta divergência de valor por campo', async () => {
    const res = await admin.get('/api/reconciliation/results?flow=B_ACORDOS&rule=ACORDO_X_BAT_ACORDO').expect(200);
    const ok = res.body.rows.find((x: any) => x.ahid === '5001');
    const div = res.body.rows.find((x: any) => x.ahid === '5002');
    expect(ok.status).toBe('CONCILIADO');
    expect(div.status).toBe('DIVERGENTE');
    expect(div.field).toBe('AHTOTPMT');
    expect(div.value_received).toBe('50.00');
    expect(div.value_expected).toBe('77.77');
    const d = await admin.get('/api/dashboard').expect(200);
    expect(d.body.kpis.acordos_reconhecidos).toBe(1);
    expect(d.body.kpis.acordos_divergentes).toBe(1);
  });

  it('reprocessamento não duplica registros nem pendências', async () => {
    const before = await pool.query(`SELECT (SELECT count(*) FROM records)::int r, (SELECT count(*) FROM divergences)::int d`);
    await admin.post(`/api/imports/${acordoId}/reprocess`).expect(200);
    await admin.post('/api/reconciliation/run').send({}).expect(200);
    const after = await pool.query(`SELECT (SELECT count(*) FROM records)::int r, (SELECT count(*) FROM divergences)::int d`);
    expect(after.rows[0]).toEqual(before.rows[0]);
    const imp = await admin.get(`/api/imports/${acordoId}`).expect(200);
    expect(imp.body.reprocess_count).toBe(1);
  });

  it('cancelamento retira o arquivo dos batimentos e encerra as pendências dele, mantendo os registros', async () => {
    await admin.post(`/api/imports/${batId}/cancel`).send({ reason: 'arquivo substituído' }).expect(200);
    const res = await admin.get('/api/reconciliation/results?flow=B_ACORDOS&rule=ACORDO_X_BAT_ACORDO').expect(200);
    expect(res.body.total).toBe(0);
    const div = await pool.query(`SELECT status FROM divergences WHERE flow='B_ACORDOS' AND rule='ACORDO_X_BAT_ACORDO'`);
    expect(div.rows.every((r) => r.status === 'RESOLVIDA_AUTOMATICAMENTE')).toBe(true);
    const kept = await pool.query(`SELECT count(*)::int n FROM records WHERE import_id = $1`, [batId]);
    expect(kept.rows[0].n).toBe(3);
  });

  it('aceita upload compactado (gzip) e devolve o original idêntico', async () => {
    const content = repasseFile().replace('4154', '4155');
    const r = await admin.post('/api/imports').field('encoding', 'gzip')
      .attach('file', gzipSync(Buffer.from(content, 'latin1')), 'REPASSE_LEALCO_18112026.txt').expect(201);
    expect(r.body.size_bytes).toBe(String(Buffer.byteLength(content, 'latin1')));
    const d = await admin.get(`/api/imports/${r.body.id}/download`).expect(200);
    expect(d.text).toBe(content);
    await admin.post(`/api/imports/${r.body.id}/discard`).send({}).expect(200);
  });

  it('arquivo vazio fica registrado como VAZIO (não é sucesso), sem gerar pendência', async () => {
    const r = await upload(admin, 'tb_campanha_rej_ext_LEALCO_20261117_034554.txt', '').expect(201);
    expect(r.body.status).toBe('VAZIO');
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(409);
    const p = await admin.get('/api/divergences?category=ARQUIVO_INVALIDO&status=').expect(200);
    expect(p.body.rows.some((x: any) => x.source_file?.startsWith('tb_campanha'))).toBe(false);
    // segundo arquivo vazio com outro nome não é tratado como duplicado
    await upload(admin, 'tb_campanha_rej_int_LEALCO_20261117_034551.txt', '').expect(201);
  });

  it('consulta de contrato traz a linha do tempo com o resultado dos batimentos', async () => {
    const r = await admin.get(`/api/contracts/${ACC[0]}`).expect(200);
    const kinds = r.body.events.map((e: any) => e.kind);
    expect(kinds).toContain('ACORDO');
    expect(kinds).toContain('PAGAMENTO');
    const pay = r.body.events.find((e: any) => e.kind === 'PAGAMENTO');
    expect(pay.results.some((x: any) => x.status === 'CONCILIADO')).toBe(true);
  });

  it('confirma vários arquivos de uma vez e roda os batimentos uma única vez', async () => {
    const a = await upload(admin, 'BAT_ACORDO_LEALCO_20261118_000041.txt', acordoFile('BAT_ACORDO', 6001, 41)).expect(201);
    const b = await upload(admin, 'BAT_ACORDO_LEALCO_20261118_000042.txt', acordoFile('BAT_ACORDO', 6002, 42)).expect(201);
    await viewer.post('/api/imports/confirm-batch').send({ ids: [a.body.id] }).expect(403);
    const r = await admin.post('/api/imports/confirm-batch').send({ ids: [b.body.id, a.body.id, 999999] }).expect(200);
    expect(r.body.results.filter((x: any) => x.ok).map((x: any) => x.id).sort()).toEqual([a.body.id, b.body.id].sort());
    expect(r.body.flows).toEqual([]);
    for (const id of [a.body.id, b.body.id]) expect((await admin.get(`/api/imports/${id}`).expect(200)).body.status).toBe('CONFIRMADO');
    // segunda tentativa: já confirmados, falha por arquivo sem derrubar o lote
    const again = await admin.post('/api/imports/confirm-batch').send({ ids: [a.body.id] }).expect(200);
    expect(again.body.results[0]).toMatchObject({ ok: false });
    const f = await admin.post('/api/imports/confirm-batch').send({ ids: [], runFlowsFor: ['BAT_ACORDO'] }).expect(200);
    expect(f.body.flows.map((x: any) => x.flow)).toContain('B_ACORDOS');
    await admin.post('/api/imports/confirm-batch').send({ ids: Array.from({ length: 51 }, (_, i) => i + 1) }).expect(400);
  });

  it('visão do cliente agrega os contratos do CPF com totais e linha do tempo unificada', async () => {
    const r = await admin.get(`/api/clientes/${CPF[0]}`).expect(200);
    expect(r.body.cpf).toBe(CPF[0].replace(/^0+/, ''));
    expect(r.body.contratos.map((c: any) => c.contrato)).toContain(ACC[0]);
    expect(r.body.totais.contratos).toBe(r.body.contratos.length);
    expect(r.body.totais.pago).toBe(100);
    expect(r.body.timeline.every((e: any) => e.contrato)).toBe(true);
    expect(r.body.timeline.some((e: any) => e.kind === 'PAGAMENTO')).toBe(true);
    // mesma consulta com o CPF formatado e sem zeros à esquerda
    const f = await admin.get(`/api/clientes/${encodeURIComponent('000.000.001-91')}`).expect(200);
    expect(f.body.contratos.length).toBe(r.body.contratos.length);
    await admin.get('/api/clientes/99999999999').expect(404);
  });

  it('filtros rápidos combinam várias categorias e resultados', async () => {
    const all = await admin.get('/api/divergences?status=').expect(200);
    const cats = [...new Set(all.body.rows.map((x: any) => x.category))].slice(0, 2) as string[];
    const one = await admin.get(`/api/divergences?status=&category=${cats[0]}`).expect(200);
    const two = await admin.get(`/api/divergences?status=&category=${cats.join(',')}`).expect(200);
    expect(two.body.total).toBeGreaterThanOrEqual(one.body.total);
    expect(two.body.rows.every((x: any) => cats.includes(x.category))).toBe(true);
    const rr = await admin.get('/api/reconciliation/results?status=CONCILIADO,DIVERGENTE&pageSize=500').expect(200);
    expect(rr.body.rows.every((x: any) => ['CONCILIADO', 'DIVERGENTE'].includes(x.status))).toBe(true);
    expect(rr.body.rows.length).toBeGreaterThan(0);
  });

  it('exporta pendências em CSV e Excel', async () => {
    const csv = await admin.get('/api/divergences?format=csv').expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/Tipo de divergência/);
    const xlsx = await admin.get('/api/divergences?format=xlsx').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('registra auditoria das operações', async () => {
    const a = await admin.get('/api/audit?pageSize=200').expect(200);
    const actions = new Set(a.body.rows.map((r: any) => r.action));
    for (const x of ['LOGIN', 'IMPORTACAO_ENVIADA', 'IMPORTACAO_CONFIRMADA', 'IMPORTACAO_REPROCESSADA', 'IMPORTACAO_CANCELADA', 'BATIMENTO_EXECUTADO', 'EXPORTACAO']) {
      expect(actions.has(x), x).toBe(true);
    }
  });
});

describe('carteira classificada e conciliação com o CRM externo', () => {
  const csv = [
    'Contrato;CPF;Parcelas;Canal;Obs',
    `00${ACC[0]};${CPF[0]};1;Assessoria;ok`,
    `${ACC[1]};${CPF[1]};5;Assessoria;parcela errada`,
    `${ACC[1]};${CPF[1]};1;Assessoria;linha duplicada`,
    '99999999999;12345678909;1;Assessoria;conta inexistente na base',
  ].join('\r\n');
  let snapId: number;
  let runId: number;

  it('carteira classifica origem pelo AHCOLLID do acordo', async () => {
    const r = await admin.get('/api/carteira?scope=TODOS&pageSize=10').expect(200);
    const acc0 = r.body.rows.find((x: any) => x.contrato === ACC[0]);
    expect(acc0.origem).toBe('ASSESSORIA (DIRETO)');
    expect(acc0.canal_acordo).toBe('LEALCO');
    expect(acc0.parcelas).toBe(1);
    // Sem REM_CONTRATOS não há cadastro a classificar: ausência de dados não é inconsistência.
    expect(acc0.tem_cadastro).toBe(false);
    expect(acc0.ranking).toBeNull();
    expect(acc0.flags).toEqual([]);
  });

  it('carrega a exportação do CRM e sugere o mapeamento pelas colunas', async () => {
    const r = await admin.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_export.csv').expect(201);
    snapId = r.body.id;
    expect(r.body.rows_count).toBe(4);
    expect(r.body.headers).toEqual(['Contrato', 'CPF', 'Parcelas', 'Canal', 'Obs']);
    expect(r.body.suggestion.keyColumn).toBe('Contrato');
    await admin.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_export.csv').expect(409);
  });

  it('exige mapeamento antes de conciliar', async () => {
    await admin.post(`/api/crm/snapshots/${snapId}/conciliar`).send({ scope: 'TODOS' }).expect(409);
  });

  it('confronta 100% das contas: CONFORME, NÃO IMPORTADO, DIVERGENTE e fora da base', async () => {
    await admin.put('/api/crm/perfil').send({
      profile: {
        keyColumn: 'Contrato', key: { stripLeadingZeros: true, digitsOnly: false },
        comparisons: [
          { crmColumn: 'CPF', baseAttribute: 'cpf' },
          { crmColumn: 'Parcelas', baseAttribute: 'parcelas', kind: 'number' },
          { crmColumn: 'Canal', baseAttribute: 'canal_acordo', equivalences: [{ crm: 'Assessoria', base: 'LEALCO' }] },
        ],
      },
    }).expect(200);
    const r = await admin.post(`/api/crm/snapshots/${snapId}/conciliar`).send({ scope: 'TODOS' }).expect(200);
    runId = r.body.runId;
    expect(r.body.base_contas).toBe(3);
    expect(r.body.conforme).toBe(1);
    expect(r.body.divergente).toBe(1);
    expect(r.body.nao_importado).toBe(1);
    expect(r.body.nao_consta_na_base).toBe(1);
    expect(r.body.duplicados_no_crm).toBe(1);

    const items = await admin.get(`/api/crm/execucoes/${runId}/itens?pageSize=50`).expect(200);
    const by = Object.fromEntries(items.body.rows.map((x: any) => [x.contrato, x]));
    expect(by[ACC[0]].situacao).toBe('CONFORME');
    expect(by[ACC[2]].situacao).toBe('NAO_IMPORTADO');
    const div = by[ACC[1]];
    expect(div.situacao).toBe('DIVERGENTE');
    expect(div.duplicado).toBe(true);
    const parc = div.divergencias.find((d: any) => d.atributo === 'parcelas');
    expect(parc).toMatchObject({ coluna_crm: 'Parcelas', base: 1, crm: '5' });
    expect(div.divergencias.some((d: any) => d.campo === 'REGISTRO DUPLICADO NO CRM')).toBe(true);
  });

  it('exporta uma linha por campo divergente, sem alterar a exportação do CRM', async () => {
    const csvOut = await admin.get(`/api/crm/execucoes/${runId}/itens?format=csv&situacao=DIVERGENTE`).expect(200);
    expect(csvOut.text).toMatch(/Campo inconsistente;Coluna no CRM;Valor na base original;Valor no CRM/);
    expect(csvOut.text).toMatch(/Quantidade de parcelas;Parcelas;1;5/);
    const rows = await pool.query(`SELECT count(*)::int n FROM crm_snapshot_rows WHERE snapshot_id = $1`, [snapId]);
    expect(rows.rows[0].n).toBe(4);
    const orig = await admin.get(`/api/crm/snapshots/${snapId}/download`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((orig.body as Buffer).toString('utf8')).toBe(csv);
  });
});

describe('cargas variáveis: ausência de dados não bloqueia o processamento', () => {
  const ACC2 = ['10000000004', '10000000005', '10000000006', '10000000007'];
  const remFile = (seq: number, date: string) => {
    const H = line(head('REM_CONTRATOS'), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REMESSA_CONTRATOS_ASSESSORIA', TIPO_ENVIO: 'D', DATA_GERACAO: date, SEQUENCIA_ARQUIVO: seq });
    const r = (acc: string, v: Record<string, string | number>) => line(rec('REM_CONTRATOS'), { DMACCTG: '1', DMACCT: acc, ...v });
    const rows = [
      r(ACC2[0], { U1PRODUTO: 'SAMSGOLD', U1DAYSGER02: 400, DMAMTDLQ: 150000, DMCURBAL: 999999 }), // SAMS, saldo = 1.500
      r(ACC2[1], { U1PRODUTO: 'MC GOLD', DMAMTDLQ: 200000 }),                                    // cadastro sem dias de atraso
      r(ACC2[2], { U1PRODUTO: 'MCATGOLD', U1DAYSGER02: 100, DMAMTDLQ: 200000 }),                 // G1 – MAIOR MIL, faixa 04
      r(ACC2[3], { U1PRODUTO: 'VS GOLD', U1DAYSGER02: 1500, DMAMTDLQ: 50000 }),                  // G2 – MENOR MIL, faixa 22
    ];
    const T = line(trail('REM_CONTRATOS'), { TIPO: 'T', DATA_GERACAO: date, QTD_REGISTROS: rows.length, SEQUENCIA_ARQUIVO: seq });
    return [H, ...rows, T].join('\r\n') + '\r\n';
  };
  const get = async (acc: string) => (await admin.get(`/api/carteira?scope=TODOS&q=${acc}`).expect(200)).body.rows[0];

  it('importa um novo dia de remessa e classifica conforme as regras, inclusive categorias antes inexistentes', async () => {
    const r = await upload(admin, 'REM_CONTRATOS_LEALCO_20261118_010101.txt', remFile(36000, '18112026')).expect(201);
    expect(r.body.valid_records).toBe(4);
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const sams = await get(ACC2[0]);
    expect(sams.produto).toBe('SAMS CLUB');
    expect(sams.grupo).toBe('G2');
    expect(sams.ranking).toBeNull();
    expect(sams.faixa_codigo).toBe('14'); // G2: faixa independe do ranking
    expect(sams.flags).toEqual(['RANKING_SALDO_IGUAL_1500']);
    const g1 = await get(ACC2[2]);
    expect([g1.produto, g1.ranking, g1.faixa_codigo, g1.flags]).toEqual(['ATACADÃO', 'G1 – MAIOR MIL', '04', []]);
    const g2 = await get(ACC2[3]);
    expect([g2.produto, g2.ranking, g2.faixa_codigo, g2.flags]).toEqual(['CARREFOUR', 'G2 – MENOR MIL', '22', []]);
  });

  it('cadastro existente com campo vazio é inconsistência real e é sinalizado', async () => {
    const semDias = await get(ACC2[1]);
    expect(semDias.tem_cadastro).toBe(true);
    expect(semDias.flags).toEqual(['RANKING_SEM_DADOS']);
  });

  it('resumo mostra somente alertas que ocorrem e zero para categorias sem registros', async () => {
    const r = await admin.get('/api/carteira?scope=ATIVOS').expect(200);
    const flags = Object.keys(r.body.summary.flags);
    expect(flags.sort()).toEqual(['RANKING_SALDO_IGUAL_1500', 'RANKING_SEM_DADOS']);
    expect(r.body.summary.matriz['G1 – MENOR MIL']).toBeUndefined();
    expect(r.body.summary.porProduto['SAMS CLUB'].contas).toBe(1);
  });

  it('origem do acordo é buscada em qualquer arquivo com AHCOLLID, pela chave AHID', async () => {
    // ACC[2] não tem acordo no ACORDO_ASSESSORIA: a origem vem do REPASSE (AHID 9999, AHCOLLID APP).
    const c = await get(ACC[2]);
    expect(c.origem).toBe('INDIRETO');
    expect(c.origem_ahcollid).toBe('APP');
    expect(c.origem_fonte).toMatch(/^REPASSE/);
    expect(c.flags).toEqual([]);
  });

  it('pagamento sem AHCOLLID é aceito e não gera pendência de layout', async () => {
    const H = line(head('REPASSE', 1), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REPASSE PAGAMENTO', TIPO_ENVIO: 'D', DATA_GERACAO: '11192026', SEQUENCIA_ARQUIVO: 4200 });
    const p = line(rec('REPASSE'), { PMACCTG: '1', PMACCT: ACC[1].padStart(25, ' '), PMTDATE_TRANSACAO: '11182026', DMSSNUM: CPF[1], PMTCODE: 'REC', PMTDATE: '11182026', PMEDATE: '11182026', PMAMT: 1000, PMBATCH: '00', DMAMTDLQ: 0 });
    const T = line(trail('REPASSE', 1), { TIPO: 'T', DATA_GERACAO: '11192026', QTD_REGISTROS: 3, SEQUENCIA_ARQUIVO: 4200 });
    const r = await upload(admin, 'REPASSE_LEALCO_19112026.txt', [H, p, T].join('\r\n') + '\r\n').expect(201);
    expect(r.body.valid_records).toBe(1);
    expect(r.body.rejected_records).toBe(0);
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const d = await pool.query(`SELECT count(*)::int n FROM divergences WHERE import_id = $1 AND category = 'ERRO_LAYOUT'`, [r.body.id]);
    expect(d.rows[0].n).toBe(0);
  });

  it('AHCOLLID diferente entre arquivos para o mesmo acordo é sinalizado (inconsistência real)', async () => {
    const H = line(head('REPASSE', 1), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REPASSE PAGAMENTO', TIPO_ENVIO: 'D', DATA_GERACAO: '11202026', SEQUENCIA_ARQUIVO: 4300 });
    const p = line(rec('REPASSE'), { PMACCTG: '1', PMACCT: ACC[1].padStart(25, ' '), PMTDATE_TRANSACAO: '11192026', DMSSNUM: CPF[1], PMTCODE: 'PX', PMTDATE: '11192026', PMEDATE: '11192026', PMAMT: 5000, PMBATCH: '01', AHID: 5002, AHCOLLID: 'Serasa', DMAMTDLQ: 0 });
    const T = line(trail('REPASSE', 1), { TIPO: 'T', DATA_GERACAO: '11202026', QTD_REGISTROS: 3, SEQUENCIA_ARQUIVO: 4300 });
    const r = await upload(admin, 'REPASSE_LEALCO_20112026.txt', [H, p, T].join('\r\n') + '\r\n').expect(201);
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const c = await get(ACC[1]);
    expect(c.flags).toContain('ORIGEM_DIVERGENTE_ENTRE_ARQUIVOS');
    expect(c.origem_detalhe).toMatch(/ACORDO_ASSESSORIA: LEALCO/);
    expect(c.origem_detalhe).toMatch(/REPASSE: Serasa/);
  });

  it('CRM: campo sem dado na base não é confrontado por padrão; com "comparar" vira divergência', async () => {
    const csv = ['Contrato;Parcelas', `${ACC2[2]};12`].join('\r\n'); // conta sem acordo na base (parcelas vazio)
    const snap = await admin.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_dia2.csv').expect(201);
    const profile = (whenBaseEmpty: string) => ({ keyColumn: 'Contrato', key: { stripLeadingZeros: true }, comparisons: [{ crmColumn: 'Parcelas', baseAttribute: 'parcelas', kind: 'number', whenBaseEmpty }] });
    await admin.put('/api/crm/perfil').send({ profile: profile('ignore') }).expect(200);
    const a = await admin.post(`/api/crm/snapshots/${snap.body.id}/conciliar`).send({ scope: 'COM_CADASTRO' }).expect(200);
    expect(a.body.conforme).toBe(1);
    expect(a.body.divergente).toBe(0);
    expect(a.body.nao_importado).toBe(3); // demais contas com cadastro: não importadas
    expect(a.body.nao_comparados_por_campo['Quantidade de parcelas']).toBe(1);
    await admin.put('/api/crm/perfil').send({ profile: profile('compare') }).expect(200);
    const b = await admin.post(`/api/crm/snapshots/${snap.body.id}/conciliar`).send({ scope: 'COM_CADASTRO' }).expect(200);
    expect(b.body.divergente).toBe(1);
    expect(b.body.conforme).toBe(0);
  });

  it('conciliação sem nenhuma divergência executa normalmente (categorias vazias = zero)', async () => {
    const csv = ['Contrato', ...ACC2].join('\r\n');
    const snap = await admin.post('/api/crm/snapshots').attach('file', Buffer.from(csv, 'utf8'), 'crm_completo.csv').expect(201);
    await admin.put('/api/crm/perfil').send({ profile: { keyColumn: 'Contrato', key: { stripLeadingZeros: true }, comparisons: [] } }).expect(200);
    const r = await admin.post(`/api/crm/snapshots/${snap.body.id}/conciliar`).send({ scope: 'COM_CADASTRO' }).expect(200);
    expect([r.body.conforme, r.body.nao_importado, r.body.divergente, r.body.nao_consta_na_base, r.body.duplicados_no_crm]).toEqual([4, 0, 0, 0, 0]);
    const items = await admin.get(`/api/crm/execucoes/${r.body.runId}/itens?situacao=DIVERGENTE`).expect(200);
    expect(items.body.total).toBe(0);
  });
});
