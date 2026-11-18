import type { DateFormat, FieldDef } from '../layouts/types.js';

export type Severity = 'ERRO' | 'ALERTA' | 'INFO';

export interface FieldIssue {
  field: string;
  value: string;
  message: string;
  severity: Severity;
}

const DATE_FORMATS: DateFormat[] = ['AAAAMMDD', 'DDMMAAAA', 'MMDDAAAA'];

/** Converte uma data no formato do layout para ISO (YYYY-MM-DD). Retorna null se inválida. */
export function parseDate(raw: string, fmt: DateFormat): string | null {
  if (!/^\d{8}$/.test(raw)) return null;
  let y: number, m: number, d: number;
  if (fmt === 'AAAAMMDD') [y, m, d] = [+raw.slice(0, 4), +raw.slice(4, 6), +raw.slice(6, 8)];
  else if (fmt === 'DDMMAAAA') [d, m, y] = [+raw.slice(0, 2), +raw.slice(2, 4), +raw.slice(4, 8)];
  else [m, d, y] = [+raw.slice(0, 2), +raw.slice(2, 4), +raw.slice(4, 8)];
  if (y < 1800 || m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Tenta formatos alternativos — usado apenas para diagnóstico de headers/nomes de arquivo. */
export function parseDateAnyFormat(raw: string, preferred?: DateFormat): { iso: string; format: DateFormat } | null {
  const order = preferred ? [preferred, ...DATE_FORMATS.filter((f) => f !== preferred)] : DATE_FORMATS;
  for (const fmt of order) {
    const iso = parseDate(raw, fmt);
    if (iso) return { iso, format: fmt };
  }
  return null;
}

/**
 * Normaliza um número de largura fixa para string decimal exata.
 * Mantido como string para não perder precisão (campos de até 22 dígitos).
 */
export function parseNumber(raw: string, decimals: number | undefined, signed: boolean): string | null {
  const t = raw.trim();
  if (t === '') return null;
  const re = signed ? /^-?\d+$/ : /^\d+$/;
  if (!re.test(t)) return null;
  const neg = t.startsWith('-');
  let digits = (neg ? t.slice(1) : t).replace(/^0+(?=\d)/, '');
  let out: string;
  if (decimals && decimals > 0) {
    digits = digits.padStart(decimals + 1, '0');
    const int = digits.slice(0, -decimals).replace(/^0+(?=\d)/, '');
    out = `${int}.${digits.slice(-decimals)}`;
  } else {
    out = digits;
  }
  if (neg && /[1-9]/.test(out)) out = '-' + out;
  return out;
}

export interface ParsedField {
  value: string | null;
  issue?: FieldIssue;
}

/** Extrai e valida um campo de uma linha de largura fixa. */
export function parseField(line: string, def: FieldDef): ParsedField {
  const raw = line.slice(def.start - 1, def.end);
  const trimmed = raw.trim();
  const sev: Severity = def.required ? 'ERRO' : 'ALERTA';

  if (def.fixed !== undefined && trimmed !== def.fixed) {
    return {
      value: trimmed || null,
      issue: { field: def.name, value: raw, severity: sev, message: `Valor fixo esperado '${def.fixed}', recebido '${trimmed}'` },
    };
  }

  if (trimmed === '') {
    if (def.required) {
      return { value: null, issue: { field: def.name, value: raw, severity: 'ERRO', message: 'Campo obrigatório não preenchido' } };
    }
    return { value: null };
  }

  if (def.type === 'A') return { value: trimmed };

  if (def.type === 'N') {
    const v = parseNumber(raw, def.decimals, !!def.signed);
    if (v === null) {
      // Sinal negativo não previsto no layout: valor aceito com alerta (não descarta registro financeiro).
      const signedValue = !def.signed ? parseNumber(raw, def.decimals, true) : null;
      if (signedValue !== null) {
        return {
          value: signedValue,
          issue: { field: def.name, value: raw, severity: 'ALERTA', message: 'Valor com sinal negativo (sinal não previsto no layout)' },
        };
      }
      return { value: null, issue: { field: def.name, value: raw, severity: sev, message: 'Valor numérico inválido' } };
    }
    return { value: v };
  }

  // Data
  if (/^0+$/.test(trimmed)) return { value: null };
  const iso = parseDate(trimmed, def.dateFormat ?? 'AAAAMMDD');
  if (!iso) {
    return {
      value: null,
      issue: { field: def.name, value: raw, severity: sev, message: `Data inválida para o formato ${def.dateFormat}` },
    };
  }
  return { value: iso };
}

/** Normaliza identificador numérico (AHID): remove zeros à esquerda; zero => null. */
export function normalizeNumericId(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim().replace(/^0+/, '');
  return t === '' ? null : t;
}
