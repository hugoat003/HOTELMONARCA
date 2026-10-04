// Utilidades para probar el servidor sin navegador: arranca la app y la llama como lo haría una tablet.
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';

export const PINS = { u1: '1111', u2: '2222', u3: '3333', u4: '4444' };

export async function start(opts = {}) {
  const app = await buildApp({ seed: 'demo', ...opts });
  return app;
}

export async function call(app, method, url, { token, body } = {}) {
  const res = await app.inject({
    method,
    url,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    payload: body,
  });
  return { status: res.statusCode, body: res.json() };
}

export async function login(app, userId, pin = PINS[userId]) {
  const r = await call(app, 'POST', '/api/login', { body: { userId, pin } });
  if (r.status !== 200) throw new Error(`login ${userId}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token;
}

// Envía una o varias acciones: act(app, token, ['openTable', {...}], ['addItem', ...])
export function act(app, token, ...calls) {
  return call(app, 'POST', '/api/actions', {
    token,
    body: {
      aid: randomUUID(),
      calls: calls.map(([name, ...args]) => ({ name, args })),
    },
  });
}

export const state = (app) => app.hotel.engine.state;

// Venta de restaurante mínima para cobrar líneas de una cuenta
export function restaurantSale(st, order, { method = 'efectivo', amount, resId, discount } = {}) {
  const total = order.lines.reduce((a, l) => a + l.price * l.qty, 0);
  const grand = amount ?? total;
  return {
    id: 's_' + Math.random().toString(36).slice(2, 9),
    number: st.counters.doc + 1,
    kind: 'restaurante',
    ts: Date.now(),
    ref: 'Prueba',
    cashierId: 'u3',
    lines: order.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      price: l.price,
    })),
    total,
    grand,
    tip: 0,
    payments: [{ method, amount: grand, ...(resId ? { resId } : {}) }],
    ...(discount ? { discount } : {}),
  };
}
