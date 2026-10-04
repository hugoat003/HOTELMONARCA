// Ejecución de acciones compartida por el servidor y los dispositivos.
// Cada operación viaja como { name, args, ids }: el nombre de la acción en A, sus argumentos y los
// identificadores que generó en el dispositivo. Al repetirla (en el servidor o al reaplicar cambios
// pendientes) se reutilizan esos ids para que el resultado sea el mismo en todos lados.
import { A, ActionError } from './actions.js';
import { setUidHook } from './dates.js';

const ID_RE = /^[a-z]{1,6}_[a-z0-9]{4,16}$/;

export function runCall(d, { name, args = [], ids }) {
  const fn = Object.hasOwn(A, name) ? A[name] : null;
  if (typeof fn !== 'function') throw new ActionError(`Operación desconocida: ${name}`);
  const queue = Array.isArray(ids) ? [...ids] : [];
  const used = [];
  setUidHook((prefix, gen) => {
    const next = queue[0];
    const id =
      typeof next === 'string' && next.startsWith(prefix + '_') && ID_RE.test(next) ? queue.shift() : gen(prefix);
    used.push(id);
    return id;
  });
  try {
    return { result: fn(d, ...args), ids: used };
  } finally {
    setUidHook(null);
  }
}

// Colecciones: listas de registros con identificador propio. Se guardan registro por registro;
// todo lo demás (configuración, contadores, turno abierto…) se guarda como un solo valor.
export const COLLECTIONS = {
  users: 'id',
  menu: 'id',
  modifierGroups: 'id',
  tables: 'id',
  mapDecor: 'id',
  roomTypes: 'id',
  rooms: 'n',
  reservations: 'id',
  guests: 'id',
  seasons: 'id',
  venues: 'id',
  eventMenus: 'id',
  events: 'id',
  inventory: 'id',
  invMoves: 'id',
  shopItems: 'id',
  shopMoves: 'id',
  orders: 'id',
  sales: 'id',
  voids: 'id',
  audit: 'id',
  shiftHistory: 'id',
};

export { ActionError };
