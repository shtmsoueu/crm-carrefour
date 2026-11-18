import { resolve } from 'node:path';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  /** Login obrigatório. Desativado por padrão (acesso livre); defina AUTH_ENABLED=true para exigir usuário e senha. */
  authEnabled: process.env.AUTH_ENABLED === 'true',
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: required('DATABASE_URL', isProd ? undefined : 'postgres://crm:crm_dev_password@localhost:5432/crm_carrefour'),
  /** Diretório de armazenamento dos arquivos originais (auditoria). */
  storageDir: resolve(process.env.STORAGE_DIR ?? './storage'),
  jwtSecret: required('JWT_SECRET', isProd && process.env.AUTH_ENABLED === 'true' ? undefined : 'dev-only-secret-change-me'),
  sessionHours: Number(process.env.SESSION_HOURS ?? 10),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 300),
  /** Código da assessoria esperado na nomenclatura (ex.: LEALCO). Vazio = não valida. */
  agencyCode: process.env.AGENCY_CODE ?? '',
  insertBatchSize: Number(process.env.INSERT_BATCH_SIZE ?? 1000),
  webDistDir: process.env.WEB_DIST_DIR ? resolve(process.env.WEB_DIST_DIR) : resolve('../web/dist'),
};
