// Respaldos de la base: copia consistente mientras el sistema sigue funcionando (API de respaldo de
// SQLite), y empaque comprimido y cifrado para guardarla fuera del hotel.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import Database from 'better-sqlite3';

export const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

// Revisa que un archivo sea una base sana de POS Monarca. Devuelve { rev, version }.
export function inspect(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const ok = db.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw new Error('El archivo está dañado: ' + ok);
    const meta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value;
    if (meta('version') === undefined) throw new Error('El archivo no es una base de POS Monarca');
    return { rev: Number(meta('rev') || 0), version: Number(meta('version')) || 0 };
  } catch (e) {
    if (e.code === 'SQLITE_NOTADB' || /no such table/.test(e.message))
      throw new Error('El archivo no es una base de POS Monarca');
    throw e;
  } finally {
    db.close();
  }
}

// Copia la base a `dest`. source: una conexión abierta (el servidor) o la ruta del archivo.
// La copia queda como un solo archivo (sin -wal/-shm) y se revisa antes de darla por buena.
export async function snapshot(source, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = dest + '.parcial';
  rmSync(tmp, { force: true });
  const db = typeof source === 'string' ? new Database(source, { readonly: true, fileMustExist: true }) : source;
  try {
    await db.backup(tmp);
  } finally {
    if (typeof source === 'string') db.close();
  }
  const copy = new Database(tmp);
  copy.pragma('journal_mode = DELETE');
  copy.close();
  try {
    const info = inspect(tmp);
    renameSync(tmp, dest);
    return info;
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

// ----- Empaque para la nube: gzip + AES-256-GCM con una clave derivada de la frase secreta.
// Formato: "MONARCA1" · sal (16) · iv (12) · etiqueta (16) · datos cifrados
const MAGIC = Buffer.from('MONARCA1');
const deriveKey = (secret, salt) => scryptSync(String(secret), salt, 32);

export function pack(data, secret) {
  if (!secret) throw new Error('Falta la clave de respaldo (MONARCA_RESPALDO_CLAVE)');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  const body = Buffer.concat([cipher.update(gzipSync(data, { level: 9 })), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function unpack(buf, secret) {
  if (!buf.subarray(0, 8).equals(MAGIC)) throw new Error('El archivo no es un respaldo cifrado de POS Monarca');
  if (!secret) throw new Error('Falta la clave de respaldo (MONARCA_RESPALDO_CLAVE)');
  const salt = buf.subarray(8, 24);
  const iv = buf.subarray(24, 36);
  const tag = buf.subarray(36, 52);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return gunzipSync(Buffer.concat([decipher.update(buf.subarray(52)), decipher.final()]));
  } catch {
    throw new Error('No se pudo descifrar: la clave de respaldo no es la correcta o el archivo está dañado');
  }
}
