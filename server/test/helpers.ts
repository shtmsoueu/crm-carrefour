import { getLayout } from '../src/layouts/definitions.js';
import type { RecordDef } from '../src/layouts/types.js';

/** Monta uma linha de largura fixa a partir da definição do layout (A: alinhado à esquerda, N: zeros à esquerda). */
export function line(def: RecordDef, values: Record<string, string | number>): string {
  const buf = Array.from({ length: def.length }, () => ' ');
  for (const f of def.fields) {
    const size = f.end - f.start + 1;
    let v = values[f.name] ?? (f.fixed ?? '');
    let s = String(v);
    if (f.type === 'N' && s !== '' && !s.startsWith(' ')) s = s.padStart(size, '0');
    s = s.padEnd(size, ' ').slice(0, size);
    for (let i = 0; i < size; i++) buf[f.start - 1 + i] = s[i];
  }
  return buf.join('');
}

export const rec = (code: string, type = '1') => getLayout(code).records.find((r) => r.code === type)!;
export const head = (code: string, variant = 0) => getLayout(code).headerTrailer[variant].header!;
export const trail = (code: string, variant = 0) => getLayout(code).headerTrailer[variant].trailer!;
