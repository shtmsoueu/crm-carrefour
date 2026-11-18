/**
 * Ponto de entrada da API como Função Vercel (Build Output API).
 * As rotas /api/* são encaminhadas para esta função; o caminho original chega em
 * req.url ou no parâmetro __path, conforme a reescrita aplicada pela plataforma.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { migrateOnce } from './db/migrate.js';
import { bootstrapAdmin } from './bootstrap.js';

let ready: Promise<void> | null = null;
const prepare = () => (ready ??= migrateOnce(pool).then(() => bootstrapAdmin()).catch((e) => { ready = null; throw e; }));

const app = createApp();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.searchParams.get('__path');
  if (p !== null) {
    url.searchParams.delete('__path');
    const q = url.searchParams.toString();
    req.url = `/api/${p}${q ? `?${q}` : ''}`;
  } else if (!url.pathname.startsWith('/api')) {
    req.url = `/api${req.url}`;
  }
  try {
    await prepare();
  } catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const msg = process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'Banco de dados indisponível. Verifique a variável DATABASE_URL.' : 'DATABASE_URL não configurada no projeto da Vercel.';
    res.end(JSON.stringify({ error: msg }));
    return;
  }
  (app as unknown as (rq: IncomingMessage, rs: ServerResponse) => void)(req, res);
}
