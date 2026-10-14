// Acceso de gerencia para soporte: asigna correo y contraseña a alguien de gerencia (olvidó su
// contraseña, o datos de una versión anterior sin correo), o crea a la administración general.
//   node scripts/acceso.js --lista
//   node scripts/acceso.js --correo dueña@hotel.com --contrasena "nueva clave"            (usuario existente)
//   node scripts/acceso.js --usuario u1 --correo gerente@hotel.com --contrasena "clave"  (por su id)
//   node scripts/acceso.js --nombre "Ana López" --correo ana@hotel.com --contrasena "clave"  (nueva, administración general)
// El servidor debe estar DETENIDO.
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Auth } from '../src/auth.js';
import { openDb } from '../src/db.js';
import { Engine } from '../src/engine.js';
import { isManager, PASSWORD_MIN, ROLE_LABELS } from '../../shared/data.js';
import { dbFile, ensureStopped, fail } from './comun.js';

const arg = (name) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (!existsSync(dbFile)) fail(`No existe la base ${dbFile}`);
const db = openDb(dbFile);
const engine = new Engine(db);
const users = engine.state.users;

if (process.argv.includes('--lista') || process.argv.length <= 2) {
  for (const u of users)
    console.log(
      `${u.id.padEnd(12)} ${(ROLE_LABELS[u.role] || u.role).padEnd(24)} ${u.active ? 'activo  ' : 'inactivo'} ${u.name}${u.email ? ' · ' + u.email : ''}`,
    );
  process.exit(0);
}

const email = String(arg('correo') || '')
  .trim()
  .toLowerCase();
const password = arg('contrasena') || '';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Falta un --correo válido.');
if (password.length < PASSWORD_MIN) fail(`La --contrasena debe tener al menos ${PASSWORD_MIN} caracteres.`);
await ensureStopped('cambiar accesos');

const id = arg('usuario');
const name = arg('nombre');
let user = id ? users.find((u) => u.id === id) : users.find((u) => u.email === email && isManager(u.role));
if (id && !user) fail(`No existe el usuario ${id}. Usa --lista.`);
if (user && !isManager(user.role))
  fail(`${user.name} no es de gerencia: su acceso es con PIN (se cambia en Configuración).`);
if (users.some((u) => u.id !== user?.id && isManager(u.role) && u.email === email))
  fail('Ese correo ya lo usa otra persona de gerencia.');
if (!user && !name) fail('No hay nadie de gerencia con ese correo. Para crear a alguien nuevo, agrega --nombre.');

const next = user
  ? { ...user, email, active: true }
  : { id: 'u_' + randomUUID().slice(0, 8), name, role: 'admin', email, active: true };
engine.apply({ aid: randomUUID(), calls: [{ name: 'upsert', args: ['users', next] }], userId: null });
new Auth(db).setSecret(next.id, password);
db.close();
console.log(
  `${user ? 'Acceso actualizado' : 'Usuario creado'}: ${next.name} (${ROLE_LABELS[next.role]}) · ${email}. Ya puede entrar con su correo y contraseña.`,
);
