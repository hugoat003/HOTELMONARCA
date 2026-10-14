// Borrar los datos de prueba antes de abrir: se va lo operativo, se queda lo configurado
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { act, login, start, state } from './helpers.js';

test('limpiar-pruebas conserva catálogos, usuarios y PIN, y borra ventas, reservas y turnos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'monarca-limpiar-'));
  const dbFile = join(dir, 'monarca.db');
  try {
    let app = await start({ dbFile });
    const mgr = await login(app, 'u1');
    // Un cambio de catálogo hecho durante las pruebas debe quedarse
    const m1 = state(app).menu.find((m) => m.id === 'm1');
    await act(app, mgr, ['upsert', 'menu', { ...m1, price: 99 }], ['setConfig', { footer: 'Gracias por venir' }]);
    const before = structuredClone(state(app));
    assert.ok(before.sales.length > 0 && before.reservations.length > 0 && before.shift);
    await app.close();

    const run = (args) =>
      execFileSync('node', ['scripts/limpiar-pruebas.js', ...args], {
        env: { ...process.env, MONARCA_DB: dbFile, PORT: '39999' },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    // Sin --confirmar no hace nada
    assert.throws(() => run([]));
    const out = run(['--confirmar']);
    assert.match(out, /Borrado: \d+ ventas/);
    assert.ok(readdirSync(join(dir, 'respaldos')).some((f) => f.startsWith('antes-de-limpiar-pruebas-')));

    app = await start({ dbFile });
    const s = state(app);
    for (const k of [
      'sales',
      'orders',
      'reservations',
      'guests',
      'events',
      'shiftHistory',
      'audit',
      'invMoves',
      'voids',
    ])
      assert.equal(s[k].length, 0, k);
    assert.equal(s.shift, null);
    assert.deepEqual(s.counters, { doc: 0, comanda: 0, llevar: 0 });
    assert.ok(s.rooms.every((r) => r.hk === 'limpia'));
    // Se quedan catálogos, configuración, usuarios y sus PIN
    assert.equal(s.menu.find((m) => m.id === 'm1').price, 99);
    assert.equal(s.config.footer, 'Gracias por venir');
    assert.equal(s.users.length, before.users.length);
    assert.equal(s.tables.length, before.tables.length);
    assert.ok(await login(app, 'u3', '3333'));
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
