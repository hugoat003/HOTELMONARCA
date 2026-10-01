import { expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

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
  await page.locator('.pay-row select').first().selectOption('transferencia');
  await page.locator('.pay-row input.amount').first().fill('1000');
  await modalClick(page, 'Confirmar pago');
  await expect(page.locator('.print-doc')).toContainText('Recibo No.');
  await modalClick(page, 'Cerrar');

  await page.getByRole('button', { name: 'Confirmar evento' }).click();
  await page.getByRole('button', { name: 'Registrar pago' }).click();
  await page.getByRole('button', { name: 'Usar el saldo completo' }).click();
  await modalClick(page, 'Continuar');
  await page.locator('.pay-row select').first().selectOption('tarjeta');
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');
  const ev = (await state(page)).events.find((e) => e.name === 'Cumpleaños Pérez');
  expect(ev.status).toBe('confirmado');
  expect(ev.payments).toHaveLength(2);
});
