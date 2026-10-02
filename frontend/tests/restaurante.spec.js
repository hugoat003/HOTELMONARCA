import { expect, fresh, login, modalClick, nav, state, test, typePin } from './helpers.js';

test('mesero abre mesa, agrega platillos con nota, envía a cocina y cobra con pago mixto', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await modalClick(page, 'Abrir mesa');
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.locator('.menu-item', { hasText: 'Cerveza Gallo' }).click();
  await page.getByText('Nuevo · toca para nota').first().click();
  await page.getByRole('button', { name: 'Sin chile' }).click();
  await modalClick(page, 'Guardar nota');
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  await expect(page.locator('.print-doc')).toContainText('Sin chile');
  await modalClick(page, 'Cerrar');

  // Anular un platillo ya enviado pide PIN de gerente
  await page.locator('.line .stepper button').first().click();
  await page.getByRole('button', { name: 'Error de captura' }).click();
  await page.getByRole('button', { name: /^Anular Q/ }).click();
  await expect(page.getByText('Ingresa el PIN de un gerente')).toBeVisible();
  await typePin(page, '1111');
  await expect(page.getByText(/Anulado:/)).toBeVisible();

  // Descuento (con PIN) + tarjeta y efectivo
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('button', { name: 'Aplicar descuento' }).click();
  await typePin(page, '1111');
  await page.getByPlaceholder(/Motivo/).fill('Cliente frecuente');
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await page.locator('.pay-row select').first().selectOption('tarjeta');
  await page.locator('.pay-row input.amount').first().fill('100');
  await page.getByRole('button', { name: '+ Agregar otra forma de pago' }).click();
  await page.locator('.pay-row select').nth(1).selectOption('efectivo');
  await page.locator('.pay-row input.amount').nth(1).fill('500');
  await modalClick(page, 'Confirmar pago');
  await expect(page.getByText('Pago registrado')).toBeVisible();
  await modalClick(page, 'Cerrar');

  const s = await state(page);
  const sale = s.sales.at(-1);
  expect(sale.ref).toBe('Mesa 3');
  expect(sale.discount.amount).toBeGreaterThan(0);
  expect(sale.payments.map((p) => p.method)).toEqual(['tarjeta', 'efectivo']);
  expect(s.orders.some((o) => o.tableId === 3)).toBe(false);
});

test('mapa de mesas: estados, cuentas abiertas y editor', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Mesas');
  // Una zona a la vez: el Salón tiene 6 mesas
  await expect(page.locator('.map-table')).toHaveCount(6);
  await expect(page.locator('.account')).toHaveCount(4);
  // La mesa con pedido sin enviar está en la terraza: su pestaña lo avisa
  await expect(page.locator('.map-table.pulse')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /Terraza/ }).locator('.pulse-dot')).toHaveCount(1);
  await page.getByRole('tab', { name: /Terraza/ }).click();
  await expect(page.locator('.map-table.pulse')).toHaveCount(1);
  await page.getByRole('tab', { name: /Salón/ }).click();
  await page.locator('.account', { hasText: 'Mesa 5' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido' })).toBeVisible();

  await nav(page, 'Mesas');
  await page.getByRole('button', { name: 'Editar mapa' }).click();
  const box = await page.locator('.map-table').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 120, { steps: 8 });
  await page.mouse.up();
  const t1 = (await state(page)).tables.find((t) => t.id === 1);
  expect(t1.x).toBeGreaterThan(80);
  expect(t1.x % 10).toBe(0);

  await page.getByRole('button', { name: '+ Mesa' }).click();
  await page.locator('.map-editor-side').getByRole('button', { name: 'Redonda' }).click();
  await page.locator('.map-editor-side .stepper button').last().click();
  const t11 = (await state(page)).tables.find((t) => t.id === 11);
  expect([t11.shape, t11.seats]).toEqual(['redonda', 5]);
  await page.getByRole('button', { name: 'Listo' }).click();
  expect((await state(page)).tables).toHaveLength(11);
});

test('cambiar un precio en configuración se refleja en el pedido', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tx-row', { hasText: 'Pepián de pollo' }).getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel(/Precio/).fill('99');
  await modalClick(page, 'Guardar');
  await nav(page, 'Mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await expect(page.locator('.menu-item', { hasText: 'Pepián de pollo' })).toContainText('Q 99.00');
});

test('inventario: entrada suma y merma de recepción pide PIN', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Inventario');
  await page.locator('.tx-row', { hasText: 'Servilletas' }).getByRole('button', { name: 'Entrada' }).click();
  await page.locator('.modal input').first().fill('10');
  await modalClick(page, 'Registrar');
  await page.locator('.tx-row', { hasText: 'Copas de vino' }).getByRole('button', { name: 'Merma' }).click();
  await page.locator('.modal input').first().fill('1');
  await modalClick(page, 'Registrar');
  await typePin(page, '1111');
  const inv = (await state(page)).inventory;
  expect(inv.find((i) => i.name === 'Servilletas').stock).toBe(10);
  expect(inv.find((i) => i.name === 'Copas de vino').stock).toBe(45);
});
