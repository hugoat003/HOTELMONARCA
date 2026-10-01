import { expect, fresh, login, modalClick, nav, state, test, typePin } from './helpers.js';

const openTable = async (page, n) => {
  await page.getByRole('button', { name: new RegExp(`^Mesa ${n} ·`) }).click();
  await modalClick(page, 'Abrir mesa');
};
const inv = async (page, name) => (await state(page)).inventory.find((i) => i.name === name).stock;

test('modificador obligatorio y extras con precio', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await openTable(page, 3);
  await page.locator('.menu-item', { hasText: 'Lomito a la parrilla' }).click();
  await expect(page.getByRole('button', { name: 'Elige término' })).toBeDisabled();
  await page.getByRole('button', { name: 'Término medio' }).click();
  await page.getByRole('button', { name: /Aguacate/ }).click();
  await expect(page.locator('.modal-amount')).toHaveText('Q 175.00');
  await modalClick(page, 'Agregar');
  const line = page.locator('.side-panel .line', { hasText: 'Lomito' });
  await expect(line).toContainText('Término medio · Aguacate (+10)');
  await expect(line).toContainText('Q 175.00');
});

test('cortesía con PIN de gerente', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await nav(page, 'Mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await page.locator('.side-panel .line-body', { hasText: 'Limonada' }).click();
  await page.getByRole('button', { name: 'Cumpleaños' }).click();
  await page.getByRole('button', { name: 'Dar cortesía' }).click();
  await typePin(page, '1111');
  await expect(page.locator('.side-panel .line', { hasText: 'Limonada' })).toContainText('Cortesía');
  const o = (await state(page)).orders.find((x) => x.tableId === 2);
  const l = o.lines.find((x) => x.name === 'Limonada con soda');
  expect([l.price, l.courtesy.price, l.courtesy.reason]).toEqual([0, 25, 'Cumpleaños']);
});

test('unir mesas, pasar platillos a una mesa libre y cambiar mesero', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();

  // Unir la Mesa 5 a la Mesa 2
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('button', { name: 'Unir otra mesa' }).click();
  await page.locator('.modal .room-opt', { hasText: 'Mesa 5' }).click();
  await expect(page.locator('.panel-title')).toHaveText('Mesa 2 + 5');
  let s = await state(page);
  const main = s.orders.find((o) => o.tableId === 2);
  expect(main.joined).toEqual([5]);
  expect(s.orders.some((o) => o.tableId === 5)).toBe(false);

  // Pasar 1 margarita a la Mesa 8 (libre): se abre
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('button', { name: 'Pasar platillos a otra mesa' }).click();
  await page.locator('.modal .line', { hasText: 'Margarita' }).locator('.stepper button').last().click();
  await page.getByRole('button', { name: 'Elegir mesa' }).click();
  await page.getByRole('button', { name: 'Mesa 8 · libre' }).click();
  s = await state(page);
  const m8 = s.orders.find((o) => o.tableId === 8);
  expect(m8.lines.map((l) => [l.name, l.qty])).toEqual([['Margarita', 1]]);
  expect(s.orders.find((o) => o.tableId === 2).lines.find((l) => l.name === 'Margarita').qty).toBe(1);

  // Cambiar mesero
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('button', { name: 'Cambiar mesero' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Ana', exact: true }).click();
  expect((await state(page)).orders.find((o) => o.tableId === 2).waiterId).toBe('u4');

  // En el mapa, la Mesa 5 aparece unida a la 2
  await nav(page, 'Mesas');
  await expect(page.getByRole('button', { name: /^Mesa 5 · Unida a 2/ })).toBeVisible();
});

test('la receta descuenta insumos al enviar a cocina y la anulación "no se preparó" los devuelve', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Mesas');
  const pollo0 = await inv(page, 'Pollo');
  await openTable(page, 3);
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  await modalClick(page, 'Cerrar');
  expect(await inv(page, 'Pollo')).toBeCloseTo(pollo0 - 0.7, 3);

  await page.locator('.side-panel .line', { hasText: 'Pepián' }).locator('.stepper button').first().click();
  await page.getByRole('button', { name: 'No se preparó' }).click();
  await expect(page.getByLabel(/Regresar los insumos/)).toBeChecked();
  await page.getByRole('button', { name: /^Anular Q/ }).click();
  expect(await inv(page, 'Pollo')).toBeCloseTo(pollo0 - 0.35, 3);
  const moves = (await state(page)).invMoves.map((m) => m.type);
  expect(moves).toContain('consumo');
  expect(moves).toContain('devolucion');
});

test('sin insumos el platillo no se puede pedir', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Inventario');
  await page.locator('.tx-row', { hasText: 'Salmón' }).getByRole('button', { name: 'Merma' }).click();
  await page.locator('.modal input').first().fill('4');
  await modalClick(page, 'Registrar');
  await nav(page, 'Mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  const salmon = page.locator('.menu-item', { hasText: 'Salmón' });
  await expect(salmon).toBeDisabled();
  await expect(salmon).toContainText('Sin insumos');
});

test('configuración: receta y modificadores de un platillo', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tx-row', { hasText: 'Pepián de pollo' }).getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('.modal')).toContainText('Costo');
  await page.locator('.modal').getByRole('button', { name: 'Extras', exact: true }).click();
  await modalClick(page, 'Guardar');
  const m = (await state(page)).menu.find((x) => x.name === 'Pepián de pollo');
  expect(m.modGroups).toContain('g2');
  expect(m.recipe.length).toBe(2);
});
