// Tickets para las impresoras térmicas (3nstar RPT004, 80 mm, 48 columnas).
// Cada ticket es una lista de bloques de texto; el servidor los convierte a ESC/POS y, en modo
// simulado, a texto plano para verlos en pantalla. Mismo contenido que los documentos de print/Docs.jsx.
import { COURSES, METHOD_LABELS } from './data.js';
import { fmtDate, fmtDateTime, fmtTime } from './dates.js';
import { folio as calcFolio, groupText } from './hotel.js';
import { linesTotal, makeFmt, round2 } from './money.js';
import { modsText, orderLabel } from './orders.js';

// Impresoras del hotel. mode: red (IP:puerto), usb (dispositivo en el NUC), simulada (solo en pantalla)
// o apagada. La configuración vive en config.printers; lo que falte toma estos valores.
export const PRINTER_NAMES = { cocina: 'Cocina', caja: 'Caja' };
export const PRINTER_MODES = { red: 'Red (IP)', usb: 'USB', simulada: 'Simulada', apagada: 'Apagada' };
const DEFAULTS = {
  cocina: { mode: 'simulada', host: '', port: 9100, device: '/dev/usb/lp0', columns: 48 },
  caja: { mode: 'simulada', host: '', port: 9100, device: '/dev/usb/lp0', columns: 48 },
  autoReceipt: true, // comprobante al cobrar
  openDrawer: true, // abrir la gaveta al cobrar en efectivo
  kitchenCopies: 1,
  logo: false, // logo guardado en la memoria de la impresora (FS p)
};
export function printerConfig(config = {}) {
  const p = config.printers || {};
  return {
    ...DEFAULTS,
    ...p,
    cocina: { ...DEFAULTS.cocina, ...p.cocina },
    caja: { ...DEFAULTS.caja, ...p.caja },
  };
}

// ----- Bloques
class Ticket {
  constructor(title) {
    this.title = title; // para la cola de impresión
    this.blocks = [];
    this.drawer = false;
  }
  add(b) {
    this.blocks.push(b);
    return this;
  }
  logo() {
    return this.add({ t: 'logo' });
  }
  // Título: letra doble (alto y ancho), centrada
  big(text) {
    return this.add({ t: 'text', text, wide: true, big: true, bold: true, align: 'center' });
  }
  center(text, { bold = false } = {}) {
    return this.add({ t: 'text', text, bold, align: 'center' });
  }
  text(text, { bold = false, big = false, indent = 0 } = {}) {
    return this.add({ t: 'text', text, bold, big, indent });
  }
  row(left, right = '', { bold = false } = {}) {
    return this.add({ t: 'row', left: String(left), right: String(right), bold });
  }
  sep(char = '-') {
    return this.add({ t: 'sep', char });
  }
  feed(n = 1) {
    return this.add({ t: 'feed', n });
  }
}

const userName = (state, id) => state.users.find((u) => u.id === id)?.name || '—';
const pad6 = (n) => String(n).padStart(6, '0');

function header(t, state, { logo }) {
  const c = state.config;
  if (logo) t.logo();
  else t.big(c.businessName || 'Monarca Hotel Boutique');
  if (c.legalName) t.center(c.legalName);
  if (c.nit) t.center('NIT ' + c.nit);
  if (c.address) t.center(c.address);
  if (c.phone) t.center('Tel. ' + c.phone);
  return t.sep('=');
}

const lineText = (l, { mods = true } = {}) =>
  `${l.qty} x ${l.name}` +
  (mods && l.mods?.length ? ` · ${modsText(l.mods)}` : '') +
  (l.note ? ` (${l.note})` : '') +
  (l.courtesy ? ' · cortesía' : '');

// ----- Cocina
// Comanda agrupada por tiempos, con letra alta para leer de lejos.
// held: tiempos que esperan a que el mesero los marche. march: solo marchar ese tiempo.
export function comandaTicket(state, { order, lines, number, held = [], march = null }) {
  const label = orderLabel(order, state.tables);
  const t = new Ticket(march ? `Marchar ${COURSES[march]} · ${label}` : `Comanda #${number} · ${label}`);
  t.big(march ? `MARCHAR ${COURSES[march].toUpperCase()}` : `COMANDA #${number}`);
  t.big(label);
  t.row(`Mesero: ${userName(state, order.waiterId)}`, fmtTime(Date.now()));
  if (order.customer) t.text(`Cliente: ${order.customer}`);
  const groups = [
    ...Object.keys(COURSES).map((c) => ({ key: c, title: COURSES[c], lines: lines.filter((l) => l.course === c) })),
    { key: 'otros', title: 'Sin tiempo', lines: lines.filter((l) => !l.course) },
  ].filter((g) => g.lines.length);
  const titled = groups.length > 1 || groups[0]?.key !== 'otros';
  for (const g of groups) {
    t.sep();
    if (titled)
      t.text(`${g.title.toUpperCase()}${held.includes(g.key) ? ' · EN ESPERA' : march ? ' · YA' : ''}`, {
        bold: true,
      });
    for (const l of g.lines) {
      t.text(`${l.qty} x ${l.name}`, { big: true, bold: true });
      for (const m of l.mods || []) t.text(`+ ${m.name}`, { indent: 4 });
      if (l.note) t.text(`-> ${l.note}`, { indent: 4, bold: true });
    }
  }
  return t.sep().feed();
}

// Aviso a cocina: un platillo ya enviado se anuló (para no prepararlo)
export function anulacionTicket(state, { order, name, qty, reason }) {
  const label = order ? orderLabel(order, state.tables) : '';
  const t = new Ticket(`Anulación · ${label}`);
  t.big('*** ANULADO ***');
  t.big(label);
  t.row(`Mesero: ${order ? userName(state, order.waiterId) : '—'}`, fmtTime(Date.now()));
  t.sep();
  t.text(`${qty} x ${name}`, { big: true, bold: true });
  if (reason) t.text(`Motivo: ${reason}`);
  return t.sep().feed();
}

// ----- Caja
export function saleTicket(state, sale, { logo = false } = {}) {
  const fmt = makeFmt(state.config.currency);
  const hotel = sale.kind === 'hotel';
  const kind =
    sale.docType === 'recibo'
      ? 'Recibo'
      : sale.docType === 'devolucion'
        ? 'Comprobante de devolución'
        : 'Comprobante de venta';
  const t = new Ticket(`${kind} #${sale.number} · ${sale.ref || ''}`);
  header(t, state, { logo });
  t.center(`${kind} No. ${pad6(sale.number)}`, { bold: true });
  if (sale.docType === 'recibo') t.center('Se aplicará en el comprobante de salida');
  if (sale.status === 'anulada') t.center(`ANULADA · ${sale.voidReason || ''}`, { bold: true });
  t.sep();
  t.row('Fecha', fmtDateTime(sale.ts));
  const refLabel = hotel
    ? 'Habitación'
    : sale.kind === 'evento'
      ? 'Evento'
      : sale.kind === 'tienda'
        ? 'Venta'
        : 'Cuenta';
  if (sale.ref) t.row(refLabel, sale.ref);
  if (sale.kind === 'restaurante' && sale.waiterId) t.row('Atendió', userName(state, sale.waiterId));
  if (sale.invoice) {
    t.row('Factura a nombre de', sale.invoice.name || '');
    t.row('NIT', sale.invoice.nit || '');
  }
  t.sep();
  for (const l of sale.lines) t.row(lineText(l), fmt(l.price * l.qty));
  t.sep();
  if (sale.discount) {
    t.row('Subtotal', fmt(sale.subtotal));
    t.row(`Descuento ${sale.discount.label}`, '- ' + fmt(sale.discount.amount));
  }
  if (sale.credits > 0) {
    t.row(hotel ? 'Total estancia' : 'Total del evento', fmt(sale.subtotal));
    t.row('Anticipos y abonos', '- ' + fmt(sale.credits));
  }
  t.row(sale.credits > 0 ? 'SALDO PAGADO' : 'TOTAL', fmt(sale.total), { bold: true });
  if (sale.tip > 0) {
    t.row('Propina', fmt(sale.tip));
    t.row('TOTAL PAGADO', fmt(sale.grand), { bold: true });
  }
  t.sep();
  for (const p of sale.payments)
    t.row(
      METHOD_LABELS[p.method] + (p.roomN ? ' ' + p.roomN : '') + (p.ref ? ' · ' + p.ref : ''),
      fmt(p.amount + (p.method === 'efectivo' ? sale.change || 0 : 0)),
    );
  if (sale.change > 0) t.row('Cambio', fmt(sale.change), { bold: true });
  t.sep();
  if (state.config.footer) t.center(state.config.footer);
  t.drawer = sale.payments.some((p) => p.method === 'efectivo' && p.amount > 0);
  return t.feed();
}

export function precuentaTicket(state, order, { logo = false } = {}) {
  const fmt = makeFmt(state.config.currency);
  const label = orderLabel(order, state.tables);
  const t = new Ticket(`Precuenta · ${label}`);
  header(t, state, { logo });
  t.center('PRECUENTA', { bold: true });
  t.center('No es un comprobante de pago');
  t.sep();
  t.row(label, fmtDateTime(Date.now()));
  t.row('Atendió', userName(state, order.waiterId));
  t.sep();
  for (const l of order.lines) t.row(lineText(l), fmt(l.price * l.qty));
  t.sep();
  const total = linesTotal(order.lines);
  const tip = round2((total * (state.config.tipPct || 0)) / 100);
  t.row('TOTAL', fmt(total), { bold: true });
  if (tip > 0) {
    t.row(`Propina sugerida (${state.config.tipPct}%)`, fmt(tip));
    t.row('Total con propina', fmt(total + tip));
  }
  return t.feed();
}

export function folioTicket(state, res, { logo = false } = {}) {
  const fmt = makeFmt(state.config.currency);
  const f = calcFolio(res, state);
  const t = new Ticket(`Estado de cuenta · Hab. ${res.roomN}`);
  header(t, state, { logo });
  t.center(`ESTADO DE CUENTA · HAB. ${res.roomN}`, { bold: true });
  t.sep();
  t.row('Huésped', res.guest.name);
  t.row('Estancia', `${fmtDate(res.checkIn)} - ${fmtDate(res.checkOut)}`);
  t.sep();
  if (f.periods) for (const p of f.periods) t.row(`Mes ${p.n}${p.frac < 1 ? ' (prorrateo)' : ''}`, fmt(p.amount));
  else for (const g of f.groups) t.row(`Hospedaje ${groupText(g, fmt)}`, fmt(g.amount));
  for (const c of res.charges) t.row(c.desc, fmt(c.amt));
  t.row('Total cargos', fmt(f.total), { bold: true });
  for (const p of res.payments) t.row(`${p.desc} · ${METHOD_LABELS[p.method]}`, '- ' + fmt(p.amount));
  t.sep();
  t.row('SALDO', fmt(f.balance), { bold: true });
  if (f.dueToday !== null) t.row('Pendiente a hoy', fmt(Math.max(0, f.dueToday)), { bold: true });
  return t.feed();
}

// Resumen del cierre de caja (el reporte completo se imprime en carta desde la computadora)
export function cierreTicket(state, shift) {
  const fmt = makeFmt(state.config.currency);
  const r = shift.report;
  const t = new Ticket(`Cierre de caja · ${fmtDate(r.day)}`);
  t.big('CIERRE DE CAJA');
  t.center(fmtDate(r.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  t.row('Abrió', `${userName(state, shift.openedBy)} ${fmtTime(shift.openedAt)}`);
  if (shift.closedAt) t.row('Cerró', `${userName(state, shift.closedBy)} ${fmtTime(shift.closedAt)}`);
  t.sep();
  t.text('PRODUCCIÓN', { bold: true });
  t.row('Restaurante', fmt(r.restTotal));
  t.row('Hospedaje cobrado', fmt(r.hotel.collected));
  t.row('Eventos', fmt(r.events?.collected));
  t.row('Tienda', fmt(r.shop?.total));
  t.row('Propinas', fmt(r.tips));
  t.row('Descuentos', fmt(r.discounts));
  t.row('Producción total', fmt(r.production), { bold: true });
  t.sep();
  t.text('COBROS POR FORMA DE PAGO', { bold: true });
  for (const m of r.byMethod) t.row(`${m.label} (${m.count})`, fmt(m.amount));
  t.sep();
  t.text('EFECTIVO', { bold: true });
  t.row('Fondo inicial', fmt(r.cash.float));
  t.row('Ventas en efectivo', fmt(r.cash.cashSales));
  t.row('Entradas', fmt(r.cash.entradas));
  t.row('Salidas', '- ' + fmt(r.cash.salidas));
  t.row('Esperado', fmt(r.cash.expected), { bold: true });
  if (shift.closedAt) {
    t.row('Contado', fmt(shift.counted));
    t.row('Diferencia', fmt(shift.difference), { bold: true });
    if (shift.differenceNote) t.text(`Nota: ${shift.differenceNote}`);
  }
  t.feed(2);
  t.row('________________', '________________');
  t.row('Cajero', 'Gerente');
  return t.feed();
}

export function pruebaTicket(state, name) {
  const t = new Ticket(`Prueba · ${PRINTER_NAMES[name] || name}`);
  t.big('PRUEBA DE IMPRESIÓN');
  t.center(`Impresora: ${PRINTER_NAMES[name] || name}`);
  t.center(fmtDateTime(Date.now()));
  t.sep();
  t.text('Acentos: á é í ó ú ñ Ñ ü ¿? ¡!');
  t.row('Texto a la izquierda', 'Q 1,234.50');
  t.text('Letra alta', { big: true, bold: true });
  t.sep();
  t.center(state.config.businessName || 'Monarca');
  return t.feed();
}

// ----- Texto plano (modo simulado y pruebas)
const fit = (s, n) => (s.length > n ? s.slice(0, n) : s);
export function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out;
}
// Fila izquierda/derecha: si no cabe, la izquierda baja de línea y el monto queda a la derecha
export function rowLines(left, right, width) {
  if (!right) return wrap(left, width);
  const room = width - right.length - 1;
  const lines = wrap(left, Math.max(8, room));
  const last = lines.pop();
  if (last.length <= room) return [...lines, last + ' '.repeat(width - last.length - right.length) + right];
  return [...lines, last, ' '.repeat(Math.max(0, width - right.length)) + right];
}
export function ticketText(ticket, width = 48) {
  const out = [];
  for (const b of ticket.blocks) {
    if (b.t === 'sep') out.push(b.char.repeat(width));
    else if (b.t === 'feed') for (let i = 0; i < b.n; i++) out.push('');
    else if (b.t === 'logo') out.push('[logo]');
    else if (b.t === 'row') out.push(...rowLines(b.left, b.right, width));
    else {
      // La letra doble ancha ocupa dos columnas por carácter
      const cols = b.wide ? Math.floor(width / 2) : width;
      for (const l of wrap(b.text, cols - (b.indent || 0))) {
        const s = ' '.repeat(b.indent || 0) + l;
        out.push(
          b.align === 'center' ? ' '.repeat(Math.max(0, Math.floor((width - s.length) / 2))) + s : fit(s, width),
        );
      }
    }
  }
  return out.join('\n');
}
