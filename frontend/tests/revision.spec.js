import { expect, fresh, login, modalClick, pickMethod, nav, patchState, state, test } from './helpers.js';

const patch = patchState;
const today = () => new Date().toLocaleDateString('sv-SE');

test('salida anticipada: cancelar no cambia la reserva y el saldo a favor se devuelve', async ({ page }) => {
  await fresh(page);
  await patch(page, (s) => {
    const r = s.reservations.find((x) => x.id === 'r3');
    r.payments.push({ id: 'p_big', ts: Date.now(), method: 'tarjeta', amount: 5000, desc: 'Prepago' });
  });
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '202' }).click();
  const before = (await state(page)).reservations.find((x) => x.id === 'r3').checkOut;

  await page.getByRole('button', { name: 'Check-out anticipado' }).click();
  await modalClick(page, 'Continuar');
  await expect(page.locator('.modal')).toContainText('saldo a favor');
  await modalClick(page, 'Cancelar');
  let r = (await state(page)).reservations.find((x) => x.id === 'r3');
  expect([r.status, r.checkOut]).toEqual(['hospedado', before]);

  await page.getByRole('button', { name: 'Check-out anticipado' }).click();
  await modalClick(page, 'Continuar');
  await page
    .locator('.modal')
    .getByRole('button', { name: /^Devolver Q/ })
    .click();
  await expect(page.locator('.print-doc')).toContainText('Devolución de saldo a favor');
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  r = s.reservations.find((x) => x.id === 'r3');
  expect([r.status, r.checkOut]).toEqual(['salida', today()]);
  const refund = s.sales.at(-1);
  expect(refund.docType).toBe('devolucion');
  expect(refund.grand).toBeLessThan(0);
  expect(s.audit.at(-1).type).toBe('devolucion');
});

test('no se registra la llegada si el huésped anterior sigue en la habitación', async ({ page }) => {
  await fresh(page);
  await patch(page, (s) => {
    const d = new Date().toLocaleDateString('sv-SE');
    const out = new Date(Date.now() + 2 * 864e5).toLocaleDateString('sv-SE');
    // La familia Ortega (104) sale hoy pero sigue hospedada; llega otro huésped a la 104
    s.reservations.push({
      id: 'r_new',
      roomN: '104',
      checkIn: d,
      checkOut: out,
      adults: 2,
      children: 0,
      channel: 'Teléfono',
      rateType: 'noche',
      pricing: 'auto',
      rate: 650,
      status: 'reservada',
      notes: '',
      charges: [],
      payments: [],
      guest: { name: 'Pedro Nuevo', phone: '', email: '', doc: '', nationality: '' },
    });
    s.rooms.find((r) => r.n === '104').hk = 'limpia';
  });
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  await page.locator('.cal-bar', { hasText: 'Pedro Nuevo' }).click();
  await expect(page.locator('.side-panel')).toContainText('Familia Ortega sigue en la habitación 104');
  await expect(page.getByRole('button', { name: 'Registrar llegada' })).toHaveCount(0);
});

test('anular: solo cobros del turno abierto', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Ventas');
  await page.getByRole('button', { name: 'Todas' }).click();
  const old = page.locator('.tx-row.sales', { hasText: /\d{2}\/\d{2}\/\d{4}/ }).last();
  await old.getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByText('Solo se anulan cobros del turno abierto')).toBeVisible();
});

test('cobrar con productos sin enviar los envía primero y el vuelto sale del efectivo', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('tab', { name: /Terraza/ }).click();
  await page.locator('.account', { hasText: 'Mesa 7' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.locator('.modal')).toContainText('no se ha enviado a cocina');
  await modalClick(page, 'Enviar y cobrar');
  await expect(page.locator('.print-doc')).toContainText('Comanda');
  await modalClick(page, 'Cerrar');
  // Dos pagos en efectivo: Q 200 y Q 10; el vuelto sale primero del último
  await page.locator('.pay-row input.amount').first().fill('200');
  await page.getByRole('button', { name: '+ Agregar otra forma de pago' }).click();
  await pickMethod(page, 1, 'efectivo');
  await page.locator('.pay-row input.amount').nth(1).fill('10');
  await page.locator('.cobro').getByRole('button', { name: 'Sin propina' }).click();
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  const sale = s.sales.at(-1);
  expect(sale.payments.every((p) => p.amount > 0)).toBe(true);
  expect(sale.payments.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(sale.grand, 2);
  expect(s.orders.some((o) => o.tableId === 7)).toBe(false);
});

test('salida de efectivo mayor a lo que hay en caja se rechaza', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Caja');
  await page.getByRole('button', { name: 'Salida de efectivo' }).click();
  await page.locator('.modal input').first().fill('999999');
  await page.getByRole('button', { name: 'Compra de insumos' }).click();
  await modalClick(page, 'Registrar');
  await expect(page.getByText('No hay tanto efectivo en caja para esa salida')).toBeVisible();
});

test('mesas: tocar una mesa libre o "Para llevar" pasa directo al menú', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 1 ·/ }).click();
  await expect(page.locator('.menu-grid')).toBeVisible();
  let s = await state(page);
  expect(s.orders.find((o) => o.tableId === 1).waiterId).toBe('u3');

  await page.getByRole('button', { name: '← Mesas' }).click();
  await page.getByRole('button', { name: '+ Para llevar' }).click();
  await expect(page.locator('.menu-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Opciones', exact: true }).click();
  await page.getByRole('button', { name: 'Poner nombre del cliente' }).click();
  await page.locator('.modal input').fill('Sra. Pérez');
  await modalClick(page, 'Guardar');
  await expect(page.locator('.side-panel .panel-title')).toContainText('Sra. Pérez');
  s = await state(page);
  expect(s.orders.at(-1)).toMatchObject({ type: 'llevar', waiterId: 'u3', customer: 'Sra. Pérez' });
});

test('mesa reservada pide confirmación antes de abrirla', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('tab', { name: /Terraza/ }).click();
  await page.getByRole('button', { name: /^Mesa 9 ·/ }).click();
  await expect(page.locator('.modal')).toContainText('Tiene una reserva para las 20:00');
  await modalClick(page, 'Abrir mesa');
  await expect(page.locator('.menu-grid')).toBeVisible();
  expect((await state(page)).tables.find((t) => t.id === 9).reservedAt).toBeNull();
});

test('caja cerrada: aviso en todas las pantallas y no se cobra', async ({ page }) => {
  await fresh(page);
  await patch(page, (s) => {
    s.shift = null;
  });
  await login(page, 'Luis Recepción');
  await nav(page, 'Tienda');
  await expect(page.locator('.shift-banner')).toContainText('Caja cerrada');
  await page.locator('.menu-item').first().click();
  await page.locator('.shop-cart').getByRole('button', { name: 'Cobrar' }).click();
  await expect(page.getByText('Abre el turno de caja para cobrar.')).toBeVisible();
  await page.locator('.shift-banner').getByRole('button', { name: 'Abrir caja' }).click();
  await expect(page.getByRole('heading', { name: 'Caja' })).toBeVisible();
});

test('rentabilidad: costo y margen por platillo', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await expect(page.locator('.tx-row.admin-menu', { hasText: 'Pepián de pollo' })).toContainText('%');
  await nav(page, 'Reporte / RDP');
  await page.getByRole('button', { name: 'Por fechas' }).click();
  const rows = page.locator('.tx-row.dishes:not(.head)');
  await expect(rows.first()).toBeVisible();
  const s = await state(page);
  expect(s.menu.find((m) => m.name === 'Pepián de pollo').recipe.length).toBeGreaterThan(0);
});

test('revisión de la mañana: no-show con devolución y aviso de Booking', async ({ page }) => {
  await fresh(page);
  await patch(page, (s) => {
    const y = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE');
    const t = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE');
    const base = {
      adults: 2,
      children: 0,
      rateType: 'noche',
      pricing: 'auto',
      rate: 650,
      status: 'reservada',
      notes: '',
      charges: [],
    };
    s.reservations.push(
      {
        ...base,
        id: 'r_ns',
        roomN: '102',
        checkIn: y,
        checkOut: t,
        channel: 'Booking.com',
        payments: [{ id: 'p_ns', ts: Date.now(), method: 'tarjeta', amount: 300, desc: 'Anticipo' }],
        guest: { name: 'Hans Gruber', phone: '', email: '', doc: '', nationality: '' },
      },
      {
        ...base,
        id: 'r_late',
        roomN: '301',
        checkIn: y,
        checkOut: t,
        channel: 'Teléfono',
        lateArrival: true,
        payments: [],
        guest: { name: 'Lucía Tarde', phone: '', email: '', doc: '', nationality: '' },
      },
    );
  });
  await login(page, 'Luis Recepción');
  await nav(page, 'Caja');
  const review = page.locator('.review');
  await expect(review).toContainText('No llegaron · 2');
  await expect(review.locator('.review-row', { hasText: 'Hans Gruber' })).toContainText(
    'Repórtalo también en Booking.com',
  );
  await expect(review.locator('.review-row', { hasText: 'Lucía Tarde' })).toContainText('Avisó que llega tarde');

  await review
    .locator('.review-row', { hasText: 'Hans Gruber' })
    .getByRole('button', { name: 'Marcar no-show' })
    .click();
  await page.getByText('Devolver', { exact: true }).click();
  await modalClick(page, 'Marcar no-show');
  await modalClick(page, 'Cerrar');
  await expect(review).toContainText('No llegaron · 1');
  const s = await state(page);
  const r = s.reservations.find((x) => x.id === 'r_ns');
  expect(r.status).toBe('noshow');
  expect(r.payments.reduce((a, p) => a + p.amount, 0)).toBe(0);

  // "Ver reserva" abre la reserva en la pantalla de Reservas
  await review.locator('.review-row', { hasText: 'Lucía Tarde' }).getByRole('button', { name: 'Ver reserva' }).click();
  await expect(page.locator('.side-panel')).toContainText('Avisó que llega tarde');
});

test('cargo a habitación: sin escribir el monto, queda pendiente y se cobra en el check-out', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.locator('.account', { hasText: 'Mesa 2' }).click();
  await page.locator('.ticket-totals').getByRole('button', { name: 'Cobrar', exact: true }).click();
  // No se abre el teclado solo: ningún campo tiene el foco
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  await pickMethod(page, 0, 'habitacion');
  await expect(page.locator('.pay-row input.amount').first()).toHaveValue('264'); // Q240 + 10% de propina
  await page
    .locator('.pay-rooms')
    .getByRole('button', { name: /^104 ·/ })
    .click();
  await modalClick(page, 'Confirmar pago');
  await modalClick(page, 'Cerrar');

  let s = await state(page);
  const sale = s.sales.at(-1);
  expect(sale.payments).toEqual([expect.objectContaining({ method: 'habitacion', amount: 264, roomN: '104' })]);
  expect(s.reservations.find((x) => x.id === 'r2').charges.at(-1)).toMatchObject({ amt: 264, saleId: sale.id });

  // En el folio queda pendiente y se cobra al salir
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '104' }).click();
  await expect(page.locator('.side-panel')).toContainText('Restaurante · Mesa 2');
  await page.getByRole('button', { name: /Check-out y cobrar/ }).click();
  await pickMethod(page, 0, 'tarjeta');
  await modalClick(page, 'Confirmar pago');
  await expect(page.locator('.print-doc')).toContainText('Restaurante · Mesa 2');
  await modalClick(page, 'Cerrar');
  s = await state(page);
  expect(s.reservations.find((x) => x.id === 'r2').status).toBe('salida');
  expect(s.sales.at(-1).lines.some((l) => l.name.includes('Restaurante · Mesa 2') && l.price === 264)).toBe(true);
});
