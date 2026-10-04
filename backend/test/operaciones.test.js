// Cobros y concurrencia: dos dispositivos operando al mismo tiempo no deben duplicar ni perder nada
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { act, call, login, restaurantSale, start, state } from './helpers.js';

describe('cobros y concurrencia', () => {
  let app, juan, ana, recep, mgr;
  before(async () => {
    app = await start();
    juan = await login(app, 'u3');
    ana = await login(app, 'u4');
    recep = await login(app, 'u2');
    mgr = await login(app, 'u1');
  });
  after(() => app.close());

  test('dos meseros no pueden abrir la misma mesa', async () => {
    const a = await act(app, juan, ['openTable', { id: 'o_mesa1aa', tableId: 1, waiterId: 'u3' }]);
    const b = await act(app, ana, ['openTable', { id: 'o_mesa1bb', tableId: 1, waiterId: 'u4' }]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 409);
    assert.match(b.body.error, /ya tiene una cuenta abierta/);
    assert.equal(state(app).orders.filter((o) => o.tableId === 1).length, 1);
  });

  test('los ids que generó la tablet se conservan en el servidor', async () => {
    const m = state(app).menu.find((x) => x.id === 'm1');
    const r = await call(app, 'POST', '/api/actions', {
      token: juan,
      body: {
        aid: randomUUID(),
        calls: [{ name: 'addItem', args: ['o_mesa1aa', m, []], ids: ['l_tablet01'] }],
      },
    });
    assert.equal(r.status, 200);
    assert.equal(state(app).orders.find((o) => o.id === 'o_mesa1aa').lines[0].id, 'l_tablet01');
  });

  test('dos cajas cobrando a la vez reciben números de ticket distintos', async () => {
    const st = state(app);
    const o2 = st.orders.find((o) => o.id === 'o2');
    const o4 = st.orders.find((o) => o.id === 'o4');
    const paid = (o) => Object.fromEntries(o.lines.map((l) => [l.id, l.qty]));
    // Las dos tablets calcularon el mismo "siguiente número"
    const s1 = restaurantSale(st, o2);
    const s2 = restaurantSale(st, o4);
    assert.equal(s1.number, s2.number);
    const [a, b] = await Promise.all([
      act(app, juan, ['registerSale', s1, { orderId: 'o2', paidQty: paid(o2) }]),
      act(app, recep, ['registerSale', s2, { orderId: 'o4', paidQty: paid(o4) }]),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const nums = state(app)
      .sales.slice(-2)
      .map((s) => s.number);
    assert.notEqual(nums[0], nums[1]);
    assert.equal(state(app).counters.doc, Math.max(...nums));
    // El cajero de la venta es quien cobró, no lo que dijo la tablet
    assert.equal(state(app).sales.find((s) => s.id === s2.id).cashierId, 'u2');
  });

  test('la misma cuenta no se cobra dos veces desde dos dispositivos', async () => {
    const st = state(app);
    const o1 = st.orders.find((o) => o.id === 'o1');
    const paid = Object.fromEntries(o1.lines.map((l) => [l.id, l.qty]));
    const first = await act(app, juan, ['registerSale', restaurantSale(st, o1), { orderId: 'o1', paidQty: paid }]);
    const second = await act(app, recep, ['registerSale', restaurantSale(st, o1), { orderId: 'o1', paidQty: paid }]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /cambió en otro dispositivo|ya no existe/);
    assert.equal(
      state(app).sales.filter((s) => s.ref === 'Prueba' && s.lines.length === o1.lines.length).length >= 1,
      true,
    );
  });

  test('un reintento (se cortó la red) no duplica el cobro', async () => {
    const st = state(app);
    const o3 = st.orders.find((o) => o.id === 'o3');
    const body = {
      aid: randomUUID(),
      calls: [
        {
          name: 'registerSale',
          args: [
            restaurantSale(st, o3),
            {
              orderId: 'o3',
              paidQty: Object.fromEntries(o3.lines.map((l) => [l.id, l.qty])),
            },
          ],
        },
      ],
    };
    const n = state(app).sales.length;
    const a = await call(app, 'POST', '/api/actions', { token: juan, body });
    const b = await call(app, 'POST', '/api/actions', { token: juan, body });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.body.duplicate, true);
    assert.equal(b.body.rev, a.body.rev);
    assert.equal(state(app).sales.length, n + 1);
  });

  test('cargo a habitación: solo a huéspedes hospedados', async () => {
    await act(app, juan, ['openTakeout', { id: 'o_cargo01', waiterId: 'u3' }]);
    const m = state(app).menu.find((x) => x.id === 'm3');
    await act(app, juan, ['addItem', 'o_cargo01', m, []]);
    const o = state(app).orders.find((x) => x.id === 'o_cargo01');
    const paid = { [o.lines[0].id]: 1 };
    const res = state(app).reservations.find((r) => r.status === 'reservada');
    const bad = await act(app, juan, [
      'registerSale',
      restaurantSale(state(app), o, { method: 'habitacion', resId: res.id }),
      { orderId: o.id, paidQty: paid },
    ]);
    assert.equal(bad.status, 409);
    const ok = await act(app, juan, [
      'registerSale',
      restaurantSale(state(app), o, { method: 'habitacion', resId: 'r2' }),
      { orderId: o.id, paidQty: paid },
    ]);
    assert.equal(ok.status, 200);
    const charge = state(app)
      .reservations.find((r) => r.id === 'r2')
      .charges.at(-1);
    assert.equal(charge.amt, m.price);
    assert.match(charge.desc, /Ticket #/);
  });

  test('el descuento de un mesero necesita PIN de gerente y queda en la bitácora', async () => {
    await act(app, juan, ['openTakeout', { id: 'o_desc001', waiterId: 'u3' }]);
    await act(app, juan, ['addItem', 'o_desc001', state(app).menu.find((x) => x.id === 'm2'), []]);
    const o = state(app).orders.find((x) => x.id === 'o_desc001');
    const discount = {
      label: '10 %',
      reason: 'cliente frecuente',
      amount: 7,
      authBy: 'u1',
    };
    const sale = restaurantSale(state(app), o, { discount });
    const paid = { [o.lines[0].id]: 1 };
    assert.equal((await act(app, juan, ['registerSale', sale, { orderId: o.id, paidQty: paid }])).status, 403);
    await call(app, 'POST', '/api/authorize', {
      token: juan,
      body: { pin: '1111' },
    });
    assert.equal((await act(app, juan, ['registerSale', sale, { orderId: o.id, paidQty: paid }])).status, 200);
    const au = state(app).audit.at(-1);
    assert.equal(au.type, 'descuento');
    assert.equal(au.authId, 'u1');
    assert.equal(au.userId, 'u3');
  });

  test('con la caja cerrada no se cobra nada', async () => {
    const st = state(app);
    const report = { cash: { expected: 0 } };
    assert.equal(
      (await act(app, mgr, ['closeShift', { counted: 0, denominations: {}, userId: 'u1', authId: 'u1', report }]))
        .status,
      200,
    );
    assert.equal(state(app).shift, null);
    await act(app, juan, ['openTakeout', { id: 'o_cerrad1', waiterId: 'u3' }]);
    await act(app, juan, ['addItem', 'o_cerrad1', st.menu[0], []]);
    const o = state(app).orders.find((x) => x.id === 'o_cerrad1');
    const r = await act(app, juan, [
      'registerSale',
      restaurantSale(state(app), o),
      { orderId: o.id, paidQty: { [o.lines[0].id]: 1 } },
    ]);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /caja está cerrada/);
    // Cerrar dos veces tampoco
    assert.equal((await act(app, mgr, ['closeShift', { counted: 0, userId: 'u1', authId: 'u1', report }])).status, 409);
    // Abrir de nuevo y cobrar
    assert.equal((await act(app, recep, ['openShift', { float: 500, userId: 'u2' }])).status, 200);
    assert.equal((await act(app, recep, ['openShift', { float: 500, userId: 'u2' }])).status, 409);
    const ok = await act(app, juan, [
      'registerSale',
      restaurantSale(state(app), o),
      { orderId: o.id, paidQty: { [o.lines[0].id]: 1 } },
    ]);
    assert.equal(ok.status, 200);
  });

  test('una tanda falla completa: si una acción falla, ninguna se aplica', async () => {
    const before = JSON.stringify(state(app));
    const rev = app.hotel.engine.rev;
    const r = await act(app, mgr, ['setHk', '101', 'sucia'], ['setHk', 'no-existe', 'limpia']);
    assert.equal(r.status, 409);
    assert.equal(JSON.stringify(state(app)), before);
    assert.equal(app.hotel.engine.rev, rev);
  });
});
