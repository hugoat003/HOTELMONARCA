import net from 'node:net';
import { expect, fresh, login, modalClick, nav, payAll, pickMethod, test } from './helpers.js';

// Impresora falsa en la red (como la 3nstar RPT004 en el puerto 9100): guarda lo que recibe
async function fakePrinter(port = 0) {
  const jobs = [];
  const server = net.createServer((sock) => {
    const chunks = [];
    sock.on('data', (c) => chunks.push(c));
    sock.on('end', () => jobs.push(Buffer.concat(chunks).toString('latin1')));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { jobs, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}

// Configuración → Impresoras: pone una impresora en red con esa IP y puerto
async function setNetworkPrinter(page, name, port) {
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Impresoras' }).click();
  const card = page.locator(`[data-printer="${name}"]`);
  await card.getByRole('radio', { name: 'Red (IP)' }).click();
  await card.getByLabel('IP de la impresora').fill('127.0.0.1');
  await card.getByLabel('Puerto').fill(String(port));
  await page.getByRole('button', { name: 'Guardar impresoras' }).click();
  await expect(page.getByText('Impresoras guardadas')).toBeVisible();
}

test('cocina por red: prueba de impresión y la comanda sale sola al enviar', async ({ page }) => {
  const cocina = await fakePrinter();
  try {
    await fresh(page);
    await login(page, 'Marta Gerente');
    await setNetworkPrinter(page, 'cocina', cocina.port);
    await page.locator('[data-printer="cocina"]').getByRole('button', { name: 'Imprimir prueba' }).click();
    await expect.poll(() => cocina.jobs.length).toBe(1);
    expect(cocina.jobs[0]).toContain('PRUEBA DE IMPRESI');
    await expect(page.locator('[data-printer="cocina"]')).toContainText('Funcionando');

    await login(page, 'Juan');
    await page.getByRole('button', { name: /^Mesa 3 ·/ }).click();
    await page.locator('.menu-item', { hasText: 'Pepián de pollo' }).click();
    await page.getByRole('button', { name: /Enviar a cocina/ }).click();
    // Sin ventana que cerrar: solo el aviso, y la comanda sale en cocina
    await expect(page.getByText(/Comanda #\d+ enviada a cocina/)).toBeVisible();
    await expect(page.locator('.modal')).toHaveCount(0);
    await expect.poll(() => cocina.jobs.length).toBe(2);
    expect(cocina.jobs[1]).toMatch(/COMANDA #\d+/);
    expect(cocina.jobs[1]).toContain('Pepi'); // "Pepián" en PC850
  } finally {
    await cocina.close();
  }
});

test('caja sin respuesta: aviso en pantalla y el comprobante sale al reconectarla', async ({ page }) => {
  // Puerto libre donde todavía no hay impresora
  const probe = await fakePrinter();
  const port = probe.port;
  await probe.close();
  let caja;
  try {
    await fresh(page);
    await login(page, 'Marta Gerente');
    await setNetworkPrinter(page, 'caja', port);
    await nav(page, 'Mesas');
    await page.getByRole('button', { name: /^Mesa 2 ·/ }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await pickMethod(page, 0, 'efectivo');
    await page.locator('.pay-row .quick button', { hasText: 'Exacto' }).first().click();
    await modalClick(page, 'Confirmar pago');
    await expect(page.locator('.note-box', { hasText: 'El comprobante salió en la impresora de caja' })).toBeVisible();
    await modalClick(page, 'Cerrar');

    const banner = page.locator('.shift-banner.printer');
    await expect(banner).toContainText('La impresora de caja no responde');
    await expect(banner).toContainText('1 ticket en espera');

    // Se conecta la impresora: con "Reintentar" sale el comprobante (con el pulso a la gaveta) y el aviso se va
    caja = await fakePrinter(port);
    await banner.getByRole('button', { name: 'Reintentar' }).click();
    await expect.poll(() => caja.jobs.length).toBe(1);
    expect(caja.jobs[0]).toContain('Comprobante de venta No.');
    expect(caja.jobs[0]).toContain('\x1bp\x00'); // abre la gaveta: se pagó en efectivo
    await expect(banner).toHaveCount(0);
  } finally {
    await caja?.close();
  }
});

test('impresora simulada: la precuenta queda en la lista de tickets para verla', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await page.getByRole('button', { name: /^Mesa 2 ·/ }).click();
  await page.getByRole('button', { name: 'Precuenta' }).click();
  await modalClick(page, 'Imprimir');
  await expect(page.getByText('Guardado en la lista de tickets (impresora simulada)')).toBeVisible();
  await modalClick(page, 'Cerrar');

  await login(page, 'Marta Gerente');
  await nav(page, 'Configuración');
  await page.locator('.tabs').getByRole('button', { name: 'Impresoras' }).click();
  const row = page.locator('.tx-row.print-jobs', { hasText: 'Precuenta · Mesa 2' });
  await expect(row).toContainText('Simulado');
  await row.getByRole('button', { name: 'Ver' }).click();
  await expect(page.locator('.ticket-text')).toContainText('PRECUENTA');
  await expect(page.locator('.ticket-text')).toContainText('Atendió');
  await modalClick(page, 'Cerrar');

  // Un cobro también deja su comprobante en la lista
  await nav(page, 'Mesas');
  await page.getByRole('button', { name: /^Mesa 2 ·/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await payAll(page, 'tarjeta');
  await modalClick(page, 'Cerrar');
  await nav(page, 'Configuración');
  await expect(page.locator('.tx-row.print-jobs', { hasText: /Comprobante de venta #\d+ · Mesa 2/ })).toBeVisible();
});

test('el mesero no ve la configuración de impresoras', async ({ page }) => {
  await fresh(page);
  await login(page, 'Juan');
  await expect(page.locator('.nav').getByRole('button', { name: 'Configuración' })).toHaveCount(0);
});
