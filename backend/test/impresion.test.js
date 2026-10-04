// Impresión: tickets ESC/POS, impresión automática, cola con reintento y permisos.
// Se usa una "impresora" falsa por red (puerto TCP) que guarda lo que recibe, como la RPT004.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { CMD, encode850, render } from '../src/printing/escpos.js';
import { comandaTicket, pruebaTicket, ticketText } from '../../shared/tickets.js';
import { seed } from '../../shared/seed.js';
import { act, call, login, restaurantSale, start, state } from './helpers.js';

const dir = mkdtempSync(join(tmpdir(), 'monarca-imp-'));
after(() => rmSync(dir, { recursive: true, force: true }));

// Impresora falsa: cada conexión es un ticket
async function fakePrinter(port = 0) {
  const jobs = [];
  const server = net.createServer((sock) => {
    const chunks = [];
    sock.on('data', (c) => chunks.push(c));
    sock.on('end', () => jobs.push(Buffer.concat(chunks)));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { jobs, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}
const freePort = async () => {
  const p = await fakePrinter();
  await p.close();
  return p.port;
};
const until = async (fn, ms = 4000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('tiempo agotado');
    await new Promise((r) => setTimeout(r, 20));
  }
};
// Texto legible de lo que recibió la impresora: quita los comandos y traduce PC850
const ARGS = { 0x1b: { 0x40: 0, 0x74: 1, 0x61: 1, 0x45: 1, 0x70: 3 }, 0x1d: { 0x21: 1, 0x56: 2 }, 0x1c: { 0x70: 2 } };
const decode = (buf) => {
  const high = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»';
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (ARGS[b]) {
      i += 1 + (ARGS[b][buf[i + 1]] ?? 0);
      continue;
    }
    out +=
      b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : b >= 0x80 && b < 0xb0 ? high[b - 0x80] : b === 0x0a ? '\n' : '';
  }
  return out;
};
const has = (buf, bytes) => buf.includes(Buffer.from(bytes));

const printers = (cocina, caja, extra = {}) => ({
  printers: { cocina, caja, autoReceipt: true, openDrawer: true, kitchenCopies: 1, ...extra },
});
const red = (port) => ({ mode: 'red', host: '127.0.0.1', port, columns: 48 });

describe('ESC/POS', () => {
  test('inicializa, elige PC850, codifica acentos y corta el papel', () => {
    const s = seed();
    const buf = render(pruebaTicket(s, 'caja'));
    assert.ok(buf.subarray(0, 2).equals(Buffer.from(CMD.init)));
    assert.ok(has(buf, CMD.codepage850));
    assert.ok(buf.subarray(-4).equals(Buffer.from(CMD.cut)));
    assert.deepEqual(encode850('ñÑ¿¡áé'), [0xa4, 0xa5, 0xa8, 0xad, 0xa0, 0x82]);
    assert.match(decode(buf), /Acentos: á é í ó ú ñ Ñ ü ¿\? ¡!/);
    assert.ok(!has(buf, CMD.drawer));
  });

  test('gaveta y copias', () => {
    const t = pruebaTicket(seed(), 'caja');
    const buf = render(t, { drawer: true, copies: 2 });
    assert.ok(has(buf, CMD.drawer));
    const cuts = (b, n = 0, at = 0) => ((at = b.indexOf(Buffer.from(CMD.cut), at)) < 0 ? n : cuts(b, n + 1, at + 1));
    assert.equal(cuts(buf), 2);
  });

  test('las filas no pasan de 48 columnas y el monto queda a la derecha', () => {
    const s = seed();
    const order = s.orders.find((o) => o.id === 'o2');
    const lines = [
      { ...order.lines[0], name: 'Platillo con un nombre larguísimo que no cabe en una línea', note: 'sin cebolla' },
    ];
    const text = ticketText(comandaTicket(s, { order, lines, number: 7 }), 48);
    for (const l of text.split('\n')) assert.ok(l.length <= 48, `"${l}" pasa de 48`);
    assert.match(text, /-> sin cebolla/);
  });
});

describe('impresión automática', () => {
  let app, cocina, caja, juan, mgr;
  before(async () => {
    cocina = await fakePrinter();
    caja = await fakePrinter();
    app = await start({ printing: { retryMs: [50] } });
    mgr = await login(app, 'u1');
    juan = await login(app, 'u3');
    assert.equal((await act(app, mgr, ['setConfig', printers(red(cocina.port), red(caja.port))])).status, 200);
  });
  after(async () => {
    await app.close();
    await cocina.close();
    await caja.close();
  });

  test('al enviar a cocina sale la comanda con lo nuevo, por tiempos', async () => {
    await act(app, juan, ['openTable', { id: 'o_imp0001', tableId: 1, waiterId: 'u3' }]);
    const menu = state(app).menu;
    const pepian = menu.find((m) => m.name === 'Pepián de pollo');
    await act(app, juan, ['addItem', 'o_imp0001', pepian, []]);
    await act(app, juan, ['setNote', 'o_imp0001', state(app).orders.at(-1).lines[0].id, 'Sin chile']);
    await act(app, juan, ['sendKitchen', 'o_imp0001', { userId: 'u3', label: 'Mesa 1' }]);
    await until(() => cocina.jobs.length === 1);
    const text = decode(cocina.jobs[0]);
    assert.match(text, /COMANDA #\d+/);
    assert.match(text, /\nMesa 1\n/);
    assert.match(text, /1 x Pepián de pollo/);
    assert.match(text, /-> Sin chile/);
    assert.equal(caja.jobs.length, 0);

    // El segundo envío solo trae lo nuevo
    await act(app, juan, ['addItem', 'o_imp0001', menu.find((m) => m.name === 'Cerveza Gallo'), []]);
    await act(app, juan, ['sendKitchen', 'o_imp0001', { userId: 'u3', label: 'Mesa 1' }]);
    await until(() => cocina.jobs.length === 2);
    assert.match(decode(cocina.jobs[1]), /Cerveza Gallo/);
    assert.doesNotMatch(decode(cocina.jobs[1]), /Pepián/);
  });

  test('anular algo ya enviado avisa a cocina', async () => {
    const o = state(app).orders.find((x) => x.id === 'o_imp0001');
    const line = o.lines.find((l) => l.name === 'Cerveza Gallo');
    await act(app, mgr, [
      'voidLine',
      {
        orderId: o.id,
        lineId: line.id,
        qty: 1,
        reason: 'Error de captura',
        userId: 'u1',
        authId: 'u1',
        label: 'Mesa 1',
      },
    ]);
    await until(() => cocina.jobs.length === 3);
    const text = decode(cocina.jobs[2]);
    assert.match(text, /ANULADO/);
    assert.match(text, /1 x Cerveza Gallo/);
    assert.match(text, /Motivo: Error de captura/);
  });

  test('cobrar en efectivo imprime el comprobante en caja y abre la gaveta', async () => {
    const o = state(app).orders.find((x) => x.id === 'o_imp0001');
    const sale = restaurantSale(state(app), o, { method: 'efectivo' });
    await act(app, juan, [
      'registerSale',
      sale,
      { orderId: o.id, paidQty: Object.fromEntries(o.lines.map((l) => [l.id, l.qty])) },
    ]);
    await until(() => caja.jobs.length === 1);
    const buf = caja.jobs[0];
    assert.ok(has(buf, CMD.drawer));
    const text = decode(buf);
    const n = state(app).sales.at(-1).number;
    assert.match(text, new RegExp(`Comprobante de venta No. ${String(n).padStart(6, '0')}`));
    assert.match(text, /Monarca Hotel Boutique/);
    assert.match(text, /Pepián de pollo/);
  });

  test('con tarjeta no abre la gaveta', async () => {
    const o = state(app).orders.find((x) => x.id === 'o1');
    const sale = restaurantSale(state(app), o, { method: 'tarjeta' });
    await act(app, juan, [
      'registerSale',
      sale,
      { orderId: o.id, paidQty: Object.fromEntries(o.lines.map((l) => [l.id, l.qty])) },
    ]);
    await until(() => caja.jobs.length === 2);
    assert.ok(!has(caja.jobs[1], CMD.drawer));
  });

  test('imprimir a pedido: precuenta (mesero) y permisos', async () => {
    const r = await call(app, 'POST', '/api/print', { token: juan, body: { doc: 'precuenta', id: 'o2' } });
    assert.equal(r.status, 200);
    await until(() => caja.jobs.length === 3);
    assert.match(decode(caja.jobs[2]), /PRECUENTA/);
    assert.equal(
      (await call(app, 'POST', '/api/print', { token: juan, body: { doc: 'folio', id: 'r1' } })).status,
      403,
    );
    assert.equal(
      (await call(app, 'POST', '/api/print', { token: juan, body: { doc: 'prueba', id: 'caja' } })).status,
      403,
    );
    const shopSale = state(app).sales.find((s) => s.kind === 'tienda');
    assert.equal(
      (await call(app, 'POST', '/api/print', { token: juan, body: { doc: 'ticket', id: shopSale.id } })).status,
      403,
    );
    const folio = await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'folio', id: 'r1' } });
    assert.equal(folio.status, 200);
    await until(() => caja.jobs.length === 4);
    assert.match(decode(caja.jobs[3]), /ESTADO DE CUENTA \W*HAB\. 101/);
  });

  test('cerrar la caja imprime el resumen del cierre', async () => {
    const report = {
      day: '2026-10-04',
      restTotal: 100,
      hotel: { collected: 0 },
      events: {},
      shop: {},
      tips: 0,
      discounts: 0,
      production: 100,
      byMethod: [],
      cash: { float: 0, cashSales: 0, entradas: 0, salidas: 0, expected: 0 },
    };
    await act(app, mgr, ['closeShift', { counted: 0, denominations: {}, userId: 'u1', authId: 'u1', report }]);
    await until(() => caja.jobs.some((b) => /CIERRE DE CAJA/.test(decode(b))));
  });
});

describe('cola con reintento', () => {
  test('impresora sin respuesta: el ticket espera, avisa y sale al reconectar', async () => {
    const port = await freePort();
    const app = await start({ printing: { retryMs: [40] } });
    const mgr = await login(app, 'u1');
    await act(app, mgr, ['setConfig', printers(red(port), { mode: 'simulada' })]);
    const r = await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'prueba', id: 'cocina' } });
    assert.equal(r.status, 200);
    await until(() => app.hotel.printing.status().printers.cocina.error);
    const st = app.hotel.printing.status();
    assert.equal(st.printers.cocina.pending, 1);
    assert.match(st.printers.cocina.error, /rechazó|no responde|red/);
    // Se conecta la impresora en ese puerto: el ticket sale solo
    const printer = await fakePrinter(port);
    await until(() => printer.jobs.length === 1);
    assert.match(decode(printer.jobs[0]), /PRUEBA DE IMPRESI/);
    await until(() => app.hotel.printing.status().printers.cocina.pending === 0);
    assert.equal(app.hotel.printing.status().printers.cocina.error, null);
    await app.close();
    await printer.close();
  });

  test('los tickets en espera sobreviven a un reinicio del NUC', async () => {
    const port = await freePort();
    const dbFile = join(dir, 'cola.db');
    let app = await start({ dbFile, printing: { retryMs: [60_000] } });
    const mgr = await login(app, 'u1');
    await act(app, mgr, ['setConfig', printers(red(port), { mode: 'simulada' })]);
    await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'prueba', id: 'cocina' } });
    await until(() => app.hotel.printing.status().printers.cocina.error);
    await app.close();
    const printer = await fakePrinter(port);
    app = await start({ dbFile, printing: { retryMs: [60_000] } });
    await until(() => printer.jobs.length === 1);
    await app.close();
    await printer.close();
  });

  test('descartar un ticket en espera, y "reintentar ahora"', async () => {
    const port = await freePort();
    const app = await start({ printing: { retryMs: [60_000] } });
    const mgr = await login(app, 'u1');
    const juan = await login(app, 'u3');
    await act(app, mgr, ['setConfig', printers(red(port), { mode: 'simulada' })]);
    await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'prueba', id: 'cocina' } });
    await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'prueba', id: 'cocina' } });
    await until(
      () =>
        app.hotel.printing.status().printers.cocina.pending === 2 && app.hotel.printing.status().printers.cocina.error,
    );
    const [newest, oldest] = app.hotel.printing.status().jobs;
    assert.equal(
      (await call(app, 'POST', '/api/printers/discard', { token: juan, body: { id: oldest.id } })).status,
      403,
    );
    assert.equal(
      (await call(app, 'POST', '/api/printers/discard', { token: mgr, body: { id: oldest.id } })).status,
      200,
    );
    const printer = await fakePrinter(port);
    // Con la espera larga no reintentaría sola en un minuto: "Reintentar ahora"
    await call(app, 'POST', '/api/printers/retry', { token: juan, body: { printer: 'cocina' } });
    await until(() => printer.jobs.length === 1);
    assert.equal(app.hotel.printing.status().jobs.find((j) => j.id === newest.id).status, 'impreso');
    await app.close();
    await printer.close();
  });

  test('modo simulado guarda el texto; apagada no imprime', async () => {
    const app = await start();
    const mgr = await login(app, 'u1');
    await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'precuenta', id: 'o2' } });
    const job = app.hotel.printing.status().jobs[0];
    assert.equal(job.status, 'simulado');
    assert.match(job.text, /PRECUENTA/);
    await act(app, mgr, ['setConfig', printers({ mode: 'apagada' }, { mode: 'apagada' })]);
    const r = await call(app, 'POST', '/api/print', { token: mgr, body: { doc: 'precuenta', id: 'o2' } });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /apagada/);
    await app.close();
  });
});
