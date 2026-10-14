import { authorize, expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

// Dos niveles de gerencia: el gerente opera el día a día; la administración general (la dueña)
// controla precios, usuarios de gerencia, reportes históricos, bitácora y datos del negocio.

test('gerencia entra con correo y contraseña; no aparece entre los usuarios con PIN', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('.login-user', { hasText: 'Marta' })).toHaveCount(0);
  await expect(page.locator('.login-user', { hasText: 'Sofía' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerencia · ingresar con correo' }).click();
  await page.getByLabel('Correo').fill('gerencia@monarca.demo');
  await page.getByLabel('Contraseña').fill('equivocada');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.locator('.pin-msg')).toContainText('Correo o contraseña incorrectos');
  await expect(page.getByLabel('Contraseña')).toHaveValue('');
  await page.getByLabel('Contraseña').fill('gerencia2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByText('Hola, Marta')).toBeVisible();
});

test('el gerente no cambia precios, ni ve datos del negocio, respaldo o reportes por fechas', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await expect(page.getByRole('button', { name: 'Negocio', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Datos de demo|Respaldo/ })).toHaveCount(0);
  // Precio bloqueado en un platillo existente, libre en uno nuevo
  await page.locator('.tx-row', { hasText: 'Pepián de pollo' }).getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByLabel(/Precio/)).toBeDisabled();
  await page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: '+ Platillo' }).click();
  await expect(page.getByLabel(/Precio/)).toBeEnabled();
  await page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
  // Sin temporadas y con tarifas bloqueadas
  await page.getByRole('button', { name: 'Habitaciones', exact: true }).last().click();
  await expect(page.getByText('Temporadas')).toHaveCount(0);
  await nav(page, 'Reporte / RDP');
  await expect(page.getByRole('button', { name: 'Por fechas' })).toHaveCount(0);
  await nav(page, 'Resumen');
  await expect(page.getByText('Tendencia')).toHaveCount(0);
});

test('el gerente da de alta personal, pero no gerentes', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.getByRole('button', { name: 'Usuarios' }).click();
  // A la dueña no la puede editar ni desactivar
  const sofia = page.locator('.tx-row.admin-users', { hasText: 'Sofía Directora' });
  await expect(sofia.getByRole('button', { name: 'Editar' })).toHaveCount(0);
  await expect(sofia.locator('.toggle')).toBeDisabled();
  await page.getByRole('button', { name: '+ Usuario' }).click();
  const roles = page.locator('.modal select option');
  await expect(roles).toHaveText(['Mesero', 'Recepción']);
  await page.locator('.modal input').first().fill('Pedro');
  await page.getByLabel('PIN').fill('5678');
  await modalClick(page, 'Guardar');
  await expect(page.locator('.tx-row.admin-users', { hasText: 'Pedro' })).toContainText('PIN');
});

test('la dueña crea un gerente con correo y contraseña, y él entra con ellos', async ({ page }) => {
  await fresh(page);
  await login(page, 'Sofía Directora');
  await nav(page, 'Configuración');
  await page.getByRole('button', { name: 'Usuarios' }).click();
  await page.getByRole('button', { name: '+ Usuario' }).click();
  await page.locator('.modal input').first().fill('Carlos Gerente');
  await page.locator('.modal select').selectOption('gerente');
  await expect(page.getByLabel('PIN')).toHaveCount(0);
  await page.getByLabel('Correo').fill('Carlos@Hotel.com');
  await page.getByLabel(/Contraseña/).fill('corta');
  await expect(page.locator('.modal .btn-primary')).toHaveText('La contraseña debe tener al menos 8 caracteres');
  await page.getByLabel(/Contraseña/).fill('carlos-2026');
  await modalClick(page, 'Guardar');
  await expect(page.locator('.tx-row.admin-users', { hasText: 'Carlos Gerente' })).toContainText('carlos@hotel.com');
  const s = await state(page);
  expect(JSON.stringify(s)).not.toContain('carlos-2026');

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('button', { name: 'Gerencia · ingresar con correo' }).click();
  await page.getByLabel('Correo').fill('carlos@hotel.com');
  await page.getByLabel('Contraseña').fill('carlos-2026');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page.getByText('Hola, Carlos')).toBeVisible();
});

test('la dueña también autoriza con su contraseña en la tablet del mesero', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  await modalClick(page, 'Cerrar');
  await page.locator('.line .stepper button').first().click();
  await page.getByRole('button', { name: 'Error de captura' }).click();
  await page.getByRole('button', { name: /^Anular Q/ }).click();
  await authorize(page, 'direccion2026');
  await expect(page.getByText(/Anulado:/)).toBeVisible();
  const s = await state(page);
  expect(s.audit.at(-1).authId).toBe('u0');
});
