// Qué datos recibe cada dispositivo según el rol de quien inició sesión. El servidor tiene todo;
// a cada tablet le manda solo lo que su rol usa, para que los datos personales y de dinero no
// viajen a donde no hacen falta (aunque alguien revise la tablet por dentro).
//
// Dos formas de ocultar:
//   - Colecciones completas: la tablet las recibe vacías y nunca recibe sus cambios.
//   - Campos de cada registro (datos personales): el registro llega sin ellos. Se conserva la
//     posición de cada registro en su lista, porque los cambios en tiempo real (parches de immer)
//     se ubican por posición.
import { applyPatches } from 'immer';

const HIDDEN = {
  // El mesero opera el restaurante: no recibe huéspedes, eventos, bitácora, cierres de caja ni movimientos
  mesero: new Set(['guests', 'events', 'audit', 'shiftHistory', 'invMoves', 'shopMoves']),
  // La bitácora completa es de la administración general
  recepcion: new Set(['audit']),
  gerente: new Set(['audit']),
};

const withoutEmail = ({ email: _e, ...u }) => u;
const REDACT = {
  mesero: {
    users: withoutEmail,
    // Para cargar a la habitación basta el nombre del huésped
    reservations: (r) => (r.guest ? { ...r, guest: { name: r.guest.name } } : r),
    // Los datos de facturación del cliente (NIT, nombre, correo) no hacen falta en el restaurante
    sales: (s) => (s.invoice ? { ...s, invoice: { number: s.invoice.number || '' } } : s),
  },
  recepcion: { users: withoutEmail },
};

const NONE = { hidden: new Set(), redact: {} };
const rulesFor = (role) =>
  HIDDEN[role] || REDACT[role] ? { hidden: HIDDEN[role] || new Set(), redact: REDACT[role] || {} } : NONE;

// Estado completo → lo que ve ese rol
export function viewState(state, role) {
  const { hidden, redact } = rulesFor(role);
  if (!hidden.size && !Object.keys(redact).length) return state;
  const out = { ...state };
  for (const k of hidden) if (k in out) out[k] = [];
  for (const [k, fn] of Object.entries(redact)) if (Array.isArray(out[k])) out[k] = out[k].map(fn);
  return out;
}

// Parches de una operación → los que recibe ese rol. prev: estado completo antes de la operación.
export function viewPatches(patches, role, prev) {
  const { hidden, redact } = rulesFor(role);
  if (!hidden.size && !Object.keys(redact).length) return patches;
  const out = [];
  let cur = prev; // estado completo, avanzando parche por parche (para saber cómo queda cada registro)
  for (const p of patches) {
    const [coll, index] = p.path;
    const fn = redact[coll];
    const needsCur = fn && p.path.length > 2;
    const next = needsCur ? applyPatches(cur, [p]) : null;
    if (hidden.has(coll)) {
      // nada
    } else if (!fn || index === 'length' || (p.op === 'remove' && p.path.length === 2)) out.push(p);
    else if (p.path.length === 1) out.push({ ...p, value: p.value.map(fn) });
    else if (p.path.length === 2) out.push({ ...p, value: fn(p.value) });
    else {
      // Un cambio dentro de un registro: se manda el registro completo ya filtrado
      // (así nunca se cuela un campo oculto, ni algo anidado en él)
      out.push({ op: 'replace', path: [coll, index], value: fn(next[coll][index]) });
    }
    // Para los parches siguientes, el estado debe reflejar este
    cur = next || (fn ? applyPatches(cur, [p]) : cur);
  }
  return out;
}
