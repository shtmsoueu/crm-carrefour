import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface Column {
  key: string;
  header: string;
  width?: number;
}

/** Evita injeção de fórmulas em planilhas (CSV/XLSX), preservando números negativos. */
function safe(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) return `'${s}`;
  return s;
}

function csvCell(v: unknown): string {
  const s = safe(v);
  if (s === null) return '';
  const t = String(s);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export async function sendExport(res: Response, format: string, filename: string, columns: Column[], rows: Record<string, unknown>[]) {
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
    const ws = wb.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).commit();
    for (const r of rows) {
      const o: Record<string, unknown> = {};
      for (const c of columns) o[c.key] = safe(r[c.key]);
      ws.addRow(o).commit();
    }
    ws.commit();
    await wb.commit();
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  // BOM + ';' para abertura correta no Excel em pt-BR.
  res.write('﻿' + columns.map((c) => csvCell(c.header)).join(';') + '\r\n');
  for (const r of rows) res.write(columns.map((c) => csvCell(r[c.key])).join(';') + '\r\n');
  res.end();
}
