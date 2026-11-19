/** Carteiras: sempre exibidas como "código · nome" (regra 12 do CLAUDE.md). */
export const EPS = [
  { codigo: '0140', nome: 'CLEAN' },
  { codigo: '0144', nome: 'CAÍDOS' },
  { codigo: '0900', nome: 'DESAFIANTE' },
] as const;

export type CodigoEps = (typeof EPS)[number]['codigo'];

export function rotuloEps(codigo: CodigoEps): string {
  const eps = EPS.find((e) => e.codigo === codigo);
  if (!eps) throw new Error(`EPS desconhecida: ${codigo}`);
  return `${eps.codigo} · ${eps.nome}`;
}
