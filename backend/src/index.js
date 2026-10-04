// Arranque del servidor en el NUC.
//   PORT          puerto (3000)
//   HOST          interfaz (0.0.0.0: visible en la red del hotel)
//   MONARCA_DB    archivo de la base (backend/data/monarca.db)
//   MONARCA_SEED  con qué arranca una base nueva: demo | vacio
//   MONARCA_DEMO  1 = permite "Restaurar datos de ejemplo"
//   MONARCA_TEST  1 = modo de pruebas automáticas (un hotel aislado por prueba). Nunca en el hotel.
//   STATIC_DIR    carpeta de la aplicación web compilada (frontend/dist)
process.env.TZ ||= 'America/Guatemala';

const { mkdirSync } = await import('node:fs');
const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const { buildApp } = await import('./app.js');

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const test = env.MONARCA_TEST === '1';
const dbFile = test ? ':memory:' : resolve(env.MONARCA_DB || resolve(here, '../data/monarca.db'));
if (dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true });

const app = await buildApp({
  dbFile,
  seed: env.MONARCA_SEED || 'demo',
  staticDir: resolve(env.STATIC_DIR || resolve(here, '../../frontend/dist')),
  demo: env.MONARCA_DEMO === '1',
  test,
  logger: test ? false : { level: env.LOG_LEVEL || 'warn' },
});

const port = Number(env.PORT || 3000);
await app.listen({ port, host: env.HOST || '0.0.0.0' });
console.log(`POS Monarca en http://localhost:${port}${test ? ' (modo pruebas)' : ''} · base: ${dbFile}`);

for (const sig of ['SIGINT', 'SIGTERM'])
  process.on(sig, async () => {
    await app.close();
    process.exit(0);
  });
