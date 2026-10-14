// PIN y contraseñas, sesiones, permisos por rol y autorizaciones de gerencia
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { act, call, login, start, state } from './helpers.js';

describe('PIN y sesiones', () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.close());

  test('el estado y la base nunca llevan el PIN ni la contraseña; solo un hash', async () => {
    const t = await login(app, 'u1');
    const { body } = await call(app, 'GET', '/api/state', { token: t });
    assert.ok(body.state.users.every((u) => !('pin' in u) && !('password' in u)));
    assert.ok(!JSON.stringify(body).includes('"2222"'));
    assert.ok(!JSON.stringify(body).includes('gerencia2026'));
    const rows = app.hotel.db.prepare('SELECT pin_hash FROM credentials').all();
    assert.equal(rows.length, 5);
    assert.ok(rows.every((r) => r.pin_hash.startsWith('scrypt$') && !r.pin_hash.includes('gerencia2026')));
    const pub = await call(app, 'GET', '/api/public');
    assert.ok(pub.body.users.every((u) => !('pin' in u)));
  });

  test('gerencia entra con correo y contraseña, no con PIN, y no aparece en la pantalla de ingreso', async () => {
    const pub = await call(app, 'GET', '/api/public');
    assert.deepEqual(
      pub.body.users.map((u) => u.id),
      ['u2', 'u3', 'u4'],
    );
    assert.ok(!JSON.stringify(pub.body).includes('@'));
    const byPin = await call(app, 'POST', '/api/login', { body: { userId: 'u1', pin: '1111' } });
    assert.equal(byPin.status, 400);
    // El correo no distingue mayúsculas ni espacios
    const ok = await call(app, 'POST', '/api/login', {
      body: { email: ' Gerencia@Monarca.demo ', password: 'gerencia2026' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.id, 'u1');
    const bad = await call(app, 'POST', '/api/login', {
      body: { email: 'gerencia@monarca.demo', password: 'gerencia2025' },
    });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, 'Correo o contraseña incorrectos');
    // Un correo que no existe responde igual (no revela quién tiene cuenta)
    const nobody = await call(app, 'POST', '/api/login', { body: { email: 'nadie@x.com', password: 'x' } });
    assert.equal(nobody.status, 401);
    assert.equal(nobody.body.error, 'Correo o contraseña incorrectos');
    // El personal no entra por correo
    const staff = await call(app, 'POST', '/api/login', { body: { email: 'u2', password: '2222' } });
    assert.equal(staff.status, 401);
  });

  test('contraseña incorrecta: bloquea el correo al quinto intento', async () => {
    const body = { email: 'direccion@monarca.demo', password: 'mal' };
    for (let i = 4; i >= 1; i--) {
      const r = await call(app, 'POST', '/api/login', { body });
      assert.equal(r.status, 401);
      assert.equal(r.body.left, i);
    }
    assert.equal((await call(app, 'POST', '/api/login', { body })).status, 429);
    const ok = await call(app, 'POST', '/api/login', { body: { ...body, password: 'direccion2026' } });
    assert.equal(ok.status, 429);
  });

  test('PIN incorrecto: avisa los intentos que quedan y bloquea al quinto', async () => {
    for (let i = 4; i >= 1; i--) {
      const r = await call(app, 'POST', '/api/login', {
        body: { userId: 'u4', pin: '0000' },
      });
      assert.equal(r.status, 401);
      assert.equal(r.body.left, i);
    }
    const locked = await call(app, 'POST', '/api/login', {
      body: { userId: 'u4', pin: '0000' },
    });
    assert.equal(locked.status, 429);
    assert.ok(locked.body.lockedMs > 60_000);
    // Ni el PIN correcto entra mientras está bloqueado
    const ok = await call(app, 'POST', '/api/login', {
      body: { userId: 'u4', pin: '4444' },
    });
    assert.equal(ok.status, 429);
    // La pantalla de ingreso sabe que está bloqueado
    const pub = await call(app, 'GET', '/api/public');
    assert.ok(pub.body.users.find((u) => u.id === 'u4').lockedMs > 0);
  });

  test('sin sesión o con sesión inválida no se leen ni cambian datos', async () => {
    assert.equal((await call(app, 'GET', '/api/state')).status, 401);
    assert.equal((await call(app, 'GET', '/api/state', { token: 'inventado' })).status, 401);
    const r = await act(app, 'inventado', ['setHk', '101', 'limpia']);
    assert.equal(r.status, 401);
  });

  test('cerrar sesión invalida el token', async () => {
    const t = await login(app, 'u2');
    await call(app, 'POST', '/api/logout', { token: t, body: {} });
    assert.equal((await call(app, 'GET', '/api/state', { token: t })).status, 401);
  });

  test('un usuario desactivado pierde la sesión al instante', async () => {
    const mgr = await login(app, 'u1');
    const juan = await login(app, 'u3');
    const u3 = state(app).users.find((u) => u.id === 'u3');
    assert.equal((await act(app, mgr, ['upsert', 'users', { ...u3, active: false }])).status, 200);
    assert.equal((await call(app, 'GET', '/api/state', { token: juan })).status, 401);
    assert.equal(
      (
        await call(app, 'POST', '/api/login', {
          body: { userId: 'u3', pin: '3333' },
        })
      ).status,
      400,
    );
    await act(app, mgr, ['upsert', 'users', { ...u3, active: true }]);
  });
});

describe('permisos por rol', () => {
  let app, mesero, recep, mgr;
  before(async () => {
    app = await start();
    mesero = await login(app, 'u3');
    recep = await login(app, 'u2');
    mgr = await login(app, 'u1');
  });
  after(() => app.close());

  const denied = async (token, ...c) => {
    const r = await act(app, token, ...c);
    assert.equal(r.status, 403, `${c[0][0]} debió rechazarse: ${JSON.stringify(r.body)}`);
  };

  test('el mesero no cierra caja, no cambia precios ni hace check-in', async () => {
    const before = JSON.stringify(state(app));
    await denied(mesero, ['closeShift', { counted: 0, report: { cash: { expected: 0 } } }]);
    await denied(mesero, ['upsert', 'menu', { id: 'm1', price: 1 }]);
    await denied(mesero, ['checkIn', 'r5']);
    await denied(mesero, ['setConfig', { tipPct: 50 }]);
    await denied(mesero, ['openShift', { float: 0 }]);
    // Ni siquiera dentro de una tanda con algo permitido
    await denied(
      mesero,
      ['setNote', 'o1', state(app).orders[0].lines[0].id, 'x'],
      ['upsert', 'menu', { id: 'm1', price: 1 }],
    );
    assert.equal(JSON.stringify(state(app)), before);
  });

  test('recepción no edita menú, usuarios ni configuración', async () => {
    await denied(recep, ['upsert', 'menu', { id: 'm1', price: 1 }]);
    await denied(recep, ['upsert', 'users', { id: 'u2', role: 'gerente' }]);
    await denied(recep, ['remove', 'rooms', '101']);
    await denied(recep, ['setConfig', { tipPct: 50 }]);
    await denied(recep, ['markInvoiced', 'x', { number: '1' }]);
  });

  test('nadie puede llamar acciones internas o catálogos inventados', async () => {
    await denied(mgr, ['login', 'u1']);
    await denied(mgr, ['upsert', 'sales', { id: 'x' }]);
    const r = await act(app, mgr, ['noExiste']);
    assert.equal(r.status, 409);
  });

  test('recepción registra entradas sin PIN; la merma pide autorización de gerente', async () => {
    const ok = await act(app, recep, ['invMove', { itemId: 'i1', type: 'entrada', qty: 2, note: '', userId: 'u2' }]);
    assert.equal(ok.status, 200);
    await denied(recep, ['invMove', { itemId: 'i1', type: 'merma', qty: 1, note: '', userId: 'u2' }]);
  });

  test('la autorización de gerente vale para una sola operación', async () => {
    const bad = await call(app, 'POST', '/api/authorize', {
      token: recep,
      body: { password: '2222' },
    });
    assert.equal(bad.status, 401); // el PIN de recepción no autoriza
    assert.equal(
      (await call(app, 'POST', '/api/authorize', { token: recep, body: { pin: '1111' } })).status,
      401, // ni el PIN viejo de la gerente
    );
    const r = await call(app, 'POST', '/api/authorize', {
      token: recep,
      body: { password: 'gerencia2026' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'u1');
    const stock = state(app).inventory.find((i) => i.id === 'i1').stock;
    const merma = [
      'invMove',
      {
        itemId: 'i1',
        type: 'merma',
        qty: 1,
        note: 'se cayó',
        userId: 'u2',
        authId: 'u1',
      },
    ];
    assert.equal((await act(app, recep, merma)).status, 200);
    assert.equal(state(app).inventory.find((i) => i.id === 'i1').stock, stock - 1);
    const au = state(app).audit.at(-1);
    assert.equal(au.type, 'inventario');
    assert.equal(au.userId, 'u2');
    assert.equal(au.authId, 'u1');
    // La segunda vez ya no hay autorización
    await denied(recep, merma);
  });

  test('dos autorizaciones seguidas: cada operación usa la suya', async () => {
    // El gerente autoriza una merma y en seguida otra, antes de que llegue la primera
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await call(app, 'POST', '/api/authorize', { token: recep, body: { password: 'gerencia2026' } })).status,
        200,
      );
    const merma = ['invMove', { itemId: 'i3', type: 'merma', qty: 1, note: '', userId: 'u2', authId: 'u1' }];
    assert.equal((await act(app, recep, merma)).status, 200);
    assert.equal((await act(app, recep, merma)).status, 200);
    assert.equal((await act(app, recep, merma)).status, 403);
  });

  test('una operación que no pide autorización no gasta la del gerente', async () => {
    assert.equal(
      (await call(app, 'POST', '/api/authorize', { token: recep, body: { password: 'gerencia2026' } })).status,
      200,
    );
    // Llega primero otro cambio cualquiera de la misma tablet…
    assert.equal((await act(app, recep, ['setHk', '101', 'limpia'])).status, 200);
    // …y la merma autorizada sigue pasando
    const merma = ['invMove', { itemId: 'i3', type: 'merma', qty: 1, note: '', userId: 'u2', authId: 'u1' }];
    assert.equal((await act(app, recep, merma)).status, 200);
  });

  test('no se puede inventar quién autorizó', async () => {
    // Sin PIN de gerente, decir authId: 'u1' no sirve
    await denied(recep, [
      'invMove',
      {
        itemId: 'i1',
        type: 'merma',
        qty: 1,
        note: '',
        userId: 'u2',
        authId: 'u1',
      },
    ]);
    // Ni anular un platillo ya enviado poniendo un autorizador
    const o = state(app).orders.find((x) => x.id === 'o1');
    await denied(mesero, [
      'voidLine',
      {
        orderId: 'o1',
        lineId: o.lines[0].id,
        qty: 1,
        reason: 'x',
        userId: 'u3',
        authId: 'u1',
        label: 'Mesa 2',
      },
    ]);
  });

  test('quién hizo la operación lo dice la sesión, no el dispositivo', async () => {
    const r = await act(app, mesero, ['openTakeout', { id: 'o_llevar01', waiterId: 'u3' }]);
    assert.equal(r.status, 200);
    // Juan dice ser la gerente al registrar una entrada… recepción no, mesero no puede; probamos con recepción
    await act(app, recep, ['invMove', { itemId: 'i2', type: 'entrada', qty: 1, note: '', userId: 'u1' }]);
    assert.equal(state(app).invMoves.at(-1).userId, 'u2');
  });

  test('un usuario nuevo necesita PIN propio, y no puede repetir el de otra persona', async () => {
    const nuevo = {
      id: 'u_nuevo1',
      name: 'Pedro',
      role: 'mesero',
      active: true,
    };
    assert.equal((await act(app, mgr, ['upsert', 'users', nuevo])).status, 409); // sin PIN
    const dup = await act(app, mgr, ['upsert', 'users', { ...nuevo, pin: '3333' }]);
    assert.equal(dup.status, 409);
    assert.match(dup.body.error, /ya lo usa/);
    assert.equal((await act(app, mgr, ['upsert', 'users', { ...nuevo, pin: '12' }])).status, 409);
    assert.equal((await act(app, mgr, ['upsert', 'users', { ...nuevo, pin: '5555' }])).status, 200);
    assert.ok(!('pin' in state(app).users.find((u) => u.id === 'u_nuevo1')));
    assert.ok(await login(app, 'u_nuevo1', '5555'));
    // Editar sin PIN conserva el actual
    await act(app, mgr, ['upsert', 'users', { ...nuevo, name: 'Pedro M.' }]);
    assert.ok(await login(app, 'u_nuevo1', '5555'));
    // Al eliminarlo se borran sus credenciales
    await act(app, mgr, ['remove', 'users', 'u_nuevo1']);
    assert.equal(app.hotel.db.prepare("SELECT * FROM credentials WHERE user_id = 'u_nuevo1'").get(), undefined);
  });

  test('siempre queda al menos una persona de administración general activa', async () => {
    const owner = await login(app, 'u0');
    const u0 = state(app).users.find((u) => u.id === 'u0');
    const r = await act(app, owner, ['upsert', 'users', { ...u0, role: 'gerente' }]);
    assert.equal(r.status, 409);
    assert.equal(state(app).users.find((u) => u.id === 'u0').role, 'admin');
  });
});

describe('administración general (dueña) y gerente', () => {
  let app, owner, mgr, recep;
  before(async () => {
    app = await start();
    owner = await login(app, 'u0');
    mgr = await login(app, 'u1');
    recep = await login(app, 'u2');
  });
  after(() => app.close());

  const status = async (token, ...c) => (await act(app, token, ...c)).status;
  const menu = (id) => state(app).menu.find((m) => m.id === id);

  test('el gerente no cambia precios de venta; la dueña sí y queda en la bitácora', async () => {
    const m1 = menu('m1');
    assert.equal(await status(mgr, ['upsert', 'menu', { ...m1, price: m1.price + 5 }]), 403);
    assert.equal(menu('m1').price, m1.price);
    // Sí cambia lo que no es precio, y crea platillos nuevos con su precio
    assert.equal(await status(mgr, ['upsert', 'menu', { ...m1, name: m1.name + ' ' }]), 200);
    assert.equal(await status(mgr, ['upsert', 'menu', { ...m1, id: 'm_nuevo', name: 'Nuevo', price: 50 }]), 200);
    // Tarifas, salones, extras y temporadas
    const rt = state(app).roomTypes[0];
    assert.equal(await status(mgr, ['upsert', 'roomTypes', { ...rt, rate: rt.rate + 1 }]), 403);
    const g = state(app).modifierGroups.find((x) => x.id === 'g2');
    const options = g.options.map((o, i) => (i ? o : { ...o, price: o.price + 1 }));
    assert.equal(await status(mgr, ['upsert', 'modifierGroups', { ...g, options }]), 403);
    assert.equal(await status(mgr, ['upsert', 'seasons', { ...state(app).seasons[0], name: 'x' }]), 403);
    assert.equal(await status(owner, ['upsert', 'menu', { ...m1, price: m1.price + 5 }]), 200);
    assert.equal(menu('m1').price, m1.price + 5);
    assert.equal(state(app).audit.at(-1).type, 'precio');
    assert.equal(state(app).audit.at(-1).userId, 'u0');
  });

  test('recepción no cambia el precio de la tienda ni con autorización del gerente', async () => {
    const it = state(app).shopItems[0];
    await call(app, 'POST', '/api/authorize', { token: recep, body: { password: 'gerencia2026' } });
    const r = await act(app, recep, ['upsert', 'shopItems', { ...it, price: it.price + 1 }, 'id', { authId: 'u1' }]);
    assert.equal(r.status, 403);
    assert.match(r.body.error, /administración general/);
  });

  test('el gerente solo toca la configuración operativa', async () => {
    assert.equal(await status(mgr, ['setConfig', { tipPct: 15 }]), 403);
    assert.equal(await status(mgr, ['setConfig', { businessName: 'Otro' }]), 403);
    assert.equal(await status(mgr, ['setConfig', { printers: state(app).config.printers || {} }]), 200);
    assert.equal(await status(owner, ['setConfig', { tipPct: 12 }]), 200);
  });

  test('el gerente administra al personal, pero no a gerencia', async () => {
    const pedro = { id: 'u_pedro', name: 'Pedro', role: 'mesero', active: true, pin: '5678' };
    assert.equal(await status(mgr, ['upsert', 'users', pedro]), 200);
    assert.equal(await status(mgr, ['upsert', 'users', { id: 'u_pedro', pin: '5679' }]), 200);
    // No asciende a nadie ni se sube de nivel
    assert.equal(
      await status(mgr, [
        'upsert',
        'users',
        { id: 'u_pedro', role: 'gerente', email: 'p@x.com', password: '12345678' },
      ]),
      403,
    );
    assert.equal(await status(mgr, ['upsert', 'users', { id: 'u1', role: 'admin' }]), 403);
    assert.equal(await status(mgr, ['upsert', 'users', { id: 'u0', active: false }]), 403);
    assert.equal(await status(mgr, ['remove', 'users', 'u0']), 403);
    // Su propia contraseña sí la cambia
    assert.equal(await status(mgr, ['upsert', 'users', { id: 'u1', password: 'nueva-clave-1' }]), 200);
    assert.equal(
      (await call(app, 'POST', '/api/login', { body: { email: 'gerencia@monarca.demo', password: 'nueva-clave-1' } }))
        .status,
      200,
    );
    assert.equal(await status(mgr, ['remove', 'users', 'u_pedro']), 200);
  });

  test('gerencia necesita correo válido, único, y contraseña de 8 o más', async () => {
    const nuevo = { id: 'u_ger2', name: 'Otro gerente', role: 'gerente', active: true };
    assert.equal(await status(owner, ['upsert', 'users', { ...nuevo, password: '12345678' }]), 409); // sin correo
    assert.equal(
      await status(owner, ['upsert', 'users', { ...nuevo, email: 'GERENCIA@monarca.demo', password: '12345678' }]),
      409,
    );
    assert.equal(await status(owner, ['upsert', 'users', { ...nuevo, email: 'g2@hotel.com', password: 'corta' }]), 409);
    assert.equal(await status(owner, ['upsert', 'users', { ...nuevo, email: 'g2@hotel.com' }]), 409); // sin contraseña
    assert.equal(
      await status(owner, ['upsert', 'users', { ...nuevo, email: ' G2@Hotel.com', password: 'segura123' }]),
      200,
    );
    assert.equal(state(app).users.find((u) => u.id === 'u_ger2').email, 'g2@hotel.com');
    // Pasar a mesero pide PIN
    assert.equal(await status(owner, ['upsert', 'users', { id: 'u_ger2', role: 'mesero' }]), 409);
    assert.equal(await status(owner, ['upsert', 'users', { id: 'u_ger2', role: 'mesero', pin: '8642' }]), 200);
    assert.ok(await login(app, 'u_ger2', '8642'));
  });

  test('la contraseña de la dueña también autoriza', async () => {
    const r = await call(app, 'POST', '/api/authorize', { token: recep, body: { password: 'direccion2026' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.id, 'u0');
  });

  test('restaurar un respaldo es solo de la dueña', async () => {
    const backup = structuredClone(state(app));
    assert.equal((await call(app, 'POST', '/api/admin/restore', { token: mgr, body: { state: backup } })).status, 403);
    assert.equal(
      (await call(app, 'POST', '/api/admin/restore', { token: owner, body: { state: backup } })).status,
      200,
    );
  });
});
