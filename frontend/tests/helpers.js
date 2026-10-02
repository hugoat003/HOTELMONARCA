import { test as base, expect } from '@playwright/test';

// Falla la prueba si la página registra errores de JavaScript o de consola
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await use(page);
    expect(errors, 'errores en la página').toEqual([]);
  },
});
export { expect };

export const PINS = { 'Marta Gerente': '1111', 'Luis Recepción': '2222', Juan: '3333', Ana: '4444' };

// Arranca con los datos de ejemplo recién cargados
export async function fresh(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function typePin(page, pin) {
  for (const k of pin) await page.keyboard.press(k);
  await page.waitForTimeout(350);
}

export async function login(page, name) {
  const logout = page.getByRole('button', { name: 'Cerrar sesión' });
  if (await logout.count()) {
    // El mesero tiene el menú en cajón: hay que abrirlo para llegar a "Cerrar sesión"
    if (!(await logout.isVisible()) || (await page.locator('.app.compact').count()))
      await page.locator('.menu-toggle').click();
    await logout.click();
    await page.locator('.modal').getByRole('button', { name: 'Cerrar sesión' }).click();
  }
  await page.getByRole('button', { name }).first().click();
  await typePin(page, PINS[name]);
  await expect(page.locator('.app')).toBeVisible();
}

// Abre la pantalla desde el menú lateral (si el menú es un cajón, primero lo abre)
export async function nav(page, label) {
  const toggle = page.locator('.menu-toggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('.nav').getByRole('button', { name: label, exact: true }).click();
}
export const modalClick = (page, label) =>
  page.locator('.modal').getByRole('button', { name: label, exact: true }).last().click();
export const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('monarca-pos-v1')));

// Paga lo que muestre la pantalla de cobro con la forma indicada
const METHOD = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  habitacion: 'Cargo a habitación',
};
// Elige la forma de pago de la fila indicada (botones, ya no lista desplegable)
export const pickMethod = (page, row, method) =>
  page.locator('.pay-row').nth(row).getByRole('radio', { name: METHOD[method], exact: true }).click();

export async function payAll(page, method = 'tarjeta') {
  await pickMethod(page, 0, method);
  if (method === 'efectivo') await page.locator('.pay-row .quick button', { hasText: 'Exacto' }).first().click();
  await modalClick(page, 'Confirmar pago');
}
