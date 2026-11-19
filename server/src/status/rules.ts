/**
 * Regras de status operacional (puras, sem banco). Derivadas apenas dos dados importados.
 *
 * Contrato (ciclo da carga): evento mais recente entre REM_CONTRATOS (ATIVO) e
 * RET_CARTEIRA / RET_DISTRIBUICAO (005 - PARALISADO). Retirada na mesma data da remessa => PARALISADO.
 *
 * Acordo (grade de parcelas), em ordem de prioridade:
 *   1. QUEBRA_DE_ACORDO   existe registro em QUEBRA_ACORDO para o AHID
 *   2. ACORDO_EXTERNO     AHCOLLID (origem/canal) preenchido e diferente de LEALCO
 *   3. ACORDO             entrada (parcela 00) paga e colchão (01) sem atraso
 *   4. PROMESSA_EM_ATRASO entrada vencida sem pagamento (tolerância 7 dias) ou
 *                         colchão vencido sem pagamento (tolerância 30 dias)
 *   5. PROMESSA_ATIVA     acordo válido, sem quebra e dentro do prazo
 * Acima da tolerância e sem QUEBRA_ACORDO, o acordo segue EM ATRASO marcado como fora da tolerância
 * (a quebra só é registrada quando o banco envia o arquivo).
 */
import { AGENCY_ID } from '../portfolio/rules.js';

export const CONTRACT_ACTIVE = 'ATIVO';
export const CONTRACT_PAUSED = '005 - PARALISADO';
export const CONTRACT_NONE = 'SEM_DISTRIBUICAO';

export type AgreementStatus = 'PROMESSA_ATIVA' | 'PROMESSA_EM_ATRASO' | 'ACORDO' | 'QUEBRA_DE_ACORDO' | 'ACORDO_EXTERNO' | 'NAO_IDENTIFICADO';
export type InstallmentStatus = 'PAGA' | 'A_VENCER' | 'EM_ATRASO' | 'VENCIDA' | 'QUEBRADA';

/** Tolerância de atraso por parcela: entrada (00) 7 dias; colchão (01) 30 dias; demais sem tolerância definida. */
export const TOLERANCE: Record<number, number> = { 0: 7, 1: 30 };

export interface Ev { date: string | null; source: string; importId: number; recordId: string }

/** Situação do contrato pelo evento mais recente (remessa x retirada). */
export function contractStatus(rem: Ev | undefined, ret: Ev | undefined): { status: string; ev: Ev | null } {
  if (rem && ret) return (ret.date ?? '') >= (rem.date ?? '') ? { status: CONTRACT_PAUSED, ev: ret } : { status: CONTRACT_ACTIVE, ev: rem };
  if (rem) return { status: CONTRACT_ACTIVE, ev: rem };
  if (ret) return { status: CONTRACT_PAUSED, ev: ret };
  return { status: CONTRACT_NONE, ev: null };
}

export interface ParcelIn { dueDate: string | null; amount: number | null; recordId: string; importId: number }
export interface PaymentIn { date: string | null; amount: number | null; parcel: number | null; recordId: string; importId: number }
export interface ParcelOut {
  numero: number;
  dueDate: string | null;
  amount: number | null;
  status: InstallmentStatus;
  daysLate: number | null;
  toleranceDays: number | null;
  paidAt: string | null;
  paidAmount: number | null;
  agreementRecordId: string;
  agreementImportId: number;
  paymentRecordId: string | null;
  paymentImportId: number | null;
}
export interface AgreementIn {
  ahid: string;
  agreementDate: string | null;
  parcels: ParcelIn[];
  payments: PaymentIn[];
  ahcollid: { value: string; source: string; importId: number; recordId: string } | null;
  quebra: { date: string | null; importId: number; recordId: string } | null;
  head: { importId: number; recordId: string } | null;
}
export interface AgreementOut {
  status: AgreementStatus;
  date: string | null;
  source: string | null;
  importId: number | null;
  recordId: string | null;
  reason: string;
  daysLate: number | null;
  beyondTolerance: boolean;
  parcels: ParcelOut[];
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const br = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Grade de parcelas: ordena pelo vencimento (00 = entrada) e associa os pagamentos do REPASSE pelo PMBATCH. */
export function buildParcels(parcels: ParcelIn[], payments: PaymentIn[], ref: string, broken: boolean): ParcelOut[] {
  const sorted = [...parcels].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || Number(a.recordId) - Number(b.recordId));
  const byNum = new Map<number, PaymentIn>();
  const loose: PaymentIn[] = [];
  for (const p of [...payments].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))) {
    if (p.parcel !== null && p.parcel >= 0 && p.parcel < sorted.length && !byNum.has(p.parcel)) byNum.set(p.parcel, p);
    else loose.push(p);
  }
  // Pagamento sem número de parcela utilizável: atribuído à primeira parcela ainda sem pagamento.
  for (const p of loose) {
    const free = sorted.findIndex((_, i) => !byNum.has(i));
    if (free >= 0) byNum.set(free, p);
  }
  return sorted.map((pc, i) => {
    const pay = byNum.get(i) ?? null;
    const tol = TOLERANCE[i] ?? null;
    let status: InstallmentStatus;
    let late: number | null = null;
    if (pay) status = 'PAGA';
    else if (broken) status = 'QUEBRADA';
    else if (!pc.dueDate || pc.dueDate >= ref) status = 'A_VENCER';
    else {
      late = daysBetween(pc.dueDate, ref);
      status = tol !== null && late > tol ? 'VENCIDA' : 'EM_ATRASO';
    }
    return {
      numero: i,
      dueDate: pc.dueDate,
      amount: pc.amount,
      status,
      daysLate: late,
      toleranceDays: tol,
      paidAt: pay?.date ?? null,
      paidAmount: pay?.amount ?? null,
      agreementRecordId: pc.recordId,
      agreementImportId: pc.importId,
      paymentRecordId: pay?.recordId ?? null,
      paymentImportId: pay?.importId ?? null,
    };
  });
}

export function agreementStatus(a: AgreementIn, ref: string): AgreementOut {
  const parcels = buildParcels(a.parcels, a.payments, ref, !!a.quebra);
  const head = a.head;
  const out = (status: AgreementStatus, date: string | null, src: { source: string; importId: number; recordId: string } | null, reason: string, extra: Partial<AgreementOut> = {}): AgreementOut => ({
    status, date, source: src?.source ?? null, importId: src?.importId ?? null, recordId: src?.recordId ?? null, reason, daysLate: null, beyondTolerance: false, parcels, ...extra,
  });
  if (a.quebra) return out('QUEBRA_DE_ACORDO', a.quebra.date, { source: 'QUEBRA_ACORDO', ...a.quebra }, `Quebra registrada em ${br(a.quebra.date)}`);
  const coll = a.ahcollid?.value.trim();
  if (coll && coll.toUpperCase() !== AGENCY_ID) return out('ACORDO_EXTERNO', a.agreementDate, a.ahcollid, `Origem/canal ${coll} (${a.ahcollid!.source})`);
  if (!parcels.length || !head) return out('NAO_IDENTIFICADO', null, null, 'Acordo sem ACORDO_ASSESSORIA importado');
  const headSrc = { source: 'ACORDO_ASSESSORIA', ...head };
  const [entrada, colchao] = parcels;
  const late = (p: ParcelOut, label: string) =>
    out('PROMESSA_EM_ATRASO', p.dueDate, { source: 'ACORDO_ASSESSORIA', importId: p.agreementImportId, recordId: p.agreementRecordId },
      `${label} vencida em ${br(p.dueDate)} sem pagamento (${p.daysLate} dia(s); tolerância ${p.toleranceDays})${p.status === 'VENCIDA' ? ': fora da tolerância, aguardando QUEBRA_ACORDO' : ''}`,
      { daysLate: p.daysLate, beyondTolerance: p.status === 'VENCIDA' });
  if (entrada.status !== 'PAGA') {
    if (entrada.status === 'EM_ATRASO' || entrada.status === 'VENCIDA') return late(entrada, 'Entrada');
    return out('PROMESSA_ATIVA', a.agreementDate, headSrc, entrada.dueDate ? `Entrada a vencer em ${br(entrada.dueDate)}` : 'Acordo válido, sem quebra');
  }
  if (colchao && (colchao.status === 'EM_ATRASO' || colchao.status === 'VENCIDA')) return late(colchao, 'Parcela de colchão');
  return out('ACORDO', entrada.paidAt, { source: 'REPASSE', importId: entrada.paymentImportId!, recordId: entrada.paymentRecordId! }, `Entrada paga em ${br(entrada.paidAt)}`);
}
