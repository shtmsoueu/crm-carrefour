import { config } from './config.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
import { hashPassword, validatePassword } from './auth/auth.js';

await migrate(pool);

// Primeiro acesso em hospedagens sem terminal: cria o administrador a partir de
// ADMIN_USERNAME / ADMIN_PASSWORD somente se ainda não existir nenhum usuário.
const users = await pool.query(`SELECT count(*)::int n FROM users WHERE username <> 'acesso-livre'`);
if (!config.authEnabled) {
  console.warn('ATENÇÃO: login desativado (AUTH_ENABLED != true). Qualquer pessoa com o endereço acessa os dados.');
} else if (users.rows[0].n === 0) {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;
  if (u && p) {
    const err = validatePassword(p);
    if (err) throw new Error(`ADMIN_PASSWORD inválida: ${err}`);
    await pool.query(`INSERT INTO users (username, name, role, password_hash) VALUES ($1, $2, 'ADMIN', $3)`, [u, process.env.ADMIN_NAME ?? 'Administrador', await hashPassword(p)]);
    await pool.query(`INSERT INTO audit_log (username, action, entity, entity_id) VALUES ('sistema', 'USUARIO_CRIADO_INICIAL', 'user', $1)`, [u]);
    console.log(`Administrador inicial "${u}" criado. Remova ADMIN_PASSWORD das variáveis de ambiente.`);
  } else {
    console.warn('Nenhum usuário cadastrado. Defina ADMIN_USERNAME e ADMIN_PASSWORD ou rode: npm run create-user -- <usuario> "<Nome>" ADMIN');
  }
}
createApp().listen(config.port, () => console.log(`CRM Carteira Carrefour — API em http://localhost:${config.port}`));
