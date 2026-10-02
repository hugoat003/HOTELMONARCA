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
  await page.locator('.pay-row select').nth(1).selectOption('efectivo');
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
