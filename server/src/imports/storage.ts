import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import type { Db } from '../db/pool.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const h = createHash('sha256');
  await new Promise<void>((res, rej) => {
    createReadStream(path).on('data', (c) => h.update(c)).on('end', () => res()).on('error', rej);
  });
  const s = await stat(path);
  return { sha256: h.digest('hex'), size: s.size };
}

/** Descompacta um upload enviado em gzip pelo navegador; retorna o caminho do arquivo original. */
export async function gunzipToTemp(path: string): Promise<string> {
  const out = join(tmpdir(), `crm-${randomUUID()}`);
  await writeFile(out, await gunzip(await readFile(path)));
  return out;
}

/** Armazena o arquivo original (imutável, compactado) no banco, vinculado à importação. */
export async function saveOriginal(db: Db, importId: number, path: string): Promise<void> {
  await db.query(`INSERT INTO import_files (import_id, encoding, content) VALUES ($1, 'gzip', $2)`, [importId, await gzip(await readFile(path))]);
}

export async function readOriginal(db: Db, importId: number): Promise<Buffer | null> {
  const r = await db.query<{ content: Buffer }>(`SELECT content FROM import_files WHERE import_id = $1`, [importId]);
  return r.rows[0] ? gunzip(r.rows[0].content) : null;
}

/** Grava o original em um arquivo temporário para reprocessamento. O chamador remove o arquivo. */
export async function materializeOriginal(db: Db, importId: number): Promise<string | null> {
  const buf = await readOriginal(db, importId);
  if (!buf) return null;
  const out = join(tmpdir(), `crm-${randomUUID()}`);
  await writeFile(out, buf);
  return out;
}

export const removeTemp = (p: string | null | undefined) => (p ? rm(p, { force: true }) : Promise.resolve());
