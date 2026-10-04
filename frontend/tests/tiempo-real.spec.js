import { expect, fresh, login, nav, state, test as base } from './helpers.js';

// Los otros dispositivos se cierran siempre al terminar (aunque la prueba falle)
const test = base.extend({
  devices: async ({ browser, page }, use) => {
    const open = [];
    await use(async (opts = {}) => {
      const d = await otherDevice(browser, page, opts);
      open.push(d);
      return d;
    });
    for (const d of open) await d.context().close();
  },
});

// Otro dispositivo conectado al mismo hotel de prueba que `page`
async function otherDevice(browser, page, opts = {}) {
  const other = await browser.newPage(opts);
  other.monarcaNs = page.monarcaNs;
  await other.addInitScript((v) => {
    try {
      localStorage.setItem('monarca-ns', JSON.stringify(v));
    } catch {
      /* about:blank */
    }
  }, page.monarcaNs);
  await other.goto('/');
  return other;
}

test('lo que hace el mesero en la tablet aparece en recepción sin recargar', async ({ page, devices }) => {
  await fresh(page);
  await login(page, 'Juan');
  const recep = await devices();
  await login(recep, 'Luis Recepción');
  await expect(recep.getByRole('button', { name: /^Mesa 3 · \d+ pers\./ })).toBeVisible();

  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  // Recepción ve la mesa ocupada, con el total y el mesero, al instante
  await expect(recep.getByRole('button', { name: /^Mesa 3 · Q.*· Juan/ })).toBeVisible();
});

test('dos meseros abren la misma mesa: el segundo recibe el aviso y su cambio se deshace', async ({
  page,
  devices,
}) => {
  await fresh(page);
  await login(page, 'Juan');
  const ana = await devices();
  await login(ana, 'Ana');

  // La tablet de Ana pierde el WiFi y abre la Mesa 3 (se guarda como pendiente)
  await ana.context().setOffline(true);
  await ana.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await ana.locator('.menu-item', { hasText: 'Cerveza Gallo' }).click();
  await expect(ana.getByText(/Sin conexión con el servidor/)).toBeVisible();
  await expect(ana.getByText(/cambios? pendientes? de guardar/)).toBeVisible();

  // Mientras tanto Juan abre la misma mesa
  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.evaluate(() => window.__monarca.flush());

  // Vuelve el WiFi: el servidor rechaza la mesa de Ana, ella ve por qué y su pantalla vuelve a Mesas
  await ana.context().setOffline(false);
  await expect(ana.getByText('Mesa 3 ya tiene una cuenta abierta')).toBeVisible({ timeout: 15_000 });
  await expect(ana.getByRole('button', { name: /^Mesa 3 · Q.*· Juan/ })).toBeVisible();
  const s = await state(page);
  const mesa3 = s.orders.filter((o) => o.tableId === 3);
  expect(mesa3).toHaveLength(1);
  expect(mesa3[0].waiterId).toBe('u3');
});

test('sin WiFi la tablet sigue tomando el pedido y lo guarda al reconectar', async ({ page, devices }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Mesas');
  const ana = await devices({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await login(ana, 'Ana');
  await ana.context().setOffline(true);
  await ana.getByRole('button', { name: /^Mesa 1 ·/ }).click();
  await ana.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await ana.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await expect(ana.getByText(/cambios pendientes de guardar/)).toBeVisible();
  // El servidor todavía no sabe nada
  expect((await state(page)).orders.some((o) => o.tableId === 1)).toBe(false);

  await ana.context().setOffline(false);
  await expect(ana.getByText(/Sin conexión/)).toHaveCount(0, { timeout: 15_000 });
  await ana.evaluate(() => window.__monarca.flush());
  const o = (await state(page)).orders.find((x) => x.tableId === 1);
  expect(o.waiterId).toBe('u4');
  expect(o.lines[0].qty).toBe(2);
  // La gerente lo ve en su mapa sin recargar
  await expect(page.getByRole('button', { name: /^Mesa 1 · Q.*· Ana/ })).toBeVisible();
});
