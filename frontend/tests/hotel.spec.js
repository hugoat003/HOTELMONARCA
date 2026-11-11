import { authorize, expect, fresh, login, modalClick, nav, patchState, payAll, state, test } from './helpers.js';

test('llegada, cargo extra, check-out con saldo y limpieza', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '103' }).click();
  await page.getByRole('button', { name: 'Registrar llegada' }).click();
  await page.getByRole('button', { name: 'Confirmar check-in' }).click();
  await expect(page.getByText(/Check-in · Carlos Ruiz/)).toBeVisible();
  await page.getByRole('button', { name: 'Agregar cargo' }).click();
  await page.getByRole('button', { name: /Lavandería/ }).click();
  await modalClick(page, 'Agregar');
  await expect(page.locator('.side-panel')).toContainText('Lavandería');

  await page.locator('.tile.room', { hasText: '104' }).click();
  await page.getByRole('button', { name: /Check-out/ }).click();
  await payAll(page, 'tarjeta');
  await expect(page.getByText(/de salida/).first()).toBeVisible();
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  expect(s.reservations.find((r) => r.id === 'r2').status).toBe('salida');
  expect(s.rooms.find((r) => r.n === '104').hk).toBe('sucia');
});

test('tarifa mensual: periodos, pendiente a hoy y abono', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '201' }).click();
  await expect(page.getByText(/Mes 1 ·/)).toBeVisible();
  await expect(page.getByText(/Pendiente a hoy/)).toBeVisible();
  await page.getByRole('button', { name: 'Abono', exact: true }).click();
  await page.getByRole('button', { name: /^Saldo completo/ }).click();
  await modalClick(page, 'Continuar');
  await payAll(page, 'efectivo');
  await modalClick(page, 'Cerrar');
  await expect(page.getByText(/Al día: los meses iniciados están pagados/)).toBeVisible();
});

test('nueva reserva desde el calendario', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  await page.locator('.cal-row', { hasText: '102' }).locator('.cal-cell').nth(2).click();
  await page.getByPlaceholder('Nombre completo').fill('Huésped Prueba');
  await page.getByRole('button', { name: 'Guardar reserva' }).click();
  await expect(page.getByText(/Reserva creada · Huésped Prueba/)).toBeVisible();
  expect((await state(page)).reservations.some((r) => r.guest.name === 'Huésped Prueba' && r.roomN === '102')).toBe(
    true,
  );
});

test('calendario de reservas con muchas habitaciones: se desplaza y los días quedan arriba', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await fresh(page);
  await patchState(page, (s) => {
    const t = s.rooms[0];
    for (let i = 1; i <= 12; i++) s.rooms.push({ ...t, n: String(400 + i) });
  });
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  const last = page.locator('.cal-room', { hasText: '412' });
  await expect(last).not.toBeInViewport();
  await page.locator('.calendar').hover();
  await page.mouse.wheel(0, 2000);
  await expect(last).toBeInViewport();
  await expect(page.locator('.cal-head')).toBeInViewport();
});

test('crear otra reserva encima de una estancia con check-out hecho avisa y pide confirmar', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  // La 102 tuvo una estancia ya cerrada y cobrada que cubre estos días (como un check-out por error)
  await patchState(page, (s) => {
    const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    s.reservations = s.reservations.filter((r) => r.roomN !== '102');
    s.reservations.push({
      id: 'r_cerrada',
      roomN: '102',
      guest: { name: 'Efraín Prueba', phone: '', email: '', doc: 'DPI 1', nationality: 'Guatemala' },
      adults: 1,
      children: 0,
      checkIn: d(-1),
      checkOut: d(1),
      channel: 'Directo',
      rateType: 'noche',
      pricing: 'fija',
      rate: 150,
      status: 'salida',
      checkedOutAt: Date.now(),
      notes: '',
      charges: [],
      payments: [{ id: 'p1', ts: Date.now(), method: 'efectivo', amount: 150, desc: 'Hospedaje' }],
      createdAt: Date.now(),
    });
  });
  await nav(page, 'Reservas');
  // Como en el hotel: + Nueva reserva, hoy, la misma habitación
  await page.getByRole('button', { name: '+ Nueva reserva' }).click();
  await page.getByLabel('Habitación').selectOption('102');
  await page.getByPlaceholder('Nombre completo').fill('Efraín Prueba');
  await expect(page.locator('.modal .note-box.warn')).toContainText('ya tuvo una estancia esa noche: Efraín Prueba');
  await page.getByRole('button', { name: 'Guardar reserva' }).click();
  // Pide confirmar; al volver, no se crea
  await expect(page.locator('.modal', { hasText: '¿Otra estancia en la misma noche?' })).toBeVisible();
  await page
    .locator('.modal', { hasText: '¿Otra estancia en la misma noche?' })
    .getByRole('button', { name: 'Cancelar' })
    .click();
  expect((await state(page)).reservations.filter((r) => r.roomN === '102')).toHaveLength(1);
  // Si de verdad es otro huésped, se puede crear
  await page.getByRole('button', { name: 'Guardar reserva' }).click();
  await modalClick(page, 'Crear de todos modos');
  await expect(page.getByText(/Reserva creada/)).toBeVisible();
  expect((await state(page)).reservations.filter((r) => r.roomN === '102')).toHaveLength(2);
});

test('un check-out por error se deshace con autorización y luego su cobro se puede anular', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  // La 102 tiene una estancia que hizo check-out (por error) y se cobró en este turno
  await patchState(page, (s) => {
    const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    s.reservations = s.reservations.filter((r) => r.roomN !== '102');
    s.sales.push({
      id: 's_estancia',
      number: s.counters.doc + 1,
      kind: 'hotel',
      ts: Date.now(),
      ref: 'Hab. 102 · Efraín Prueba',
      resId: 'r_cerrada',
      cashierId: 'u2',
      shiftId: s.shift.id,
      status: 'ok',
      lines: [{ name: 'Hospedaje', qty: 1, price: 150 }],
      subtotal: 150,
      total: 150,
      grand: 150,
      tip: 0,
      discount: null,
      payments: [{ method: 'efectivo', amount: 150 }],
    });
    s.counters.doc += 1;
    s.reservations.push({
      id: 'r_cerrada',
      roomN: '102',
      guest: { name: 'Efraín Prueba', phone: '', email: '', doc: 'DPI 1', nationality: 'Guatemala' },
      adults: 1,
      children: 0,
      checkIn: d(-1),
      checkOut: d(1),
      channel: 'Directo',
      rateType: 'noche',
      pricing: 'fija',
      rate: 150,
      status: 'salida',
      checkedOutAt: Date.now(),
      notes: '',
      charges: [],
      payments: [
        { id: 'p1', ts: Date.now(), method: 'efectivo', amount: 150, desc: 'Hospedaje', saleId: 's_estancia' },
      ],
      createdAt: Date.now(),
    });
  });

  // Con la estancia cerrada, su cobro no se anula: primero hay que deshacer el check-out
  await nav(page, 'Ventas');
  const row = page.locator('.tx-row.sales', { hasText: 'Hab. 102 · Efraín Prueba' });
  await row.getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByText(/ya hizo check-out/)).toBeVisible();

  await nav(page, 'Reservas');
  await page.locator('.cal-bar.salida', { hasText: 'Efraín Prueba' }).click();
  await page.getByRole('button', { name: 'Deshacer check-out' }).click();
  await expect(page.locator('.modal', { hasText: '¿Deshacer el check-out?' })).toContainText('No se cobra nada');
  await modalClick(page, 'Deshacer check-out');
  await authorize(page);
  await expect(page.getByText('Efraín Prueba vuelve a estar hospedado en la 102')).toBeVisible();
  let s = await state(page);
  let res = s.reservations.find((r) => r.id === 'r_cerrada');
  expect(res.status).toBe('hospedado');
  expect(res.payments).toHaveLength(1);
  expect(s.audit.at(-1).type).toBe('checkout');

  // Ahora sí se anula el cobro, y el saldo vuelve a quedar pendiente en su folio
  await nav(page, 'Ventas');
  await row.getByRole('button', { name: 'Anular' }).click();
  await expect(page.locator('.modal')).toContainText('El pago se quita de la Hab. 102 (Efraín Prueba)');
  await page.locator('.modal input').fill('Cobro duplicado');
  await modalClick(page, 'Anular comprobante');
  await authorize(page);
  s = await state(page);
  expect(s.sales.find((x) => x.id === 's_estancia').status).toBe('anulada');
  res = s.reservations.find((r) => r.id === 'r_cerrada');
  expect(res.payments).toHaveLength(0);
});
