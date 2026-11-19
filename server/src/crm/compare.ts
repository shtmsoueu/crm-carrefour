/** Normalização de valores para confronto base original x CRM. */

export type Kind = 'text' | 'number' | 'date';

export const normText = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** Número em formato pt-BR (1.234,56), en (1,234.56) ou simples; remove "R$" e espaços. */
export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s/gi, '').trim();
  if (s === '') return null;
  const neg = /^-|\(.*\)$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = (s.match(/,/g)!.length > 1 ? s.replace(/,/g, '') : s.replace(',', '.'));
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

/** Data em dd/mm/aaaa, aaaa-mm-dd (com ou sem hora), dd-mm-aaaa ou número serial do Excel. */
export function parseDateAny(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export interface KeyOptions {
  stripLeadingZeros: boolean;
  digitsOnly: boolean;
}

export function normKey(v: unknown, o: KeyOptions): string {
  let s = String(v ?? '').trim().toUpperCase();
  if (o.digitsOnly) s = s.replace(/\D/g, '');
  if (o.stripLeadingZeros) s = s.replace(/^0+(?=.)/, '');
  return s;
}

/** Compara valores; retorna true quando equivalentes. `equiv` mapeia valor do CRM (normalizado) -> valor da base. */
export function equivalent(kind: Kind, base: unknown, crm: unknown, equiv?: Map<string, string>): boolean {
  if (kind === 'number') {
    const a = parseNum(base);
    const b = parseNum(equiv?.get(normText(crm)) ?? crm);
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return Math.abs(a - b) < 0.005;
  }
  if (kind === 'date') {
    const a = parseDateAny(base);
    const b = parseDateAny(equiv?.get(normText(crm)) ?? crm);
    return a === b;
  }
  const b = normText(crm);
  const mapped = equiv?.get(b) ?? b;
  return normText(base) === normText(mapped);
}
