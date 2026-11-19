import { describe, expect, it } from 'vitest';
import { getLayout } from '../src/layouts/definitions.js';
import { parseDate, parseField, parseNumber } from '../src/parsing/fields.js';
import { parseLines, parseUnstructured, type ParsedRecord } from '../src/parsing/parser.js';
import { head, line, rec, trail } from './helpers.js';

async function parse(code: string, lines: string[]) {
  const out: ParsedRecord[] = [];
  const res = await parseLines(lines, getLayout(code), (r) => void out.push(r));
  return { res, out };
}

describe('campos', () => {
  it('datas nos três formatos dos layouts', () => {
    expect(parseDate('20261117', 'AAAAMMDD')).toBe('2026-11-17');
    expect(parseDate('17112026', 'DDMMAAAA')).toBe('2026-11-17');
    expect(parseDate('11172026', 'MMDDAAAA')).toBe('2026-11-17');
    expect(parseDate('01011900', 'MMDDAAAA')).toBe('1900-01-01');
    expect(parseDate('20261317', 'AAAAMMDD')).toBeNull();
    expect(parseDate('31022026', 'DDMMAAAA')).toBeNull();
  });
  it('números com decimais implícitos e sem perda de precisão', () => {
    expect(parseNumber('000000000521523', 2, false)).toBe('5215.23');
    expect(parseNumber('0970000', 4, false)).toBe('97.0000');
    expect(parseNumber('0000000000000000000400', undefined, false)).toBe('400');
    expect(parseNumber('-000', undefined, true)).toBe('0');
    expect(parseNumber('12A4', 2, false)).toBeNull();
  });
  it('valor negativo não previsto é aceito com alerta', () => {
    const p = parseField('-0000000055', { name: 'X', label: '', start: 1, end: 11, type: 'N', decimals: 2, required: true });
    expect(p.value).toBe('-0.55');
    expect(p.issue?.severity).toBe('ALERTA');
  });
  it('obrigatório vazio é erro', () => {
    expect(parseField('   ', { name: 'X', label: '', start: 1, end: 3, type: 'A', required: true }).issue?.severity).toBe('ERRO');
  });
});

describe('REM_CONTRATOS (header/trailer Cyber H/T)', () => {
  const H = line(head('REM_CONTRATOS'), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REMESSA_CONTRATOS_ASSESSORIA', TIPO_ENVIO: 'D', DATA_GERACAO: '17112026', SEQUENCIA_ARQUIVO: 35020 });
  const r1 = line(rec('REM_CONTRATOS'), { DMACCTG: '1', DMACCT: '11111111111', DMSSNUM: '00000000191', DMNAME: 'TITULAR TESTE', DMCURBAL: 123456, DMDLQDT: '08102025' });
  const r2 = line(rec('REM_CONTRATOS'), { DMACCTG: '1', DMACCT: '22222222222', DMSSNUM: '00000000272' });
  const T = (n: number) => line(trail('REM_CONTRATOS'), { TIPO: 'T', DATA_GERACAO: '17112026', QTD_REGISTROS: n, SEQUENCIA_ARQUIVO: 35020 });

  it('interpreta campos, header e trailer', async () => {
    const { res, out } = await parse('REM_CONTRATOS', [H, r1, r2, T(2)]);
    expect(res.headerVariant).toBe('CYBER_HT');
    expect(res.generationDate).toBe('2026-11-17');
    expect(res.sequenceNumber).toBe('35020');
    expect(res.trailerCountMatches).toBe('DADOS');
    expect(res.validRecords).toBe(2);
    expect(out[0].contractKey).toBe('11111111111');
    expect(out[0].fields.DMCURBAL).toBe('1234.56');
    expect(out[0].fields.DMDLQDT).toBe('2025-08-10'); // MMDDAAAA
  });
  it('trailer que inclui header/trailer é aceito com alerta; divergente é sinalizado', async () => {
    expect((await parse('REM_CONTRATOS', [H, r1, r2, T(4)])).res.trailerCountMatches).toBe('TOTAL_LINHAS');
    expect((await parse('REM_CONTRATOS', [H, r1, r2, T(9)])).res.trailerCountMatches).toBe('NAO_CONFERE');
  });
  it('linha com tamanho diferente do layout é rejeitada', async () => {
    const { res, out } = await parse('REM_CONTRATOS', [H, r1.slice(0, 900), r2, T(2)]);
    expect(res.rejectedRecords).toBe(1);
    expect(out[0].valid).toBe(false);
    expect(out[0].errors[0]).toMatch(/Tamanho/);
  });
  it('linhas idênticas são marcadas como duplicadas', async () => {
    const { res, out } = await parse('REM_CONTRATOS', [H, r1, r1, T(2)]);
    expect(res.duplicateRecords).toBe(1);
    expect(out[1].isDuplicate).toBe(true);
  });
  it('arquivo sem header é inválido', async () => {
    const { res } = await parse('REM_CONTRATOS', [r1, T(1)]);
    expect(res.fileErrors).toBeGreaterThan(0);
  });
});

describe('REPASSE aceita as duas variantes de header', () => {
  const p = line(rec('REPASSE'), {
    PMACCTG: '1', PMACCT: '              33333333333', PMTDATE_TRANSACAO: '11172026', DMSSNUM: '12345678909', PMTCODE: 'PX',
    PMTDATE: '11172026', PMEDATE: '11172026', PMAMT: 5000, PMBATCH: '01', AHID: '0000022859195', AHCOLLID: 'APP', DMAMTDLQ: 0,
  });
  it('variante oficial 0/9', async () => {
    const H = line(head('REPASSE', 0), { TIPO: '0', DATA_GERACAO: '11182026', NOME_ARQUIVO: 'PAGAMENTOS PORTAIS' });
    const T = line(trail('REPASSE', 0), { TIPO: '9', TOTAL_REGISTROS: 1 });
    const { res, out } = await parse('REPASSE', [H, p, T]);
    expect(res.headerVariant).toBe('REPASSE_0_9');
    expect(out[0].ahid).toBe('22859195');
    expect(out[0].amount).toBe('50.00');
    expect(out[0].contractKey).toBe('33333333333');
  });
  it('variante Cyber H/T observada na carga real', async () => {
    const H = line(head('REPASSE', 1), { TIPO: 'H', EMPRESA: 'CYBER', ARQUIVO: 'REPASSE PAGAMENTO', TIPO_ENVIO: 'D', DATA_GERACAO: '11182026', SEQUENCIA_ARQUIVO: 4154 });
    const T = line(trail('REPASSE', 1), { TIPO: 'T', DATA_GERACAO: '11182026', QTD_REGISTROS: 3, SEQUENCIA_ARQUIVO: 4154 });
    const { res } = await parse('REPASSE', [H, p, T]);
    expect(res.headerVariant).toBe('CYBER_HT');
    expect(res.validRecords).toBe(1);
    expect(res.issues.some((i) => /Header no formato/.test(i.message))).toBe(true);
  });
});

describe('layouts sem header e arquivos vazios', () => {
  it('ELEGIBILIDADE ignora linhas em branco', async () => {
    const r = line(rec('ELEGIBILIDADE', '*'), { AGTYPE: 'A01 1+0', AGINITDT: '08012014', AGENDDT: '12312099', AGDMDAYSMIN: '-000', AGDMDAYSMAX: '-000', AGPYTYPE: 'NO_INT',
      AGGRDAYS: 25, AGRATE2: 0, AGBREAK: 1, AGRATE: 0, AGTAXRATE: 0, AGINITPYDAYS: 30, AGLSTPYDAYS: 1000, AGINITPYMINP: 100, AGINITPYMAXP: 100, AGMININITPY: 0, AGMAXPMTS: 0 });
    const { res, out } = await parse('ELEGIBILIDADE', [' ', r, ' ']);
    expect(res.validRecords).toBe(1);
    expect(res.blankLines).toBe(2);
    expect(out[0].fields.AGENDDT).toBe('2099-12-31');
  });
  it('arquivo vazio nunca é sucesso', async () => {
    const res = await parseUnstructured([], getLayout('REJ_CAMPANHA_EXT'), null, () => undefined);
    expect(res.empty).toBe(true);
    expect(res.fileErrors).toBe(1);
  });
  it('rejeição com extração configurada', async () => {
    const out: ParsedRecord[] = [];
    await parseUnstructured(['11111111111;Endereço inválido'], getLayout('REJ_CAMPANHA_EXT'), { mode: 'delimited', delimiter: ';', contractIndex: 0, reasonIndex: 1 }, (r) => void out.push(r));
    expect(out[0].contractKey).toBe('11111111111');
    expect(out[0].fields.MOTIVO).toBe('Endereço inválido');
  });
});

describe('conexão com o banco', () => {
  it('explicita sslmode=verify-full sem alterar o restante do endereço', async () => {
    const { normalizeSslMode } = await import('../src/db/pool.js');
    expect(normalizeSslMode('postgres://u:p@h/db?sslmode=require')).toBe('postgres://u:p@h/db?sslmode=verify-full');
    expect(normalizeSslMode('postgres://u:p@h/db?sslmode=require&channel_binding=require')).toBe('postgres://u:p@h/db?sslmode=verify-full&channel_binding=require');
    expect(normalizeSslMode('postgres://u:p@localhost/db')).toBe('postgres://u:p@localhost/db');
    expect(normalizeSslMode('postgres://u:p@h/db?sslmode=disable')).toBe('postgres://u:p@h/db?sslmode=disable');
  });
});
