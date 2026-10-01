import { expect, fresh, login, nav, test } from './helpers.js';

const MENUS = {
  Juan: ['Mesas', 'Pedido', 'Ventas'],
  'Luis Recepción': [
    'Mesas',
    'Pedido',
    'Ventas',
    'Inventario',
    'Habitaciones',
    'Reservas',
    'Limpieza',
    'Tienda',
    'Eventos',
    'Caja',
  ],
  'Marta Gerente': [
    'Resumen',
    'Mesas',
    'Pedido',
    'Ventas',
    'Inventario',
    'Habitaciones',
    'Reservas',
    'Limpieza',
    'Tienda',
    'Eventos',
    'Caja',
    'Reporte / RDP',
    'Configuración',
  ],
};

for (const [user, views] of Object.entries(MENUS)) {
  test(`${user} ve su menú y abre todas sus pantallas`, async ({ page }) => {
    await fresh(page);
    await login(page, user);
    await expect(page.locator('.nav .nav-btn')).toHaveText(views);
    for (const v of views) {
      await nav(page, v);
      await expect(page.locator('.nav-btn.active')).toHaveText(v);
    }
  });
}

test('los datos se conservan al recargar', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await page.reload();
  await expect(page.getByText('Hola, Marta')).toBeVisible();
});

test('en el teléfono la gerente ve solo el resumen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fresh(page);
  await page.getByRole('button', { name: 'Marta Gerente' }).click();
  for (const k of '1111') await page.keyboard.press(k);
  await expect(page.getByText('Hola, Marta')).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByText(/pendiente de su mensualidad/)).toBeVisible();
  await page.close();
});
