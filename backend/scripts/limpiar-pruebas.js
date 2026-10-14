// Borra los datos de prueba antes de abrir el sistema en el hotel. Conserva catálogos, usuarios
// (con sus PIN) y configuración; quita ventas, cuentas, reservas, huéspedes, eventos, turnos de
// caja, movimientos, bitácora y la cola de impresión.
//   node scripts/limpiar-pruebas.js --confirmar
// El servidor debe estar DETENIDO (guarda el estado en memoria y lo volvería a escribir).
// Antes se hace un respaldo completo junto a la base.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { Engine } from '../src/engine.js';
import { clearOperations } from '../src/seed.js';
import { backup } from './respaldo.js';

const here = dirname(fileURLToPath(import.meta.url));
const dbFile = resolve(process.env.MONARCA_DB || join(here, '../data/monarca.db'));
const port = Number(process.env.PORT || 3000);

if (!process.argv.includes('--confirmar')) {
  console.error('Esto borra ventas, cuentas, reservas, huéspedes, eventos y turnos de caja.');
  console.error('Corre de nuevo con --confirmar para hacerlo.');
  process.exit(1);
}
if (!existsSync(dbFile)) {
  console.error(`No existe la base ${dbFile}`);
  process.exit(1);
}
// ¿Sigue corriendo el servidor?
try {
  const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
  if (r.ok) {
    console.error('El servidor sigue encendido. Detén el servicio antes de limpiar.');
    process.exit(1);
  }
} catch {
  /* no responde: está detenido */
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const copy = join(dirname(dbFile), 'respaldos', `antes-de-limpiar-pruebas-${stamp}.db`);
await backup(dbFile, copy);
console.log(`Respaldo: ${copy}`);

const db = openDb(dbFile);
const engine = new Engine(db);
const before = engine.state;
const counts = {
  ventas: before.sales.length,
  cuentas: before.orders.length,
  reservas: before.reservations.length,
  huéspedes: before.guests.length,
  eventos: before.events.length,
  cierres: before.shiftHistory.length,
};
engine.replaceAll(clearOperations(before));
for (const table of ['actions', 'print_jobs', 'sessions'])
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
    db.exec(`DELETE FROM ${table}`);
db.close();
console.log(
  'Borrado:',
  Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', '),
);
console.log('Se conservan: menú, mesas, habitaciones, salones, usuarios y PIN, inventario, tienda y configuración.');
console.log('Todas las sesiones se cerraron: cada quien vuelve a entrar con su PIN.');
