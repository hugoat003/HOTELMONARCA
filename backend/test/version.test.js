// El servidor anuncia qué versión de la aplicación sirve (la usan monarca-actualizar y las pantallas)
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { call, login, start } from './helpers.js';

test('health, pantalla de ingreso y tiempo real anuncian la compilación', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'monarca-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>POS</title>');
  writeFileSync(join(dir, 'version.json'), JSON.stringify({ build: 'abc1234-xyz', commit: 'abc1234' }));
  const app = await start({ staticDir: dir });
  try {
    const health = await call(app, 'GET', '/api/health');
    assert.equal(health.body.build, 'abc1234-xyz');
    assert.equal(health.body.commit, 'abc1234');
    assert.equal((await call(app, 'GET', '/api/public')).body.build, 'abc1234-xyz');

    await app.listen({ port: 0, host: '127.0.0.1' });
    const token = await login(app, 'u3');
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws?token=${token}`);
    const hello = await new Promise((r) => ws.on('message', (m) => r(JSON.parse(m))));
    assert.equal(hello.type, 'hello');
    assert.equal(hello.build, 'abc1234-xyz');
    ws.close();
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sin aplicación compilada no anuncia versión (no fuerza recargas)', async () => {
  const app = await start();
  assert.equal((await call(app, 'GET', '/api/health')).body.build, null);
  await app.close();
});
