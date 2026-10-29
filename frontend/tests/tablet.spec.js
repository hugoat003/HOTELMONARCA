import { expect, fresh, login, test } from './helpers.js';

const SCREENS = [
  'Resumen',
  'Mesas',
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
  'Bitácora',
  'Configuración',
];

for (const [label, width, height] of [
  ['vertical', 800, 1280],
  ['horizontal', 1280, 800],
]) {
  test(`tablet ${label}: ninguna pantalla se sale de lado`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await fresh(page);
    await login(page, 'Sofía Directora');
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
  await expect(page.locator('.pedido-label')).toHaveText('Mesa 7');
  // Con la hoja cerrada, Enviar y Cobrar están en la barra de abajo
  const bar = page.locator('.sheet-bar');
  await expect(bar.getByRole('button', { name: 'Enviar (2)' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Cobrar', exact: true })).toBeVisible();
  await page.locator('.menu-item', { hasText: 'Café de Antigua' }).click();
  await expect(bar.getByRole('button', { name: 'Enviar (3)' })).toBeVisible();
  await bar.locator('.sheet-toggle').click();
  // El café sin enviar se suma a la misma línea (2 → 3)
  await expect(page.locator('.side-panel .line', { hasText: 'Café de Antigua' }).locator('.stepper span')).toHaveText(
    '3',
  );
  await expect(page.locator('.ticket-totals').getByRole('button', { name: 'Cobrar', exact: true })).toBeVisible();
  await page.close();
});

test('pantalla de recepción 1024×768: menú fijo que cabe entero, sin desplazarse de lado', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await fresh(page);
  await login(page, 'Sofía Directora');
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeHidden();
  const sidebar = page.locator('.sidebar');
  await expect(sidebar.getByRole('button', { name: 'Configuración' })).toBeInViewport();
  await expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeInViewport();
  for (const view of ['Huéspedes', 'Reservas', 'Configuración']) {
    await sidebar.getByRole('button', { name: view }).click();
    const m = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth - innerWidth,
      sidebar: document.querySelector('.sidebar').scrollHeight - document.querySelector('.sidebar').clientHeight,
    }));
    expect(m).toEqual({ overflowX: 0, sidebar: 0 });
  }
});
