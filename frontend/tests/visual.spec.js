import { expect, login, modalClick, nav, test } from './helpers.js';

// Comparación visual de pantallas completas (npm run test:visual).
// La hora queda fija para que fechas y minutos no cambien entre corridas.
// Tras un cambio de diseño intencional: npm run test:visual -- --update-snapshots
const FIXED = new Date('2026-09-30T15:00:00');

test.describe.configure({ mode: 'serial' });

async function start(page, user = 'Marta Gerente') {
  await page.clock.setFixedTime(FIXED);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await login(page, user);
}
const snap = (page, name) => expect.soft(page).toHaveScreenshot(name + '.png', { fullPage: true, maxDiffPixels: 0 });

test('pantallas de gerencia', async ({ page }) => {
  await start(page);
  await snap(page, 'resumen');
  await nav(page, 'Mesas');
  await snap(page, 'mesas');
  await page.locator('.account', { hasText: 'Mesa 5' }).click();
  await snap(page, 'pedido');
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await snap(page, 'cobro');
  await page.keyboard.press('Escape');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '201' }).click();
  await snap(page, 'habitaciones');
  await nav(page, 'Reservas');
  await snap(page, 'reservas');
  await page.getByRole('button', { name: '+ Nueva reserva' }).click();
  await snap(page, 'reserva-form');
  await page.keyboard.press('Escape');
  await nav(page, 'Limpieza');
  await snap(page, 'limpieza');
  await nav(page, 'Tienda');
  await snap(page, 'tienda');
  await page.getByRole('button', { name: 'Existencias', exact: true }).click();
  await snap(page, 'tienda-existencias');
  await nav(page, 'Inventario');
  await snap(page, 'inventario');
  await nav(page, 'Eventos');
  await page.locator('.event-row', { hasText: 'Boda Castillo' }).click();
  await snap(page, 'eventos');
  await nav(page, 'Ventas');
  await snap(page, 'ventas');
  await nav(page, 'Caja');
  await snap(page, 'caja');
  await nav(page, 'Reporte / RDP');
  await snap(page, 'reporte');
  await page.getByRole('button', { name: 'Imprimir' }).click();
  await snap(page, 'reporte-impreso');
  await modalClick(page, 'Cerrar');
  await page.getByRole('button', { name: 'Por fechas', exact: true }).click();
  await page.getByRole('button', { name: 'Últimos 30 días' }).click();
  await snap(page, 'reporte-rango');
  await nav(page, 'Eventos');
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await snap(page, 'eventos-calendario');
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await nav(page, 'Bitácora');
  await page.getByRole('button', { name: 'Últimos 7 días' }).click();
  await snap(page, 'bitacora');
  await nav(page, 'Configuración');
  await snap(page, 'config-menu');
  await page.getByRole('button', { name: 'Mapa de mesas' }).click();
  await snap(page, 'config-mapa');
});

// Mesero en tablet horizontal: menú en cajón y mapa a todo lo ancho
test('mesero en tablet', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await start(page, 'Juan');
  await snap(page, 'tablet-mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await snap(page, 'tablet-pedido');
  await page.close();
});

test('login y teléfono', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.setFixedTime(FIXED);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await snap(page, 'login-telefono');
  await page.getByRole('button', { name: 'Marta Gerente' }).click();
  for (const k of '1111') await page.keyboard.press(k);
  await expect(page.getByText('Hola, Marta')).toBeVisible();
  await snap(page, 'resumen-telefono');
  await page.close();
});
