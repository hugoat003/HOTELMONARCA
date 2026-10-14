// Cada dispositivo recibe solo los datos de su rol: al cargar y en cada cambio en tiempo real
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { applyPatches } from 'immer';
import { viewPatches, viewState } from '../src/visibility.js';
import { act, call, login, restaurantSale, start, state } from './helpers.js';

const ROLES = ['mesero', 'recepcion', 'gerente', 'admin'];

describe('qué datos recibe cada rol', () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.close());
  const view = async (userId) => (await call(app, 'GET', '/api/state', { token: await login(app, userId) })).body.state;

  test('el mesero no recibe huéspedes, eventos, bitácora, cierres ni datos personales', async () => {
    const full = state(app);
    const s = await view('u3');
    for (const k of ['guests', 'events', 'audit', 'shiftHistory', 'invMoves', 'shopMoves']) {
      assert.ok(full[k].length > 0, `la demo trae ${k}`);
      assert.deepEqual(s[k], [], k);
    }
    // Las reservas llegan (para cargar a la habitación) con solo el nombre del huésped
    assert.equal(s.reservations.length, full.reservations.length);
    assert.ok(s.reservations.every((r) => !r.guest || Object.keys(r.guest).join() === 'name'));
    const text = JSON.stringify(s);
    for (const secret of ['DPI', 'Pasaporte', 'ana.torres@mail.com', '@monarca.demo'])
      assert.ok(!text.includes(secret), secret);
    // Facturas: sin NIT ni nombre del cliente
    const inv = full.sales.find((x) => x.invoice?.nit);
    assert.deepEqual(Object.keys(s.sales.find((x) => x.id === inv.id).invoice), ['number']);
    // Lo que sí necesita para trabajar
    assert.equal(s.menu.length, full.menu.length);
    assert.equal(s.orders.length, full.orders.length);
    assert.equal(s.inventory.length, full.inventory.length);
  });

  test('recepción y gerente no reciben la bitácora; la administración general recibe todo', async () => {
    const full = state(app);
    const recep = await view('u2');
    assert.deepEqual(recep.audit, []);
    assert.equal(recep.guests.length, full.guests.length);
    assert.ok(recep.users.every((u) => !u.email));
    const mgr = await view('u1');
    assert.deepEqual(mgr.audit, []);
    assert.equal(mgr.shiftHistory.length, full.shiftHistory.length);
    assert.ok(mgr.users.some((u) => u.email));
    const owner = await view('u0');
    assert.deepEqual(owner, JSON.parse(JSON.stringify(full)));
  });

  test('los cambios en tiempo real dejan cada tablet igual a lo que vería al recargar', async () => {
    const recep = await login(app, 'u2');
    const juan = await login(app, 'u3');
    const owner = await login(app, 'u0');
    const st = () => state(app);
    const o = st().orders.find((x) => x.lines.length);
    const res = st().reservations.find((r) => r.status === 'hospedado');
    const sale = { ...restaurantSale(st(), o), invoice: { nit: '1234567-8', name: 'Cliente SA', email: 'c@x.com' } };
    const steps = [
      // Venta con factura (agrega a ventas, cambia la cuenta y los contadores)
      [juan, ['registerSale', sale, { orderId: o.id, paidQty: Object.fromEntries(o.lines.map((l) => [l.id, l.qty])) }]],
      // La dueña le pone número a la factura (cambio dentro de un registro oculto en parte)
      [owner, ['markInvoiced', sale.id, { number: 'A-99', userId: 'u0' }]],
      // Cambian los datos del huésped (cambio anidado en un campo oculto)
      [recep, ['saveReservation', { ...res, guest: { ...res.guest, phone: '5555 0000', email: 'nuevo@mail.com' } }]],
      // Un cargo a la habitación (agrega dentro de la reserva)
      [recep, ['addCharge', res.id, { desc: 'Lavandería', amt: 50 }]],
      // Cambia el correo de un gerente
      [owner, ['upsert', 'users', { id: 'u1', email: 'marta@hotel.com' }]],
      // Una reserva nueva con huésped nuevo (crea ficha en guests)
      [
        recep,
        [
          'saveReservation',
          {
            ...res,
            id: 'r_nueva01',
            roomN: '301',
            status: 'reservada',
            guest: { name: 'Nueva Persona', phone: '1', doc: 'DPI 1', email: 'n@p.com' },
            charges: [],
            payments: [],
          },
        ],
      ],
    ];
    for (const [token, c] of steps) {
      const prev = st();
      // Lo que cada rol tenía antes, y lo que recibe
      const before = Object.fromEntries(ROLES.map((r) => [r, structuredClone(viewState(prev, r))]));
      const { patches } = captured(app, () => act(app, token, c));
      const r = await patches;
      assert.equal(r.status, 200, `${c[0]}: ${JSON.stringify(r.body)}`);
      const next = st();
      for (const role of ROLES) {
        // Por la red viaja en JSON (un campo vacío y uno ausente son lo mismo)
        const json = (x) => JSON.parse(JSON.stringify(x));
        const got = applyPatches(before[role], json(viewPatches(r.patches, role, prev)));
        assert.deepEqual(json(got), json(viewState(next, role)), `${c[0]} · ${role}`);
      }
    }
    // Y al mesero nunca le llegó nada de eso
    const juanView = viewState(st(), 'mesero');
    assert.ok(!JSON.stringify(juanView).includes('nuevo@mail.com'));
    assert.ok(!JSON.stringify(juanView).includes('1234567-8'));
    assert.equal(juanView.sales.find((x) => x.id === sale.id).invoice.number, 'A-99');
  });
});

// Ejecuta una operación y devuelve, junto con la respuesta, los parches que produjo en el servidor
function captured(app, fn) {
  const engine = app.hotel.engine;
  const orig = engine.apply.bind(engine);
  let patches = [];
  engine.apply = (args) => {
    const r = orig(args);
    patches = r.patches;
    return r;
  };
  return {
    patches: fn().then(
      (r) => {
        engine.apply = orig;
        return { ...r, patches };
      },
      (e) => {
        engine.apply = orig;
        throw e;
      },
    ),
  };
}

describe('tiempo real por WebSocket', () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.close());

  const connect = async (token) => {
    const msgs = [];
    // Se escucha desde antes de conectar: el saludo llega en cuanto abre
    const ws = await app.injectWS(
      '/ws',
      { headers: { authorization: 'Bearer ' + token } },
      { onInit: (w) => w.on('message', (m) => msgs.push(JSON.parse(m))) },
    );
    return { ws, msgs, next: (type) => waitFor(msgs, type) };
  };

  test('el mesero recibe la venta sin los datos de facturación; la dueña, completa', async () => {
    const juan = await login(app, 'u3');
    const owner = await login(app, 'u0');
    const a = await connect(juan);
    const b = await connect(owner);
    await a.next('hello');
    await b.next('hello');
    const o = state(app).orders.find((x) => x.lines.length);
    const sale = { ...restaurantSale(state(app), o), invoice: { nit: '9876543-2', name: 'Empresa', email: 'e@x.com' } };
    const paid = Object.fromEntries(o.lines.map((l) => [l.id, l.qty]));
    assert.equal((await act(app, juan, ['registerSale', sale, { orderId: o.id, paidQty: paid }])).status, 200);
    const pa = await a.next('patch');
    const pb = await b.next('patch');
    assert.ok(!JSON.stringify(pa).includes('9876543-2'));
    assert.ok(JSON.stringify(pb).includes('9876543-2'));
    assert.ok(!pa.patches.some((p) => p.path[0] === 'audit'));
    a.ws.terminate();
    b.ws.terminate();
  });

  test('si le cambian el rol, la tablet recarga sus datos', async () => {
    const owner = await login(app, 'u0');
    const ana = await login(app, 'u4');
    const c = await connect(ana);
    await c.next('hello');
    assert.equal((await act(app, owner, ['upsert', 'users', { id: 'u4', role: 'recepcion' }])).status, 200);
    const msg = await c.next('reload');
    assert.ok(msg.rev > 0);
    // Ahora recibe lo de recepción (huéspedes)
    const s = (await call(app, 'GET', '/api/state', { token: ana })).body.state;
    assert.ok(s.guests.length > 0);
    c.ws.terminate();
  });
});

async function waitFor(msgs, type, ms = 3000) {
  const t0 = Date.now();
  for (;;) {
    const i = msgs.findIndex((m) => m.type === type);
    if (i >= 0) return msgs.splice(i, 1)[0];
    if (Date.now() - t0 > ms) throw new Error(`no llegó un mensaje "${type}"`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
