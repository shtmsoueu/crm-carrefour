import { pool, withTransaction } from '../db/pool.js';
import { refreshDueDates, todaySP } from './refresh.js';

let currentDay: string | null = null;

/**
 * Os prazos dependem da data de hoje. Na virada do dia, aplica a atualização leve de prazos
 * (grade já gravada, sem reler arquivos). Nunca bloqueia a consulta: se outra atualização estiver
 * em andamento, segue com os dados gravados.
 */
export async function ensureStatusesCurrent() {
  const today = todaySP();
  if (currentDay === today) return;
  const r = await pool.query<{ d: string | null; n: number }>(`SELECT max(status_ref_date)::text AS d, count(*)::int AS n FROM agreements`);
  if (!r.rows[0].n || r.rows[0].d === today) {
    currentDay = today;
    return;
  }
  // Sem nenhum cálculo ainda (logo após a migração): o recálculo completo é feito na próxima importação
  // ou pelo botão "Atualizar status"; a consulta não espera por ele.
  if (r.rows[0].d === null) return;
  try {
    await withTransaction(async (db) => {
      await db.query(`SET LOCAL statement_timeout = '20s'`);
      const got = await db.query<{ ok: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtext('status-operacional')) AS ok`);
      if (!got.rows[0].ok) return;
      await refreshDueDates(db, today);
    });
    currentDay = today;
  } catch (e) {
    console.error('Atualização de prazos não concluída; a consulta segue com os dados gravados:', (e as Error).message);
  }
}

/** Acordo com a grade completa de parcelas e a origem (arquivo e linha) de cada informação. */
export async function agreementDetail(raw: string) {
  const ahid = raw.replace(/\D/g, '').replace(/^0+/, '');
  if (!ahid || ahid.length > 18) return null;
  await ensureStatusesCurrent();
  const a = await pool.query(
    `SELECT a.ahid::text, a.contract_key, a.status, a.status_date, a.status_source, a.status_reason, a.status_ref_date, a.days_late, a.beyond_tolerance,
       a.ahcollid, a.ahcollid_source, a.broken_at, a.agreement_date, a.agreement_type, a.total_amount::text, a.installments,
       a.status_import_id, i.original_name AS status_file, r.line_number AS status_line,
       c.cpf, c.name, c.status AS contract_status
     FROM agreements a
     LEFT JOIN imports i ON i.id = a.status_import_id
     LEFT JOIN records r ON r.id = a.status_record_id
     LEFT JOIN contracts c ON c.contract_key = a.contract_key
     WHERE a.ahid = $1::bigint`,
    [ahid],
  );
  if (!a.rows[0]) return null;
  const parcelas = await pool.query(
    `SELECT p.numero, p.due_date, p.amount::text, p.status, p.days_late, p.tolerance_days, p.paid_at, p.paid_amount::text,
       p.agreement_import_id, ai.original_name AS agreement_file, ar.line_number AS agreement_line,
       p.payment_import_id, pi.original_name AS payment_file, pr.line_number AS payment_line, pr.fields->>'PMTCODE' AS payment_code
     FROM agreement_installments p
     LEFT JOIN imports ai ON ai.id = p.agreement_import_id LEFT JOIN records ar ON ar.id = p.agreement_record_id
     LEFT JOIN imports pi ON pi.id = p.payment_import_id LEFT JOIN records pr ON pr.id = p.payment_record_id
     WHERE p.ahid = $1::bigint ORDER BY p.numero`,
    [ahid],
  );
  // Pagamentos do REPASSE sem parcela correspondente na grade (ex.: número de parcela acima da quantidade informada).
  const used = new Set(parcelas.rows.map((p) => `${p.payment_import_id}:${p.payment_line}`));
  const pays = await pool.query(
    `SELECT r.import_id, i.original_name AS file, r.line_number, r.event_date, r.amount::text, r.fields->>'PMBATCH' AS parcela, r.fields->>'PMTCODE' AS codigo
     FROM records r JOIN imports i ON i.id = r.import_id AND i.status = 'CONFIRMADO'
     WHERE r.file_type = 'REPASSE' AND r.valid AND r.ahid = $1::bigint ORDER BY r.event_date, r.line_number`,
    [ahid],
  );
  return {
    acordo: a.rows[0],
    parcelas: parcelas.rows,
    pagamentos_sem_parcela: pays.rows.filter((p) => !used.has(`${p.import_id}:${p.line_number}`)),
  };
}
