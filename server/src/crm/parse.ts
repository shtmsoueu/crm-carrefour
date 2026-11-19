/**
 * Leitura da exportação do CRM externo (CSV ou XLSX). Todas as colunas são
 * preservadas como texto, exatamente como exportadas.
 */
import ExcelJS from 'exceljs';

export interface ParsedTable {
  format: 'CSV' | 'XLSX';
  delimiter: string | null;
  encoding: string | null;
  headers: string[];
  rows: Record<string, string>[];
  warnings: string[];
}

function decode(buf: Buffer): { text: string; encoding: string } {
  let b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  const utf8 = b.toString('utf8');
  // Sequências inválidas em UTF-8 indicam arquivo em ISO-8859-1 (padrão de exportações Windows/Excel).
  if (!utf8.includes('�')) return { text: utf8, encoding: 'UTF-8' };
  return { text: b.toString('latin1'), encoding: 'ISO-8859-1' };
}

function detectDelimiter(firstLine: string): string {
  const cands = [';', ',', '\t', '|'];
  let best = ';';
  let max = -1;
  for (const c of cands) {
    const n = firstLine.split(c).length;
    if (n > max) [best, max] = [c, n];
  }
  return best;
}

/** Parser CSV (RFC 4180): aspas, aspas escapadas e quebras de linha dentro de campos. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') q = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') out.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') out.push(row);
  }
  return out;
}

function uniqueHeaders(raw: string[], warnings: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = (h ?? '').trim() || `COLUNA_${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) {
      warnings.push(`Coluna "${name}" repetida no cabeçalho; renomeada para "${name}_${n + 1}".`);
      name = `${name}_${n + 1}`;
    }
    return name;
  });
}

function toRecords(headers: string[], matrix: string[][], warnings: string[]): Record<string, string>[] {
  let ragged = 0;
  const rows = matrix.map((cells) => {
    if (cells.length !== headers.length) ragged++;
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (cells[i] ?? '').trim()));
    return o;
  });
  if (ragged) warnings.push(`${ragged} linha(s) com quantidade de colunas diferente do cabeçalho.`);
  return rows;
}

export async function parseCrmExport(buf: Buffer, filename: string): Promise<ParsedTable> {
  const warnings: string[] = [];
  const isXlsx = /\.xlsx$/i.test(filename) || (buf[0] === 0x50 && buf[1] === 0x4b);
  if (isXlsx) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Planilha sem abas.');
    if (wb.worksheets.length > 1) warnings.push(`Planilha com ${wb.worksheets.length} abas: utilizada somente a primeira ("${ws.name}").`);
    const matrix: string[][] = [];
    let precision = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const v = row.getCell(c).value as unknown;
        let s = '';
        if (v === null || v === undefined) s = '';
        else if (v instanceof Date) s = v.toISOString().slice(0, 10);
        else if (typeof v === 'number') {
          if (Number.isInteger(v) && Math.abs(v) > Number.MAX_SAFE_INTEGER) precision++;
          s = Number.isInteger(v) ? String(v) : String(v);
        } else if (typeof v === 'object' && v !== null && 'text' in (v as object)) s = String((v as { text: unknown }).text);
        else if (typeof v === 'object' && v !== null && 'result' in (v as object)) s = String((v as { result: unknown }).result ?? '');
        else if (typeof v === 'object' && v !== null && 'richText' in (v as object)) s = ((v as { richText: { text: string }[] }).richText).map((t) => t.text).join('');
        else s = String(v);
        cells.push(s);
      }
      matrix.push(cells);
    });
    if (precision) warnings.push(`${precision} célula(s) numérica(s) com mais de 15 dígitos podem ter perdido precisão no Excel. Prefira exportar o CRM em CSV.`);
    const headers = uniqueHeaders(matrix.shift() ?? [], warnings);
    return { format: 'XLSX', delimiter: null, encoding: null, headers, rows: toRecords(headers, matrix, warnings), warnings };
  }
  const { text, encoding } = decode(buf);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const matrix = parseCsv(text, delimiter);
  const headers = uniqueHeaders(matrix.shift() ?? [], warnings);
  if (headers.length < 2) warnings.push('Apenas uma coluna identificada: verifique o delimitador do arquivo.');
  return { format: 'CSV', delimiter, encoding, headers, rows: toRecords(headers, matrix, warnings), warnings };
}
