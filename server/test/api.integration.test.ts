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
  const pay = (i: number, ahid: number, amt: number) =>
    line(rec('REPASSE'), { PMACCTG: '1', PMACCT: ACC[i].padStart(25, ' '), PMTDATE_TRANSACAO: '11172026', DMSSNUM: CPF[i], PMTCODE: 'PX', PMTDATE: '11172026', PMEDATE: '11172026', PMAMT: amt, PMBATCH: '00', AHID: ahid, AHCOLLID: 'APP', DMAMTDLQ: 0 });
  const rows = [pay(0, 5001, 10000), pay(2, 9999, 7000)];
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
    expect(r.body.flows.map((f: any) => f.flow)).toContain('B_ACORDOS');
    const d = await admin.get('/api/dashboard').expect(200);
    expect(d.body.kpis.acordos_realizados).toBe(2);
    expect(Number(d.body.kpis.valor_negociado)).toBe(250);
    expect(d.body.kpis.acordos_reconhecidos).toBeNull(); // sem BAT_ACORDO: nada é simulado
  });

  it('repasse: pagamento conciliado com o acordo e pagamento sem acordo vira pendência', async () => {
    const r = await upload(admin, 'REPASSE_LEALCO_17112026.txt', repasseFile()).expect(201);
    expect(r.body.header_variant).toBe('CYBER_HT');
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(200);
    const res = await admin.get('/api/reconciliation/results?flow=C_PAGAMENTOS&rule=REPASSE_X_ACORDO').expect(200);
    const by = Object.fromEntries(res.body.rows.map((x: any) => [x.contract_key, x.status]));
    expect(by[ACC[0]]).toBe('CONCILIADO');
    expect(by[ACC[2]]).toBe('SOMENTE_ORIGEM');
    const p = await admin.get('/api/divergences?category=PAGAMENTO_NAO_IDENTIFICADO').expect(200);
    expect(p.body.total).toBe(1);
    expect(p.body.rows[0].contract_key).toBe(ACC[2]);
  });

  it('BAT_ACORDO: reconhece acordos e aponta divergência de valor por campo', async () => {
    const r = await upload(admin, 'BAT_ACORDO_LEALCO_20261117_000003.txt', acordoFile('BAT_ACORDO', 7777, 3)).expect(201);
    batId = r.body.id;
    await admin.post(`/api/imports/${batId}/confirm`).expect(200);
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

  it('arquivo vazio fica como VAZIO, gera pendência e não pode ser confirmado', async () => {
    const r = await upload(admin, 'tb_campanha_rej_ext_LEALCO_20261117_034554.txt', '').expect(201);
    expect(r.body.status).toBe('VAZIO');
    await admin.post(`/api/imports/${r.body.id}/confirm`).expect(409);
    const p = await admin.get('/api/divergences?category=ARQUIVO_INVALIDO').expect(200);
    expect(p.body.rows.some((x: any) => x.import_id === undefined || x.source_file?.startsWith('tb_campanha'))).toBe(true);
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
    expect(acc0.flags).toContain('RANKING_SEM_DADOS'); // sem REM_CONTRATOS: dias/saldo indisponíveis
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
