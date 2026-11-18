import m001 from './001_init.js';
import m002 from './002_import_files.js';

/** Migrações em ordem. Nomes preservam o histórico já aplicado (001_init.sql). */
export const MIGRATIONS: { name: string; sql: string }[] = [
  { name: '001_init.sql', sql: m001 },
  { name: '002_import_files', sql: m002 },
];
