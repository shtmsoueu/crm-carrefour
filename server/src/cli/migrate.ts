import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

await migrate(pool);
await pool.end();
console.log('Banco de dados atualizado.');
