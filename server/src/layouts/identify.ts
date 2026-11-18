import { LAYOUTS } from './definitions.js';
import type { FileTypeCode } from './types.js';
import { parseDate, parseDateAnyFormat } from '../parsing/fields.js';

export interface FileIdentification {
  code: FileTypeCode;
  agency: string | null;
  /** Data extraída da nomenclatura (ISO). */
  fileDate: string | null;
  fileTime: string | null;
  warnings: string[];
}

/** Identifica o tipo de arquivo pela nomenclatura oficial do De-Para. */
export function identifyByFilename(filename: string): FileIdentification | null {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  for (const layout of LAYOUTS) {
    const m = layout.filenameRegex.exec(base);
    if (!m) continue;
    const g = layout.filenameGroups;
    const warnings: string[] = [];
    const rawDate = g.date ? m[g.date] : undefined;
    let fileDate: string | null = null;
    if (rawDate) {
      if (g.dateFormat) {
        fileDate = parseDate(rawDate, g.dateFormat);
        if (!fileDate) {
          const alt = parseDateAnyFormat(rawDate);
          if (alt) {
            fileDate = alt.iso;
            warnings.push(`Data do nome do arquivo em ${alt.format}, divergente da nomenclatura oficial (${g.dateFormat}).`);
          } else warnings.push(`Data inválida no nome do arquivo: ${rawDate}`);
        }
      } else {
        const alt = parseDateAnyFormat(rawDate, 'AAAAMMDD');
        if (alt) {
          fileDate = alt.iso;
          if (alt.format !== 'AAAAMMDD') {
            warnings.push(`Data do nome do arquivo interpretada como ${alt.format}; a nomenclatura oficial indica AAAAMMDD.`);
          }
        } else warnings.push(`Data inválida no nome do arquivo: ${rawDate}`);
      }
    }
    const t = g.time ? m[g.time] : undefined;
    return {
      code: layout.code,
      agency: g.agency ? (m[g.agency] ?? null) : null,
      fileDate,
      fileTime: t ? `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}` : null,
      warnings,
    };
  }
  return null;
}
