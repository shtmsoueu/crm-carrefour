/**
 * Build para a Vercel usando a Build Output API v3:
 *   .vercel/output/static            -> interface (web/dist)
 *   .vercel/output/functions/api.func -> API empacotada em um único arquivo
 *   .vercel/output/config.json       -> rotas (/api/* -> função; demais -> SPA)
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/functions/api.func`, { recursive: true });

cpSync('web/dist', `${out}/static`, { recursive: true });

await build({
  entryPoints: ['server/src/vercel.ts'],
  outfile: `${out}/functions/api.func/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['pg-native'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});

writeFileSync(`${out}/functions/api.func/.vc-config.json`, JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  maxDuration: 60,
  memory: 1024,
}, null, 2));

writeFileSync(`${out}/config.json`, JSON.stringify({
  version: 3,
  routes: [
    { src: '^/api/?$', dest: '/api' },
    { src: '^/api/(.*)$', dest: '/api?__path=$1' },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index.html' },
  ],
}, null, 2));
console.log('Build Vercel gerado em .vercel/output');
