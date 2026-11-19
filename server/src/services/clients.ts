import { pool } from '../db/pool.js';
import { getPortfolioCached, normCpf } from '../portfolio/portfolio.js';
import { contractDetail } from './contracts.js';

/** Limite de contratos detalhados na linha do tempo de um mesmo CPF/CNPJ (proteção de desempenho). */
const MAX_TIMELINE_CONTRACTS = 30;

const cents = (v: number | null | undefined) => Math.round((v ?? 0) * 100);

/**
 * Visão consolidada do cliente (Pilar 3: CPF/CNPJ). O CPF é usado apenas para AGRUPAR contratos;
 * os vínculos continuam sendo contrato e acordo. Nenhum valor é estimado: totais somam o que veio nos arquivos.
 */
export async function clientDetail(raw: string) {
  const cpf = normCpf(raw);
  if (cpf.length < 3) return null;
  const c = await pool.query(
    `SELECT c.contract_key, c.cpf, c.name, c.status, c.status_date, c.first_seen_at
     FROM contracts c WHERE ltrim(regexp_replace(c.cpf, '\\D', '', 'g'), '0') = $1 ORDER BY c.contract_key`,
    [cpf],
  );
  if (!c.rows.length) return null;
  const keys = c.rows.map((r) => r.contract_key as string);

  const { rows: portfolio } = await getPortfolioCached();
  const port = new Map(portfolio.filter((p) => keys.includes(p.contrato)).map((p) => [p.contrato, p]));

  const divs = await pool.query(
    `SELECT DISTINCT ON (d.id) d.id::text, d.category, d.flow, d.rule, d.contract_key, d.ahid::text, d.field, d.value_received, d.value_expected,
       d.description, d.status, d.source_file, d.first_detected_at, d.last_detected_at
     FROM divergences d
     WHERE d.contract_key = ANY($1::text[])
        OR d.ahid IN (SELECT a.ahid FROM agreements a WHERE a.contract_key = ANY($1::text[]))
        OR ltrim(regexp_replace(d.cpf, '\\D', '', 'g'), '0') = $2
     ORDER BY d.id`,
    [keys, cpf],
  );
  const isOpen = (s: string) => s === 'ABERTA' || s === 'EM_ANALISE';

  const contratos = c.rows.map((r) => {
    const p = port.get(r.contract_key);
    const own = divs.rows.filter((d) => d.contract_key === r.contract_key);
    return {
      contrato: r.contract_key as string,
      status: r.status as string,
      status_data: r.status_date,
      produto: p?.produto ?? null,
      ranking: p?.ranking ?? null,
      faixa: p?.faixa ?? null,
      faixa_codigo: p?.faixa_codigo ?? null,
      dias_atraso: p?.dias_atraso ?? null,
      saldo_risco: p?.saldo_risco ?? null,
      acordos_qtde: p?.acordos_qtde ?? 0,
      acordo_status: p?.acordo_status ?? null,
      acordo_valor: p?.acordo_valor ?? null,
      pagamentos_valor: p?.pagamentos_valor ?? 0,
      comissao_valor_recebido: p?.comissao_valor_recebido ?? 0,
      pendencias_abertas: own.filter((d) => isOpen(d.status)).length,
      pendencias_total: own.length,
      flags: p?.flags ?? [],
    };
  });

  // Faixa principal: a do contrato com maior saldo de risco (premissa exibida na tela).
  const principal = [...contratos].filter((x) => x.faixa_codigo).sort((a, b) => cents(b.saldo_risco) - cents(a.saldo_risco))[0];
  const sum = (f: (x: (typeof contratos)[number]) => number | null | undefined) => contratos.reduce((m, x) => m + cents(f(x)), 0) / 100;
  const totais = {
    contratos: contratos.length,
    contratos_ativos: contratos.filter((x) => x.status === 'ATIVO').length,
    saldo_risco: sum((x) => x.saldo_risco),
    saldo_risco_sem_dado: contratos.filter((x) => x.saldo_risco === null).length,
    acordado: sum((x) => x.acordo_valor),
    acordos: contratos.reduce((m, x) => m + x.acordos_qtde, 0),
    pago: sum((x) => x.pagamentos_valor),
    comissao_recebida: sum((x) => x.comissao_valor_recebido),
    pendencias_abertas: divs.rows.filter((d) => isOpen(d.status)).length,
    faixa_principal: principal ? { codigo: principal.faixa_codigo, faixa: principal.faixa, contrato: principal.contrato } : null,
  };

  // Linha do tempo unificada: eventos de cada contrato (com resultados de batimento) + abertura das pendências.
  const detailed = keys.slice(0, MAX_TIMELINE_CONTRACTS);
  const details = await Promise.all(detailed.map((k) => contractDetail(k)));
  const timeline: Record<string, unknown>[] = [];
  details.forEach((d, i) => {
    for (const e of d?.events ?? []) timeline.push({ ...e, contrato: detailed[i] });
  });
  for (const d of divs.rows) {
    timeline.push({
      kind: 'PENDENCIA',
      label: 'Pendência registrada',
      date: (d.first_detected_at as Date).toISOString().slice(0, 10),
      contrato: d.contract_key,
      divergenceId: d.id,
      category: d.category,
      divStatus: d.status,
      info: d.description,
      file: d.source_file,
      results: [],
    });
  }
  timeline.sort((a, b) => String(a.date ?? '9999').localeCompare(String(b.date ?? '9999')));

  const nome = c.rows.find((r) => r.name)?.name ?? null;
  return {
    cpf,
    cpf_original: c.rows[0].cpf as string,
    nome,
    totais,
    contratos,
    divergencias: divs.rows,
    timeline,
    timeline_limitada: keys.length > MAX_TIMELINE_CONTRACTS ? MAX_TIMELINE_CONTRACTS : null,
  };
}
