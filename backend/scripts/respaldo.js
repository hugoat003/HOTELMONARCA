// Copia de la base de datos mientras el servidor sigue funcionando (API de respaldo de SQLite:
// la copia es consistente aunque en ese momento se esté cobrando).
//   node scripts/respaldo.js [archivo-destino]
// Sin destino: respaldos/monarca-AAAA-MM-DD-HHMMSS.db junto a la base.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.env.MONARCA_DB || join(here, '../data/monarca.db'));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dest = resolve(process.argv[2] || join(dirname(source), 'respaldos', `monarca-${stamp}.db`));

export async function backup(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  const db = new Database(from, { readonly: true, fileMustExist: true });
  try {
    await db.backup(to);
  } finally {
    db.close();
  }
  // La copia queda como un solo archivo (sin -wal/-shm) y se revisa que esté sana
  const copy = new Database(to);
  copy.pragma('journal_mode = DELETE');
  try {
    const ok = copy.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw new Error('La copia no pasó la revisión de integridad: ' + ok);
    return copy.prepare("SELECT value FROM meta WHERE key = 'rev'").get()?.value;
  } finally {
    copy.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const rev = await backup(source, dest);
    console.log(dest);
    console.error(`Respaldo listo (versión de datos ${rev}).`);
  } catch (e) {
    console.error('No se pudo respaldar:', e.message);
    process.exit(1);
  }
}
