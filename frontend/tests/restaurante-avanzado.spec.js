import { expect, fresh, login, modalClick, nav, state, test, authorize } from './helpers.js';

const openTable = async (page, n) => {
  await page.getByRole('button', { name: new RegExp(`^Mesa ${n} ·`) }).click();
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
  await authorize(page);
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

test('configuración: un grupo de modificadores se asigna a varios platillos', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Modificadores' }).click();
  await page
    .locator('.tx-row.mods')
    .filter({ has: page.getByText('Término', { exact: true }) })
    .getByRole('button', { name: 'Editar' })
    .click();
  const modal = page.locator('.modal');
  await modal.getByRole('button', { name: 'Lomito a la parrilla' }).click(); // lo quita
  await modal.getByRole('button', { name: 'Pepián de pollo' }).click();
  await modal.getByRole('button', { name: 'Chilaquiles verdes' }).click();
  await modalClick(page, 'Guardar');
  const s = await state(page);
  const groups = (name) => s.menu.find((m) => m.name === name).modGroups;
  expect(groups('Lomito a la parrilla')).toEqual(['g2']);
  expect(groups('Pepián de pollo')).toContain('g1');
  expect(groups('Chilaquiles verdes')).toEqual(['g2', 'g1']);
});

test('configuración: un insumo se agrega a la receta de varios platillos', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Insumos' }).click();
  const row = page.locator('.tx-row.insumos', { hasText: 'Aguacate' });
  await expect(row).toContainText('Guacamole de la casa');
  await row.getByRole('button', { name: 'Platillos' }).click();
  await page.getByLabel('Cantidad en Guacamole de la casa').fill('3');
  await page.locator('.modal').getByRole('button', { name: 'Desayunos' }).click();
  await page.getByLabel('Cantidad en Chilaquiles verdes').fill('0.5');
  await modalClick(page, 'Guardar · 2 platillos');
  const s = await state(page);
  const recipe = (name) => s.menu.find((m) => m.name === name).recipe;
  expect(recipe('Guacamole de la casa')).toEqual([{ itemId: 'i4', qty: 3 }]);
  expect(recipe('Chilaquiles verdes')).toContainEqual({ itemId: 'i4', qty: 0.5 });
  expect(recipe('Chilaquiles verdes')).toHaveLength(3);
});

test('insumo que se compra en kg y se gasta en g: la receta se escribe en g y se descuenta en kg', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Insumos' }).click();
  await page
    .locator('.tx-row.insumos', { hasText: /^Pollo/ })
    .getByRole('button', { name: 'Editar' })
    .click();
  const modal = page.locator('.modal');
  await modal.getByLabel(/Se gasta en/).selectOption('g');
  await expect(modal).toContainText('1 kg = 1000 g');
  await expect(modal).toContainText('Q 0.03 por g');
  await modalClick(page, 'Guardar');
  let s = await state(page);
  expect(s.inventory.find((i) => i.name === 'Pollo')).toMatchObject({ unit: 'kg', useUnit: 'g', perUnit: 1000 });
  // La receta que estaba en kg (0.35) pasa a g
  expect(s.menu.find((m) => m.name === 'Pepián de pollo').recipe).toContainEqual({ itemId: 'i1', qty: 350 });

  await page
    .locator('.tx-row.insumos', { hasText: /^Pollo/ })
    .getByRole('button', { name: 'Platillos' })
    .click();
  await expect(page.locator('.modal')).toContainText('en g');
  await page.getByLabel('Cantidad en Pepián de pollo').fill('200');
  await modalClick(page, 'Guardar · 2 platillos');

  const pollo0 = await inv(page, 'Pollo');
  await nav(page, 'Mesas');
  await openTable(page, 3);
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  await modalClick(page, 'Cerrar');
  expect(await inv(page, 'Pollo')).toBeCloseTo(pollo0 - 0.2, 6);
});

test('insumo por botella: se pide cuánto trae y se gasta en ml', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Insumos' }).click();
  await page.getByRole('button', { name: '+ Insumo' }).click();
  const modal = page.locator('.modal');
  await modal.getByLabel(/^Nombre/).fill('Ron añejo');
  await modal.getByLabel(/Se compra en/).selectOption('botella');
  await modal.getByLabel(/Se gasta en/).selectOption('ml');
  await modal.getByLabel(/^Mínimo/).fill('2');
  await modal.getByLabel(/^Costo por botella/).fill('150');
  await expect(modal.getByRole('button', { name: 'Falta cuánto trae cada botella' })).toBeDisabled();
  await modal.getByLabel('¿Cuántos ml trae cada botella?').fill('750');
  await expect(modal).toContainText('Q 0.20 por ml');
  await modalClick(page, 'Guardar');
  const s = await state(page);
  expect(s.inventory.find((i) => i.name === 'Ron añejo')).toMatchObject({
    unit: 'botella',
    useUnit: 'ml',
    perUnit: 750,
  });
});
