import { expect, fresh, login, modalClick, nav, state, test, typePin } from './helpers.js';

test('tiempos: los fuertes y postres esperan y se marchan desde el pedido', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
  for (const n of ['Guacamole de la casa', 'Pepián de pollo', 'Flan de la casa', 'Café de Antigua'])
    await page.locator('.menu-item', { hasText: n }).click();
  await page.getByRole('button', { name: /Enviar a cocina/ }).click();
  const doc = page.locator('.print-doc');
  await expect(doc).toContainText('Entradas');
  await expect(doc).toContainText('Plato fuerte · EN ESPERA');
  await expect(doc).toContainText('Postres · EN ESPERA');
  await modalClick(page, 'Cerrar');
  await expect(page.locator('.side-panel .line', { hasText: 'Pepián' })).toContainText('En espera');

  await page.getByRole('button', { name: 'Marchar plato fuerte (1)' }).click();
  await expect(doc).toContainText('Marchar · Plato fuerte');
  await modalClick(page, 'Cerrar');
  await page.getByRole('button', { name: 'Marchar postres (1)' }).click();
  await modalClick(page, 'Cerrar');
  await expect(page.getByRole('button', { name: /^Marchar/ })).toHaveCount(0);

  const o = (await state(page)).orders.find((x) => x.tableId === 3);
  expect(o.fired).toEqual(['fuerte', 'postre']);
  expect(o.lines.every((l) => !l.held)).toBe(true);
  // El café no tiene tiempo: nunca espera
  expect(o.lines.find((l) => l.name === 'Café de Antigua').course).toBeNull();
});

test('mesas: una zona a la vez con pestañas', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await expect(page.getByRole('button', { name: /^Mesa 7 ·/ })).toHaveCount(0);
  await page.getByRole('tab', { name: /Terraza/ }).click();
  await expect(page.getByRole('button', { name: /^Mesa 7 ·/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mesa 1 ·/ })).toHaveCount(0);
  // El pedido ya no está en el menú: se entra desde la mesa y se regresa con "← Mesas"
  await page.getByRole('button', { name: /^Mesa 7 ·/ }).click();
  await page.getByRole('button', { name: '← Mesas' }).click();
  await expect(page.getByRole('tab', { name: /Terraza/ })).toHaveAttribute('aria-selected', 'true');
});

test('recepción: editar productos y mermas piden PIN y quedan en la bitácora', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Inventario');
  await page.locator('.tx-row', { hasText: 'Cerveza Gallo' }).getByRole('button', { name: 'Editar' }).click();
  await expect(page.getByText('Ingresa el PIN de un gerente')).toBeVisible();
  await typePin(page, '1111');
  await page.locator('.modal input[type=number]').nth(2).fill('9.5');
  await modalClick(page, 'Guardar');

  await nav(page, 'Tienda');
  await page.getByRole('button', { name: 'Existencias' }).click();
  await page.locator('.tx-row', { hasText: 'Gatorade' }).getByRole('button', { name: 'Merma' }).click();
  await page.locator('.modal input[type=number]').first().fill('1');
  await page.locator('.modal .chip').first().click();
  await page.locator('.modal .btn-primary').click();
  await typePin(page, '1111');

  const s = await state(page);
  const last = s.audit.slice(-2);
  expect(last.map((a) => a.type)).toEqual(['precio', 'inventario']);
  expect(last.every((a) => a.userId === 'u2' && a.authId === 'u1')).toBe(true);
  expect(last[0].detail).toContain('Cambio de costo');

  await login(page, 'Marta Gerente');
  await nav(page, 'Bitácora');
  await expect(page.locator('.tx-row.audit', { hasText: 'Tienda · Gatorade' })).toContainText('autorizó Marta');
  await page.getByRole('button', { name: /^Cambio de precio/ }).click();
  await expect(page.locator('.tx-row.audit:not(.head)')).toHaveCount(1);
});

test('cierre ciego: la diferencia se ve al confirmar el conteo y se explica', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Caja');
  // Recepción no ve el efectivo esperado
  await expect(page.locator('.kpi', { hasText: 'Efectivo esperado' })).toContainText('Lo ve gerencia');
  await page.getByRole('button', { name: 'Cerrar turno' }).click();
  await modalClick(page, 'Cerrar de todos modos');
  await typePin(page, '1111');
  await page.locator('.denom', { hasText: 'Q 100' }).locator('input').fill('3');
  await modalClick(page, /Confirmar conteo/);
  await expect(page.locator('.arqueo-result')).toContainText('Faltante');
  await expect(page.locator('.modal .btn-primary')).toBeDisabled();
  await page.getByRole('button', { name: 'Volver a contar' }).click();
  await page.locator('.denom', { hasText: 'Q 100' }).locator('input').fill('4');
  await modalClick(page, /Confirmar conteo/);
  await page.locator('.modal input').fill('Pago a proveedor sin registrar');
  await modalClick(page, 'Cerrar turno');
  await modalClick(page, 'Cerrar');

  const s = await state(page);
  const sh = s.shiftHistory[0];
  expect([sh.counted, sh.firstCounted, sh.recounts]).toEqual([400, 300, 1]);
  expect(sh.differenceNote).toBe('Pago a proveedor sin registrar');
  const a = s.audit.at(-1);
  expect([a.type, a.authId]).toEqual(['caja', 'u1']);
  expect(a.detail).toContain('recontado 1 vez');
});

test('evento con habitaciones apartadas: se liberan al cancelar', async ({ page }) => {
  await fresh(page);
  let s = await state(page);
  const block = (st) => st.reservations.filter((r) => r.eventId === 'e1' && r.status === 'reservada');
  expect(block(s).map((r) => r.roomN)).toEqual(['301', '302']);
  expect(block(s)[0].rate).toBe(900);
  // Los bloqueos no crean fichas de huésped
  expect(s.guests.some((g) => g.name.startsWith('Bloqueo'))).toBe(false);

  await login(page, 'Marta Gerente');
  await nav(page, 'Eventos');
  await page.locator('.event-row', { hasText: 'Boda Castillo' }).click();
  await expect(page.locator('.kv')).toContainText('301, 302 · 1 noche');
  await page.getByRole('button', { name: 'Cancelar evento' }).click();
  // Tiene anticipo: pide motivo y si se devuelve o se retiene
  await page.locator('.modal input').first().fill('Cambio de fecha');
  await page.getByText('Devolver', { exact: true }).click();
  await modalClick(page, 'Cancelar evento');
  await expect(page.locator('.print-doc')).toContainText('Devolución de anticipo');
  await modalClick(page, 'Cerrar');
  s = await state(page);
  expect(block(s)).toHaveLength(0);
  const ev = s.events.find((e) => e.id === 'e1');
  expect(ev.payments.reduce((a, p) => a + p.amount, 0)).toBe(0);
  expect(s.audit.slice(-2).map((a) => a.type)).toEqual(['cancelacion', 'devolucion']);
  expect(s.audit.at(-2).detail).toBe('Evento cancelado · Cambio de fecha');
});

test('resumen: pendientes del día ordenados por urgencia', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  const items = page.locator('.dash-alert');
  await expect(items.first()).toHaveClass(/high/);
  await expect(page.getByText(/Último cierre con faltante de Q 20.00/)).toBeVisible();
  await expect(page.getByText(/Capacitación Banco Industrial .* sigue en cotización/)).toBeVisible();
  await expect(page.getByText(/registros? en la bitácora hoy/)).toBeVisible();
});
