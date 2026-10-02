import { expect, fresh, login, modalClick, nav, payAll, state, test } from './helpers.js';

test('llegada, cargo extra, check-out con saldo y limpieza', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '103' }).click();
  await page.getByRole('button', { name: 'Registrar llegada' }).click();
  await page.getByRole('button', { name: 'Confirmar check-in' }).click();
  await expect(page.getByText(/Check-in · Carlos Ruiz/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar cargo' }).click();
  await page.getByRole('button', { name: /Lavandería/ }).click();
  await modalClick(page, 'Agregar');
  await expect(page.locator('.side-panel')).toContainText('Lavandería');

  await page.locator('.tile.room', { hasText: '104' }).click();
  await page.getByRole('button', { name: /Check-out/ }).click();
  await payAll(page, 'tarjeta');
  await expect(page.getByText(/de salida/).first()).toBeVisible();
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  expect(s.reservations.find((r) => r.id === 'r2').status).toBe('salida');
  expect(s.rooms.find((r) => r.n === '104').hk).toBe('sucia');
});

test('tarifa mensual: periodos, pendiente a hoy y abono', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '201' }).click();
  await expect(page.getByText(/Mes 1 ·/)).toBeVisible();
  await expect(page.getByText(/Pendiente a hoy/)).toBeVisible();
  await page.getByRole('button', { name: 'Abono', exact: true }).click();
  await page.getByRole('button', { name: /^Saldo completo/ }).click();
  await modalClick(page, 'Continuar');
  await payAll(page, 'efectivo');
  await modalClick(page, 'Cerrar');
  await expect(page.getByText(/Al día: los meses iniciados están pagados/)).toBeVisible();
});

test('nueva reserva desde el calendario', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  await page.locator('.cal-row', { hasText: '102' }).locator('.cal-cell').nth(2).click();
  await page.getByPlaceholder('Nombre completo').fill('Huésped Prueba');
  await page.getByRole('button', { name: 'Guardar reserva' }).click();
  await expect(page.getByText(/Reserva creada · Huésped Prueba/)).toBeVisible();
  expect((await state(page)).reservations.some((r) => r.guest.name === 'Huésped Prueba' && r.roomN === '102')).toBe(
    true,
  );
});
