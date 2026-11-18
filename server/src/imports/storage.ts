import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';

export async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const h = createHash('sha256');
  await new Promise<void>((res, rej) => {
    createReadStream(path).on('data', (c) => h.update(c)).on('end', () => res()).on('error', rej);
  });
  const s = await stat(path);
  return { sha256: h.digest('hex'), size: s.size };
}

export function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'arquivo';
  return base.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180) || 'arquivo';
}

/**
 * Armazena o arquivo original (imutável) em STORAGE_DIR/AAAA/MM/<sha256>_<nome>.
 * Retorna o caminho relativo ao diretório de armazenamento.
 */
export async function storeOriginal(tempPath: string, sha256: string, originalName: string): Promise<string> {
  const now = new Date();
  const rel = join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${sha256}_${sanitizeName(originalName)}`);
  const abs = join(config.storageDir, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await copyFile(tempPath, abs);
  await rm(tempPath, { force: true });
  return rel;
}

export function storedAbsolutePath(rel: string): string {
  const abs = join(config.storageDir, rel);
  if (!abs.startsWith(config.storageDir)) throw new Error('Caminho de armazenamento inválido');
  return abs;
}
