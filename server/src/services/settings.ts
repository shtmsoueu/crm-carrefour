import { pool, type Db } from '../db/pool.js';
import type { UnstructuredConfig } from '../parsing/parser.js';

export const SETTING_REJEICAO = 'rejeicao_campanha';

export async function getSetting<T>(key: string, db: Db = pool): Promise<T | null> {
  const r = await db.query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
  return r.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: unknown, userId: number | null, db: Db = pool): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
}

export function validateUnstructuredConfig(v: unknown): UnstructuredConfig {
  const c = v as UnstructuredConfig;
  if (!c || (c.mode !== 'delimited' && c.mode !== 'fixed')) throw new Error("Modo deve ser 'delimited' ou 'fixed'.");
  if (c.mode === 'delimited') {
    if (!c.delimiter || c.delimiter.length > 3) throw new Error('Delimitador inválido.');
    if (!Number.isInteger(c.contractIndex) || c.contractIndex! < 0) throw new Error('Índice do contrato inválido.');
  } else {
    for (const k of ['contractStart', 'contractEnd'] as const) if (!Number.isInteger(c[k]) || c[k]! < 1) throw new Error(`${k} inválido.`);
    if (c.contractEnd! < c.contractStart!) throw new Error('Posição final do contrato menor que a inicial.');
  }
  return c;
}
