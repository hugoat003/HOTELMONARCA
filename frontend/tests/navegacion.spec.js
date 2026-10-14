import { expect, fresh, login, nav, test } from './helpers.js';

const MENUS = {
  Juan: ['Mesas', 'Ventas'],
  'Luis Recepción': [
    'Mesas',
    'Ventas',
    'Inventario',
    'Habitaciones',
    'Reservas',
    'Huéspedes',
    'Limpieza',
    'Tienda',
    'Eventos',
    'Caja',
  ],
  // El gerente opera todo menos la bitácora completa
  'Marta Gerente': [
    'Resumen',
    'Mesas',
    'Ventas',
    'Inventario',
    'Habitaciones',
    'Reservas',
    'Huéspedes',
    'Limpieza',
    'Tienda',
    'Eventos',
    'Caja',
    'Reporte / RDP',
    'Configuración',
  ],
  'Sofía Directora': [
    'Resumen',
    'Mesas',
    'Ventas',
    'Inventario',
    'Habitaciones',
    'Reservas',
    'Huéspedes',
    'Limpieza',
    'Tienda',
    'Eventos',
    'Caja',
    'Reporte / RDP',
    'Bitácora',
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

test('en el teléfono la dueña ve solo el resumen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fresh(page);
  await login(page, 'Sofía Directora');
  await expect(page.getByText('Hola, Sofía')).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByText(/mensualidad pendiente/)).toBeVisible();
  await page.close();
});
