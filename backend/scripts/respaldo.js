// Respaldo inmediato de la base, mientras el servidor sigue funcionando (la copia es consistente
// aunque en ese momento se esté cobrando). El respaldo nocturno lo hace el servidor solo.
//   node scripts/respaldo.js [archivo-destino] [--subir]
// Sin destino: respaldos/manual-AAAAMMDD-HHMMSS.db. --subir: además, la copia cifrada fuera del hotel.
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack, snapshot, stamp } from '../src/backup.js';
import { REMOTE_PREFIX } from '../src/remote.js';
import { backupDir, dbFile, fail, kb, remote, secret } from './comun.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dest = resolve(args.find((a) => !a.startsWith('--')) || join(backupDir, `manual-${stamp()}.db`));
  try {
    const { rev } = await snapshot(dbFile, dest);
    console.log(dest);
    console.error(`Respaldo listo (cambio número ${rev}).`);
    if (args.includes('--subir')) {
      if (!remote) fail('La copia fuera del hotel no está configurada (MONARCA_S3_…).');
      if (!secret) fail('Falta la clave de respaldo (MONARCA_RESPALDO_CLAVE).');
      const body = pack(readFileSync(dest), secret);
      const key = `${REMOTE_PREFIX}${basename(dest)}.gz.enc`;
      await remote.put(key, body);
      console.error(`Copia fuera del hotel: ${key} (${kb(body.length)}, cifrada).`);
    }
  } catch (e) {
    fail('No se pudo respaldar: ' + e.message);
  }
}
