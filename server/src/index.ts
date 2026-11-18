import { config } from './config.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
import { bootstrapAdmin } from './bootstrap.js';

await migrate(pool);
await bootstrapAdmin();
if (!config.authEnabled) console.warn('ATENÇÃO: login desativado (AUTH_ENABLED != true). Qualquer pessoa com o endereço acessa os dados.');
createApp().listen(config.port, () => console.log(`CRM Carteira Carrefour — API em http://localhost:${config.port}`));
