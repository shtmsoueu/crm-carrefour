import { pool } from '../db/pool.js';
import { ensureStatusesCurrent } from '../status/detail.js';

export async function searchContracts(q: string) {
  const t = q.trim();
  if (t.length < 3) return [];
  const digits = t.replace(/\D/g, '').replace(/^0+/, '');
  const r = await pool.query(
    `SELECT c.contract_key, c.cpf, c.name, c.status, c.status_date,
       (SELECT count(*) FROM agreements a WHERE a.contract_key = c.contract_key)::int AS acordos,
       (SELECT count(*) FROM divergences d WHERE d.contract_key = c.contract_key AND d.status IN ('ABERTA','EM_ANALISE'))::int AS pendencias
     FROM contracts c
     WHERE c.contract_key = $1 OR c.contract_key LIKE $2
        OR ($3 <> '' AND ltrim(regexp_replace(c.cpf, '\\D', '', 'g'), '0') = $3)
     ORDER BY c.contract_key LIMIT 50`,
    [t, `${t.replace(/[%_]/g, '')}%`, digits],
  );
  return r.rows;
}

type Kind =
  | 'RECEBIMENTO'
  | 'DISTRIBUICAO'
  | 'ALTERACAO'
  | 'RECONHECIMENTO_BANCO'
  | 'ELEGIBILIDADE'
  | 'ACORDO'
  | 'ACORDO_BATIMENTO'
  | 'BOLETO'
  | 'PAGAMENTO'
  | 'PAGAMENTO_BATIMENTO'
  | 'QUEBRA'
  | 'RETIRADA_REDISTRIBUICAO'
  | 'RETIRADA_CARTEIRA'
  | 'COMISSAO'
  | 'CAMPANHA'
  | 'REJEICAO_CAMPANHA';

const money = (v: string | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Linha do tempo completa do contrato, a partir de todos os registros importados. */
export async function contractDetail(key: string) {
  await ensureStatusesCurrent();
  const c = await pool.query(`SELECT * FROM contracts WHERE contract_key = $1`, [key]);
  if (!c.rows[0]) return null;
  const recs = await pool.query(
    `SELECT r.id::text, r.file_type, r.record_type, r.line_number, r.valid, r.errors, r.ahid::text, r.event_date, r.amount::text,
       r.fields, r.dup_in_file, i.id AS import_id, i.original_name, i.status AS import_status,
       COALESCE(i.generation_date, i.file_name_date) AS file_date, i.confirmed_at
     FROM records r JOIN imports i ON i.id = r.import_id
     WHERE r.contract_key = $1 AND i.status IN ('CONFIRMADO','CANCELADO')
     ORDER BY COALESCE(i.generation_date, i.file_name_date), i.id, r.line_number`,
    [key],
  );
  const ahids = [...new Set(recs.rows.map((r) => r.ahid).filter(Boolean))];
  // Origem do acordo (AHCOLLID), quando disponível em algum arquivo, cruzando pelo AHID.
  const agreements = await pool.query(
    `SELECT a.ahid::text, a.status, a.status_date, a.status_reason, a.days_late, a.beyond_tolerance, a.broken_at, a.agreement_date, a.agreement_type, a.total_amount::text, a.installments, o.ahcollid, o.fonte
     FROM agreements a
     LEFT JOIN LATERAL (
       SELECT trim(r.fields->>'AHCOLLID') AS ahcollid, r.file_type AS fonte FROM records r JOIN imports i ON i.id = r.import_id AND i.status = 'CONFIRMADO'
       WHERE r.ahid = a.ahid AND r.valid AND COALESCE(trim(r.fields->>'AHCOLLID'), '') <> ''
       ORDER BY CASE r.file_type WHEN 'REPASSE' THEN 1 WHEN 'ACORDO_ASSESSORIA' THEN 2 WHEN 'BAT_ACORDO' THEN 3 ELSE 4 END, i.id DESC LIMIT 1
     ) o ON TRUE
     WHERE a.contract_key = $1 OR a.ahid = ANY($2::bigint[]) ORDER BY a.agreement_date NULLS LAST`,
    [key, ahids],
  );
  const results = await pool.query(
    `SELECT flow, rule, status, key_name, key_value, ahid::text, source_type, source_record_id::text, target_type, target_record_id::text,
       field, value_received, value_expected, reason
     FROM reconciliation_results WHERE contract_key = $1 OR ahid = ANY($2::bigint[])`,
    [key, ahids],
  );
  const divergences = await pool.query(
    `SELECT id, category, flow, rule, field, value_received, value_expected, description, status, source_file, last_detected_at
     FROM divergences WHERE contract_key = $1 OR ahid = ANY($2::bigint[]) ORDER BY status, last_detected_at DESC`,
    [key, ahids],
  );
  const resBy = new Map<string, typeof results.rows>();
  for (const r of results.rows) {
    for (const id of [r.source_record_id, r.target_record_id]) if (id) resBy.set(id, [...(resBy.get(id) ?? []), r]);
  }

  const events: {
    kind: Kind;
    label: string;
    date: string | null;
    file: string;
    fileType: string;
    importId: number;
    info: string;
    status: string;
    results: { flow: string; rule: string; status: string; reason: string | null }[];
  }[] = [];
  let distributions = 0;
  const seenAgreementImport = new Set<string>();
  for (const r of recs.rows) {
    const f = r.fields as Record<string, string | null>;
    const status = r.import_status === 'CANCELADO' ? 'IMPORTAÇÃO CANCELADA' : r.valid ? (r.dup_in_file ? 'DUPLICADO NO ARQUIVO' : 'VÁLIDO') : 'REJEITADO';
    const res = (resBy.get(r.id) ?? []).map((x) => ({ flow: x.flow, rule: x.rule, status: x.status, reason: x.reason }));
    const ev = (kind: Kind, label: string, date: string | null, info: string) =>
      events.push({ kind, label, date, file: r.original_name, fileType: r.file_type, importId: r.import_id, info, status, results: res });
    switch (r.file_type) {
      case 'REM_CONTRATOS':
        if (distributions === 0) ev('RECEBIMENTO', 'Recebimento do contrato', r.file_date, `Contrato recebido do banco. Produto ${f.U1PRODUTO ?? '—'}, ${f.U1DAYSGER02 ?? '—'} dias de atraso.`);
        ev(distributions === 0 ? 'DISTRIBUICAO' : 'ALTERACAO', distributions === 0 ? 'Distribuição para a assessoria' : 'Atualização / redistribuição', r.file_date,
          `Saldo ${money(f.DMCURBAL)} · Principal ${money(f.DMAMTDLQ)} · Fila ${f.DMQUE ?? '—'} · Permanência até ${br(f.U1DTRETOR)}`);
        distributions++;
        break;
      case 'BAT_CONTRATOS':
        ev('RECONHECIMENTO_BANCO', 'Contrato no batimento do banco', r.file_date, `Saldo ${money(f.DMCURBAL)} · Fila ${f.DMQUE ?? '—'}`);
        break;
      case 'ACORDO_ASSESSORIA': {
        const k = `${r.import_id}:${r.ahid}`;
        if (seenAgreementImport.has(k)) break;
        seenAgreementImport.add(k);
        const parcels = recs.rows.filter((x) => x.import_id === r.import_id && x.ahid === r.ahid);
        const flowRes = results.rows.filter((x) => x.ahid === r.ahid && ['B_ACORDOS', 'F_ELEGIBILIDADE'].includes(x.flow)).map((x) => ({ flow: x.flow, rule: x.rule, status: x.status, reason: x.reason }));
        events.push({
          kind: 'ACORDO',
          label: `Acordo ${r.ahid} realizado`,
          date: f.AHDT,
          file: r.original_name,
          fileType: r.file_type,
          importId: r.import_id,
          info: `Tipo ${f.AHTYPE ?? '—'} · Valor ${money(f.AHTOTPMT)} · Entrada ${money(f.VALOR_ENTRADA)} · ${parcels.length} parcela(s) informada(s) · Canal ${f.AHCOLLID ?? '—'}`,
          status,
          results: flowRes,
        });
        break;
      }
      case 'BAT_ACORDO':
        ev('ACORDO_BATIMENTO', `Acordo ${r.ahid} no batimento do banco`, f.AHDT, `Valor ${money(f.AHTOTPMT)}`);
        break;
      case 'REM_BOLETOS':
        if (r.record_type === '2') ev('BOLETO', `Boleto da parcela ${f.BLNUMPARC}/${f.QTD_PARCELAS}`, r.file_date, `Acordo ${f.BLNUMACORDO} · Vencimento ${br(f.BLDTVENC)} · ${money(f.BLVLBOLETO)} · ${f.SITUACAO_PARCELA ?? ''}`);
        break;
      case 'REPASSE':
        ev('PAGAMENTO', 'Pagamento identificado', r.event_date, `${money(r.amount)} · Parcela ${f.PMBATCH ?? '—'} · Código ${f.PMTCODE ?? '—'} · Acordo ${f.AHID ?? '—'} · ${f.AHCOLLID ?? ''}`);
        break;
      case 'BAT_ACORDO_PGTO':
        ev('PAGAMENTO_BATIMENTO', 'Pagamento no batimento do banco', f.APINDATE, `${money(f.APAMT)} · Acordo ${r.ahid}`);
        break;
      case 'QUEBRA_ACORDO':
        ev('QUEBRA', `Quebra do acordo ${r.ahid}`, r.event_date, `Tipo ${f.AHTYPE ?? '—'} · Negociado em ${br(f.AHDT)} · Assessoria ${f.DMAGENCY ?? '—'}`);
        break;
      case 'RET_DISTRIBUICAO':
        ev('RETIRADA_REDISTRIBUICAO', 'Retirada por redistribuição', r.event_date, 'Contrato retirado da cobrança por redistribuição');
        break;
      case 'RET_CARTEIRA':
        ev('RETIRADA_CARTEIRA', 'Retirada da carteira', r.file_date, `Motivo: ${f.U_MOTBXA ?? '—'}`);
        break;
      case 'COMISSAO':
        ev('COMISSAO', 'Comissionamento', r.event_date, `Recebido ${money(r.amount)} · Status ${f.STATUS_CONTRATO ?? '—'} · %Rem ${f.PCT_REM ?? '—'} · Remuneração (bruto) ${f.REMUNERACAO_DEVIDA ?? '—'}`);
        break;
      case 'CCAM':
        if (r.record_type === '1' || r.record_type === '2') ev('CAMPANHA', 'Carta campanha', r.file_date, r.record_type === '2' ? `Plano ${f.CAQTDPA}x ${money(f.CAVLRPREST)} · Total ${money(f.CAVLRDIVIDA)}` : `Acordo ${f.AHID ?? '—'}`);
        break;
      case 'REJ_CAMPANHA_EXT':
      case 'REJ_CAMPANHA_INT':
        ev('REJEICAO_CAMPANHA', 'Rejeição de campanha', r.file_date, f.MOTIVO ?? f.LINHA ?? '');
        break;
    }
  }
  events.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return { contract: c.rows[0], agreements: agreements.rows, events, divergences: divergences.rows, resultsCount: results.rowCount };
}
