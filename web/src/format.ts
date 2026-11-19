/**
 * Mapa ÚNICO de estados da plataforma (mesma cor para o mesmo estado em todas as telas):
 * ok = concluído/conciliado · bad = divergência/erro · warn = atenção/pendência ·
 * wait = aguardando/sem informação · info = informação/processamento.
 */
export const fmtInt = (n: number | string | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR'));
export const fmtMoney = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const FILE_TYPE_LABELS: Record<string, string> = {
  REM_CONTRATOS: 'Remessa de contratos',
  RET_DISTRIBUICAO: 'Retirada por distribuição',
  RET_CARTEIRA: 'Retirada da carteira',
  ACORDO_ASSESSORIA: 'Acordos da assessoria',
  REPASSE: 'Repasse de pagamentos',
  REM_BOLETOS: 'Remessa de boletos',
  QUEBRA_ACORDO: 'Quebra de acordos',
  ELEGIBILIDADE: 'Elegibilidade',
  CCAM: 'Carta campanha (CCAM)',
  COMISSAO: 'Comissão',
  BAT_CONTRATOS: 'Batimento de contratos',
  BAT_ACORDO: 'Batimento de acordos',
  BAT_ACORDO_PGTO: 'Batimento de pagamentos',
  REJ_CAMPANHA_EXT: 'Rejeição de campanha externa',
  REJ_CAMPANHA_INT: 'Rejeição de campanha interna',
  CAMPANHA_ASSESSORIA: 'Campanha da assessoria',
  RAJADA_PIX: 'Rajada PIX',
};

export const RESULT_LABELS: Record<string, { label: string; tone: string }> = {
  CONCILIADO: { label: 'Conciliado', tone: 'ok' },
  DIVERGENTE: { label: 'Divergente', tone: 'bad' },
  SOMENTE_ORIGEM: { label: 'Somente na origem', tone: 'bad' },
  SOMENTE_DESTINO: { label: 'Somente no destino', tone: 'bad' },
  DUPLICADO: { label: 'Duplicado', tone: 'bad' },
  INFORMATIVO: { label: 'Informativo', tone: 'info' },
  PENDENTE_CONFIGURACAO: { label: 'Requer configuração', tone: 'warn' },
  AGUARDANDO_ARQUIVO: { label: 'Aguardando arquivo', tone: 'wait' },
};

export const IMPORT_STATUS: Record<string, { label: string; tone: string }> = {
  PRE_VISUALIZACAO: { label: 'Aguardando confirmação', tone: 'warn' },
  CONFIRMADO: { label: 'Confirmado', tone: 'ok' },
  DESCARTADO: { label: 'Descartado', tone: 'wait' },
  CANCELADO: { label: 'Cancelado', tone: 'wait' },
  VAZIO: { label: 'Arquivo vazio', tone: 'wait' },
  SEM_LAYOUT: { label: 'Sem layout oficial', tone: 'info' },
  INVALIDO: { label: 'Fora do padrão', tone: 'bad' },
};

export const DIV_STATUS: Record<string, { label: string; tone: string }> = {
  ABERTA: { label: 'Aberta', tone: 'warn' },
  EM_ANALISE: { label: 'Em análise', tone: 'info' },
  RESOLVIDA: { label: 'Resolvida', tone: 'ok' },
  JUSTIFICADA: { label: 'Justificada', tone: 'ok' },
  RESOLVIDA_AUTOMATICAMENTE: { label: 'Resolvida automaticamente', tone: 'ok' },
};

export const CONTRACT_STATUS: Record<string, { label: string; tone: string }> = {
  ATIVO: { label: 'Ativo na carteira', tone: 'ok' },
  '005 - PARALISADO': { label: '005 - Paralisado', tone: 'wait' },
  SEM_DISTRIBUICAO: { label: 'Sem distribuição registrada', tone: 'wait' },
};

export const AGREEMENT_STATUS: Record<string, { label: string; tone: string }> = {
  PROMESSA_ATIVA: { label: 'Promessa ativa', tone: 'info' },
  PROMESSA_EM_ATRASO: { label: 'Promessa em atraso', tone: 'warn' },
  ACORDO: { label: 'Acordo', tone: 'ok' },
  QUEBRA_DE_ACORDO: { label: 'Quebra de acordo', tone: 'bad' },
  ACORDO_EXTERNO: { label: 'Acordo externo', tone: 'wait' },
  NAO_IDENTIFICADO: { label: 'Sem ACORDO_ASSESSORIA', tone: 'wait' },
};

export const INSTALLMENT_STATUS: Record<string, { label: string; tone: string }> = {
  PAGA: { label: 'Paga', tone: 'ok' },
  A_VENCER: { label: 'A vencer', tone: 'info' },
  EM_ATRASO: { label: 'Em atraso', tone: 'warn' },
  VENCIDA: { label: 'Fora da tolerância', tone: 'bad' },
  QUEBRADA: { label: 'Quebrada', tone: 'wait' },
};

/** Aviso de fluxo em forma curta: "X não importado: ..." -> "Aguardando X". */
export function shortNote(text: string): string {
  const m = /^([A-Z_]+(?: ou [A-Z_]+)*) não importado/.exec(text);
  if (m) return `Aguardando ${m[1]}`;
  if (/^Nenhum(a)? ([A-Z_]+)/.test(text)) return text.replace(/^Nenhum(a)? ([A-Z_]+).*$/, 'Aguardando $2');
  if (/sem registros/i.test(text)) return 'Sem registros no arquivo';
  return text.split(':')[0];
}

export const SCOPE_SHORT: Record<string, string> = { ATIVOS: 'Ativos', COM_CADASTRO: 'Com cadastro', TODOS: 'Todos' };
