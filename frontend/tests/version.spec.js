import { expect, fresh, login, test } from './helpers.js';

// Simula que en el servidor se instaló otra versión mientras la pantalla tenía cargada la anterior

test('en la pantalla de ingreso, una versión nueva se carga sola (una sola vez)', async ({ page }) => {
  await fresh(page);
  let loads = 0;
  page.on('load', () => loads++);
  await page.route('**/api/public', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, build: 'version-nueva' } });
  });
  await page.reload();
  // Recarga sola para tomar la versión nueva; si el navegador insiste con la vieja, no se queda en ciclo
  await expect.poll(() => loads).toBe(2);
  await page.waitForTimeout(800);
  expect(loads).toBe(2);
  await expect(page.getByRole('button', { name: 'Juan' })).toBeVisible();
});

test('con sesión abierta avisa y no interrumpe: se actualiza al tocar el botón', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  // El servidor "reinicia" con otra versión: el saludo del tiempo real trae otro número de compilación
  await page.routeWebSocket(/\/ws/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((m) => {
      const msg = JSON.parse(m);
      if (msg.type === 'hello') msg.build = 'version-nueva';
      ws.send(JSON.stringify(msg));
    });
  });
  await page.reload();
  const banner = page.locator('.shift-banner.update');
  await expect(banner).toContainText('Hay una versión nueva del sistema');
  // Sigue trabajando normal mientras tanto
  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  const reloaded = page.waitForEvent('load');
  await banner.getByRole('button', { name: 'Actualizar ahora' }).click();
  await reloaded;
  await expect(page.locator('.app')).toBeVisible();
});
