// Qué se imprime solo, según lo que cambió con cada operación:
//   cocina · comanda al enviar, "marchar" al marchar un tiempo, aviso al anular algo ya enviado
//   caja   · comprobante de cada cobro o devolución (abre la gaveta si hubo efectivo), cierre de caja
import { anulacionTicket, cierreTicket, comandaTicket, printerConfig, saleTicket } from '../../../shared/tickets.js';

const byId = (arr, id) => arr?.find((x) => x.id === id);

export function autoJobs(prev, next, calls) {
  const cfg = printerConfig(next.config);
  const jobs = [];
  const kitchen = (ticket) => jobs.push({ printer: 'cocina', ticket, copies: cfg.kitchenCopies || 1 });

  for (const { name, args } of calls) {
    if (name === 'sendKitchen') {
      const order = byId(next.orders, args[0]);
      const before = byId(prev.orders, args[0]);
      if (!order) continue;
      // Lo que se acaba de enviar: líneas marcadas como enviadas que antes no lo estaban
      const lines = order.lines.filter((l) => l.sent && !byId(before?.lines, l.id)?.sent);
      if (!lines.length) continue;
      const held = [...new Set(lines.filter((l) => l.held).map((l) => l.course))];
      kitchen(comandaTicket(next, { order, lines, number: next.counters.comanda, held }));
    } else if (name === 'fireCourse') {
      const order = byId(next.orders, args[0]);
      const lines = order?.lines.filter((l) => l.course === args[1] && l.sent) || [];
      if (lines.length) kitchen(comandaTicket(next, { order, lines, march: args[1] }));
    } else if (name === 'voidLine') {
      const { orderId, lineId, qty, reason } = args[0] || {};
      const order = byId(prev.orders, orderId);
      const line = byId(order?.lines, lineId);
      if (line?.sent) kitchen(anulacionTicket(next, { order, name: line.name, qty, reason }));
    }
  }

  // Cobros y devoluciones nuevos (se agregan al final de la lista de ventas)
  if (cfg.autoReceipt && prev.sales !== next.sales) {
    const known = new Set(prev.sales.slice(-100).map((s) => s.id));
    for (const sale of next.sales.slice(-20))
      if (!known.has(sale.id) && !prev.sales.some((s) => s.id === sale.id)) {
        const ticket = saleTicket(next, sale, { logo: cfg.logo });
        jobs.push({ printer: 'caja', ticket, drawer: cfg.openDrawer && ticket.drawer });
      }
  }

  // Cierre de caja
  const closed = next.shiftHistory?.[0];
  if (closed && closed !== prev.shiftHistory?.[0] && !prev.shiftHistory?.some((s) => s.id === closed.id))
    jobs.push({ printer: 'caja', ticket: cierreTicket(next, closed) });

  return jobs;
}
