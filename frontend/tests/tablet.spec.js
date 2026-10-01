import { expect, fresh, login, test } from './helpers.js';

const SCREENS = [
  'Resumen',
  'Mesas',
  'Pedido',
  'Ventas',
  'Inventario',
  'Habitaciones',
  'Reservas',
  'Huéspedes',
  'Limpieza',
  'Tienda',
  'Eventos',
  'Caja',
  'Reporte / RDP',
  'Configuración',
];

for (const [label, width, height] of [
  ['vertical', 800, 1280],
  ['horizontal', 1280, 800],
]) {
  test(`tablet ${label}: ninguna pantalla se sale de lado`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await fresh(page);
    await login(page, 'Marta Gerente');
    for (const s of SCREENS) {
      if (await page.locator('.menu-toggle').isVisible()) await page.locator('.menu-toggle').click();
      await page.locator('.nav').getByRole('button', { name: s, exact: true }).click();
      await expect(page.locator('.nav-btn.active')).toHaveText(s);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, `ancho de ${s}`).toBeLessThanOrEqual(width);
    }
    await page.close();
  });
}

test('tablet vertical: menú en cajón y cuenta como hoja inferior', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 800, height: 1280 }, hasTouch: true });
  await fresh(page);
  await login(page, 'Juan');
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await page.locator('.menu-toggle').click();
  await expect(page.locator('.sidebar')).toBeInViewport();
  await page.locator('.nav').getByRole('button', { name: 'Mesas', exact: true }).click();
  await expect(page.locator('.sidebar')).not.toBeInViewport();

  await page.locator('.account', { hasText: 'Mesa 7' }).click();
  const bar = page.locator('.sheet-bar');
  await expect(bar).toContainText('Mesa 7');
  await expect(bar).toContainText('sin enviar');
  await expect(page.getByRole('button', { name: 'Cobrar', exact: true })).toBeHidden();
  await page.locator('.menu-item', { hasText: 'Café de Antigua' }).click();
  await bar.click();
  await expect(page.getByRole('button', { name: 'Cobrar', exact: true })).toBeVisible();
  // El café sin enviar se suma a la misma línea (2 → 3)
  await expect(page.locator('.side-panel .line', { hasText: 'Café de Antigua' }).locator('.stepper span')).toHaveText(
    '3',
  );
  await page.close();
});
