/**
 * Validação obrigatória com as cargas de teste (item 12 do escopo).
 * Uso: npm run validate-loads -- <diretório com os arquivos de Cargas_teste.zip> [--reset]
 *
 * --reset limpa o banco de DESENVOLVIMENTO antes (recusa-se a rodar com NODE_ENV=production).
 */
import { copyFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { createImport, confirmImport, ImportError } from '../imports/service.js';
import { runAllFlows } from '../reconciliation/index.js';
import { SYSTEM_ACTOR } from '../services/audit.js';

const dir = process.argv[2];
if (!dir) {
  console.error('Informe o diretório das cargas de teste.');
  process.exit(1);
}
if (process.argv.includes('--reset')) {
  if (process.env.NODE_ENV === 'production') throw new Error('--reset não permitido em produção');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}
await migrate(pool, () => undefined);
const actor = { ...SYSTEM_ACTOR, username: 'validacao-cargas' };
const tmp = await mkdtemp(join(tmpdir(), 'crm-val-'));
const rows: Record<string, unknown>[] = [];
for (const f of (await readdir(dir)).sort()) {
  const t = join(tmp, f);
  await copyFile(join(dir, f), t);
  try {
    let imp = await createImport({ tempPath: t, originalName: f, actor });
    if (imp.status === 'PRE_VISUALIZACAO') imp = await confirmImport(imp.id, actor);
    rows.push({
      arquivo: f, tipo: imp.file_type, situacao: imp.status, linhas: imp.total_lines, dados: imp.data_records,
      validos: imp.valid_records, rejeitados: imp.rejected_records, dup: imp.duplicate_records, trailer: imp.trailer_count_match ?? '-',
    });
  } catch (e) {
    rows.push({ arquivo: f, erro: e instanceof ImportError ? e.message : String(e) });
  }
}
console.log('\n=== IMPORTAÇÃO ===');
console.table(rows);

console.log('\n=== BATIMENTOS ===');
const t0 = Date.now();
const runs = await runAllFlows(actor);
for (const r of runs) {
  console.log(`\n${r.flow}: ${r.total} resultado(s), ${r.divergences} pendência(s)`);
  for (const [rule, st] of Object.entries(r.byRule)) console.log(`   ${rule}: ${JSON.stringify(st)}`);
  for (const n of r.notes) console.log(`   [${n.level}] ${n.text}`);
}
console.log(`\nBatimentos executados em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const pend = await pool.query(`SELECT category, count(*)::int n FROM divergences WHERE status IN ('ABERTA','EM_ANALISE') GROUP BY 1 ORDER BY 2 DESC`);
console.log('\n=== PENDÊNCIAS ABERTAS ===');
console.table(pend.rows);
const integ = await pool.query(`SELECT
  (SELECT count(*) FROM records r JOIN imports i ON i.id=r.import_id WHERE i.status='CONFIRMADO' AND r.contract_ref IS NOT NULL AND r.contract_key IS NULL)::int AS registros_sem_vinculo_contrato,
  (SELECT count(*) FROM records r JOIN imports i ON i.id=r.import_id WHERE i.status='CONFIRMADO' AND r.ahid_ref IS NOT NULL AND r.ahid IS NULL)::int AS registros_sem_vinculo_acordo,
  (SELECT count(*) FROM contracts)::int AS contratos, (SELECT count(*) FROM agreements)::int AS acordos`);
console.log('\n=== INTEGRIDADE ===');
console.table(integ.rows);
await pool.end();
