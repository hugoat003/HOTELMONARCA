import { expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

const res = async (page, id) => (await state(page)).reservations.find((r) => r.id === id);

// Arrastra la barra de una reserva: days a la derecha, rows hacia abajo
async function dragBar(page, name, { days = 0, rows = 0, resize = false }) {
  const bar = page.locator('.cal-bar', { hasText: name });
  const box = await bar.boundingBox();
  const cal = await page.locator('.calendar').boundingBox();
  const dayW = (cal.width - 110) / 14;
  const rowH = (await page.locator('.cal-row').nth(1).boundingBox()).height;
  const x = resize ? box.x + box.width - 4 : box.x + 20;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + days * dayW, y + rows * rowH, { steps: 10 });
  await page.mouse.up();
}

test('cambio de habitación de un huésped hospedado', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '101' }).click();
  await page.getByRole('button', { name: 'Cambiar de habitación' }).click();
  await page
    .locator('.modal')
    .getByRole('button', { name: /^102 ·/ })
    .click();
  await modalClick(page, 'Pasar a la 102');
  const r = await res(page, 'r1');
  expect(r.roomN).toBe('102');
  expect(r.roomHistory[0].roomN).toBe('101');
  expect((await state(page)).rooms.find((x) => x.n === '101').hk).toBe('sucia');
  await expect(page.locator('.side-panel')).toContainText('Hab. 101 →');
});

test('arrastrar reservas: rechaza fechas ocupadas, mueve y extiende', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  const before = await res(page, 'r7'); // Pedro Castillo, 102

  // Subir a la 101 en las mismas fechas: choca con Diego Paz
  await dragBar(page, 'Pedro Castillo', { rows: -1 });
  await expect(page.getByText(/La 101 está ocupada/)).toBeVisible();
  expect((await res(page, 'r7')).roomN).toBe('102');

  // Un día después en la misma habitación
  await dragBar(page, 'Pedro Castillo', { days: 1 });
  let r = await res(page, 'r7');
  expect(r.checkIn > before.checkIn).toBe(true);

  // Estirar el borde: una noche más
  const out = r.checkOut;
  await dragBar(page, 'Pedro Castillo', { days: 1, resize: true });
  r = await res(page, 'r7');
  expect(r.checkOut > out).toBe(true);
  expect(r.checkIn).not.toBe(before.checkIn);
});

test('no-show con devolución parcial del anticipo', async ({ page }) => {
  await fresh(page);
  // Carlos Ruiz debía llegar ayer
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('monarca-pos-v1'));
    const r = s.reservations.find((x) => x.id === 'r5');
    const d = new Date(r.checkIn + 'T12:00');
    d.setDate(d.getDate() - 1);
    r.checkIn = d.toISOString().slice(0, 10);
    localStorage.setItem('monarca-pos-v1', JSON.stringify(s));
  });
  await page.reload();
  await login(page, 'Luis Recepción');
  await nav(page, 'Habitaciones');
  await page.locator('.tile.room', { hasText: '103' }).click();
  await page.getByRole('button', { name: 'Marcar no-show' }).click();
  await page.getByLabel('Devolver').check();
  await page.getByLabel('Monto a devolver').fill('300');
  await modalClick(page, 'Marcar no-show');
  await expect(page.locator('.print-doc')).toContainText('Comprobante de devolución');
  await modalClick(page, 'Cerrar');
  const s = await state(page);
  const r = s.reservations.find((x) => x.id === 'r5');
  expect(r.status).toBe('noshow');
  const refund = s.sales.at(-1);
  expect([refund.grand, refund.payments[0].method]).toEqual([-300, 'efectivo']);
});

test('el precio automático usa la temporada', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Reservas');
  // 301 (Suite) en el primer día de la temporada alta: inicio del calendario + 6 días
  await page.locator('.cal-row', { hasText: '301' }).locator('.cal-cell').nth(6).click();
  await expect(page.locator('.modal')).toContainText('Temporada alta de octubre');
  await expect(page.locator('.summary-bar')).toContainText(/Q 1,750\.00|Q 2,012\.50/);
});

test('fichas de huéspedes: frecuente, historial y autocompletar', async ({ page }) => {
  await fresh(page);
  await login(page, 'Luis Recepción');
  await nav(page, 'Huéspedes');
  await page.getByPlaceholder(/Buscar por nombre/).fill('Laura');
  const row = page.locator('.tx-row.guests', { hasText: 'Laura Méndez' });
  await expect(row).toContainText('Frecuente');
  await row.click();
  await expect(page.locator('.side-panel .folio-line')).toHaveCount(4);
  await expect(page.locator('.side-panel')).toContainText('Prefiere habitación en primer piso');

  await nav(page, 'Reservas');
  await page.getByRole('button', { name: '+ Nueva reserva' }).click();
  await page.getByPlaceholder('Nombre completo o documento').fill('Laur');
  await page.locator('.suggest-item', { hasText: 'Laura Méndez' }).click();
  await expect(page.getByPlaceholder('DPI / Pasaporte')).toHaveValue('DPI 2456 78901 0101');
  await expect(page.getByText('Ficha de huésped vinculada')).toBeVisible();
});
