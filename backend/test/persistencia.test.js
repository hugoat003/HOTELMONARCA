// Los datos sobreviven a un reinicio del NUC, y todos los dispositivos ven los cambios al instante
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { applyPatches, enablePatches } from 'immer';
import WebSocket from 'ws';
import { act, call, login, restaurantSale, start, state } from './helpers.js';

enablePatches();

const dir = mkdtempSync(join(tmpdir(), 'monarca-'));
after(() => rmSync(dir, { recursive: true, force: true }));

describe('persistencia', () => {
  test('después de reiniciar, el estado es idéntico (incluido el orden de las listas)', async () => {
    const dbFile = join(dir, 'reinicio.db');
    let app = await start({ dbFile });
    const mgr = await login(app, 'u1');
    const juan = await login(app, 'u3');

    // Operaciones variadas: agregan al final, al inicio (cierres de caja), reordenan (habitaciones) y borran
    await act(app, juan, ['openTable', { id: 'o_persis1', tableId: 1, waiterId: 'u3' }]);
    for (const mid of ['m1', 'm4', 'm7'])
      await act(app, juan, ['addItem', 'o_persis1', state(app).menu.find((m) => m.id === mid), []]);
    await act(app, juan, ['sendKitchen', 'o_persis1', { userId: 'u3', label: 'Mesa 1' }]);
    const o = state(app).orders.find((x) => x.id === 'o_persis1');
    await act(app, juan, [
      'registerSale',
      restaurantSale(state(app), o),
      {
        orderId: o.id,
        paidQty: Object.fromEntries(o.lines.map((l) => [l.id, l.qty])),
      },
    ]);
    await act(app, mgr, ['saveRoom', { n: '105', typeId: state(app).rooms[0].typeId, hk: 'limpia' }]);
    await act(app, mgr, [
      'closeShift',
      {
        counted: 0,
        denominations: {},
        userId: 'u1',
        authId: 'u1',
        report: { cash: { expected: 0 } },
      },
    ]);
    await act(app, mgr, ['openShift', { float: 800, userId: 'u1' }]);
    await act(app, mgr, ['removeCategory', 'Especiales']);
    await act(app, mgr, ['remove', 'tables', 10]);
    await act(app, mgr, ['setConfig', { tipPct: 12 }]);

    const before = structuredClone(state(app));
    const rev = app.hotel.engine.rev;
    await app.close();

    app = await start({ dbFile });
    assert.deepEqual(state(app), before);
    assert.equal(app.hotel.engine.rev, rev);
    assert.deepEqual(
      state(app).rooms.map((r) => r.n),
      [...before.rooms.map((r) => r.n)].sort(),
    );
    assert.equal(state(app).shiftHistory[0].id, before.shiftHistory[0].id); // el cierre más reciente primero
    // La sesión sigue abierta tras el reinicio y el PIN sigue sirviendo
    assert.equal((await call(app, 'GET', '/api/state', { token: juan })).status, 200);
    assert.ok(await login(app, 'u2', '2222'));
    // Y se puede seguir operando
    assert.equal((await act(app, juan, ['openTable', { id: 'o_persis2', tableId: 3, waiterId: 'u3' }])).status, 200);
    await app.close();
    app = await start({ dbFile });
    assert.ok(state(app).orders.some((x) => x.id === 'o_persis2'));
    await app.close();
  });

  test('muchas operaciones al azar: lo guardado coincide con lo que hay en memoria', async () => {
    const dbFile = join(dir, 'azar.db');
    let app = await start({ dbFile });
    const mgr = await login(app, 'u1');
    let n = 0;
    const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
    for (let i = 0; i < 150; i++) {
      const st = state(app);
      const free = st.tables.filter((t) => !st.orders.some((o) => o.tableId === t.id));
      const open = st.orders.filter((o) => o.lines.length);
      const pick = Math.random();
      if (pick < 0.25 && free.length)
        await act(app, mgr, ['openTable', { id: `o_rand${n++}`, tableId: rnd(free).id, waiterId: 'u1' }]);
      else if (pick < 0.55 && st.orders.length) await act(app, mgr, ['addItem', rnd(st.orders).id, rnd(st.menu), []]);
      else if (pick < 0.65 && open.length) {
        const o = rnd(open);
        await act(app, mgr, ['changeQty', o.id, rnd(o.lines).id, -1]);
      } else if (pick < 0.75 && open.length) {
        const o = rnd(open);
        await act(app, mgr, [
          'registerSale',
          restaurantSale(st, o),
          {
            orderId: o.id,
            paidQty: Object.fromEntries(o.lines.map((l) => [l.id, l.qty])),
          },
        ]);
      } else if (pick < 0.85) await act(app, mgr, ['setHk', rnd(st.rooms).n, rnd(['limpia', 'sucia', 'limpiando'])]);
      else if (pick < 0.92)
        await act(app, mgr, [
          'invMove',
          {
            itemId: rnd(st.inventory).id,
            type: 'entrada',
            qty: 1,
            note: '',
            userId: 'u1',
          },
        ]);
      else if (st.orders.length) await act(app, mgr, ['closeOrder', rnd(st.orders).id]);
    }
    const before = structuredClone(state(app));
    await app.close();
    app = await start({ dbFile });
    assert.deepEqual(state(app), before);
    await app.close();
  });
});

describe('tiempo real', () => {
  test('lo que hace una tablet lo ve otra al instante, con el mismo resultado', async () => {
    const app = await start();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const port = app.server.address().port;
    const juan = await login(app, 'u3');
    const recep = await login(app, 'u2');

    // La "pantalla de recepción" carga el estado y escucha
    const { body } = await call(app, 'GET', '/api/state', { token: recep });
    let mirror = body.state;
    let rev = body.rev;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${recep}`);
    const messages = [];
    ws.on('message', (m) => {
      const msg = JSON.parse(m);
      messages.push(msg);
      if (msg.type === 'patch') {
        assert.equal(msg.rev, rev + 1, 'no se pierde ningún cambio');
        mirror = applyPatches(mirror, msg.patches);
        rev = msg.rev;
      }
    });
    await new Promise((r) => ws.on('open', r));

    await act(app, juan, ['openTable', { id: 'o_ws00001', tableId: 1, waiterId: 'u3' }]);
    await act(app, juan, ['addItem', 'o_ws00001', state(app).menu[4], []]);
    await act(app, juan, ['sendKitchen', 'o_ws00001', { userId: 'u3', label: 'Mesa 1' }]);
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(messages[0].type, 'hello');
    assert.equal(messages.filter((m) => m.type === 'patch').length, 3);
    assert.deepEqual(mirror, state(app));
    assert.ok(mirror.orders.find((o) => o.id === 'o_ws00001').lines[0].sent);

    // Sin sesión válida no se conecta
    const intruso = new WebSocket(`ws://127.0.0.1:${port}/ws?token=falso`);
    const code = await new Promise((r) => intruso.on('close', (c) => r(c)));
    assert.equal(code, 4401);

    ws.close();
    await app.close();
  });
});
