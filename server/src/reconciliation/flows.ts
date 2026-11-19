/**
 * FLUXOS DE BATIMENTO (A–H)
 *
 * Chaves utilizadas — todas definidas nos layouts oficiais:
 *   DMACCT/PMACCT/CONTRATO  "Nº Conta-Nº Contrato / Nº Contrato (Chave)"
 *   AHID/BLNUMACORDO        "ID do acordo" (campo numérico; comparado por valor, pois possui
 *                            13 posições em ACORDO/REPASSE/QUEBRA e 8 em BOLETOS/CCAM)
 *   AHTYPE x AGTYPE         "Tipo de Acordo" (único elo disponível no layout de Elegibilidade)
 * Nunca se relaciona registros apenas por CPF.
 */
import { config } from '../config.js';
import { registerFlow, type FlowContext, type ResultInput } from './engine.js';
import {
  earliestFileDate,
  fmtMoney,
  hasConfirmed,
  loadAll,
  loadLatestImport,
  loadLatestPerAhid,
  loadLatestPerContract,
  norm,
  normDoc,
  numEq,
  type Rec,
} from './data.js';
import { getSetting, SETTING_REJEICAO } from '../services/settings.js';

const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');

function base(rec: Rec | undefined, keyName: string, keyValue: string | null): Pick<ResultInput, 'key_name' | 'key_value' | 'contract_key' | 'cpf' | 'ahid' | 'source_type' | 'source_record_id' | 'event_date'> {
  return {
    key_name: keyName,
    key_value: keyValue,
    contract_key: rec?.contract_key ?? null,
    cpf: rec?.cpf ?? null,
    ahid: rec?.ahid ?? null,
    source_type: rec?.file_type ?? null,
    source_record_id: rec?.id ?? null,
    event_date: rec?.event_date ?? rec?.file_date ?? null,
  };
}

interface FieldCheck {
  field: string;
  label: string;
  src: string | null | undefined;
  dst: string | null | undefined;
  kind: 'text' | 'doc' | 'num' | 'date';
  category: 'DIVERGENCIA_CADASTRAL' | 'DIVERGENCIA_VALOR' | 'DIVERGENCIA_DATA';
}

/** Compara campos entre origem e destino e registra uma divergência por campo divergente. */
function compareFields(ctx: FlowContext, rule: string, src: Rec, dst: Rec, keyName: string, keyValue: string, fp: string, checks: FieldCheck[]): number {
  let n = 0;
  for (const c of checks) {
    const equal =
      c.kind === 'num' ? numEq(c.src, c.dst) || (c.src == null && c.dst == null)
      : c.kind === 'doc' ? normDoc(c.src) === normDoc(c.dst)
      : norm(c.src) === norm(c.dst);
    if (equal) continue;
    n++;
    ctx.divergence(
      {
        ...base(src, keyName, keyValue),
        rule,
        status: 'DIVERGENTE',
        target_type: dst.file_type,
        target_record_id: dst.id,
        field: c.field,
        value_received: c.kind === 'date' ? br(c.src) : (c.src ?? null),
        value_expected: c.kind === 'date' ? br(c.dst) : (c.dst ?? null),
        reason: `${c.label} divergente entre ${src.file_type} e ${dst.file_type}`,
      },
      c.category,
      fp,
    );
  }
  return n;
}

function dupResults(ctx: FlowContext, rule: string, keyName: string, groups: Map<string, Rec[]>, describe: (k: string, list: Rec[]) => string) {
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const first = list[0];
    for (const extra of list.slice(1)) {
      ctx.result({ ...base(extra, keyName, k), rule, status: 'DUPLICADO', target_type: first.file_type, target_record_id: first.id, reason: describe(k, list) });
    }
    ctx.divergences.push({
      fingerprint: `${ctx.flow}|${rule}|${k}`,
      category: 'DUPLICIDADE',
      flow: ctx.flow,
      rule,
      contract_key: first.contract_key,
      cpf: first.cpf,
      ahid: first.ahid,
      import_id: first.import_id,
      source_file: first.import_name,
      record_id: first.id,
      field: keyName,
      value_received: String(list.length),
      value_expected: '1',
      description: describe(k, list),
      occurrences: list.length,
    });
  }
}

function groupBy<T>(items: T[], key: (t: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (k === null) continue;
    const l = m.get(k);
    if (l) l.push(it);
    else m.set(k, [it]);
  }
  return m;
}

const agreementHead = (list: Rec[]) => list[0];

/** Registro sem a contraparte importada: resultado individual explícito (sem simular conciliação). */
function waiting(ctx: FlowContext, rule: string, recs: Rec[], keyName: string, target: string) {
  for (const r of recs) {
    ctx.result({ ...base(r, keyName, r.ahid ?? r.contract_key), rule, status: 'AGUARDANDO_ARQUIVO', target_type: target, reason: `Aguardando importação de ${target} para confronto` });
  }
}

// ===========================================================================
// A. DISTRIBUIÇÃO DE CONTRATOS — REM_CONTRATOS x BAT_CONTRATOS x RET_DISTRIBUICAO x RET_CARTEIRA
// ===========================================================================
registerFlow({
  code: 'A_DISTRIBUICAO',
  title: 'A. Distribuição de contratos',
  description: 'Contratos enviados pelo banco, reconhecidos no batimento, redistribuídos e retirados da carteira.',
  sources: ['REM_CONTRATOS', 'BAT_CONTRATOS', 'RET_DISTRIBUICAO', 'RET_CARTEIRA'],
  rules: [
    'Chave: DMACCT (Nº Conta-Nº Contrato / Nº Contrato).',
    'Situação do contrato: evento mais recente entre distribuição (data de geração do REM_CONTRATOS) e retirada (IXFDATE do RET_DISTRIBUICAO ou data de geração do RET_CARTEIRA). Retirada na mesma data ou posterior => RETIRADO.',
    'REM_CONTRATOS é incremental (inclusões/atualizações): a ausência de remessa para um contrato retirado é informativa. O reconhecimento oficial é feito contra a fotografia BAT_CONTRATOS.',
    'BAT_CONTRATOS (última fotografia): contratos ativos distribuídos até a data do batimento x contratos do batimento. Campos comparados: DMSSNUM, DMNAME, DMCURBAL, DMAMTDLQ, DMDLQDT.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const rem = await loadLatestPerContract(db, 'REM_CONTRATOS', 'COALESCE(i.generation_date, i.file_name_date)');
    const retd = await loadLatestPerContract(db, 'RET_DISTRIBUICAO');
    const retc = await loadLatestPerContract(db, 'RET_CARTEIRA', 'COALESCE(i.generation_date, i.file_name_date)');
    if (!rem.size && !retd.size && !retc.size) {
      ctx.note('AGUARDANDO', 'Nenhum REM_CONTRATOS, RET_DISTRIBUICAO ou RET_CARTEIRA confirmado.');
      return;
    }

    // Duplicidade de contrato no mesmo arquivo de remessa
    const remAll = await loadAll(db, 'REM_CONTRATOS');
    dupResults(ctx, 'CONTRATO_DUPLICADO_REMESSA', 'DMACCT', groupBy(remAll, (r) => (r.contract_key ? `${r.import_id}:${r.contract_key}` : null)), (_k, l) =>
      `Contrato ${l[0].contract_key} presente ${l.length} vezes no arquivo ${l[0].import_name}`,
    );

    const statusRows: { k: string; s: string; d: string | null; src: string }[] = [];
    const keys = new Set([...rem.keys(), ...retd.keys(), ...retc.keys()]);
    for (const k of keys) {
      const r = rem.get(k);
      const a = retd.get(k);
      const c = retc.get(k);
      const wd = a && c ? ((a.ref_date ?? '') >= (c.ref_date ?? '') ? a : c) : (a ?? c);
      if (r && wd) {
        const retirado = (wd.ref_date ?? '') >= (r.ref_date ?? '');
        statusRows.push({ k, s: retirado ? 'RETIRADO' : 'ATIVO', d: retirado ? wd.ref_date : r.ref_date, src: retirado ? wd.file_type : r.file_type });
        ctx.result({
          ...base(r, 'DMACCT', k),
          rule: retirado ? 'DISTRIBUIDO_E_RETIRADO' : 'RETIRADO_E_REDISTRIBUIDO',
          status: 'INFORMATIVO',
          target_type: wd.file_type,
          target_record_id: wd.id,
          reason: retirado
            ? `Distribuído em ${br(r.ref_date)} e retirado em ${br(wd.ref_date)} (${wd.file_type}${wd.fields.U_MOTBXA ? ': ' + wd.fields.U_MOTBXA : ''})`
            : `Retirado em ${br(wd.ref_date)} e novamente distribuído em ${br(r.ref_date)}`,
        });
        compareFields(ctx, 'CPF_REMESSA_X_RETIRADA', r, wd, 'DMACCT', k, k, [
          { field: 'DMSSNUM', label: 'CPF/CNPJ', src: r.cpf, dst: wd.cpf, kind: 'doc', category: 'DIVERGENCIA_CADASTRAL' },
        ]);
      } else if (r) {
        statusRows.push({ k, s: 'ATIVO', d: r.ref_date, src: r.file_type });
        ctx.result({ ...base(r, 'DMACCT', k), rule: 'CONTRATO_DISTRIBUIDO', status: 'INFORMATIVO', reason: `Distribuído em ${br(r.ref_date)}, sem retirada registrada` });
      } else if (wd) {
        statusRows.push({ k, s: 'RETIRADO', d: wd.ref_date, src: wd.file_type });
        ctx.result({
          ...base(wd, 'DMACCT', k),
          rule: 'RETIRADA_SEM_REMESSA_NO_HISTORICO',
          status: 'INFORMATIVO',
          reason: `Retirado em ${br(wd.ref_date)} (${wd.file_type}${wd.fields.U_MOTBXA ? ': ' + wd.fields.U_MOTBXA : ''}); não há REM_CONTRATOS deste contrato no histórico importado`,
        });
      }
    }

    // Atualiza a situação dos contratos (integridade: somente contratos existentes)
    await db.query(`UPDATE contracts SET status='SEM_DISTRIBUICAO', status_date=NULL, status_source=NULL WHERE status <> 'SEM_DISTRIBUICAO'`);
    for (let i = 0; i < statusRows.length; i += 5000) {
      await db.query(
        `UPDATE contracts c SET status = x.s, status_date = x.d, status_source = x.src, updated_at = now()
         FROM jsonb_to_recordset($1::jsonb) AS x(k text, s text, d date, src text) WHERE c.contract_key = x.k`,
        [JSON.stringify(statusRows.slice(i, i + 5000))],
      );
    }

    // REM_CONTRATOS x BAT_CONTRATOS
    const bat = await loadLatestImport(db, 'BAT_CONTRATOS');
    if (!bat.importId) {
      ctx.note('AGUARDANDO', 'BAT_CONTRATOS não importado: o reconhecimento dos contratos pelo banco não pode ser verificado.');
      return;
    }
    const batMap = new Map(bat.rows.filter((b) => b.contract_key).map((b) => [b.contract_key!, b]));
    dupResults(ctx, 'CONTRATO_DUPLICADO_BATIMENTO', 'DMACCT', groupBy(bat.rows, (r) => r.contract_key), (k, l) => `Contrato ${k} presente ${l.length} vezes no BAT_CONTRATOS`);
    const active = statusRows.filter((s) => s.s === 'ATIVO' && rem.has(s.k));
    for (const s of active) {
      const r = rem.get(s.k)!;
      if (bat.fileDate && r.ref_date && r.ref_date > bat.fileDate) continue; // distribuído após o batimento
      const b = batMap.get(s.k);
      if (!b) {
        ctx.divergence(
          { ...base(r, 'DMACCT', s.k), rule: 'REM_X_BAT_CONTRATOS', status: 'SOMENTE_ORIGEM', target_type: 'BAT_CONTRATOS', reason: `Contrato ativo na assessoria não consta no BAT_CONTRATOS de ${br(bat.fileDate)}` },
          'NAO_LOCALIZADO_BANCO',
          s.k,
        );
        continue;
      }
      const n = compareFields(ctx, 'REM_X_BAT_CONTRATOS', r, b, 'DMACCT', s.k, s.k, [
        { field: 'DMSSNUM', label: 'CPF/CNPJ', src: r.cpf, dst: b.cpf, kind: 'doc', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'DMNAME', label: 'Nome', src: r.fields.DMNAME, dst: b.fields.DMNAME, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'DMCURBAL', label: 'Saldo devedor', src: r.fields.DMCURBAL, dst: b.fields.DMCURBAL, kind: 'num', category: 'DIVERGENCIA_VALOR' },
        { field: 'DMAMTDLQ', label: 'Valor principal', src: r.fields.DMAMTDLQ, dst: b.fields.DMAMTDLQ, kind: 'num', category: 'DIVERGENCIA_VALOR' },
        { field: 'DMDLQDT', label: 'Data de vencimento/atraso', src: r.fields.DMDLQDT, dst: b.fields.DMDLQDT, kind: 'date', category: 'DIVERGENCIA_DATA' },
      ]);
      if (n === 0) ctx.result({ ...base(r, 'DMACCT', s.k), rule: 'REM_X_BAT_CONTRATOS', status: 'CONCILIADO', target_type: b.file_type, target_record_id: b.id, reason: 'Contrato reconhecido no batimento do banco' });
    }
    const activeKeys = new Set(active.map((a) => a.k));
    const statusBy = new Map(statusRows.map((s) => [s.k, s]));
    for (const [k, b] of batMap) {
      if (activeKeys.has(k)) continue;
      const st = statusBy.get(k);
      ctx.divergence(
        {
          ...base(b, 'DMACCT', k),
          rule: 'BAT_CONTRATOS_X_REM',
          status: 'SOMENTE_DESTINO',
          reason: st?.s === 'RETIRADO' ? `Contrato consta no batimento do banco, mas foi retirado em ${br(st.d)}` : 'Contrato consta no batimento do banco sem distribuição ativa na assessoria',
        },
        st?.s === 'RETIRADO' ? 'CONTRATO_NAO_RECONHECIDO' : 'NAO_LOCALIZADO_ASSESSORIA',
        k,
      );
    }
  },
});

// ===========================================================================
// B. ACORDOS — ACORDO_ASSESSORIA x BAT_ACORDO
// ===========================================================================
registerFlow({
  code: 'B_ACORDOS',
  title: 'B. Acordos',
  description: 'Acordos realizados pela assessoria e seu reconhecimento no arquivo de batimento do banco.',
  sources: ['ACORDO_ASSESSORIA', 'BAT_ACORDO'],
  rules: [
    'Chave: AHID (ID do acordo), presente na posição 224-236 dos dois layouts.',
    'Cada AHID é representado pela importação mais recente que o contém (uma linha por parcela).',
    'Campos comparados com BAT_ACORDO: DMACCT, DMSSNUM, AHDT, AHTOTPMT, VALOR_ENTRADA, AHPRD, AHTYPE.',
    'Acordos com data posterior à geração do BAT_ACORDO não são cobrados como não reconhecidos.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const aco = await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA');
    if (!aco.size) {
      ctx.note('AGUARDANDO', 'Nenhum ACORDO_ASSESSORIA confirmado.');
      return;
    }
    // Consolida o cadastro de acordos (integridade: agreements x contracts)
    const rows = [...aco.entries()].map(([ahid, l]) => {
      const h = agreementHead(l);
      return { ahid, d: h.fields.AHDT, t: h.fields.AHTYPE, v: h.fields.AHTOTPMT, p: h.fields.AHPRD === null ? null : Number(h.fields.AHPRD) };
    });
    for (let i = 0; i < rows.length; i += 5000) {
      await db.query(
        `UPDATE agreements a SET agreement_date = x.d, agreement_type = x.t, total_amount = x.v, installments = x.p,
           status = CASE WHEN a.status = 'NAO_IDENTIFICADO' THEN 'ATIVO' ELSE a.status END, updated_at = now()
         FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, d date, t text, v numeric, p int) WHERE a.ahid = x.ahid`,
        [JSON.stringify(rows.slice(i, i + 5000))],
      );
    }

    // Consistência interna: mesmo AHID com contratos diferentes no mesmo arquivo
    for (const [ahid, l] of aco) {
      const contracts = new Set(l.map((r) => r.contract_key));
      if (contracts.size > 1) {
        ctx.divergence(
          { ...base(l[0], 'AHID', ahid), rule: 'ACORDO_MULTIPLOS_CONTRATOS', status: 'DIVERGENTE', field: 'DMACCT', value_received: [...contracts].join(', '), reason: 'O mesmo AHID aparece com contratos diferentes no ACORDO_ASSESSORIA' },
          'DIVERGENCIA_CADASTRAL',
          ahid,
        );
      }
    }
    dupResults(ctx, 'PARCELA_DUPLICADA_ACORDO', 'AHID+APDUEDT', groupBy([...aco.values()].flat(), (r) => (r.dup_in_file ? null : `${r.ahid}:${r.fields.APDUEDT}:${r.fields.APAMT}`)), (k, l) =>
      `Parcela repetida no acordo ${l[0].ahid} (vencimento ${br(l[0].fields.APDUEDT)}) — ${l.length} linhas`,
    );

    // Contrato do acordo na base de distribuição (informativo — REM_CONTRATOS é incremental)
    const distributed = new Set(
      (await db.query<{ k: string }>(`SELECT DISTINCT r.contract_key AS k FROM records r JOIN imports i ON i.id=r.import_id AND i.status='CONFIRMADO' WHERE r.file_type IN ('REM_CONTRATOS','BAT_CONTRATOS') AND r.contract_key IS NOT NULL`)).rows.map((r) => r.k),
    );
    const withdrawn = new Map(
      (await db.query<{ contract_key: string; status_date: string }>(`SELECT contract_key, status_date FROM contracts WHERE status='RETIRADO'`)).rows.map((r) => [r.contract_key, r.status_date]),
    );
    for (const [ahid, l] of aco) {
      const h = agreementHead(l);
      const k = h.contract_key!;
      const wd = withdrawn.get(k);
      if (wd && h.fields.AHDT && h.fields.AHDT > wd) {
        ctx.result({ ...base(h, 'AHID', ahid), rule: 'ACORDO_APOS_RETIRADA', status: 'INFORMATIVO', reason: `Acordo de ${br(h.fields.AHDT)} em contrato retirado da carteira em ${br(wd)}` });
      }
      if (!distributed.has(k)) {
        ctx.result({ ...base(h, 'AHID', ahid), rule: 'ACORDO_SEM_DISTRIBUICAO_NO_HISTORICO', status: 'INFORMATIVO', reason: `Contrato ${k} sem REM_CONTRATOS/BAT_CONTRATOS no histórico importado` });
      }
    }

    // ACORDO_ASSESSORIA x BAT_ACORDO
    if (!(await hasConfirmed(db, 'BAT_ACORDO'))) {
      ctx.note('AGUARDANDO', 'BAT_ACORDO não importado: o reconhecimento dos acordos pelo banco não pode ser verificado.');
      return;
    }
    const bat = await loadLatestImport(db, 'BAT_ACORDO');
    const batBy = groupBy(bat.rows, (r) => r.ahid);
    for (const [ahid, l] of aco) {
      const h = agreementHead(l);
      const b = batBy.get(ahid)?.[0];
      if (!b) {
        if (bat.fileDate && h.fields.AHDT && h.fields.AHDT > bat.fileDate) continue;
        ctx.divergence({ ...base(h, 'AHID', ahid), rule: 'ACORDO_X_BAT_ACORDO', status: 'SOMENTE_ORIGEM', target_type: 'BAT_ACORDO', reason: `Acordo não consta no BAT_ACORDO de ${br(bat.fileDate)}` }, 'ACORDO_NAO_RECONHECIDO', ahid);
        continue;
      }
      const n = compareFields(ctx, 'ACORDO_X_BAT_ACORDO', h, b, 'AHID', ahid, ahid, [
        { field: 'DMACCT', label: 'Contrato', src: h.contract_key, dst: b.contract_key, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'DMSSNUM', label: 'CPF/CNPJ', src: h.cpf, dst: b.cpf, kind: 'doc', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'AHDT', label: 'Data do acordo', src: h.fields.AHDT, dst: b.fields.AHDT, kind: 'date', category: 'DIVERGENCIA_DATA' },
        { field: 'AHTOTPMT', label: 'Valor do acordo', src: h.fields.AHTOTPMT, dst: b.fields.AHTOTPMT, kind: 'num', category: 'DIVERGENCIA_VALOR' },
        { field: 'VALOR_ENTRADA', label: 'Valor de entrada', src: h.fields.VALOR_ENTRADA, dst: b.fields.VALOR_ENTRADA, kind: 'num', category: 'DIVERGENCIA_VALOR' },
        { field: 'AHPRD', label: 'Quantidade de parcelas', src: h.fields.AHPRD, dst: b.fields.AHPRD, kind: 'num', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'AHTYPE', label: 'Tipo de acordo', src: h.fields.AHTYPE, dst: b.fields.AHTYPE, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
      ]);
      if (n === 0) ctx.result({ ...base(h, 'AHID', ahid), rule: 'ACORDO_X_BAT_ACORDO', status: 'CONCILIADO', target_type: 'BAT_ACORDO', target_record_id: b.id, reason: 'Acordo reconhecido pelo banco' });
    }
    for (const [ahid, l] of batBy) {
      if (aco.has(ahid)) continue;
      ctx.divergence({ ...base(l[0], 'AHID', ahid), rule: 'BAT_ACORDO_X_ACORDO', status: 'SOMENTE_DESTINO', reason: 'Acordo consta no BAT_ACORDO e não foi informado no ACORDO_ASSESSORIA' }, 'NAO_LOCALIZADO_ASSESSORIA', ahid);
    }
  },
});

// ===========================================================================
// C. PAGAMENTOS — REPASSE x BAT_ACORDO_PGTO (e REPASSE x ACORDO_ASSESSORIA)
// ===========================================================================
registerFlow({
  code: 'C_PAGAMENTOS',
  title: 'C. Pagamentos',
  description: 'Pagamentos repassados pelo banco confrontados com os acordos e com o batimento de pagamentos.',
  sources: ['REPASSE', 'BAT_ACORDO_PGTO', 'ACORDO_ASSESSORIA'],
  rules: [
    'REPASSE x ACORDO_ASSESSORIA: chave AHID; compara PMACCT x DMACCT e CPF.',
    'Pagamento sem AHID ou com AHID inexistente nos acordos => Pagamento não identificado.',
    'Linhas de REPASSE idênticas em arquivos diferentes => Duplicidade (contabilizadas uma única vez).',
    'REPASSE x BAT_ACORDO_PGTO: chave AHID + data do pagamento (PMTDATE x APINDATE) + valor (PMAMT x APAMT). Mesmo AHID e data com valor diferente => Divergência de valor.',
    'Acordos com parcela vencida no período coberto pelos repasses e sem pagamento => informativo.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const all = await loadAll(db, 'REPASSE');
    if (!all.length) {
      ctx.note('AGUARDANDO', 'Nenhum REPASSE confirmado.');
      return;
    }
    const byHash = groupBy(all, (r) => r.record_hash);
    // Linhas idênticas (no mesmo arquivo ou entre arquivos) entram uma única vez nos totais e
    // geram pendência de duplicidade, para que nenhuma unificação ocorra em silêncio.
    dupResults(ctx, 'PAGAMENTO_DUPLICADO', 'LINHA', byHash, (_k, l) => {
      const files = [...new Set(l.map((x) => x.import_name))];
      return `Pagamento do contrato ${l[0].contract_key} (${fmtMoney(l[0].amount)} em ${br(l[0].event_date)}) em ${l.length} linhas idênticas ${files.length > 1 ? `em ${files.length} arquivos: ${files.join(', ')}` : `no arquivo ${files[0]}`}; contabilizado uma vez`;
    });
    const payments = [...byHash.values()].map((l) => l[0]);
    const acoAvailable = await hasConfirmed(db, 'ACORDO_ASSESSORIA');
    const aco = acoAvailable ? await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA') : new Map<string, Rec[]>();
    if (!acoAvailable) {
      ctx.note('AGUARDANDO', 'ACORDO_ASSESSORIA não importado: pagamentos não podem ser relacionados aos acordos.');
      waiting(ctx, 'REPASSE_X_ACORDO', payments, 'AHID', 'ACORDO_ASSESSORIA');
    }

    const paidAhids = new Set<string>();
    for (const p of payments) {
      const key = `${p.contract_key}|${p.ahid ?? '-'}|${p.event_date}|${p.fields.PMBATCH}|${p.amount}`;
      if (p.ahid) paidAhids.add(p.ahid);
      if (!acoAvailable) continue;
      if (!p.ahid) {
        ctx.divergence(
          { ...base(p, 'AHID', null), rule: 'REPASSE_X_ACORDO', status: 'SOMENTE_ORIGEM', target_type: 'ACORDO_ASSESSORIA', field: 'AHID', value_received: p.fields.AHID, reason: `Pagamento de ${fmtMoney(p.amount)} (${p.fields.PMTCODE}) sem ID de acordo` },
          'PAGAMENTO_NAO_IDENTIFICADO',
          key,
        );
        continue;
      }
      const a = aco.get(p.ahid);
      if (!a) {
        ctx.divergence(
          { ...base(p, 'AHID', p.ahid), rule: 'REPASSE_X_ACORDO', status: 'SOMENTE_ORIGEM', target_type: 'ACORDO_ASSESSORIA', reason: `Pagamento de ${fmtMoney(p.amount)} para acordo ${p.ahid} não localizado nos ACORDO_ASSESSORIA importados` },
          'PAGAMENTO_NAO_IDENTIFICADO',
          key,
        );
        continue;
      }
      const h = agreementHead(a);
      const n = compareFields(ctx, 'REPASSE_X_ACORDO', p, h, 'AHID', p.ahid, key, [
        { field: 'PMACCT', label: 'Contrato', src: p.contract_key, dst: h.contract_key, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'DMSSNUM', label: 'CPF/CNPJ', src: p.cpf, dst: h.cpf, kind: 'doc', category: 'DIVERGENCIA_CADASTRAL' },
      ]);
      if (n === 0) ctx.result({ ...base(p, 'AHID', p.ahid), rule: 'REPASSE_X_ACORDO', status: 'CONCILIADO', target_type: 'ACORDO_ASSESSORIA', target_record_id: h.id, reason: `Pagamento de ${fmtMoney(p.amount)} (parcela ${p.fields.PMBATCH}) vinculado ao acordo` });
    }

    // Acordos sem pagamento no período coberto pelos repasses
    const covered = new Set(payments.map((p) => p.event_date).filter(Boolean) as string[]);
    const minD = [...covered].sort()[0];
    const maxD = [...covered].sort().at(-1);
    for (const [ahid, l] of aco) {
      if (paidAhids.has(ahid)) continue;
      const due = l.filter((r) => r.fields.APDUEDT && minD && maxD && r.fields.APDUEDT >= minD && r.fields.APDUEDT <= maxD);
      if (!due.length) continue;
      ctx.result({
        ...base(due[0], 'AHID', ahid),
        rule: 'ACORDO_SEM_PAGAMENTO',
        status: 'INFORMATIVO',
        reason: `Parcela com vencimento em ${br(due[0].fields.APDUEDT)} (período dos repasses ${br(minD)} a ${br(maxD)}) sem pagamento repassado`,
      });
    }

    // REPASSE x BAT_ACORDO_PGTO
    if (!(await hasConfirmed(db, 'BAT_ACORDO_PGTO'))) {
      ctx.note('AGUARDANDO', 'BAT_ACORDO_PGTO não importado: o batimento de pagamentos com o banco não pode ser verificado.');
      return;
    }
    const batMap = await loadLatestPerAhid(db, 'BAT_ACORDO_PGTO');
    const batDate = (await loadLatestImport(db, 'BAT_ACORDO_PGTO')).fileDate;
    const repBy = groupBy(payments.filter((p) => p.ahid), (p) => p.ahid);
    for (const [ahid, reps] of repBy) {
      const pool = [...(batMap.get(ahid) ?? [])];
      for (const p of reps) {
        if (batDate && p.event_date && p.event_date > batDate) continue;
        const fp = `${ahid}|${p.event_date}|${p.fields.PMBATCH}|${p.amount}`;
        const exact = pool.findIndex((b) => b.fields.APINDATE === p.event_date && numEq(b.fields.APAMT, p.amount));
        if (exact >= 0) {
          const b = pool.splice(exact, 1)[0];
          ctx.result({ ...base(p, 'AHID+DATA+VALOR', fp), rule: 'REPASSE_X_BAT_PGTO', status: 'CONCILIADO', target_type: 'BAT_ACORDO_PGTO', target_record_id: b.id, reason: 'Pagamento reconhecido no batimento de pagamentos' });
          continue;
        }
        const sameDate = pool.findIndex((b) => b.fields.APINDATE === p.event_date);
        if (sameDate >= 0) {
          const b = pool.splice(sameDate, 1)[0];
          ctx.divergence(
            { ...base(p, 'AHID+DATA', fp), rule: 'REPASSE_X_BAT_PGTO', status: 'DIVERGENTE', target_type: 'BAT_ACORDO_PGTO', target_record_id: b.id, field: 'PMAMT', value_received: fmtMoney(p.amount), value_expected: fmtMoney(b.fields.APAMT), reason: 'Valor do pagamento difere do batimento' },
            'DIVERGENCIA_VALOR',
            fp,
          );
          continue;
        }
        ctx.divergence({ ...base(p, 'AHID+DATA+VALOR', fp), rule: 'REPASSE_X_BAT_PGTO', status: 'SOMENTE_ORIGEM', target_type: 'BAT_ACORDO_PGTO', reason: 'Pagamento repassado não consta no BAT_ACORDO_PGTO' }, 'NAO_LOCALIZADO_BANCO', fp);
      }
    }
    for (const [ahid, list] of batMap) {
      const reps = repBy.get(ahid) ?? [];
      for (const b of list) {
        const d = b.fields.APINDATE;
        if (!d || !covered.has(d)) continue; // somente datas cobertas pelos repasses importados
        if (reps.some((p) => p.event_date === d)) continue;
        const fp = `${ahid}|${d}|${b.fields.APAMT}|${b.line_number}`;
        ctx.divergence(
          { ...base(b, 'AHID+DATA+VALOR', fp), rule: 'BAT_PGTO_X_REPASSE', status: 'SOMENTE_DESTINO', reason: `Pagamento de ${fmtMoney(b.fields.APAMT)} em ${br(d)} consta no batimento e não foi repassado` },
          'PAGAMENTO_NAO_IDENTIFICADO',
          fp,
        );
      }
    }
  },
});

// ===========================================================================
// D. PARCELAS E BOLETOS — REM_BOLETOS x ACORDO_ASSESSORIA
// ===========================================================================
registerFlow({
  code: 'D_BOLETOS',
  title: 'D. Parcelas e boletos',
  description: 'Parcelas, vencimentos e valores dos boletos confrontados com os acordos.',
  sources: ['REM_BOLETOS', 'ACORDO_ASSESSORIA'],
  rules: [
    'Registro tipo 2 (parcela). Chave: BLNUMACORDO (AHID, comparado numericamente) + BLDTVENC x APDUEDT.',
    'Campos comparados: BLVLBOLETO x APAMT, DMACCT, DMSSNUM e QTD_PARCELAS (ahprd+1) x AHPRD+1.',
    'Mesmo acordo e vencimento repetidos no mesmo arquivo => Duplicidade.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const parcels = await loadAll(db, 'REM_BOLETOS', '2');
    if (!parcels.length) {
      ctx.note('AGUARDANDO', 'Nenhum REM_BOLETOS confirmado.');
      return;
    }
    if (!(await hasConfirmed(db, 'ACORDO_ASSESSORIA'))) {
      ctx.note('AGUARDANDO', 'ACORDO_ASSESSORIA não importado: boletos não podem ser confrontados.');
      waiting(ctx, 'BOLETO_X_ACORDO', parcels, 'AHID', 'ACORDO_ASSESSORIA');
      return;
    }
    const aco = await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA');
    const groups = groupBy(parcels, (p) => `${p.import_id}:${p.ahid}:${p.fields.BLDTVENC}`);
    dupResults(ctx, 'BOLETO_DUPLICADO', 'AHID+BLDTVENC', groups, (_k, l) => `Boleto do acordo ${l[0].ahid} com vencimento ${br(l[0].fields.BLDTVENC)} repetido ${l.length} vezes em ${l[0].import_name}`);
    for (const l of groups.values()) {
      const p = l[0];
      const fp = `${p.ahid}|${p.fields.BLDTVENC}|${p.fields.BLNUMPARC}`;
      const a = p.ahid ? aco.get(p.ahid) : undefined;
      if (!a) {
        ctx.divergence({ ...base(p, 'AHID', p.ahid), rule: 'BOLETO_X_ACORDO', status: 'SOMENTE_ORIGEM', target_type: 'ACORDO_ASSESSORIA', reason: `Boleto do acordo ${p.fields.BLNUMACORDO} não localizado nos ACORDO_ASSESSORIA importados` }, 'ACORDO_NAO_RECONHECIDO', fp);
        continue;
      }
      const h = agreementHead(a);
      const inst = a.find((r) => r.fields.APDUEDT === p.fields.BLDTVENC);
      if (!inst) {
        ctx.divergence(
          {
            ...base(p, 'AHID+BLDTVENC', fp),
            rule: 'BOLETO_X_ACORDO',
            status: 'DIVERGENTE',
            target_type: 'ACORDO_ASSESSORIA',
            target_record_id: h.id,
            field: 'BLDTVENC',
            value_received: br(p.fields.BLDTVENC),
            value_expected: a.map((r) => br(r.fields.APDUEDT)).slice(0, 6).join(', ') + (a.length > 6 ? '…' : ''),
            reason: 'Vencimento do boleto não corresponde a nenhuma parcela do acordo',
          },
          'DIVERGENCIA_DATA',
          fp,
        );
        continue;
      }
      const qtdEsperada = h.fields.AHPRD === null ? null : String(Number(h.fields.AHPRD) + 1);
      const n = compareFields(ctx, 'BOLETO_X_ACORDO', p, inst, 'AHID+BLDTVENC', fp, fp, [
        { field: 'BLVLBOLETO', label: 'Valor da parcela', src: p.amount, dst: inst.fields.APAMT, kind: 'num', category: 'DIVERGENCIA_VALOR' },
        { field: 'DMACCT', label: 'Contrato', src: p.contract_key, dst: h.contract_key, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'DMSSNUM', label: 'CPF/CNPJ', src: p.cpf, dst: h.cpf, kind: 'doc', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'QTD_PARCELAS', label: 'Quantidade de parcelas (ahprd+1)', src: p.fields.QTD_PARCELAS, dst: qtdEsperada, kind: 'num', category: 'DIVERGENCIA_CADASTRAL' },
      ]);
      if (n === 0) ctx.result({ ...base(p, 'AHID+BLDTVENC', fp), rule: 'BOLETO_X_ACORDO', status: 'CONCILIADO', target_type: 'ACORDO_ASSESSORIA', target_record_id: inst.id, reason: `Parcela ${p.fields.BLNUMPARC} confere com o acordo` });
    }
  },
});

// ===========================================================================
// E. QUEBRA DE ACORDOS — QUEBRA_ACORDO x ACORDO_ASSESSORIA
// ===========================================================================
registerFlow({
  code: 'E_QUEBRA',
  title: 'E. Quebra de acordos',
  description: 'Acordos quebrados relacionados ao acordo original, com atualização de status.',
  sources: ['QUEBRA_ACORDO', 'ACORDO_ASSESSORIA'],
  rules: [
    'Chave: AHID (Número do Acordo). O status do acordo passa a QUEBRADO com a data AHAUTDT.',
    'Campos comparados: DMACCT, AHTYPE e AHDT (Data de Negociação x Data do Acordo).',
    'AHPRD não é comparado: na Quebra significa "total incluindo a entrada" e no Acordo "Qtde de parcelas".',
  ],
  async run(ctx) {
    const db = ctx.db;
    const q = await loadAll(db, 'QUEBRA_ACORDO');
    if (!q.length) {
      ctx.note('AGUARDANDO', 'Nenhum QUEBRA_ACORDO confirmado.');
      await db.query(`UPDATE agreements SET status='ATIVO', broken_at=NULL WHERE status='QUEBRADO'`);
      return;
    }
    // Uma entrada por (AHID, contrato): o mesmo AHID pode vir com contratos diferentes e nenhum
    // registro pode ser descartado. Para a situação do acordo vale a quebra mais recente do AHID.
    const latest = new Map<string, Rec>();
    const perKey = new Map<string, Rec>();
    for (const r of q) {
      if (!r.ahid) continue;
      latest.set(r.ahid, r); // ordenado por data do arquivo
      perKey.set(`${r.ahid}|${r.contract_key}`, r);
    }
    await db.query(`UPDATE agreements SET status = CASE WHEN agreement_date IS NULL THEN 'NAO_IDENTIFICADO' ELSE 'ATIVO' END, broken_at=NULL WHERE status='QUEBRADO'`);
    await db.query(
      `UPDATE agreements a SET status='QUEBRADO', broken_at=x.d, updated_at=now() FROM jsonb_to_recordset($1::jsonb) AS x(ahid bigint, d date) WHERE a.ahid=x.ahid`,
      [JSON.stringify([...latest.values()].map((r) => ({ ahid: r.ahid, d: r.event_date })))],
    );
    const acoAvailable = await hasConfirmed(db, 'ACORDO_ASSESSORIA');
    if (!acoAvailable) ctx.note('AGUARDANDO', 'ACORDO_ASSESSORIA não importado: quebras não podem ser relacionadas ao acordo original.');
    const aco = acoAvailable ? await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA') : new Map<string, Rec[]>();
    for (const r of perKey.values()) {
      const ahid = r.ahid!;
      const fpk = `${ahid}|${r.contract_key}`;
      if (config.agencyCode && norm(r.fields.DMAGENCY) !== norm(config.agencyCode)) {
        ctx.result({ ...base(r, 'AHID', ahid), rule: 'QUEBRA_OUTRA_ASSESSORIA', status: 'INFORMATIVO', field: 'DMAGENCY', value_received: r.fields.DMAGENCY, value_expected: config.agencyCode, reason: 'Acordo criado por outra assessoria' });
      }
      if (!acoAvailable) {
        waiting(ctx, 'QUEBRA_X_ACORDO', [r], 'AHID', 'ACORDO_ASSESSORIA');
        continue;
      }
      const a = aco.get(ahid);
      if (!a) {
        ctx.divergence({ ...base(r, 'AHID', ahid), rule: 'QUEBRA_X_ACORDO', status: 'SOMENTE_ORIGEM', target_type: 'ACORDO_ASSESSORIA', reason: `Quebra em ${br(r.event_date)} de acordo não localizado nos ACORDO_ASSESSORIA importados` }, 'ACORDO_NAO_RECONHECIDO', fpk);
        continue;
      }
      const h = agreementHead(a);
      const n = compareFields(ctx, 'QUEBRA_X_ACORDO', r, h, 'AHID', ahid, fpk, [
        { field: 'DMACCT', label: 'Contrato', src: r.contract_key, dst: h.contract_key, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'AHTYPE', label: 'Tipo de acordo', src: r.fields.AHTYPE, dst: h.fields.AHTYPE, kind: 'text', category: 'DIVERGENCIA_CADASTRAL' },
        { field: 'AHDT', label: 'Data de negociação', src: r.fields.AHDT, dst: h.fields.AHDT, kind: 'date', category: 'DIVERGENCIA_DATA' },
      ]);
      if (n === 0) ctx.result({ ...base(r, 'AHID', ahid), rule: 'QUEBRA_X_ACORDO', status: 'CONCILIADO', target_type: 'ACORDO_ASSESSORIA', target_record_id: h.id, reason: `Acordo quebrado em ${br(r.event_date)} — status atualizado` });
    }
  },
});

// ===========================================================================
// F. ELEGIBILIDADE — ELEGIBILIDADE x REM_CONTRATOS x ACORDO_ASSESSORIA
// ===========================================================================
registerFlow({
  code: 'F_ELEGIBILIDADE',
  title: 'F. Elegibilidade',
  description: 'Tipos de acordo elegíveis (catálogo) confrontados com os acordos realizados.',
  sources: ['ELEGIBILIDADE', 'ACORDO_ASSESSORIA', 'REM_CONTRATOS'],
  rules: [
    'O layout de Elegibilidade NÃO contém contrato nem CPF; é um catálogo de tipos de acordo (AGTYPE) com vigência.',
    'Chave: AHTYPE (Tipo Acordo) x AGTYPE (Tipo de Acordo) da última Elegibilidade importada.',
    'Elegível: tipo existente e AHDT dentro de AGINITDT..AGENDDT. Fora da vigência => Divergência de data. Tipo inexistente => Divergência cadastral.',
    'Elegibilidade por contrato (REM_CONTRATOS): requer configuração de regra — não há campo de relacionamento no layout.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const el = await loadLatestImport(db, 'ELEGIBILIDADE');
    if (!el.importId) {
      ctx.note('AGUARDANDO', 'Nenhum ELEGIBILIDADE confirmado.');
      return;
    }
    ctx.result({
      rule: 'ELEGIBILIDADE_POR_CONTRATO',
      status: 'PENDENTE_CONFIGURACAO',
      key_name: 'DMACCT',
      key_value: null,
      source_type: 'ELEGIBILIDADE',
      reason: 'O layout de Elegibilidade não possui contrato/CPF; a elegibilidade por contrato exige regra de relacionamento não definida nos layouts.',
    });
    const types = new Map(el.rows.map((r) => [norm(r.fields.AGTYPE), r]));
    if (!(await hasConfirmed(db, 'ACORDO_ASSESSORIA'))) {
      ctx.note('AGUARDANDO', 'ACORDO_ASSESSORIA não importado.');
      return;
    }
    const aco = await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA');
    for (const [ahid, l] of aco) {
      const h = agreementHead(l);
      const t = types.get(norm(h.fields.AHTYPE));
      if (!t) {
        ctx.divergence(
          { ...base(h, 'AHTYPE', h.fields.AHTYPE), rule: 'ACORDO_X_ELEGIBILIDADE', status: 'SOMENTE_ORIGEM', target_type: 'ELEGIBILIDADE', field: 'AHTYPE', value_received: h.fields.AHTYPE, reason: `Tipo de acordo ${h.fields.AHTYPE} não consta na Elegibilidade vigente` },
          'DIVERGENCIA_CADASTRAL',
          ahid,
        );
        continue;
      }
      const d = h.fields.AHDT;
      const ini = t.fields.AGINITDT;
      const fim = t.fields.AGENDDT;
      if (d && ((ini && d < ini) || (fim && d > fim))) {
        ctx.divergence(
          { ...base(h, 'AHTYPE', h.fields.AHTYPE), rule: 'ACORDO_X_ELEGIBILIDADE', status: 'DIVERGENTE', target_type: 'ELEGIBILIDADE', target_record_id: t.id, field: 'AHDT', value_received: br(d), value_expected: `${br(ini)} a ${br(fim)}`, reason: 'Acordo realizado fora da vigência do tipo de acordo' },
          'DIVERGENCIA_DATA',
          ahid,
        );
        continue;
      }
      ctx.result({ ...base(h, 'AHTYPE', h.fields.AHTYPE), rule: 'ACORDO_X_ELEGIBILIDADE', status: 'CONCILIADO', target_type: 'ELEGIBILIDADE', target_record_id: t.id, reason: `Tipo ${h.fields.AHTYPE} elegível na data do acordo (vigência ${br(ini)} a ${br(fim)})` });
    }
  },
});

// ===========================================================================
// G. COMISSIONAMENTO — COMISSAO x ACORDO_ASSESSORIA x REPASSE
// ===========================================================================
registerFlow({
  code: 'G_COMISSAO',
  title: 'G. Comissionamento',
  description: 'Registros de comissão relacionados a acordos e pagamentos.',
  sources: ['COMISSAO', 'ACORDO_ASSESSORIA', 'REPASSE'],
  rules: [
    'O layout de Comissão não possui AHID: relacionamento por CONTRATO (mesma chave DMACCT).',
    'COMISSAO x REPASSE: CONTRATO + DATA_RECEBIMENTO (x PMTDATE) + VALOR_RECEBIDO (x PMAMT). Mesmo contrato e data com valor diferente => Divergência de valor.',
    'Recebimentos em datas não cobertas pelos repasses importados => informativo.',
    'Linhas idênticas no mesmo arquivo de comissão => Duplicidade.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const com = await loadAll(db, 'COMISSAO');
    if (!com.length) {
      ctx.note('AGUARDANDO', 'Nenhum arquivo de COMISSÃO confirmado.');
      return;
    }
    dupResults(ctx, 'COMISSAO_DUPLICADA', 'LINHA', groupBy(com, (r) => `${r.import_id}:${r.record_hash}`), (_k, l) =>
      `Linha de comissão do contrato ${l[0].contract_key} (recebimento ${br(l[0].event_date)}, ${fmtMoney(l[0].amount)}) idêntica em ${l.length} ocorrências em ${l[0].import_name}. O layout não possui identificador de parcela: confirmar com o banco se são recebimentos distintos.`,
    );
    const unique = com.filter((r) => !r.dup_in_file);
    const acoAvailable = await hasConfirmed(db, 'ACORDO_ASSESSORIA');
    const acoByContract = new Map<string, string[]>();
    if (acoAvailable) {
      for (const [ahid, l] of await loadLatestPerAhid(db, 'ACORDO_ASSESSORIA')) {
        const k = agreementHead(l).contract_key!;
        acoByContract.set(k, [...(acoByContract.get(k) ?? []), ahid]);
      }
    } else ctx.note('AGUARDANDO', 'ACORDO_ASSESSORIA não importado.');
    const reps = await loadAll(db, 'REPASSE');
    if (!reps.length) ctx.note('AGUARDANDO', 'REPASSE não importado.');
    const repBy = groupBy(reps, (r) => `${r.contract_key}|${r.event_date}`);
    const covered = new Set(reps.map((r) => r.event_date));

    for (const c of unique) {
      const k = c.contract_key!;
      const fp = `${k}|${c.event_date}|${c.amount}|${c.fields.PRESTACAO_ATRASO}|${c.line_number}|${c.import_id}`;
      if (acoAvailable) {
        const ah = acoByContract.get(k);
        ctx.result({
          ...base(c, 'CONTRATO', k),
          rule: 'COMISSAO_X_ACORDO',
          status: ah ? 'CONCILIADO' : 'INFORMATIVO',
          target_type: 'ACORDO_ASSESSORIA',
          reason: ah ? `Contrato com acordo(s): ${ah.join(', ')}` : 'Contrato sem acordo nos ACORDO_ASSESSORIA importados',
        });
      }
      if (!reps.length) continue;
      const cand = repBy.get(`${k}|${c.event_date}`);
      if (!cand) {
        if (!covered.has(c.event_date)) {
          ctx.result({ ...base(c, 'CONTRATO+DATA', fp), rule: 'COMISSAO_X_REPASSE', status: 'INFORMATIVO', target_type: 'REPASSE', reason: `Recebimento de ${br(c.event_date)} fora do período dos repasses importados` });
        } else {
          ctx.divergence({ ...base(c, 'CONTRATO+DATA', fp), rule: 'COMISSAO_X_REPASSE', status: 'SOMENTE_ORIGEM', target_type: 'REPASSE', reason: `Recebimento de ${fmtMoney(c.amount)} em ${br(c.event_date)} sem repasse correspondente` }, 'PAGAMENTO_NAO_IDENTIFICADO', fp);
        }
        continue;
      }
      const match = cand.find((r) => numEq(r.amount, c.amount));
      if (match) ctx.result({ ...base(c, 'CONTRATO+DATA+VALOR', fp), rule: 'COMISSAO_X_REPASSE', status: 'CONCILIADO', target_type: 'REPASSE', target_record_id: match.id, reason: 'Recebimento corresponde ao pagamento repassado' });
      else
        ctx.divergence(
          { ...base(c, 'CONTRATO+DATA', fp), rule: 'COMISSAO_X_REPASSE', status: 'DIVERGENTE', target_type: 'REPASSE', target_record_id: cand[0].id, field: 'VALOR_RECEBIDO', value_received: fmtMoney(c.amount), value_expected: cand.map((r) => fmtMoney(r.amount)).join(', '), reason: 'Valor recebido na comissão difere dos repasses do contrato na data' },
          'DIVERGENCIA_VALOR',
          fp,
        );
    }
  },
});

// ===========================================================================
// H. CAMPANHAS — CCAM x arquivos de rejeição de campanha
// ===========================================================================
registerFlow({
  code: 'H_CAMPANHAS',
  title: 'H. Campanhas',
  description: 'Registros de campanha enviados (CCAM) e rejeitados (rejeição interna/externa).',
  sources: ['CCAM', 'REJ_CAMPANHA_EXT', 'REJ_CAMPANHA_INT'],
  rules: [
    'Chave: contrato (DMACCT do registro tipo 1 da CCAM x contrato informado na rejeição).',
    'Arquivos de rejeição não possuem layout: a extração do contrato e do motivo depende de configuração.',
    'Arquivos de rejeição vazios são registrados como "sem informação" e não como sucesso.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const rejImports = await db.query<{ id: number; original_name: string; status: string; file_type: string }>(
      `SELECT id, original_name, status, file_type FROM imports WHERE file_type IN ('REJ_CAMPANHA_EXT','REJ_CAMPANHA_INT') AND status IN ('CONFIRMADO','VAZIO')`,
    );
    for (const i of rejImports.rows.filter((r) => r.status === 'VAZIO')) {
      ctx.result({ rule: 'REJEICAO_ARQUIVO_VAZIO', status: 'INFORMATIVO', key_name: 'ARQUIVO', key_value: i.original_name, source_type: i.file_type, reason: 'Arquivo de rejeição vazio: nenhuma informação de rejeição recebida (não equivale a "sem rejeições").' });
    }
    const ccam = await loadAll(db, 'CCAM', '1');
    const rej = [...(await loadAll(db, 'REJ_CAMPANHA_EXT')), ...(await loadAll(db, 'REJ_CAMPANHA_INT'))];
    const cfg = await getSetting(SETTING_REJEICAO, db);
    if (!ccam.length && !rej.length) {
      ctx.note('AGUARDANDO', (await hasConfirmed(db, 'CCAM')) ? 'CCAM importada sem registros de dados.' : 'Nenhuma CCAM confirmada.');
      return;
    }
    if (rej.length && !cfg) {
      ctx.result({ rule: 'REJEICAO_SEM_CONFIGURACAO', status: 'PENDENTE_CONFIGURACAO', key_name: 'CONTRATO', key_value: null, source_type: 'REJ_CAMPANHA', reason: `${rej.length} linha(s) de rejeição armazenada(s) sem extração configurada de contrato/motivo.` });
    }
    const rejBy = groupBy(rej, (r) => r.contract_key);
    const ccamKeys = new Set(ccam.map((c) => c.contract_key));
    for (const c of ccam) {
      const r = rejBy.get(c.contract_key!)?.[0];
      if (r) ctx.result({ ...base(c, 'DMACCT', c.contract_key), rule: 'CCAM_X_REJEICAO', status: 'DIVERGENTE', target_type: r.file_type, target_record_id: r.id, field: 'MOTIVO', value_received: r.fields.MOTIVO, reason: `Campanha rejeitada${r.fields.MOTIVO ? ': ' + r.fields.MOTIVO : ''}` });
      else ctx.result({ ...base(c, 'DMACCT', c.contract_key), rule: 'CCAM_X_REJEICAO', status: rej.length || rejImports.rows.length ? 'CONCILIADO' : 'INFORMATIVO', reason: 'Campanha enviada sem rejeição registrada' });
    }
    for (const [k, l] of rejBy) {
      if (ccamKeys.has(k)) continue;
      ctx.result({ ...base(l[0], 'CONTRATO', k), rule: 'REJEICAO_X_CCAM', status: 'SOMENTE_DESTINO', reason: `Rejeição de campanha para contrato sem CCAM importada${l[0].fields.MOTIVO ? ' (' + l[0].fields.MOTIVO + ')' : ''}` });
    }
  },
});

// ===========================================================================
// I. INTEGRIDADE DAS CHAVES — três pilares de identificação
//   Pilar 1 (visão conta): Número do Acordo (AHID) -> deve apontar para um único contrato.
//   Pilar 2 (visão contrato): Nº Conta/Contrato (DMACCT) -> deve ter um único CPF/CNPJ.
//   Pilar 3 (visão unique): CPF/CNPJ -> pode ter vários contratos (multiplicidade natural, informativa).
// ===========================================================================
registerFlow({
  code: 'I_INTEGRIDADE',
  title: 'I. Integridade das chaves',
  description: 'Prova que cada acordo aponta para um único contrato e cada contrato para um único CPF/CNPJ, em todos os arquivos.',
  sources: ['REM_CONTRATOS', 'BAT_CONTRATOS', 'RET_DISTRIBUICAO', 'RET_CARTEIRA', 'ACORDO_ASSESSORIA', 'BAT_ACORDO', 'BAT_ACORDO_PGTO', 'REPASSE', 'REM_BOLETOS', 'QUEBRA_ACORDO', 'COMISSAO', 'CCAM'],
  rules: [
    'Pilar 1: um AHID associado a mais de um contrato (em qualquer arquivo) é divergência cadastral — nenhum dos registros é descartado.',
    'Pilar 2: um contrato com mais de um CPF/CNPJ entre arquivos é divergência cadastral (CPF comparado só por dígitos, sem zeros à esquerda).',
    'Pilar 3: CPF/CNPJ com vários contratos é multiplicidade natural da operação (informativo), não duplicidade.',
    'Chaves não são substituídas entre si: Nº Contrato, Nº Conta-Contrato (15/19 posições) e CPF são tratados como identificadores distintos.',
  ],
  async run(ctx) {
    const db = ctx.db;
    const BASE = `FROM records r JOIN imports i ON i.id = r.import_id AND i.status = 'CONFIRMADO' WHERE r.valid`;
    // Pilar 1
    const p1 = await db.query<{ ahid: string; contratos: string[]; arquivos: string[]; rid: string }>(
      `SELECT r.ahid::text, array_agg(DISTINCT r.contract_key) AS contratos, array_agg(DISTINCT r.file_type) AS arquivos, min(r.id)::text AS rid
       ${BASE} AND r.ahid IS NOT NULL AND r.contract_key IS NOT NULL GROUP BY r.ahid`,
    );
    if (!p1.rows.length && !(await db.query(`SELECT 1 ${BASE} AND r.contract_key IS NOT NULL LIMIT 1`)).rowCount) {
      ctx.note('AGUARDANDO', 'Nenhum registro confirmado.');
      return;
    }
    for (const a of p1.rows) {
      const r = { rule: 'PILAR1_ACORDO_CONTRATO', key_name: 'AHID', key_value: a.ahid, ahid: a.ahid, source_record_id: a.rid, source_type: a.arquivos.join(', ') };
      if (a.contratos.length === 1) ctx.result({ ...r, status: 'CONCILIADO', contract_key: a.contratos[0], reason: `Acordo associado a um único contrato em ${a.arquivos.length} tipo(s) de arquivo` });
      else
        ctx.divergence(
          { ...r, status: 'DIVERGENTE', contract_key: a.contratos[0], field: 'DMACCT', value_received: a.contratos.join(', '), reason: `O acordo ${a.ahid} aparece com ${a.contratos.length} contratos diferentes (${a.arquivos.join(', ')})` },
          'DIVERGENCIA_CADASTRAL',
          a.ahid,
        );
    }
    // Pilar 2
    const p2 = await db.query<{ contract_key: string; cpfs: string[]; arquivos: string[]; rid: string }>(
      `SELECT r.contract_key, array_agg(DISTINCT ltrim(regexp_replace(r.cpf, '\\D', '', 'g'), '0')) AS cpfs, array_agg(DISTINCT r.file_type) AS arquivos, min(r.id)::text AS rid
       ${BASE} AND r.contract_key IS NOT NULL AND COALESCE(ltrim(regexp_replace(r.cpf, '\\D', '', 'g'), '0'), '') <> '' GROUP BY r.contract_key`,
    );
    for (const c of p2.rows) {
      const r = { rule: 'PILAR2_CONTRATO_CPF', key_name: 'DMACCT', key_value: c.contract_key, contract_key: c.contract_key, source_record_id: c.rid, source_type: c.arquivos.join(', ') };
      if (c.cpfs.length === 1) ctx.result({ ...r, status: 'CONCILIADO', cpf: c.cpfs[0], reason: `Contrato com um único CPF/CNPJ em ${c.arquivos.length} tipo(s) de arquivo` });
      else
        ctx.divergence(
          { ...r, status: 'DIVERGENTE', cpf: c.cpfs[0], field: 'DMSSNUM', value_received: c.cpfs.join(', '), reason: `O contrato ${c.contract_key} aparece com ${c.cpfs.length} CPF/CNPJ diferentes (${c.arquivos.join(', ')})` },
          'DIVERGENCIA_CADASTRAL',
          c.contract_key,
        );
    }
    // Pilar 3 (informativo): CPF com mais de um contrato
    const byCpf = new Map<string, string[]>();
    for (const c of p2.rows) if (c.cpfs.length === 1) byCpf.set(c.cpfs[0], [...(byCpf.get(c.cpfs[0]) ?? []), c.contract_key]);
    let multi = 0;
    for (const [cpf, cts] of byCpf) {
      if (cts.length < 2) continue;
      multi++;
      ctx.result({ rule: 'PILAR3_CPF_MULTIPLOS_CONTRATOS', status: 'INFORMATIVO', key_name: 'CPF', key_value: cpf, cpf, contract_key: cts[0], reason: `CPF/CNPJ com ${cts.length} contratos: ${cts.join(', ')} (multiplicidade natural)` });
    }
    ctx.note('INFO', `Pilar 1: ${p1.rows.length} acordos; Pilar 2: ${p2.rows.length} contratos com CPF; Pilar 3: ${byCpf.size} CPF/CNPJ distintos, ${multi} com mais de um contrato.`);
  },
});
