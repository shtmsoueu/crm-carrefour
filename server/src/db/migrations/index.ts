import m001 from './001_init.js';
import m002 from './002_import_files.js';
import m003 from './003_crm_conciliacao.js';
import m004 from './004_status_operacional.js';

/** Migrações em ordem. Nomes preservam o histórico já aplicado (001_init.sql). */
export const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '001_init.sql', sql: m001 },
  { name: '002_import_files', sql: m002 },
  { name: '003_crm_conciliacao', sql: m003 },
  { name: '004_status_operacional', sql: m004 },
];
