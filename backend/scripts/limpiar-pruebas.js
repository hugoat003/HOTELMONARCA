// Borra los datos de prueba antes de abrir el sistema en el hotel. Conserva catálogos, usuarios
// (con sus PIN) y configuración; quita ventas, cuentas, reservas, huéspedes, eventos, turnos de
// caja, movimientos, bitácora y la cola de impresión.
//   node scripts/limpiar-pruebas.js --confirmar
// El servidor debe estar DETENIDO (guarda el estado en memoria y lo volvería a escribir).
// Antes se hace un respaldo completo junto a la base.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { snapshot, stamp } from '../src/backup.js';
import { openDb } from '../src/db.js';
import { Engine } from '../src/engine.js';
import { clearOperations } from '../src/seed.js';
import { backupDir, dbFile, ensureStopped } from './comun.js';

if (!process.argv.includes('--confirmar')) {
  console.error('Esto borra ventas, cuentas, reservas, huéspedes, eventos y turnos de caja.');
  console.error('Corre de nuevo con --confirmar para hacerlo.');
  process.exit(1);
}
if (!existsSync(dbFile)) {
  console.error(`No existe la base ${dbFile}`);
  process.exit(1);
}
await ensureStopped('limpiar');

const copy = join(backupDir, `antes-de-limpiar-pruebas-${stamp()}.db`);
await snapshot(dbFile, copy);
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
console.log(
  'Se conservan: menú, mesas, habitaciones, salones, usuarios con su PIN o contraseña, inventario, tienda y configuración.',
);
console.log('Todas las sesiones se cerraron: cada quien vuelve a entrar.');
