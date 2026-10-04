import { test as base, expect } from '@playwright/test';

// Cada prueba trabaja en su propio hotel dentro del servidor de pruebas (namespace aislado),
// así pueden correr en paralelo sin pisarse los datos.
// Falla la prueba si la página registra errores de JavaScript o de consola.
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Las respuestas 4xx (PIN incorrecto, sesión vencida, operación rechazada) las maneja la pantalla
    const handled = /Failed to load resource: the server responded with a status of 4\d\d/;
    page.on('console', (m) => m.type() === 'error' && !handled.test(m.text()) && errors.push(m.text()));
    await isolate(page);
    await use(page);
    expect(errors, 'errores en la página').toEqual([]);
  },
});
export { expect };

export const PINS = { 'Marta Gerente': '1111', 'Luis Recepción': '2222', Juan: '3333', Ana: '4444' };

// Le da a la página un hotel nuevo (datos de ejemplo recién cargados) en el servidor de pruebas
export async function isolate(page, { now } = {}) {
  const ns = 't' + Math.random().toString(36).slice(2, 12);
  page.monarcaNs = ns;
  await page.addInitScript((v) => {
    try {
      localStorage.setItem('monarca-ns', JSON.stringify(v));
    } catch {
      /* about:blank no tiene almacenamiento */
    }
  }, ns);
  // now: fecha fija para los datos de ejemplo (pruebas visuales con reloj fijo)
  if (now) await page.request.post('/api/test/reset', { headers: { 'x-monarca-ns': ns }, data: { now: +now } });
  return ns;
}

// Arranca con los datos de ejemplo recién cargados y sin sesión
export async function fresh(page, opts) {
  await isolate(page, opts);
  await page.goto('/');
  await page.evaluate(() => {
    const ns = localStorage.getItem('monarca-ns');
    localStorage.clear();
    localStorage.setItem('monarca-ns', ns);
  });
  await page.reload();
}

export async function typePin(page, pin) {
  for (const k of pin) await page.keyboard.press(k);
  await page.waitForTimeout(200);
  // Espera la respuesta del servidor antes de seguir tecleando
  await expect(page.locator('.pinpad.busy')).toHaveCount(0);
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
// Estado guardado en el servidor (después de que la pantalla envió todo lo pendiente)
export async function state(page) {
  await page.evaluate(() => window.__monarca?.flush());
  const r = await page.request.get('/api/test/state', { headers: { 'x-monarca-ns': page.monarcaNs } });
  return r.json();
}
// Cambia los datos del servidor (para preparar casos que la demo no trae) y recarga la pantalla
export async function patchState(page, fn) {
  const s = await state(page);
  fn(s);
  await page.request.put('/api/test/state', { headers: { 'x-monarca-ns': page.monarcaNs }, data: s });
  await page.reload();
}

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
