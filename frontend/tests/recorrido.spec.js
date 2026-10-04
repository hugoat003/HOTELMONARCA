import { nightRate } from '../src/lib/hotel.js';
import { expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

// Cambia los datos guardados y recarga (para preparar casos que la demo no trae)
async function patch(page, fn) {
  await page.evaluate((src) => {
    const s = JSON.parse(localStorage.getItem('monarca-pos-v1'));
    new Function('s', src)(s);
    localStorage.setItem('monarca-pos-v1', JSON.stringify(s));
  }, `(${fn})(s)`);
  await page.reload();
}

test('una mesa abierta por error (sin productos) se libera al regresar', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 1 ·/ }).click();
  await page.getByRole('button', { name: '← Mesas' }).click();
  expect((await state(page)).orders.some((o) => o.tableId === 1)).toBe(false);
  // Con un producto, la cuenta sigue abierta
  await page.getByRole('button', { name: /^Mesa 1 ·/ }).click();
  await page.locator('.menu-item', { hasText: 'Café de Antigua' }).click();
  await page.getByRole('button', { name: '← Mesas' }).click();
  expect((await state(page)).orders.some((o) => o.tableId === 1)).toBe(true);
});

test('un usuario desactivado pierde la sesión', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await expect(page.locator('.app')).toBeVisible();
  await patch(page, (s) => {
    s.users.find((u) => u.id === 'u3').active = false;
  });
  await expect(page.locator('.login')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Juan/ })).toHaveCount(0);
});

test('temporadas que se cruzan: aviso y gana la más corta', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  const s0 = await state(page);
  const t1 = s0.seasons[0];
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Habitaciones', exact: true }).click();
  await page.getByRole('button', { name: '+ Temporada' }).click();
  await page.locator('.modal input').first().fill('Feria');
  await page.locator('.modal input[type=date]').first().fill(t1.from);
  await page.locator('.modal input[type=date]').nth(1).fill(t1.from);
  await expect(page.locator('.modal .note-box')).toContainText(`Comparte fechas con ${t1.name}`);
  await page.locator('.modal input[type=number]').first().fill('2000');
  await modalClick(page, 'Guardar');
  // Un día que comparten: la reserva automática toma el precio de la temporada corta
  const s = await state(page);
  const type = s.roomTypes[0];
  const room = s.rooms.find((r) => r.typeId === type.id);
  const res = { pricing: 'auto', roomN: room.n, adults: 1, children: 0, rate: 0 };
  const night = nightRate(res, t1.from, { ...s, config: { ...s.config, weekendPct: 0 } });
  expect(night).toMatchObject({ rate: 2000, label: 'Feria' });
});

test('cargar un respaldo pide confirmación', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.getByRole('button', { name: /Datos de demo|Respaldo/ }).click();
  const data = await state(page);
  data.sales = [];
  await page.locator('input[type=file]').setInputFiles({
    name: 'respaldo.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator('.modal')).toContainText('Se reemplazan todos los datos actuales');
  await modalClick(page, 'Cancelar');
  expect((await state(page)).sales.length).toBeGreaterThan(0);
});

// Recorrido: cada pantalla y cada ventana principal se abren sin errores (la prueba falla si hay errores de JS)
const OPEN = {
  Mesas: ['Editar mapa'],
  Ventas: ['Facturas pendientes'],
  Inventario: ['+ Producto', 'Entrada', 'Exportar a Excel'],
  Habitaciones: ['Nueva reserva'],
  Reservas: ['+ Nueva reserva', 'Ver lista'],
  Huéspedes: [],
  Limpieza: [],
  Tienda: ['Existencias', '+ Producto'],
  Eventos: ['+ Nuevo evento', 'Calendario'],
  Caja: ['Entrada de efectivo', 'Salida de efectivo', 'Cerrar turno', 'Ver reporte'],
  'Reporte / RDP': ['Por fechas', 'Imprimir', 'Exportar a Excel'],
  Bitácora: ['Últimos 30 días', 'Exportar a Excel'],
  Configuración: ['+ Platillo', 'Mapa de mesas', 'Habitaciones', 'Eventos', 'Usuarios', 'Negocio'],
};

test('recorrido de gerencia por todas las pantallas y ventanas', async ({ page }) => {
  test.setTimeout(120000);
  await fresh(page);
  await login(page, 'Marta Gerente');
  let clicked = 0;
  for (const [screen, buttons] of Object.entries(OPEN)) {
    await nav(page, screen);
    for (const b of buttons) {
      const btn = page.locator('.content').getByRole('button', { name: b, exact: true }).first();
      if (!(await btn.count())) continue;
      await btn.click();
      clicked++;
      // Si abrió una ventana, se cierra con Escape (o con su botón de cancelar si pide PIN)
      if (await page.locator('.overlay').count()) {
        await page.keyboard.press('Escape');
        if (await page.locator('.overlay').count()) await page.locator('.overlay .btn').first().click();
      }
    }
    await expect(page.locator('.error-screen')).toHaveCount(0);
  }
  expect(clicked).toBeGreaterThanOrEqual(20);
  // El resumen y sus enlaces
  await nav(page, 'Resumen');
  await page.locator('.dash-alert').first().click();
  await expect(page.locator('.error-screen')).toHaveCount(0);
});

test('editar a un huésped hospedado no cambia la entrada ni la habitación', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '202' }).click();
  await page.getByRole('button', { name: 'Editar / extender' }).click();
  await expect(page.locator('.modal input[type=date]').first()).toBeDisabled();
  await expect(
    page
      .locator('.modal select')
      .filter({ hasText: /Elegir|101/ })
      .first(),
  ).toBeDisabled();
  await expect(page.locator('.modal')).toContainText('Cambiar de habitación');
  // Extender sí se puede
  const out = page.locator('.modal input[type=date]').nth(1);
  const d = new Date(Date.now() + 6 * 864e5).toLocaleDateString('sv-SE');
  await out.fill(d);
  await modalClick(page, 'Guardar cambios');
  expect((await state(page)).reservations.find((r) => r.id === 'r3').checkOut).toBe(d);
});

test('recorrido de recepción y mesero sin errores', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  for (const s of [
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
  ])
    await nav(page, s);
  await expect(page.locator('.error-screen')).toHaveCount(0);
  await login(page, 'Juan');
  for (const s of ['Ventas', 'Mesas']) await nav(page, s);
  await page.locator('.account').first().click();
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('.ticket-totals').getByRole('button', { name: 'Precuenta' }).click();
  await expect(page.locator('.print-doc')).toContainText('Precuenta');
  await modalClick(page, 'Cerrar');
  await page.locator('.ticket-totals').getByRole('button', { name: 'Dividir' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.error-screen')).toHaveCount(0);
});
