import { expect, fresh, login, modalClick, nav, state, test, typePin } from './helpers.js';

const item = async (page, id) => (await state(page)).shopItems.find((x) => x.id === id);

test('venta con cargo a habitación, existencias y anulación', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Tienda');
  await expect(page.locator('.menu-item', { hasText: 'Bloqueador solar' })).toBeDisabled();
  const agua0 = (await item(page, 't1')).stock;
  await page.locator('.menu-item', { hasText: 'Agua pura' }).click();
  await page.locator('.menu-item', { hasText: 'Agua pura' }).click();
  for (let i = 0; i < 6; i++) await page.locator('.menu-item', { hasText: 'Galletas Chiky' }).click();
  await expect(page.locator('.shop-cart .line', { hasText: 'Galletas' }).locator('.stepper span')).toHaveText('4');

  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.locator('.pay-row select').first().selectOption('habitacion');
  await page.locator('.pay-row select').nth(1).selectOption({ label: '201 · Ing. Mariela Gómez' });
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');
  expect((await item(page, 't1')).stock).toBe(agua0 - 2);
  expect((await item(page, 't8')).stock).toBe(0);
  let s = await state(page);
  const sale = s.sales.find((x) => x.kind === 'tienda' && x.ref === 'Tienda · Hab. 201');
  expect(s.reservations.find((r) => r.id === 'r8').charges.some((c) => c.saleId === sale.id)).toBe(true);

  await nav(page, 'Ventas');
  await page.locator('.tx-row.sales', { hasText: 'Hab. 201' }).first().getByRole('button', { name: 'Anular' }).click();
  await page.locator('.modal input').fill('Cobro equivocado');
  await modalClick(page, 'Anular comprobante');
  await typePin(page, '1111');
  s = await state(page);
  expect(s.shopItems.find((x) => x.id === 't1').stock).toBe(agua0);
  expect(s.reservations.find((r) => r.id === 'r8').charges.some((c) => c.saleId === sale.id)).toBe(false);
});
