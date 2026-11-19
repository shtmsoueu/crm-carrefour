/**
 * REGRAS DE NEGÓCIO DA CARTEIRA (definidas pelo cliente)
 *
 * Cada função devolve o valor classificado OU um alerta (flag) quando a situação
 * não é contemplada pelas regras recebidas. Nenhuma situação ambígua recebe
 * classificação presumida: ela fica "pendente de definição".
 */

export type FlagCode =
  | 'ORIGEM_SEM_AHCOLLID'
  | 'PRODUTO_SEM_CODIGO'
  | 'PRODUTO_AMBIGUO'
  | 'RANKING_SEM_DADOS'
  | 'RANKING_SALDO_IGUAL_1500'
  | 'RANKING_DIAS_FORA_DA_REGRA'
  | 'RANKING_G1_MENOR_MIL_CONFLITO'
  | 'FAIXA_G1_ATE_60_DIAS';

export const FLAG_LABELS: Record<FlagCode, string> = {
  ORIGEM_SEM_AHCOLLID: 'Origem não identificada: conta sem AHCOLLID (sem acordo/pagamento informado)',
  PRODUTO_SEM_CODIGO: 'Produto não identificado: código de produto (U1PRODUTO) ausente',
  PRODUTO_AMBIGUO: 'Produto ambíguo: código contém AT e SAMS ao mesmo tempo',
  RANKING_SEM_DADOS: 'Ranking não calculado: dias de atraso ou saldo de risco ausentes',
  RANKING_SALDO_IGUAL_1500: 'Saldo de risco exatamente 1.500: regra não define MAIOR ou MENOR MIL',
  RANKING_DIAS_FORA_DA_REGRA: 'Dias de atraso fora das regras (negativo ou acima de 9.999)',
  RANKING_G1_MENOR_MIL_CONFLITO: 'Conflito de regras: G1 – MENOR MIL (regra 3) x "não existe MENOR MIL no Grupo 1" (regra 5)',
  FAIXA_G1_ATE_60_DIAS: 'Grupo 1 com 0 a 60 dias: não há faixa definida (faixas do G1 começam em 61 dias)',
};

export interface Classified<T> {
  value: T | null;
  flag?: FlagCode;
}

// ------------------------------------------------------------------ 1. Origem
export type Origem = 'ASSESSORIA (DIRETO)' | 'INDIRETO';
export const AGENCY_ID = 'LEALCO';

/** AHCOLLID = LEALCO => ASSESSORIA (DIRETO); qualquer outro identificador => INDIRETO. */
export function classifyOrigem(ahcollid: string | null | undefined): Classified<Origem> {
  const v = (ahcollid ?? '').trim();
  if (!v) return { value: null, flag: 'ORIGEM_SEM_AHCOLLID' };
  return { value: v.toUpperCase() === AGENCY_ID ? 'ASSESSORIA (DIRETO)' : 'INDIRETO' };
}

// ------------------------------------------------------------------ 4. Produto
export type Produto = 'ATACADÃO' | 'CARREFOUR' | 'SAMS CLUB';

/**
 * Sigla avaliada no Código do Produto (U1PRODUTO), em maiúsculas.
 * AT => ATACADÃO; SAMS => SAMS CLUB; nenhum dos dois => CARREFOUR; ambos => ambíguo (sem classificação).
 * Obs.: o campo descritivo U1BPRODUCT NÃO é usado, pois contém palavras como "Private" (contém "AT").
 */
export function classifyProduto(codigo: string | null | undefined): Classified<Produto> {
  const v = (codigo ?? '').trim().toUpperCase();
  if (!v) return { value: null, flag: 'PRODUTO_SEM_CODIGO' };
  const at = v.includes('AT');
  const sams = v.includes('SAMS');
  if (at && sams) return { value: null, flag: 'PRODUTO_AMBIGUO' };
  if (sams) return { value: 'SAMS CLUB' };
  if (at) return { value: 'ATACADÃO' };
  return { value: 'CARREFOUR' };
}

// ------------------------------------------------------------------ 3. Ranking
export type Grupo = 'G1' | 'G2';
export type Ranking = 'G1 – MAIOR MIL' | 'G1 – MENOR MIL' | 'G2 – MAIOR MIL' | 'G2 – MENOR MIL';
export const SALDO_LIMITE = 1500;

export interface RankingResult {
  grupo: Grupo | null;
  ranking: Ranking | null;
  flags: FlagCode[];
}

export function classifyRanking(dias: number | null | undefined, saldoRisco: number | null | undefined): RankingResult {
  if (dias === null || dias === undefined || Number.isNaN(dias) || saldoRisco === null || saldoRisco === undefined || Number.isNaN(saldoRisco)) {
    return { grupo: null, ranking: null, flags: ['RANKING_SEM_DADOS'] };
  }
  let grupo: Grupo | null = null;
  if (dias >= 0 && dias <= 364) grupo = 'G1';
  else if (dias >= 365 && dias <= 9999) grupo = 'G2';
  if (!grupo) return { grupo: null, ranking: null, flags: ['RANKING_DIAS_FORA_DA_REGRA'] };
  if (saldoRisco === SALDO_LIMITE) return { grupo, ranking: null, flags: ['RANKING_SALDO_IGUAL_1500'] };
  const maior = saldoRisco > SALDO_LIMITE;
  const ranking = `${grupo} – ${maior ? 'MAIOR' : 'MENOR'} MIL` as Ranking;
  const flags: FlagCode[] = [];
  if (ranking === 'G1 – MENOR MIL') flags.push('RANKING_G1_MENOR_MIL_CONFLITO');
  return { grupo, ranking, flags };
}

// ------------------------------------------------------------------ 5. Faixas de atraso
export interface FaixaDef {
  codigo: string;
  grupo: Grupo;
  de: number;
  ate: number | null; // null = sem limite superior
}

export const FAIXAS: FaixaDef[] = [
  { codigo: '03', grupo: 'G1', de: 61, ate: 90 },
  { codigo: '04', grupo: 'G1', de: 91, ate: 120 },
  { codigo: '05', grupo: 'G1', de: 121, ate: 150 },
  { codigo: '06', grupo: 'G1', de: 151, ate: 180 },
  { codigo: '07', grupo: 'G1', de: 181, ate: 210 },
  { codigo: '08', grupo: 'G1', de: 211, ate: 240 },
  { codigo: '09', grupo: 'G1', de: 241, ate: 270 },
  { codigo: '10', grupo: 'G1', de: 271, ate: 300 },
  { codigo: '11', grupo: 'G1', de: 301, ate: 330 },
  { codigo: '12', grupo: 'G1', de: 331, ate: 364 },
  { codigo: '14', grupo: 'G2', de: 365, ate: 450 },
  { codigo: '15', grupo: 'G2', de: 451, ate: 540 },
  { codigo: '16', grupo: 'G2', de: 541, ate: 630 },
  { codigo: '17', grupo: 'G2', de: 631, ate: 720 },
  { codigo: '18', grupo: 'G2', de: 721, ate: 810 },
  { codigo: '19', grupo: 'G2', de: 811, ate: 1080 },
  { codigo: '21', grupo: 'G2', de: 1081, ate: 1440 },
  { codigo: '22', grupo: 'G2', de: 1441, ate: null },
];

export const faixaLabel = (f: FaixaDef) => `Faixa ${f.codigo} (${f.ate === null ? `acima de ${f.de - 1}` : `${f.de} a ${f.ate}`} dias)`;

/**
 * Faixa de atraso. Não é atribuída quando o ranking está pendente de definição
 * (ex.: G1 – MENOR MIL, que conflita com a regra de faixas) ou quando não há faixa para os dias.
 */
export function classifyFaixa(dias: number | null | undefined, rk: RankingResult): Classified<FaixaDef> {
  if (!rk.grupo || dias === null || dias === undefined) return { value: null };
  if (rk.ranking === 'G1 – MENOR MIL') return { value: null }; // conflito já sinalizado no ranking
  // Ranking indefinido (saldo = 1.500): no G2 a faixa independe do ranking (mesmas 8 faixas);
  // no G1 depende (MENOR MIL não tem faixa no G1), portanto não é atribuída.
  if (!rk.ranking && rk.grupo === 'G1') return { value: null };
  const f = FAIXAS.find((x) => x.grupo === rk.grupo && dias >= x.de && (x.ate === null || dias <= x.ate));
  if (!f) return { value: null, flag: rk.grupo === 'G1' ? 'FAIXA_G1_ATE_60_DIAS' : undefined };
  return { value: f };
}
