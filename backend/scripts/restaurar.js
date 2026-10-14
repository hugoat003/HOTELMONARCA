// Restaura la base desde un respaldo: uno de la mini PC o uno guardado fuera del hotel.
//   node scripts/restaurar.js --lista                 respaldos disponibles (aquí y fuera del hotel)
//   node scripts/restaurar.js <respaldo> --confirmar  <respaldo>: ruta, nombre de la lista o nombre externo
// El servidor debe estar DETENIDO. Antes de reemplazar, la base actual se guarda como
// respaldos/antes-de-restaurar-….db. Si el respaldo es de una versión anterior del sistema, el
// servidor lleva los datos al formato actual al arrancar.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { inspect, snapshot, stamp, unpack } from '../src/backup.js';
import { REMOTE_PREFIX } from '../src/remote.js';
import { VERSION } from '../../shared/version.js';
import { backupDir, dbFile, ensureStopped, fail, kb, remote, secret } from './comun.js';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));

function localList() {
  try {
    return readdirSync(backupDir)
      .filter((f) => f.endsWith('.db') || f.endsWith('.gz.enc'))
      .map((f) => ({ name: f, size: statSync(join(backupDir, f)).size }))
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch {
    return [];
  }
}

if (args.includes('--lista') || !target) {
  const local = localList();
  console.log(`En la mini PC (${backupDir}):`);
  for (const f of local) console.log(`  ${f.name}  ${kb(f.size)}`);
  if (!local.length) console.log('  (ninguno)');
  if (remote) {
    try {
      const items = (await remote.list(REMOTE_PREFIX)).sort((a, b) => b.key.localeCompare(a.key));
      console.log('Fuera del hotel:');
      for (const o of items) console.log(`  ${o.key.slice(REMOTE_PREFIX.length)}  ${kb(o.size)}`);
      if (!items.length) console.log('  (ninguno)');
    } catch (e) {
      console.log('Fuera del hotel: ' + e.message);
    }
  } else console.log('Fuera del hotel: no está configurado.');
  if (!target) console.log('\nPara restaurar: monarca-restaurar <nombre>');
  process.exit(0);
}

if (!args.includes('--confirmar'))
  fail(`Esto reemplaza TODOS los datos actuales por los del respaldo ${target}.\nCorre de nuevo con --confirmar.`);
await ensureStopped('restaurar');

// ¿De dónde sale el respaldo? Ruta, nombre en la carpeta de respaldos o nombre fuera del hotel
let source = [resolve(target), join(backupDir, target)].find((f) => existsSync(f));
mkdirSync(backupDir, { recursive: true });
const tmp = join(backupDir, `.restaurando-${stamp()}.db`);
try {
  if (!source) {
    if (!remote) throw new Error(`no se encontró "${target}" en la mini PC`);
    const name = basename(target).replace(/\.gz\.enc$/, '');
    console.log(`Descargando ${name} de fuera del hotel…`);
    writeFileSync(tmp, unpack(await remote.get(`${REMOTE_PREFIX}${name}.gz.enc`), secret));
    source = tmp;
  } else if (source.endsWith('.gz.enc')) {
    writeFileSync(tmp, unpack(readFileSync(source), secret));
    source = tmp;
  }

  const info = inspect(source);
  if (info.version > VERSION)
    throw new Error(
      `es de una versión más nueva del sistema (formato ${info.version}; este programa usa el ${VERSION}). ` +
        'Actualiza el sistema antes de restaurarlo.',
    );

  if (existsSync(dbFile)) {
    const before = join(backupDir, `antes-de-restaurar-${stamp()}.db`);
    await snapshot(dbFile, before);
    console.log(`La base actual quedó guardada en ${before}`);
  }
  copyFileSync(source, dbFile);
  for (const f of [dbFile + '-wal', dbFile + '-shm']) rmSync(f, { force: true });
  console.log(`Restaurado: ${basename(target)} (cambio número ${info.rev}).`);
  if (info.version < VERSION)
    console.log(`Es de una versión anterior (formato ${info.version}): al arrancar se actualizará al ${VERSION}.`);
  console.log('Las sesiones abiertas en ese respaldo siguen válidas; las demás tablets deberán volver a entrar.');
} catch (e) {
  fail('No se pudo restaurar: ' + e.message);
} finally {
  rmSync(tmp, { force: true });
}
