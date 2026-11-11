// Cobros y concurrencia: dos dispositivos operando al mismo tiempo no deben duplicar ni perder nada
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { act, call, login, restaurantSale, start, state } from './helpers.js';
import { addDays, today } from '../../shared/dates.js';

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
      body: { password: 'gerencia2026' },
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

  test('anular el pago de un evento o de una reserva deja el saldo pendiente otra vez', async () => {
    const st = () => state(app);
    const payment = (extra, amount) => ({
      id: 's_' + randomUUID().slice(0, 8),
      number: st().counters.doc + 1,
      ts: Date.now(),
      cashierId: 'u2',
      lines: [{ name: 'Anticipo', qty: 1, price: amount }],
      total: amount,
      grand: amount,
      tip: 0,
      payments: [{ method: 'efectivo', amount }],
      ...extra,
    });
    // Evento
    const ev = st().events.find((e) => e.status !== 'cancelado');
    const paidBefore = ev.payments.length;
    const evSale = payment({ kind: 'evento', ref: ev.name, eventId: ev.id }, 500);
    assert.equal((await act(app, recep, ['addEventPayment', ev.id, evSale])).status, 200);
    assert.equal(st().events.find((e) => e.id === ev.id).payments.length, paidBefore + 1);
    assert.equal(
      (await act(app, mgr, ['voidSale', evSale.id, { reason: 'monto equivocado', authId: 'u1' }])).status,
      200,
    );
    assert.equal(st().events.find((e) => e.id === ev.id).payments.length, paidBefore);
    assert.equal(st().sales.find((s) => s.id === evSale.id).status, 'anulada');
    // Reserva (anticipo / abono al folio)
    const res = st().reservations.find((r) => r.status === 'hospedado');
    const before = res.payments.length;
    const resSale = payment({ kind: 'hotel', ref: 'Hab. ' + res.roomN, resId: res.id }, 300);
    assert.equal((await act(app, recep, ['addFolioPayment', res.id, resSale])).status, 200);
    assert.equal((await act(app, mgr, ['voidSale', resSale.id, { reason: 'duplicado', authId: 'u1' }])).status, 200);
    assert.equal(st().reservations.find((r) => r.id === res.id).payments.length, before);
  });
  test('no se anula un cobro de un turno cerrado ni uno ya anulado', async () => {
    const st = state(app);
    const old = st.sales.find((s) => s.status === 'ok' && s.shiftId !== st.shift.id);
    const r = await act(app, mgr, ['voidSale', old.id, { reason: 'prueba', authId: 'u1' }]);
    assert.equal(r.status, 409);
    assert.match(r.body.error, /turno abierto/);
    const done = state(app).sales.find((s) => s.status === 'anulada');
    const again = await act(app, mgr, ['voidSale', done.id, { reason: 'otra vez', authId: 'u1' }]);
    assert.equal(again.status, 409);
    assert.match(again.body.error, /ya está anulado/);
  });

  test('deshacer un check-out por error: vuelve a hospedado con sus pagos, sin cobrar de nuevo', async () => {
    const st = () => state(app);
    const d0 = today();
    const res = st().reservations.find((r) => r.status === 'hospedado' && r.checkOut > d0);
    const planned = res.checkOut;
    // Abono del huésped y luego check-out anticipado por error
    const sale = {
      id: 's_' + randomUUID().slice(0, 8),
      number: st().counters.doc + 1,
      kind: 'hotel',
      ts: Date.now(),
      ref: 'Hab. ' + res.roomN,
      resId: res.id,
      cashierId: 'u2',
      lines: [{ name: 'Abono a cuenta', qty: 1, price: 150 }],
      total: 150,
      grand: 150,
      tip: 0,
      payments: [{ method: 'efectivo', amount: 150 }],
    };
    assert.equal((await act(app, recep, ['addFolioPayment', res.id, sale])).status, 200);
    assert.equal(st().sales.find((s) => s.id === sale.id).shiftId, st().shift.id);
    assert.equal((await act(app, recep, ['checkOutWith', res.id, null, { checkOut: d0 }])).status, 200);
    const out = st().reservations.find((r) => r.id === res.id);
    assert.equal(out.status, 'salida');
    assert.equal(out.plannedCheckOut, planned);
    const paid = out.payments.length;

    // Con la estancia cerrada no se anula su cobro (el saldo quedaría sin cobrar)
    const v = await act(app, mgr, ['voidSale', sale.id, { reason: 'prueba', authId: 'u1' }]);
    assert.equal(v.status, 409);
    assert.match(v.body.error, /deshaz el check-out/);

    // Recepción necesita autorización de gerencia
    assert.equal((await act(app, recep, ['undoCheckOut', res.id, {}])).status, 403);
    await call(app, 'POST', '/api/authorize', { token: recep, body: { password: 'gerencia2026' } });
    assert.equal((await act(app, recep, ['undoCheckOut', res.id, { authId: 'u1' }])).status, 200);
    const back = st().reservations.find((r) => r.id === res.id);
    assert.equal(back.status, 'hospedado');
    assert.equal(back.checkOut, planned);
    assert.equal(back.payments.length, paid);
    assert.equal(back.checkedOutAt, undefined);
    const log = st().audit.at(-1);
    assert.equal(log.type, 'checkout');
    assert.equal(log.authId, 'u1');

    // Ya hospedado otra vez, el cobro sí se puede anular
    assert.equal((await act(app, mgr, ['voidSale', sale.id, { reason: 'duplicado', authId: 'u1' }])).status, 200);
  });

  test('no se deshace el check-out si la estancia ya terminó o si otro huésped ocupa la habitación', async () => {
    const st = () => state(app);
    const d0 = today();
    const ended = st().reservations.find((r) => r.status === 'salida' && r.checkOut < d0);
    const r1 = await act(app, mgr, ['undoCheckOut', ended.id, { authId: 'u1' }]);
    assert.equal(r1.status, 409);
    assert.match(r1.body.error, /ya terminó/);

    // Otro huésped ya entró a la habitación
    const res = st().reservations.find((r) => r.status === 'hospedado' && r.checkOut > d0);
    assert.equal((await act(app, mgr, ['checkOutWith', res.id, null, { checkOut: d0 }])).status, 200);
    const next = {
      ...res,
      id: 'r_' + randomUUID().slice(0, 8),
      status: 'hospedado',
      checkIn: d0,
      checkOut: addDays(d0, 1),
      payments: [],
      charges: [],
      guest: { ...res.guest, name: 'Otra Persona' },
    };
    delete next.plannedCheckOut;
    assert.equal((await act(app, mgr, ['saveReservation', next])).status, 200);
    const r2 = await act(app, mgr, ['undoCheckOut', res.id, { authId: 'u1' }]);
    assert.equal(r2.status, 409);
    assert.match(r2.body.error, /Otra Persona/);
  });
});
