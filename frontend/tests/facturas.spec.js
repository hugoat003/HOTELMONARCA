import { expect, fresh, login, modalClick, pickMethod, nav, payAll, state, test } from './helpers.js';

test('cobro sin factura no pide NIT; con "Requiere factura" queda pendiente y la gerencia la marca', async ({
  page,
}) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Mesas');

  // Sin factura: no hay campos de NIT y el comprobante no es "Factura"
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.getByLabel('NIT')).toHaveCount(0);
  await payAll(page, 'tarjeta');
  await expect(page.locator('.print-doc')).toContainText('Comprobante de venta No.');
  await expect(page.locator('.print-doc')).not.toContainText('Tributario');
  await modalClick(page, 'Cerrar');
  expect((await state(page)).sales.at(-1).invoice).toBeNull();

  // Con factura: pide NIT y nombre
  await page.locator('.account', { hasText: 'Mesa 5' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await pickMethod(page, 0, 'tarjeta');
  await page.getByLabel(/Requiere factura/).check();
  await expect(page.getByRole('button', { name: 'Falta el NIT para la factura' })).toBeDisabled();
  await page.getByLabel('NIT').fill('7654321-0');
  await page.getByLabel('Nombre', { exact: true }).fill('Café La Ceiba, S.A.');
  await modalClick(page, 'Confirmar pago');
  await expect(page.locator('.print-doc')).toContainText('Pendiente de emitir');
  await modalClick(page, 'Cerrar');

  await nav(page, 'Ventas');
  await page.getByRole('button', { name: /Facturas pendientes · 2/ }).click();
  const row = page.locator('.tx-row.invoices', { hasText: 'Café La Ceiba' });
  await row.getByRole('button', { name: 'Marcar facturada' }).click();
  await page.getByLabel('Número de la factura emitida').fill('A-20001');
  await modalClick(page, 'Guardar');
  await expect(page.getByRole('button', { name: /Facturas pendientes · 1/ })).toBeVisible();
  const sale = (await state(page)).sales.find((s) => s.invoice?.name === 'Café La Ceiba, S.A.');
  expect(sale.invoice.number).toBe('A-20001');
});

test('reservas y eventos ya no piden NIT; recepción no ve facturas pendientes', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  await page.getByRole('button', { name: '+ Nueva reserva' }).click();
  await expect(page.locator('.modal')).not.toContainText('NIT');
  await page.keyboard.press('Escape');
  await nav(page, 'Ventas');
  await expect(page.getByRole('button', { name: /Facturas pendientes/ })).toHaveCount(0);
});
