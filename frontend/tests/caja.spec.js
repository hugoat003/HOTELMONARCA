import { expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

test('salida de efectivo, cierre con arqueo y cobro bloqueado con caja cerrada', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Caja');
  await page.getByRole('button', { name: 'Salida de efectivo' }).click();
  await page.locator('.modal input').first().fill('80');
  await page.getByRole('button', { name: 'Compra de insumos' }).click();
  await modalClick(page, 'Registrar');

  await page.getByRole('button', { name: 'Cerrar turno' }).click();
  // Hay cuentas abiertas: avisa antes de cerrar
  await expect(page.locator('.modal')).toContainText(/Quedan 4 cuentas sin cobrar/);
  await modalClick(page, 'Cerrar de todos modos');
  // Cierre ciego: el esperado no se ve hasta confirmar el conteo
  await expect(page.locator('.modal')).not.toContainText('Esperado');
  await page.getByRole('button', { name: /Llenar con el monto esperado/ }).click();
  await modalClick(page, /Confirmar conteo/);
  await expect(page.locator('.modal')).toContainText('La caja cuadra');
  await modalClick(page, 'Cerrar turno');
  await expect(page.locator('.print-doc')).toContainText('Reporte Diario de Producción');
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  expect(s.shift).toBeNull();
  expect(s.shiftHistory[0].difference).toBe(0);
  expect(s.shiftHistory[0].report.shop).toBeTruthy();

  await nav(page, 'Mesas');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.getByText(/La caja está cerrada/)).toBeVisible();
});
