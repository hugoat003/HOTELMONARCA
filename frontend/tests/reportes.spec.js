import * as XLSX from 'xlsx';
import { expect, fresh, login, modalClick, nav, state, test } from './helpers.js';

const dateOf = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('reporte por fechas: últimos 7 días suma los turnos y reparte propinas', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Reporte / RDP');
  await page.getByRole('button', { name: 'Por fechas', exact: true }).click();
  await page.getByRole('button', { name: 'Últimos 7 días' }).click();

  // El total del reporte coincide con la suma de las ventas de esos días
  const s = await state(page);
  const days = new Set(Array.from({ length: 7 }, (_, i) => dateOf(Date.now() - i * 864e5)));
  const expected = s.sales
    .filter((x) => x.status === 'ok' && x.kind === 'restaurante' && days.has(dateOf(x.ts)))
    .reduce((a, x) => a + x.total, 0);
  const fmt = 'Q ' + expected.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await expect(page.locator('.kpi', { hasText: 'Ventas restaurante' })).toContainText(fmt);

  // Gráficas con 7 columnas y tabla alternativa
  await expect(page.locator('.chart').first().locator('path')).toHaveCount(7);
  await page.locator('.chart').first().getByRole('button', { name: 'Ver tabla' }).click();
  await expect(page.locator('.chart-table .row')).toHaveCount(7);

  // Reparto de propinas en partes iguales
  await page.getByRole('button', { name: 'Partes iguales' }).click();
  const shares = await page.locator('.tx-row.waiters:not(.head) strong:last-child').allInnerTexts();
  expect(new Set(shares).size).toBe(1);
  expect((await state(page)).config.tipSplit).toBe('iguales');
});

test('exportar el reporte a Excel', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Reporte / RDP');
  await page.getByRole('button', { name: 'Por fechas', exact: true }).click();
  await page.getByRole('button', { name: 'Últimos 30 días' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar a Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  const wb = XLSX.read(await (await download.createReadStream()).toArray().then(Buffer.concat));
  expect(wb.SheetNames).toEqual(['Resumen', 'Por día', 'Por mesero', 'Por categoría', 'Cobros']);
  expect(XLSX.utils.sheet_to_json(wb.Sheets['Por día'])).toHaveLength(30);
  expect(XLSX.utils.sheet_to_json(wb.Sheets['Cobros']).length).toBeGreaterThan(100);
});

test('resumen con tendencia de 7 y 30 días', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  const chart = page.locator('.chart').first();
  await expect(chart.locator('path')).toHaveCount(7);
  await page.getByRole('button', { name: '30 días' }).click();
  await expect(chart.locator('path')).toHaveCount(30);
  // Tooltip al pasar sobre una columna
  await chart.locator('rect[tabindex="0"]').nth(5).hover();
  await expect(page.locator('.chart-tip')).toBeVisible();
});

test('eventos: calendario mensual, nuevo evento desde un día y orden de servicio', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  await nav(page, 'Eventos');
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  const boda = (await state(page)).events.find((e) => e.id === 'e1');
  if (boda.date.slice(0, 7) !== dateOf(Date.now()).slice(0, 7))
    await page.getByRole('button', { name: 'Mes ›' }).click();
  await page.locator('.ev-chip', { hasText: 'Boda Castillo' }).click();
  await page.getByRole('button', { name: 'Orden de servicio (BEO)' }).click();
  await expect(page.locator('.print-doc')).toContainText('Orden de servicio');
  await expect(page.locator('.print-doc')).toContainText('70 platos');
  await expect(page.locator('.print-doc')).not.toContainText('Q ');
  await modalClick(page, 'Cerrar');

  // Tocar un día vacío del mes siguiente abre el formulario con esa fecha
  await page.getByRole('button', { name: 'Mes ›' }).click();
  await page.locator('.ev-day:not(.outside) .ev-day-num').nth(14).click();
  const date = await page.locator('.modal input[type=date]').inputValue();
  expect(date.slice(8)).toBe('15');
});

test('exportar ventas e inventario a Excel', async ({ page }) => {
  await fresh(page);
  await login(page, 'Marta Gerente');
  for (const [screen, sheet] of [
    ['Ventas', 'Cobros'],
    ['Inventario', 'Inventario'],
  ]) {
    await nav(page, screen);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar a Excel' }).click(),
    ]);
    const wb = XLSX.read(await (await download.createReadStream()).toArray().then(Buffer.concat));
    expect(wb.SheetNames).toEqual([sheet]);
  }
});
