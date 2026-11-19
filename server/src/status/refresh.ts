/**
 * Atualização do status operacional (contrato e acordo) a partir dos arquivos operacionais já importados.
 * Não confronta com o batimento: roda a cada confirmação, cancelamento ou reprocessamento de arquivo.
 */
import type pg from 'pg';
import { withTransaction } from '../db/pool.js';
import { loadAll, loadLatestPerAhid, loadLatestPerContract, type Rec } from '../reconciliation/data.js';
import { agreementStatus, buildParcels, contractStatus, type Ev, type PaymentIn } from './rules.js';

/** Tipos de arquivo que alteram o status operacional. */
export const STATUS_SOURCES = ['REM_CONTRATOS', 'RET_CARTEIRA', 'RET_DISTRIBUICAO', 'ACORDO_ASSESSORIA', 'QUEBRA_ACORDO', 'REPASSE'];

/** Data de referência dos prazos: hoje no fuso de São Paulo. */
export const todaySP = () =>
  // STATUS_REF_DATE (AAAA-MM-DD) fixa a data de referência em testes e homologação.
  /^\d{4}-\d{2}-\d{2}$/.test(process.env.STATUS_REF_DATE ?? '') ? process.env.STATUS_REF_DATE! : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

const ev = (r: (Rec & { ref_date: string | null }) | undefined): Ev | undefined =>
  r ? { date: r.ref_date, source: r.file_type, importId: r.import_id, recordId: r.id } : undefined;
const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

async function batched(db: pg.PoolClient, rows: unknown[], sql: string) {
  for (let i = 0; i < rows.length; i += 5000) await db.query(sql, [JSON.stringify(rows.slice(i, i + 5000))]);
}

export async function refreshContractStatus(db: pg.PoolClient) {
  const rem = await loadLatestPerContract(db, 'REM_CONTRATOS', 'COALESCE(i.generation_date, i.file_name_date)');
  const retd = await loadLatestPerContract(db, 'RET_DISTRIBUICAO');
  const retc = await loadLatestPerContract(db, 'RET_CARTEIRA', 'COALESCE(i.generation_date, i.file_name_date)');
  const rows: { k: string; s: string; d: string | null; src: string; imp: number; rec: string }[] = [];
  for (const k of new Set([...rem.keys(), ...retd.keys(), ...retc.keys()])) {
    const a = retd.get(k);
    const c = retc.get(k);
    const ret = a && c ? ((a.ref_date ?? '') >= (c.ref_date ?? '') ? a : c) : (a ?? c);
    const st = contractStatus(ev(rem.get(k)), ev(ret));
    if (st.ev) rows.push({ k, s: st.status, d: st.ev.date, src: st.ev.source, imp: st.ev.importId, rec: st.ev.recordId });
  }
  await db.query(`UPDATE contracts SET status='SEM_DISTRIBUICAO', status_date=NULL, status_source=NULL, status_import_id=NULL, status_record_id=NULL WHERE status <> 'SEM_DISTRIBUICAO' OR status_source IS NOT NULL`);
  await batched(db, rows,
    `UPDATE contracts c SET status = x.s, status_date = x.d, status_source = x.src, status_import_id = x.imp, status_record_id = x.rec, updated_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS x(k text, s text, d date, src text, imp int, rec bigint) WHERE c.contract_key = x.k`);
  const count = (s: string) => rows.filter((r) => r.s === s).length;
  return { contratos: rows.length, ativos: count('ATIVO'), paralisados: count('005 - PARALISADO') };
}

export async function refreshAgreementStatus(db: pg.PoolClient, ref = todaySP()) {
  const known = (await db.query<{ ahid: string }>(`SELECT ahid::text FROM agreements`)).rows.map((r) => r.ahid);
  const aco = await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA');
  // REPASSE: linhas idênticas contam uma vez (mesma regra do batimento de pagamentos).
  const seen = new Set<string>();
  const pays = new Map<string, Rec[]>();
  for (const p of await loadAll(db, 'REPASSE')) {
    if (!p.ahid || seen.has(p.record_hash)) continue;
    seen.add(p.record_hash);
    pays.set(p.ahid, [...(pays.get(p.ahid) ?? []), p]);
  }
  const quebra = new Map<string, Rec>();
  for (const q of await loadAll(db, 'QUEBRA_ACORDO')) if (q.ahid) quebra.set(q.ahid, q); // ordenado por data: fica a mais recente

  const agRows: Record<string, unknown>[] = [];
  const parcelRows: Record<string, unknown>[] = [];
  const tally: Record<string, number> = {};
  for (const ahid of known) {
    const lines = aco.get(ahid) ?? [];
    const head = lines[0];
    const payments = pays.get(ahid) ?? [];
    // Origem/canal: REPASSE (gestor que capturou) e, na falta, ACORDO_ASSESSORIA (canal), como na Carteira.
    const collRec = [...payments].reverse().find((p) => p.fields.AHCOLLID?.trim()) ?? lines.find((l) => l.fields.AHCOLLID?.trim());
    const q = quebra.get(ahid);
    const res = agreementStatus(
      {
        ahid,
        agreementDate: head?.fields.AHDT ?? null,
        parcels: lines.map((l) => ({ dueDate: l.fields.APDUEDT, amount: num(l.fields.APAMT), recordId: l.id, importId: l.import_id })),
        payments: payments.map((p): PaymentIn => {
          const n = Number(String(p.fields.PMBATCH ?? '').trim());
          return { date: p.event_date, amount: num(p.amount), parcel: String(p.fields.PMBATCH ?? '').trim() !== '' && Number.isInteger(n) ? n : null, recordId: p.id, importId: p.import_id };
        }),
        ahcollid: collRec ? { value: collRec.fields.AHCOLLID!.trim(), source: collRec.file_type, importId: collRec.import_id, recordId: collRec.id } : null,
        quebra: q ? { date: q.event_date, importId: q.import_id, recordId: q.id } : null,
        head: head ? { importId: head.import_id, recordId: head.id } : null,
      },
      ref,
    );
    tally[res.status] = (tally[res.status] ?? 0) + 1;
    agRows.push({
      ahid, s: res.status, d: res.date, src: res.source, imp: res.importId, rec: res.recordId, reason: res.reason, late: res.daysLate, beyond: res.beyondTolerance,
      coll: collRec?.fields.AHCOLLID?.trim() ?? null, collsrc: collRec?.file_type ?? null, broken: q?.event_date ?? null,
      ad: head?.fields.AHDT ?? null, at: head?.fields.AHTYPE ?? null, av: head?.fields.AHTOTPMT ?? null, ap: head?.fields.AHPRD == null ? null : Number(head.fields.AHPRD),
    });
    for (const p of res.parcels) {
      parcelRows.push({
        ahid, n: p.numero, due: p.dueDate, amt: p.amount, s: p.status, late: p.daysLate, tol: p.toleranceDays, paid: p.paidAt, pamt: p.paidAmount,
        arec: p.agreementRecordId, aimp: p.agreementImportId, prec: p.paymentRecordId, pimp: p.paymentImportId,
      });
    }
  }
  await batched(db, agRows,
    `UPDATE agreements a SET status = x.s, status_date = x.d, status_source = x.src, status_import_id = x.imp, status_record_id = x.rec,
       status_reason = x.reason, status_ref_date = $REF, days_late = x.late, beyond_tolerance = x.beyond, ahcollid = x.coll, ahcollid_source = x.collsrc,
       broken_at = x.broken, agreement_date = COALESCE(x.ad, a.agreement_date), agreement_type = COALESCE(x.at, a.agreement_type),
       total_amount = COALESCE(x.av, a.total_amount), installments = COALESCE(x.ap, a.installments), updated_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, s text, d date, src text, imp int, rec bigint, reason text, late int, beyond boolean,
       coll text, collsrc text, broken date, ad date, at text, av numeric, ap int)
     WHERE a.ahid = x.ahid`.replace('$REF', `'${ref.replace(/[^0-9-]/g, '')}'::date`));
  await db.query(`DELETE FROM agreement_installments`);
  await batched(db, parcelRows,
    `INSERT INTO agreement_installments (ahid, numero, due_date, amount, status, days_late, tolerance_days, paid_at, paid_amount,
       agreement_record_id, agreement_import_id, payment_record_id, payment_import_id)
     SELECT x.ahid, x.n, x.due, x.amt, x.s, x.late, x.tol, x.paid, x.pamt, x.arec, x.aimp, x.prec, x.pimp
     FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, n int, due date, amt numeric, s text, late int, tol int, paid date, pamt numeric,
       arec bigint, aimp int, prec bigint, pimp int)`);
  return { acordos: known.length, parcelas: parcelRows.length, por_status: tally, referencia: ref };
}

/**
 * Atualização leve de prazos (virada do dia): recalcula o status das parcelas e dos acordos
 * a partir da grade já gravada, com as mesmas regras, sem reler os arquivos importados.
 * Quebra e origem externa não dependem da data: mantêm o status e a origem gravados.
 */
export async function refreshDueDates(db: pg.PoolClient, ref = todaySP()) {
  const ags = await db.query<{ ahid: string; status: string; agreement_date: string | null; broken_at: string | null; status_import_id: number | null; status_record_id: string | null }>(
    `SELECT ahid::text, status, agreement_date::text, broken_at::text, status_import_id, status_record_id::text FROM agreements
     WHERE ahid IN (SELECT DISTINCT ahid FROM agreement_installments)`);
  const inst = await db.query<{ ahid: string; numero: number; due_date: string | null; amount: string | null; paid_at: string | null; paid_amount: string | null;
    agreement_record_id: string; agreement_import_id: number; payment_record_id: string | null; payment_import_id: number | null }>(
    `SELECT ahid::text, numero, due_date::text, amount::text, paid_at::text, paid_amount::text, agreement_record_id::text, agreement_import_id,
       payment_record_id::text, payment_import_id FROM agreement_installments ORDER BY ahid, numero`);
  const by = new Map<string, typeof inst.rows>();
  for (const r of inst.rows) by.set(r.ahid, [...(by.get(r.ahid) ?? []), r]);
  const DATED = new Set(['PROMESSA_ATIVA', 'PROMESSA_EM_ATRASO', 'ACORDO']);
  const agRows: Record<string, unknown>[] = [];
  const parcelRows: Record<string, unknown>[] = [];
  for (const a of ags.rows) {
    const list = by.get(a.ahid) ?? [];
    const parcels = list.map((p) => ({ dueDate: p.due_date, amount: num(p.amount), recordId: p.agreement_record_id, importId: p.agreement_import_id }));
    const payments: PaymentIn[] = list.filter((p) => p.payment_record_id).map((p) => ({ date: p.paid_at, amount: num(p.paid_amount), parcel: p.numero, recordId: p.payment_record_id!, importId: p.payment_import_id! }));
    const broken = a.status === 'QUEBRA_DE_ACORDO';
    for (const p of buildParcels(parcels, payments, ref, broken)) parcelRows.push({ ahid: a.ahid, n: p.numero, s: p.status, late: p.daysLate });
    if (!DATED.has(a.status) || !list.length) continue;
    const res = agreementStatus({ ahid: a.ahid, agreementDate: a.agreement_date, parcels, payments, ahcollid: null, quebra: null, head: { importId: list[0].agreement_import_id, recordId: list[0].agreement_record_id } }, ref);
    agRows.push({ ahid: a.ahid, s: res.status, d: res.date, src: res.source, imp: res.importId, rec: res.recordId, reason: res.reason, late: res.daysLate, beyond: res.beyondTolerance });
  }
  await batched(db, parcelRows,
    `UPDATE agreement_installments p SET status = x.s, days_late = x.late FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, n int, s text, late int)
     WHERE p.ahid = x.ahid AND p.numero = x.n AND (p.status IS DISTINCT FROM x.s OR p.days_late IS DISTINCT FROM x.late)`);
  await batched(db, agRows,
    `UPDATE agreements a SET status = x.s, status_date = x.d, status_source = x.src, status_import_id = x.imp, status_record_id = x.rec,
       status_reason = x.reason, days_late = x.late, beyond_tolerance = x.beyond, updated_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, s text, d date, src text, imp int, rec bigint, reason text, late int, beyond boolean)
     WHERE a.ahid = x.ahid AND (a.status, a.status_reason) IS DISTINCT FROM (x.s, x.reason)`);
  await db.query(`UPDATE agreements SET status_ref_date = $1::date WHERE status_ref_date IS DISTINCT FROM $1::date`, [ref]);
  return { acordos: ags.rows.length, alterados: agRows.length, referencia: ref };
}

/** Recalcula contratos e acordos numa única transação (após mudança nos arquivos importados). */
export async function refreshStatuses(ref?: string) {
  const t0 = Date.now();
  return withTransaction(async (db) => {
    // Falha de forma controlada antes do limite da hospedagem (60 s), sem deixar a requisição pendurada.
    await db.query(`SET LOCAL statement_timeout = '45s'`);
    // Serializa atualizações simultâneas.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('status-operacional'))`);
    const contratos = await refreshContractStatus(db);
    const acordos = await refreshAgreementStatus(db, ref);
    return { contratos, acordos, duracao_ms: Date.now() - t0 };
  });
}
