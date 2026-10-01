import { expect, fresh, login, nav, state, test, typePin } from './helpers.js';

test('el PIN se bloquea tras 5 intentos fallidos', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Juan' }).click();
  for (let i = 0; i < 4; i++) await typePin(page, '0000');
  await expect(page.locator('.pin-msg')).toContainText('quedan 1 intento');
  await typePin(page, '0000');
  await expect(page.locator('.pin-msg')).toContainText('Demasiados intentos');
  await expect(page.locator('.pin-keys button').first()).toBeDisabled();
  // Ni el PIN correcto entra mientras está bloqueado, y recargar no lo desbloquea
  await typePin(page, '3333');
  await expect(page.locator('.app')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Juan' }).click();
  await expect(page.locator('.pin-msg')).toContainText('Demasiados intentos');
});

test('la sesión se cierra tras 5 minutos sin uso', async ({ page }) => {
  await page.clock.install();
  await fresh(page);
  await login(page, 'Luis Recepción');
  await page.clock.fastForward('04:00');
  await expect(page.locator('.app')).toBeVisible();
  await page.clock.fastForward('01:30');
  await expect(page.getByText('¿Quién eres?')).toBeVisible();
});

test('el mesero solo ve sus cobros y sus propinas', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await nav(page, 'Ventas');
  const s = await state(page);
  const mine = s.sales.filter((x) => x.shiftId === s.shift.id && x.waiterId === 'u3');
  await expect(page.locator('.tx-row.sales:not(.head)')).toHaveCount(mine.length);
  await expect(page.getByText(/Tus propinas/)).toBeVisible();
});

test('las pantallas recuerdan la selección al volver', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '201' }).click();
  await nav(page, 'Inventario');
  await page.getByRole('button', { name: 'Bebidas', exact: true }).click();
  await nav(page, 'Mesas');
  await nav(page, 'Habitaciones');
  await expect(page.locator('.side-panel')).toContainText('Ing. Mariela Gómez');
  await nav(page, 'Inventario');
  await expect(page.getByRole('button', { name: 'Bebidas', exact: true })).toHaveClass(/active/);
  // y también tras bloquear y volver a entrar
  await page.reload();
  await expect(page.locator('.nav-btn.active')).toHaveText('Inventario');
});

test('el modo demo muestra los PIN de prueba', async ({ page }) => {
  await fresh(page);
  await expect(page.getByText(/Demo · PIN/)).toBeVisible();
});
