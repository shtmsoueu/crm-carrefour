/** Regras de status operacional (contrato e acordo) — funções puras, sem banco. */
import { describe, expect, it } from 'vitest';
import { agreementStatus, buildParcels, contractStatus, type AgreementIn } from '../src/status/rules.js';

const ev = (date: string, source: string) => ({ date, source, importId: 1, recordId: '1' });

describe('status do contrato (ciclo da carga)', () => {
  it('REM => ATIVO; RET_CARTEIRA ou RET_DISTRIBUICAO => 005 - PARALISADO; vale o evento mais recente', () => {
    expect(contractStatus(ev('2026-11-01', 'REM_CONTRATOS'), undefined).status).toBe('ATIVO');
    expect(contractStatus(undefined, ev('2026-11-01', 'RET_CARTEIRA')).status).toBe('005 - PARALISADO');
    expect(contractStatus(ev('2026-11-01', 'REM_CONTRATOS'), ev('2026-11-05', 'RET_DISTRIBUICAO'))).toMatchObject({ status: '005 - PARALISADO', ev: { source: 'RET_DISTRIBUICAO', date: '2026-11-05' } });
    expect(contractStatus(ev('2026-11-10', 'REM_CONTRATOS'), ev('2026-11-05', 'RET_CARTEIRA'))).toMatchObject({ status: 'ATIVO', ev: { source: 'REM_CONTRATOS' } });
    expect(contractStatus(ev('2026-11-05', 'REM_CONTRATOS'), ev('2026-11-05', 'RET_CARTEIRA')).status).toBe('005 - PARALISADO'); // mesma data
    expect(contractStatus(undefined, undefined).status).toBe('SEM_DISTRIBUICAO');
  });
});

const parcel = (due: string, rec: string) => ({ dueDate: due, amount: 100, recordId: rec, importId: 10 });
const pay = (date: string, parcel: number | null, rec = '90') => ({ date, amount: 100, parcel, recordId: rec, importId: 20 });
const ag = (over: Partial<AgreementIn> = {}): AgreementIn => ({
  ahid: '1',
  agreementDate: '2026-11-01',
  parcels: [parcel('2026-11-10', '1'), parcel('2026-12-10', '2'), parcel('2027-01-10', '3')],
  payments: [],
  ahcollid: { value: 'LEALCO', source: 'ACORDO_ASSESSORIA', importId: 10, recordId: '1' },
  quebra: null,
  head: { importId: 10, recordId: '1' },
  ...over,
});

describe('status do acordo (grade de parcelas)', () => {
  it('PROMESSA ATIVA: entrada a vencer', () => {
    expect(agreementStatus(ag(), '2026-11-10')).toMatchObject({ status: 'PROMESSA_ATIVA', source: 'ACORDO_ASSESSORIA' });
  });

  it('PROMESSA EM ATRASO: entrada com até 7 dias; acima disso fica fora da tolerância (aguarda QUEBRA_ACORDO)', () => {
    expect(agreementStatus(ag(), '2026-11-17')).toMatchObject({ status: 'PROMESSA_EM_ATRASO', daysLate: 7, beyondTolerance: false });
    const r = agreementStatus(ag(), '2026-11-18');
    expect(r).toMatchObject({ status: 'PROMESSA_EM_ATRASO', daysLate: 8, beyondTolerance: true });
    expect(r.parcels[0].status).toBe('VENCIDA');
  });

  it('ACORDO: entrada paga (PMBATCH 00); colchão em atraso até 30 dias volta a PROMESSA EM ATRASO', () => {
    const paid = ag({ payments: [pay('2026-11-09', 0)] });
    expect(agreementStatus(paid, '2026-12-10')).toMatchObject({ status: 'ACORDO', source: 'REPASSE', date: '2026-11-09' });
    expect(agreementStatus(paid, '2027-01-09')).toMatchObject({ status: 'PROMESSA_EM_ATRASO', daysLate: 30, beyondTolerance: false });
    expect(agreementStatus(paid, '2027-01-10')).toMatchObject({ status: 'PROMESSA_EM_ATRASO', daysLate: 31, beyondTolerance: true });
    expect(agreementStatus(ag({ payments: [pay('2026-11-09', 0), pay('2026-12-09', 1, '91')] }), '2027-02-01').status).toBe('ACORDO');
  });

  it('QUEBRA DE ACORDO tem prioridade e marca as parcelas não pagas como quebradas', () => {
    const r = agreementStatus(ag({ payments: [pay('2026-11-09', 0)], quebra: { date: '2026-12-20', importId: 30, recordId: '5' } }), '2026-12-21');
    expect(r).toMatchObject({ status: 'QUEBRA_DE_ACORDO', source: 'QUEBRA_ACORDO', date: '2026-12-20', importId: 30 });
    expect(r.parcels.map((p) => p.status)).toEqual(['PAGA', 'QUEBRADA', 'QUEBRADA']);
  });

  it('ACORDO EXTERNO: origem/canal diferente de LEALCO; sem AHCOLLID não há classificação externa', () => {
    expect(agreementStatus(ag({ ahcollid: { value: 'Serasa', source: 'REPASSE', importId: 20, recordId: '9' } }), '2026-11-10')).toMatchObject({ status: 'ACORDO_EXTERNO', source: 'REPASSE' });
    expect(agreementStatus(ag({ ahcollid: null }), '2026-11-10').status).toBe('PROMESSA_ATIVA');
  });

  it('acordo conhecido só por outros arquivos (sem ACORDO_ASSESSORIA) => NAO_IDENTIFICADO', () => {
    expect(agreementStatus(ag({ parcels: [], head: null }), '2026-11-10').status).toBe('NAO_IDENTIFICADO');
  });

  it('grade: ordena por vencimento e usa o PMBATCH; sem número utilizável, vai para a primeira parcela em aberto', () => {
    const g = buildParcels([parcel('2026-12-10', '2'), parcel('2026-11-10', '1')], [pay('2026-12-01', 1), pay('2026-11-05', null, '92')], '2026-12-15', false);
    expect(g.map((p) => [p.numero, p.dueDate, p.status, p.paymentRecordId])).toEqual([
      [0, '2026-11-10', 'PAGA', '92'],
      [1, '2026-12-10', 'PAGA', '90'],
    ]);
  });
});
