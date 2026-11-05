import { expect, fresh, login, modalClick, patchState, pickMethod, nav, state, test } from './helpers.js';

test('el salón no se cobra si el menú cubre a todos los invitados', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Eventos');
  await expect(page.locator('.event-row', { hasText: 'Boda Castillo' })).toContainText('Q 19,850.00');
  await expect(page.locator('.event-row', { hasText: 'Presentación de libro' })).toContainText('Q 2,000.00');
  await page.locator('.event-row', { hasText: 'Boda Castillo' }).click();
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('.modal input[type=number]').nth(1).fill('50');
  await expect(page.locator('.summary-bar')).toContainText('Salón Q 3,500.00');
});

test('conflicto de salón, anticipo y liquidación', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Eventos');
  await page.getByRole('button', { name: '+ Nuevo evento' }).click();
  await page.getByPlaceholder('Ej. Boda López – Pérez').fill('Cumpleaños Pérez');
  await page.getByPlaceholder('Nombre o empresa').fill('Luis Pérez');
  const boda = (await state(page)).events.find((e) => e.id === 'e1');
  await page.locator('.modal input[type=date]').fill(boda.date);
  await expect(page.getByRole('button', { name: /Salón Mariposa ocupado/ })).toBeVisible();
  await page.locator('.modal select').first().selectOption('v2');
  await page.getByRole('button', { name: 'Guardar evento' }).click();

  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await page.locator('.modal input').first().fill('1000');
  await modalClick(page, 'Continuar');
  await pickMethod(page, 0, 'transferencia');
  await expect(page.locator('.pay-row input.amount').first()).toHaveValue('1000');
  await modalClick(page, 'Confirmar pago');
  await expect(page.locator('.print-doc')).toContainText('Recibo No.');
  await modalClick(page, 'Cerrar');

  await page.getByRole('button', { name: 'Confirmar evento' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await page.getByRole('button', { name: /^Saldo completo/ }).click();
  await modalClick(page, 'Continuar');
  await pickMethod(page, 0, 'tarjeta');
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');
  const ev = (await state(page)).events.find((e) => e.name === 'Cumpleaños Pérez');
  expect(ev.status).toBe('confirmado');
  expect(ev.payments).toHaveLength(2);
});

test('evento realizado sin cobrar: avisa al marcarlo y el saldo se cobra después', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  // Un evento de hoy, confirmado y sin ningún pago (como pasó en el hotel)
  const today = (await state(page)).shift.openedAt;
  await patchState(page, (s) => {
    const e = s.events.find((x) => x.id === 'e1');
    const d = new Date(today);
    e.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    e.status = 'confirmado';
    e.payments = [];
  });
  await nav(page, 'Eventos');
  await page.locator('.event-row', { hasText: 'Boda Castillo' }).click();
  await page.getByRole('button', { name: 'Marcar como realizado' }).click();
  await expect(page.locator('.modal')).toContainText('Queda saldo por cobrar');
  await modalClick(page, 'Marcar como realizado');

  // Ya realizado: sigue el botón para cobrar, con el aviso
  await expect(page.locator('.note-box.warn')).toContainText('falta cobrar Q 19,850.00');
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cobrar saldo · Q 19,850.00' }).click();
  await page.getByRole('button', { name: /^Saldo completo/ }).click();
  await modalClick(page, 'Continuar');
  await pickMethod(page, 0, 'tarjeta');
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');
  await expect(page.locator('.note-box.warn')).toHaveCount(0);

  // El cobro entró al turno de caja abierto
  const s = await state(page);
  const ev = s.events.find((x) => x.id === 'e1');
  expect(ev.status).toBe('realizado');
  expect(ev.payments.reduce((a, p) => a + p.amount, 0)).toBe(19850);
  const sale = s.sales.find((x) => x.eventId === 'e1' && x.id === ev.payments[0].saleId);
  expect(sale.shiftId).toBe(s.shift.id);
});
