/**
 * CARTEIRA CONSOLIDADA (base original)
 *
 * Uma linha por conta (contrato), montada exclusivamente a partir dos registros
 * válidos de importações CONFIRMADAS. É a referência confrontada com o CRM externo.
 * Somente leitura: nada aqui altera dados importados.
 */
import { pool, type Db } from '../db/pool.js';
import { getSetting } from '../services/settings.js';
import { classifyFaixa, classifyOrigem, classifyProduto, classifyRanking, faixaLabel, type FlagCode } from './rules.js';

export const SETTING_CARTEIRA = 'carteira_regras';
export interface CarteiraSettings {
  /** Campo usado como "saldo de risco". DMAMTDLQ = "Valor Risco Salvo (Saldo Principal)" no layout do REPASSE. */
  saldoCampo: 'DMAMTDLQ' | 'DMCURBAL';
}
export const DEFAULT_CARTEIRA: CarteiraSettings = { saldoCampo: 'DMAMTDLQ' };

export interface PortfolioRow {
  contrato: string;
  cpf: string | null;
  nome: string | null;
  status_contrato: string;
  status_data: string | null;
  fonte_cadastro: string | null;
  data_cadastro: string | null;
  dias_atraso: number | null;
  saldo_risco: number | null;
  saldo_devedor: number | null;
  produto_codigo: string | null;
  produto_descricao: string | null;
  produto: string | null;
  origem: string | null;
  origem_ahcollid: string | null;
  origem_fonte: string | null;
  grupo: string | null;
  ranking: string | null;
  faixa: string | null;
  faixa_codigo: string | null;
  acordo_id: string | null;
  acordo_status: string | null;
  acordo_tipo: string | null;
  acordo_data: string | null;
  acordo_valor: number | null;
  parcelas: number | null;
  canal_acordo: string | null;
  acordos_qtde: number;
  pagamentos_qtde: number;
  pagamentos_valor: number;
  ultimo_pagamento_data: string | null;
  ultimo_pagamento_codigo: string | null;
  ultimo_pagamento_canal: string | null;
  ultimo_pagamento_parcela: string | null;
  comissao_linhas: number;
  comissao_valor_recebido: number;
  comissao_remuneracao_bruta: number;
  comissao_ultima_data: string | null;
  comissao_status: string | null;
  flags: FlagCode[];
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

const SQL = `
WITH conf AS (
  SELECT r.*, COALESCE(i.generation_date, i.file_name_date) AS file_date
  FROM records r JOIN imports i ON i.id = r.import_id AND i.status = 'CONFIRMADO'
  WHERE r.valid AND r.contract_key IS NOT NULL
),
cad AS (           -- cadastro mais recente (REM_CONTRATOS ou BAT_CONTRATOS)
  SELECT DISTINCT ON (contract_key) contract_key, file_type, file_date, fields
  FROM conf WHERE file_type IN ('REM_CONTRATOS', 'BAT_CONTRATOS')
  ORDER BY contract_key, file_date DESC NULLS LAST, import_id DESC, line_number DESC
),
aco_latest_import AS (  -- importação mais recente de cada acordo (arquivo-fotografia)
  SELECT DISTINCT ON (ahid) ahid, import_id FROM conf
  WHERE file_type = 'ACORDO_ASSESSORIA' AND ahid IS NOT NULL
  ORDER BY ahid, file_date DESC NULLS LAST, import_id DESC
),
aco AS (
  SELECT DISTINCT ON (c.ahid) c.contract_key, c.ahid, c.fields
  FROM conf c JOIN aco_latest_import l ON l.ahid = c.ahid AND l.import_id = c.import_id
  WHERE c.file_type = 'ACORDO_ASSESSORIA' ORDER BY c.ahid, c.line_number
),
aco_ct AS (        -- acordo mais recente da conta (maior data do acordo)
  SELECT DISTINCT ON (contract_key) contract_key, ahid, fields,
    count(*) OVER (PARTITION BY contract_key) AS qtde
  FROM aco ORDER BY contract_key, fields->>'AHDT' DESC NULLS LAST, ahid DESC
),
pag AS (           -- pagamentos do REPASSE (linhas idênticas entre arquivos contadas uma vez)
  SELECT DISTINCT ON (record_hash) contract_key, amount, event_date, fields, import_id, line_number
  FROM conf WHERE file_type = 'REPASSE' ORDER BY record_hash, import_id
),
pag_ct AS (
  SELECT contract_key, count(*)::int AS qtde, COALESCE(sum(amount), 0)::text AS valor,
    (array_agg(event_date ORDER BY event_date DESC NULLS LAST, import_id DESC, line_number DESC))[1] AS ult_data,
    (array_agg(fields->>'PMTCODE' ORDER BY event_date DESC NULLS LAST, import_id DESC, line_number DESC))[1] AS ult_codigo,
    (array_agg(fields->>'AHCOLLID' ORDER BY event_date DESC NULLS LAST, import_id DESC, line_number DESC))[1] AS ult_canal,
    (array_agg(fields->>'PMBATCH' ORDER BY event_date DESC NULLS LAST, import_id DESC, line_number DESC))[1] AS ult_parcela
  FROM pag GROUP BY contract_key
),
com_ct AS (        -- comissão: todas as linhas preservadas (integridade do arquivo de remuneração)
  SELECT contract_key, count(*)::int AS linhas, COALESCE(sum(amount), 0)::text AS valor,
    COALESCE(sum(NULLIF(fields->>'REMUNERACAO_DEVIDA', '')::numeric), 0)::text AS remuneracao,
    max(event_date) AS ult_data,
    (array_agg(fields->>'STATUS_CONTRATO' ORDER BY event_date DESC NULLS LAST, line_number DESC))[1] AS status
  FROM conf WHERE file_type = 'COMISSAO' GROUP BY contract_key
)
SELECT c.contract_key, c.cpf, c.name, c.status, c.status_date,
  cad.file_type AS cad_tipo, cad.file_date AS cad_data, cad.fields AS cad,
  a.ahid::text AS acordo_id, a.fields AS aco, a.qtde AS acordos_qtde, ag.status AS acordo_status,
  p.qtde AS pag_qtde, p.valor AS pag_valor, p.ult_data, p.ult_codigo, p.ult_canal, p.ult_parcela,
  m.linhas AS com_linhas, m.valor AS com_valor, m.remuneracao AS com_rem, m.ult_data AS com_data, m.status AS com_status
FROM contracts c
LEFT JOIN cad ON cad.contract_key = c.contract_key
LEFT JOIN aco_ct a ON a.contract_key = c.contract_key
LEFT JOIN agreements ag ON ag.ahid = a.ahid
LEFT JOIN pag_ct p ON p.contract_key = c.contract_key
LEFT JOIN com_ct m ON m.contract_key = c.contract_key
WHERE EXISTS (SELECT 1 FROM conf WHERE conf.contract_key = c.contract_key)
ORDER BY c.contract_key`;

export async function buildPortfolio(db: Db = pool): Promise<{ rows: PortfolioRow[]; settings: CarteiraSettings }> {
  const settings = { ...DEFAULT_CARTEIRA, ...((await getSetting<CarteiraSettings>(SETTING_CARTEIRA, db)) ?? {}) };
  const r = await db.query(SQL);
  const rows: PortfolioRow[] = r.rows.map((x) => {
    const cad = (x.cad ?? {}) as Record<string, string | null>;
    const aco = (x.aco ?? {}) as Record<string, string | null>;
    const flags: FlagCode[] = [];
    const dias = num(cad.U1DAYSGER02);
    const saldo = num(cad[settings.saldoCampo]);
    const rk = classifyRanking(dias, saldo);
    flags.push(...rk.flags);
    const fx = classifyFaixa(dias, rk);
    if (fx.flag) flags.push(fx.flag);
    const prod = classifyProduto(cad.U1PRODUTO);
    if (prod.flag) flags.push(prod.flag);
    // Origem: AHCOLLID do acordo mais recente; na ausência de acordo, do pagamento mais recente.
    const ahc = aco.AHCOLLID ?? x.ult_canal ?? null;
    const org = classifyOrigem(ahc);
    if (org.flag) flags.push(org.flag);
    return {
      contrato: x.contract_key,
      cpf: x.cpf,
      nome: x.name,
      status_contrato: x.status,
      status_data: x.status_date,
      fonte_cadastro: x.cad_tipo,
      data_cadastro: x.cad_data,
      dias_atraso: dias,
      saldo_risco: saldo,
      saldo_devedor: num(cad.DMCURBAL),
      produto_codigo: cad.U1PRODUTO ?? null,
      produto_descricao: cad.U1BPRODUCT ?? null,
      produto: prod.value,
      origem: org.value,
      origem_ahcollid: ahc,
      origem_fonte: aco.AHCOLLID ? 'ACORDO_ASSESSORIA' : x.ult_canal ? 'REPASSE' : null,
      grupo: rk.grupo,
      ranking: rk.ranking,
      faixa: fx.value ? faixaLabel(fx.value) : null,
      faixa_codigo: fx.value?.codigo ?? null,
      acordo_id: x.acordo_id,
      acordo_status: x.acordo_id ? x.acordo_status : null,
      acordo_tipo: aco.AHTYPE ?? null,
      acordo_data: aco.AHDT ?? null,
      acordo_valor: num(aco.AHTOTPMT),
      parcelas: num(aco.AHPRD),
      canal_acordo: aco.AHCOLLID ?? null,
      acordos_qtde: Number(x.acordos_qtde ?? 0),
      pagamentos_qtde: x.pag_qtde ?? 0,
      pagamentos_valor: Number(x.pag_valor ?? 0),
      ultimo_pagamento_data: x.ult_data,
      ultimo_pagamento_codigo: x.ult_codigo,
      ultimo_pagamento_canal: x.ult_canal,
      ultimo_pagamento_parcela: x.ult_parcela,
      comissao_linhas: x.com_linhas ?? 0,
      comissao_valor_recebido: Number(x.com_valor ?? 0),
      comissao_remuneracao_bruta: Number(x.com_rem ?? 0),
      comissao_ultima_data: x.com_data,
      comissao_status: x.com_status,
      flags,
    };
  });
  return { rows, settings };
}

/** Catálogo de atributos da base original disponíveis para confronto com o CRM. */
export const BASE_ATTRIBUTES: { key: keyof PortfolioRow; label: string; kind: 'text' | 'number' | 'date'; source: string }[] = [
  { key: 'contrato', label: 'Contrato (DMACCT)', kind: 'text', source: 'Chave de todos os layouts' },
  { key: 'cpf', label: 'CPF/CNPJ', kind: 'text', source: 'DMSSNUM' },
  { key: 'nome', label: 'Nome do cliente', kind: 'text', source: 'DMNAME' },
  { key: 'status_contrato', label: 'Status do contrato', kind: 'text', source: 'ATIVO / RETIRADO / SEM_DISTRIBUICAO (fluxo A)' },
  { key: 'dias_atraso', label: 'Dias de atraso', kind: 'number', source: 'U1DAYSGER02 (REM/BAT_CONTRATOS mais recente)' },
  { key: 'saldo_risco', label: 'Saldo de risco', kind: 'number', source: 'DMAMTDLQ (configurável)' },
  { key: 'saldo_devedor', label: 'Saldo devedor', kind: 'number', source: 'DMCURBAL' },
  { key: 'produto_codigo', label: 'Código do produto', kind: 'text', source: 'U1PRODUTO' },
  { key: 'produto', label: 'Produto Carrefour', kind: 'text', source: 'Regra 4 sobre U1PRODUTO' },
  { key: 'origem', label: 'Origem (DIRETO/INDIRETO)', kind: 'text', source: 'Regra 1 sobre AHCOLLID' },
  { key: 'origem_ahcollid', label: 'AHCOLLID', kind: 'text', source: 'ACORDO_ASSESSORIA (ou REPASSE)' },
  { key: 'grupo', label: 'Grupo', kind: 'text', source: 'Regra 3' },
  { key: 'ranking', label: 'Ranking', kind: 'text', source: 'Regra 3' },
  { key: 'faixa_codigo', label: 'Faixa de atraso (código)', kind: 'text', source: 'Regra 5' },
  { key: 'acordo_id', label: 'ID do acordo (AHID)', kind: 'text', source: 'ACORDO_ASSESSORIA' },
  { key: 'acordo_status', label: 'Status do acordo', kind: 'text', source: 'ATIVO / QUEBRADO (fluxo E)' },
  { key: 'acordo_tipo', label: 'Tipo do acordo', kind: 'text', source: 'AHTYPE' },
  { key: 'acordo_data', label: 'Data do acordo', kind: 'date', source: 'AHDT' },
  { key: 'acordo_valor', label: 'Valor do acordo', kind: 'number', source: 'AHTOTPMT' },
  { key: 'parcelas', label: 'Quantidade de parcelas', kind: 'number', source: 'AHPRD (Qtde de Parcelas)' },
  { key: 'canal_acordo', label: 'Canal do acordo', kind: 'text', source: 'AHCOLLID "Usuário (Canal)" do acordo' },
  { key: 'ultimo_pagamento_codigo', label: 'Código da transação do último pagamento', kind: 'text', source: 'PMTCODE (REPASSE)' },
  { key: 'ultimo_pagamento_canal', label: 'Gestor do último pagamento', kind: 'text', source: 'AHCOLLID (REPASSE)' },
  { key: 'ultimo_pagamento_data', label: 'Data do último pagamento', kind: 'date', source: 'PMTDATE (REPASSE)' },
  { key: 'pagamentos_valor', label: 'Valor total pago', kind: 'number', source: 'Soma PMAMT (REPASSE)' },
  { key: 'comissao_valor_recebido', label: 'Comissão: valor recebido', kind: 'number', source: 'Soma VALOR_RECEBIDO (COMISSÃO)' },
  { key: 'comissao_remuneracao_bruta', label: 'Comissão: remuneração devida (bruto)', kind: 'number', source: 'Soma REMUNERACAO_DEVIDA (sem decimais definidos)' },
];

// ---------------------------------------------------------------- Cache por versão dos dados
let cache: { version: string; at: number; value: Awaited<ReturnType<typeof buildPortfolio>> } | null = null;

/** A carteira é recalculada somente quando importações, batimentos ou regras mudam. */
export async function getPortfolioCached() {
  const v = await pool.query<{ v: string }>(
    `SELECT concat_ws('|',
       (SELECT max(GREATEST(uploaded_at, confirmed_at, cancelled_at))::text FROM imports),
       (SELECT max(reprocess_count)::text FROM imports),
       (SELECT max(id)::text FROM reconciliation_runs),
       (SELECT updated_at::text FROM settings WHERE key = $1)) AS v`,
    [SETTING_CARTEIRA],
  );
  const version = v.rows[0].v;
  if (cache && cache.version === version && Date.now() - cache.at < 30 * 60 * 1000) return cache.value;
  const value = await buildPortfolio();
  cache = { version, at: Date.now(), value };
  return value;
}
