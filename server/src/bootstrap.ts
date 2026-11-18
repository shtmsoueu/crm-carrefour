import { config } from './config.js';
import { pool } from './db/pool.js';
import { hashPassword, validatePassword } from './auth/auth.js';

/**
 * Com login ativo e nenhum usuário cadastrado, cria o administrador a partir de
 * ADMIN_USERNAME / ADMIN_PASSWORD (hospedagens sem terminal, ex.: Vercel).
 */
export async function bootstrapAdmin(log: (m: string) => void = console.log): Promise<void> {
  if (!config.authEnabled) return;
  const users = await pool.query(`SELECT count(*)::int n FROM users WHERE username <> 'acesso-livre'`);
  if (users.rows[0].n > 0) return;
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (!u || !p) {
    log('Nenhum usuário cadastrado. Defina ADMIN_USERNAME e ADMIN_PASSWORD ou rode: npm run create-user -- <usuario> "<Nome>" ADMIN');
    return;
  }
  const err = validatePassword(p);
  if (err) throw new Error(`ADMIN_PASSWORD inválida: ${err}`);
  await pool.query(
    `INSERT INTO users (username, name, role, password_hash) VALUES ($1, $2, 'ADMIN', $3) ON CONFLICT (username) DO NOTHING`,
    [u, process.env.ADMIN_NAME ?? 'Administrador', await hashPassword(p)],
  );
  await pool.query(`INSERT INTO audit_log (username, action, entity, entity_id) VALUES ('sistema', 'USUARIO_CRIADO_INICIAL', 'user', $1)`, [u]);
  log(`Administrador inicial "${u}" criado. Remova ADMIN_PASSWORD das variáveis de ambiente.`);
}
