import { config } from './config.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';

await migrate(pool);
const users = await pool.query('SELECT count(*)::int n FROM users');
if (users.rows[0].n === 0) {
  console.warn('Nenhum usuário cadastrado. Crie o administrador com: npm run create-user -- <usuario> "<Nome>" ADMIN');
}
createApp().listen(config.port, () => console.log(`CRM Carteira Carrefour — API em http://localhost:${config.port}`));
