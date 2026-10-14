// Lo que comparten los comandos de mantenimiento: dónde está la base, sus respaldos y si el servidor corre.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { remoteFromEnv } from '../src/remote.js';

const here = dirname(fileURLToPath(import.meta.url));
export const dbFile = resolve(process.env.MONARCA_DB || join(here, '../data/monarca.db'));
export const backupDir = resolve(process.env.MONARCA_RESPALDOS || join(dirname(dbFile), 'respaldos'));
export const port = Number(process.env.PORT || 3000);
export const secret = process.env.MONARCA_RESPALDO_CLAVE || '';
export const remote = remoteFromEnv(process.env);

export const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

// Comandos que escriben la base directamente: el servidor guarda el estado en memoria y lo
// volvería a escribir encima, así que debe estar detenido.
export async function ensureStopped(what) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (r.ok) fail(`El servidor sigue encendido. Detén el servicio antes de ${what}.`);
  } catch {
    /* no responde: está detenido */
  }
}

export const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
