import type pg from 'pg';
import { MIGRATIONS } from './migrations/index.js';

export async function migrate(pool: pg.Pool, log: (m: string) => void = console.log): Promise<void> {
  const client = await pool.connect();
  try {
    // Lock evita que duas instâncias (ex.: funções serverless) migrem ao mesmo tempo.
    await client.query('SELECT pg_advisory_lock(hashtext($1))', ['crm-migrations']);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const m of MIGRATIONS) {
      if (applied.has(m.name)) continue;
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
        await client.query('COMMIT');
        log(`Migração aplicada: ${m.name}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${m.name}: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['crm-migrations']).catch(() => undefined);
    client.release();
  }
}

let once: Promise<void> | null = null;
/** Executa as migrações uma única vez por processo (usado no primeiro request serverless). */
export function migrateOnce(pool: pg.Pool): Promise<void> {
  return (once ??= migrate(pool, () => undefined).catch((e) => {
    once = null;
    throw e;
  }));
}
