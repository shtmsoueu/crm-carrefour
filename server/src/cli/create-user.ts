/**
 * Cria um usuário. A senha é lida da variável CRM_PASSWORD ou solicitada no terminal (sem eco).
 * Uso: npm run create-user -- <usuario> "<Nome completo>" <ADMIN|OPERADOR|CONSULTA>
 */
import { createInterface } from 'node:readline';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';
import { hashPassword, validatePassword } from '../auth/auth.js';

const [username, name, role = 'ADMIN'] = process.argv.slice(2);
if (!username || !name || !['ADMIN', 'OPERADOR', 'CONSULTA'].includes(role)) {
  console.error('Uso: npm run create-user -- <usuario> "<Nome>" <ADMIN|OPERADOR|CONSULTA>');
  process.exit(1);
}
async function askHidden(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  out._writeToOutput = (s: string) => out.output.write(s.includes(q) ? s : '');
  const a = await new Promise<string>((r) => rl.question(q, r));
  rl.close();
  process.stdout.write('\n');
  return a;
}
const password = process.env.CRM_PASSWORD ?? (await askHidden('Senha: '));
const err = validatePassword(password);
if (err) {
  console.error(err);
  process.exit(1);
}
await migrate(pool, () => undefined);
await pool.query(
  `INSERT INTO users (username, name, role, password_hash) VALUES ($1,$2,$3,$4)
   ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, active = TRUE`,
  [username, name, role, await hashPassword(password)],
);
await pool.query(`INSERT INTO audit_log (username, action, entity, entity_id, details) VALUES ('cli', 'USUARIO_CRIADO_CLI', 'user', $1, $2)`, [username, JSON.stringify({ role })]);
console.log(`Usuário ${username} (${role}) gravado.`);
await pool.end();
