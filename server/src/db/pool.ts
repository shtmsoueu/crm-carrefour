import pg from 'pg';
import { config } from '../config.js';

// DATE como string ISO (sem conversão de fuso); BIGINT e NUMERIC como string (sem perda de precisão).
pg.types.setTypeParser(1082, (v) => v);

/**
 * O pg trata sslmode=prefer/require/verify-ca como verify-full e emite um aviso a cada conexão.
 * Explicita verify-full: mesma segurança atual, sem o aviso e sem mudança de comportamento na próxima versão do pg.
 */
export function normalizeSslMode(url: string): string {
  return url.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/, '$1verify-full');
}

export const pool = new pg.Pool({ connectionString: normalizeSslMode(config.databaseUrl), max: 10 });

export type Db = pg.Pool | pg.PoolClient;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
