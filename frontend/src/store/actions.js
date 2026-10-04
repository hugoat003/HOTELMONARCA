// Las vistas llaman update((d) => A.algo(d, …)) como siempre. Este A envuelve las acciones de
// shared/actions.js: además de aplicarlas en la pantalla, anota cada llamada (nombre, argumentos y los
// ids que generó) para enviarla al servidor, que la repite con el mismo código.
import { A as actions } from '@shared/actions.js';
import { runCall } from '@shared/sync.js';

export { orderLabel } from '@shared/orders.js';

let calls = null;

// Ejecuta fn anotando en `into` las acciones que llame
export function recording(into, fn) {
  const prev = calls;
  calls = into;
  try {
    return fn();
  } finally {
    calls = prev;
  }
}

export const A = Object.fromEntries(
  Object.keys(actions).map((name) => [
    name,
    (d, ...args) => {
      if (!calls) return actions[name](d, ...args);
      // Los argumentos viajan como JSON: se aplican aquí igual que los recibirá el servidor
      const json = JSON.stringify(args);
      const call = { name, args: JSON.parse(json) };
      const into = calls;
      calls = null; // lo que la acción llame por dentro no se anota aparte
      try {
        const { result, ids } = runCall(d, { name, args: JSON.parse(json) });
        into.push({ ...call, ids });
        return result;
      } finally {
        calls = into;
      }
    },
  ]),
);
