// Migraciones: llevan los datos guardados con una versión anterior del formato a la actual (VERSION).
// Cada paso pasa de la versión N a la N+1 y recibe una copia que puede modificar.
// Reglas:
//   - Al cambiar la forma del estado se sube VERSION (shared/version.js) y se agrega aquí el paso.
//   - Un paso ya publicado no se vuelve a editar: puede haber hoteles con datos a medio camino.
//   - Los pasos no deben fallar con datos incompletos: si algo falta, se deja como esté.
import { VERSION } from './version.js';

export const MIGRATIONS = {
  // 11 → 12: nivel de administración general arriba del gerente.
  // Si no hay nadie con ese nivel, el primer gerente activo pasa a tenerlo (si no, nadie podría
  // cambiar precios ni usuarios de gerencia). Gerencia entra con correo y contraseña: a quien no
  // tenga se le asignan con `monarca-acceso` (ver deploy/README.md).
  11: (s) => {
    const users = s.users || [];
    if (!users.some((u) => u.role === 'admin' && u.active)) {
      const first = users.find((u) => u.role === 'gerente' && u.active);
      if (first) first.role = 'admin';
    }
    return s;
  },
};

export class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationError';
  }
}

// ¿Qué versión del formato traen estos datos? (los respaldos muy viejos no la traían)
export const versionOf = (state) => Number(state?.version) || 0;

// Devuelve los datos en la versión actual (una copia; el original no se toca).
export function migrate(state, { to = VERSION, steps = MIGRATIONS } = {}) {
  let v = versionOf(state);
  if (v > to)
    throw new MigrationError(
      `Los datos son de una versión más nueva del sistema (formato ${v}) que este programa (formato ${to}).`,
    );
  let s = structuredClone(state);
  while (v < to) {
    const step = steps[v];
    if (!step) throw new MigrationError(`No hay cómo pasar los datos del formato ${v} al ${v + 1}.`);
    s = step(s) || s;
    v += 1;
    s.version = v;
  }
  return s;
}
