// Recetas para store.update(d => A.algo(d, ...)). Modifican el borrador directamente.
import { today, uid } from '../lib/dates.js';
import { sameLine, unitPrice } from '../lib/orders.js';
import { placed } from '../lib/tablemap.js';

const byId = (arr, id, key = 'id') => arr.find((x) => x[key] === id);

export { orderLabel } from '../lib/orders.js';

// Movimiento de inventario por la receta de un platillo (consumo al enviar a cocina o devolución)
function applyRecipe(d, mid, qty, sign, { type, note, userId }) {
  const m = byId(d.menu, mid);
  for (const r of m?.recipe || []) {
    const it = byId(d.inventory, r.itemId);
    if (!it) continue;
    const q = Math.round(r.qty * qty * 1000) / 1000;
    it.stock = Math.max(0, Math.round((it.stock + sign * q) * 1000) / 1000);
    d.invMoves.push({ id: uid('im'), ts: Date.now(), itemId: it.id, type, qty: q, note, userId, after: it.stock });
  }
}

export const A = {
  // Sesión
  login(d, userId) {
    d.session = { userId };
  },
  logout(d) {
    d.session = null;
  },

  // Restaurante
  openTable(d, { id, tableId, guests, waiterId }) {
    byId(d.tables, tableId).reservedAt = null;
    d.orders.push({ id, type: 'mesa', tableId, guests, waiterId, openedAt: Date.now(), lines: [] });
  },
  openTakeout(d, { id, customer, waiterId }) {
    d.counters.llevar++;
    d.orders.push({
      id,
      type: 'llevar',
      number: d.counters.llevar,
      customer,
      guests: 1,
      waiterId,
      openedAt: Date.now(),
      lines: [],
    });
  },
  closeOrder(d, orderId) {
    d.orders = d.orders.filter((o) => o.id !== orderId);
  },
  // mods: modificadores elegidos [{ group, name, price }]
  addItem(d, orderId, m, mods = []) {
    const o = byId(d.orders, orderId);
    const ex = o.lines.find((l) => sameLine(l, m.id, mods));
    if (ex) ex.qty++;
    else
      o.lines.push({
        id: uid('l'),
        mid: m.id,
        name: m.name,
        cat: m.cat,
        basePrice: m.price,
        mods,
        price: unitPrice(m.price, mods),
        qty: 1,
        note: '',
        sent: false,
      });
  },
  // Cortesía: el platillo se cobra en Q0; queda registrado el motivo y quién autorizó
  setCourtesy(d, orderId, lineId, courtesy) {
    const l = byId(byId(d.orders, orderId).lines, lineId);
    if (courtesy) {
      l.courtesy = { ...courtesy, price: l.courtesy?.price ?? l.price, ts: Date.now() };
      l.price = 0;
    } else if (l.courtesy) {
      l.price = l.courtesy.price;
      delete l.courtesy;
    }
  },
  setOrderWaiter(d, orderId, waiterId) {
    byId(d.orders, orderId).waiterId = waiterId;
  },
  // Une la cuenta de otra mesa a esta: pasan sus platillos y personas, y su mesa queda unida
  joinOrders(d, targetId, sourceId) {
    const t = byId(d.orders, targetId);
    const s = byId(d.orders, sourceId);
    t.lines.push(...s.lines);
    t.guests += s.guests;
    t.joined = [...(t.joined || []), s.tableId, ...(s.joined || [])];
    d.orders = d.orders.filter((o) => o.id !== sourceId);
  },
  // Pasa platillos a otra mesa. qtys: { lineId: cantidad }. Si la mesa está libre, se abre.
  transferLines(d, fromId, qtys, { toOrderId, newOrder }) {
    const from = byId(d.orders, fromId);
    if (newOrder) {
      byId(d.tables, newOrder.tableId).reservedAt = null;
      d.orders.push({ type: 'mesa', openedAt: Date.now(), lines: [], ...newOrder });
    }
    const to = byId(d.orders, toOrderId || newOrder.id);
    for (const l of from.lines) {
      const q = qtys[l.id] || 0;
      if (!q) continue;
      to.lines.push({ ...l, id: uid('l'), qty: q });
      l.qty -= q;
    }
    from.lines = from.lines.filter((l) => l.qty > 0);
    if (!from.lines.length) d.orders = d.orders.filter((o) => o.id !== fromId);
  },
  changeQty(d, orderId, lineId, delta) {
    const o = byId(d.orders, orderId);
    const l = byId(o.lines, lineId);
    l.qty += delta;
    o.lines = o.lines.filter((x) => x.qty > 0);
  },
  setNote(d, orderId, lineId, note) {
    const o = byId(d.orders, orderId);
    byId(o.lines, lineId).note = note;
  },
  // returnStock: el platillo no se preparó, sus insumos regresan al inventario
  voidLine(d, { orderId, lineId, qty, reason, userId, authId, label, returnStock = false }) {
    const o = byId(d.orders, orderId);
    const l = byId(o.lines, lineId);
    d.voids.push({
      id: uid('v'),
      shiftId: d.shift?.id,
      ts: Date.now(),
      ref: label,
      name: l.name,
      qty,
      amount: l.price * qty,
      reason,
      userId,
      authId,
    });
    if (returnStock && l.sent)
      applyRecipe(d, l.mid, qty, +1, { type: 'devolucion', note: `Anulado sin preparar · ${label}`, userId });
    l.qty -= qty;
    o.lines = o.lines.filter((x) => x.qty > 0);
  },
  // Envía lo pendiente a cocina y descuenta los insumos de las recetas
  sendKitchen(d, orderId, { userId, label } = {}) {
    d.counters.comanda++;
    for (const l of byId(d.orders, orderId).lines) {
      if (l.sent) continue;
      l.sent = true;
      applyRecipe(d, l.mid, l.qty, -1, {
        type: 'consumo',
        note: `Comanda #${d.counters.comanda} · ${label || ''}`,
        userId,
      });
    }
  },
  moveOrder(d, orderId, tableId) {
    byId(d.tables, tableId).reservedAt = null;
    byId(d.orders, orderId).tableId = tableId;
  },

  // Registra un cobro. paidQty: { lineId: cantidad } para cobros parciales (cuenta dividida)
  registerSale(d, sale, { orderId, paidQty } = {}) {
    d.counters.doc = sale.number;
    d.sales.push(sale);
    for (const p of sale.payments) {
      if (p.method === 'habitacion') {
        byId(d.reservations, p.resId).charges.push({
          id: uid('c'),
          ts: sale.ts,
          desc:
            sale.kind === 'tienda'
              ? `Tienda de recepción · Ticket #${sale.number}`
              : `Restaurante · ${sale.ref} · Ticket #${sale.number}`,
          amt: p.amount,
          saleId: sale.id,
          type: sale.kind,
        });
      }
    }
    // Venta de la tienda: descuenta existencias
    if (sale.kind === 'tienda') {
      for (const l of sale.lines) {
        const it = byId(d.shopItems, l.itemId);
        if (!it) continue;
        it.stock = Math.max(0, it.stock - l.qty);
        d.shopMoves.push({
          id: uid('sm'),
          ts: sale.ts,
          itemId: it.id,
          type: 'venta',
          qty: l.qty,
          note: `Ticket #${sale.number}`,
          userId: sale.cashierId,
          after: it.stock,
          saleId: sale.id,
        });
      }
    }
    if (orderId) {
      const o = byId(d.orders, orderId);
      for (const l of o.lines) l.qty -= paidQty[l.id] || 0;
      o.lines = o.lines.filter((l) => l.qty > 0);
      if (!o.lines.length) d.orders = d.orders.filter((x) => x.id !== orderId);
    }
  },
  // La factura se emite fuera del sistema; aquí solo se anota su número
  markInvoiced(d, saleId, { number, userId }) {
    Object.assign(byId(d.sales, saleId).invoice, { number, invoicedAt: Date.now(), invoicedBy: userId });
  },
  voidSale(d, saleId, { reason, authId }) {
    const s = byId(d.sales, saleId);
    s.status = 'anulada';
    s.voidReason = reason;
    s.voidedAt = Date.now();
    s.voidAuth = authId;
    for (const r of d.reservations) r.charges = r.charges.filter((c) => c.saleId !== saleId);
    // Anular una venta de tienda regresa los productos a existencia
    if (s.kind === 'tienda') {
      for (const l of s.lines) {
        const it = byId(d.shopItems, l.itemId);
        if (!it) continue;
        it.stock += l.qty;
        d.shopMoves.push({
          id: uid('sm'),
          ts: Date.now(),
          itemId: it.id,
          type: 'devolucion',
          qty: l.qty,
          note: `Anulación ticket #${s.number}`,
          userId: authId,
          after: it.stock,
          saleId,
        });
      }
    }
  },

  // Hotel
  // Guarda la reserva y mantiene al día la ficha del huésped (la crea si es nuevo)
  saveReservation(d, res) {
    if (res.guest) {
      d.guests ||= [];
      let g = res.guestId && byId(d.guests, res.guestId);
      if (!g) {
        g = { id: uid('gst'), notes: '', createdAt: Date.now() };
        d.guests.push(g);
      }
      const { name, phone, email, doc, nationality } = res.guest;
      Object.assign(g, { name, phone, email, doc, nationality });
      res = { ...res, guestId: g.id };
    }
    const i = d.reservations.findIndex((r) => r.id === res.id);
    if (i >= 0) d.reservations[i] = { ...d.reservations[i], ...res };
    else d.reservations.push(res);
  },
  saveGuest(d, guest) {
    A.upsert(d, 'guests', guest);
    // Las reservas activas toman los datos actualizados de la ficha
    for (const r of d.reservations)
      if (r.guestId === guest.id && (r.status === 'reservada' || r.status === 'hospedado'))
        Object.assign(r.guest, {
          name: guest.name,
          phone: guest.phone,
          email: guest.email,
          doc: guest.doc,
          nationality: guest.nationality,
        });
  },
  // Cambio de habitación de un huésped hospedado. La anterior queda sucia y en el historial.
  // newRate (opcional): tarifa fija desde hoy; si la reserva es automática, el precio sigue al tipo de habitación.
  changeRoom(d, resId, { roomN, newRate, userId }) {
    const r = byId(d.reservations, resId);
    const date = today();
    r.roomHistory = [...(r.roomHistory || []), { roomN: r.roomN, until: date, userId }];
    byId(d.rooms, r.roomN, 'n').hk = 'sucia';
    r.roomN = roomN;
    if (newRate && r.pricing !== 'auto') r.rateChanges = [...(r.rateChanges || []), { from: date, rate: newRate }];
  },
  // Mover o extender una reserva (arrastrar en el calendario)
  moveReservation(d, resId, { roomN, checkIn, checkOut }) {
    Object.assign(byId(d.reservations, resId), { roomN, checkIn, checkOut });
  },
  // No-show o cancelación: refund (opcional) es la venta de devolución del anticipo, con monto negativo
  closeReservation(d, resId, { status, reason, refund, userId }) {
    const r = byId(d.reservations, resId);
    r.status = status;
    r.cancelReason = reason;
    r.closedBy = userId;
    if (refund) {
      d.counters.doc = refund.number;
      d.sales.push(refund);
      const p = refund.payments[0];
      r.payments.push({
        id: uid('p'),
        ts: refund.ts,
        method: p.method,
        amount: p.amount,
        desc: 'Devolución de anticipo',
        saleId: refund.id,
      });
    }
  },
  // Guarda los datos confirmados al llegar y registra la entrada en una sola operación
  checkInWith(d, res) {
    A.saveReservation(d, res);
    A.checkIn(d, res.id);
  },
  checkIn(d, resId) {
    const r = byId(d.reservations, resId);
    r.status = 'hospedado';
    r.checkedInAt = Date.now();
  },
  cancelReservation(d, resId, reason) {
    const r = byId(d.reservations, resId);
    r.status = 'cancelada';
    r.cancelReason = reason;
  },
  addCharge(d, resId, { desc, amt }) {
    byId(d.reservations, resId).charges.push({ id: uid('c'), ts: Date.now(), desc, amt, type: 'extra' });
  },
  removeCharge(d, resId, chargeId) {
    const r = byId(d.reservations, resId);
    r.charges = r.charges.filter((c) => c.id !== chargeId);
  },
  // Abono o liquidación: crea la venta (para caja) y el pago en el folio
  addFolioPayment(d, resId, sale) {
    d.counters.doc = sale.number;
    d.sales.push(sale);
    const r = byId(d.reservations, resId);
    for (const p of sale.payments)
      r.payments.push({
        id: uid('p'),
        ts: sale.ts,
        method: p.method,
        amount: p.amount,
        desc: sale.lines[0]?.name || 'Pago',
        saleId: sale.id,
      });
  },
  checkOut(d, resId) {
    const r = byId(d.reservations, resId);
    r.status = 'salida';
    r.checkedOutAt = Date.now();
    r.checkedOutOn = today();
    byId(d.rooms, r.roomN, 'n').hk = 'sucia';
  },
  // Check-out con su cobro final (sale puede ser null si la cuenta ya está saldada)
  checkOutWith(d, resId, sale) {
    if (sale) A.addFolioPayment(d, resId, sale);
    A.checkOut(d, resId);
  },
  setHk(d, roomN, hk) {
    byId(d.rooms, roomN, 'n').hk = hk;
  },

  // Eventos
  saveEvent(d, ev) {
    const i = d.events.findIndex((e) => e.id === ev.id);
    if (i >= 0) d.events[i] = { ...d.events[i], ...ev };
    else d.events.push(ev);
  },
  setEventStatus(d, id, status) {
    byId(d.events, id).status = status;
  },
  addEventPayment(d, eventId, sale) {
    d.counters.doc = sale.number;
    d.sales.push(sale);
    const ev = byId(d.events, eventId);
    for (const p of sale.payments)
      ev.payments.push({
        id: uid('ep'),
        ts: sale.ts,
        method: p.method,
        amount: p.amount,
        desc: sale.lines[0]?.name || 'Pago',
        saleId: sale.id,
      });
  },

  // Inventario: entrada suma, salida y merma restan, ajuste fija la existencia contada
  // coll / movesColl: 'inventory' + 'invMoves' (restaurante) o 'shopItems' + 'shopMoves' (tienda)
  invMove(d, { itemId, type, qty, note, userId }, coll = 'inventory', movesColl = 'invMoves') {
    const it = byId(d[coll], itemId);
    const q = Number(qty);
    it.stock = Math.max(
      0,
      Math.round((type === 'entrada' ? it.stock + q : type === 'ajuste' ? q : it.stock - q) * 1000) / 1000,
    );
    d[movesColl].push({ id: uid('im'), ts: Date.now(), itemId, type, qty: q, note, userId, after: it.stock });
  },

  // Caja
  openShift(d, { float, userId }) {
    d.shift = { id: uid('sh'), openedAt: Date.now(), openedBy: userId, float, movements: [] };
  },
  addMovement(d, { type, amount, reason, userId }) {
    d.shift.movements.push({ id: uid('mv'), ts: Date.now(), type, amount, reason, userId });
  },
  closeShift(d, { counted, denominations, userId, report }) {
    const s = d.shift;
    Object.assign(s, {
      closedAt: Date.now(),
      closedBy: userId,
      counted,
      denominations,
      difference: Math.round((counted - report.cash.expected) * 100) / 100,
      report,
    });
    d.shiftHistory.unshift(s);
    d.shift = null;
  },

  // Administración
  upsert(d, coll, item, key = 'id') {
    const i = d[coll].findIndex((x) => x[key] === item[key]);
    if (i >= 0) d[coll][i] = { ...d[coll][i], ...item };
    else d[coll].push(item);
  },
  remove(d, coll, value, key = 'id') {
    d[coll] = d[coll].filter((x) => x[key] !== value);
  },
  setConfig(d, patch) {
    Object.assign(d.config, patch);
  },
  removeModifierGroup(d, id) {
    d.modifierGroups = d.modifierGroups.filter((g) => g.id !== id);
    for (const m of d.menu) m.modGroups = (m.modGroups || []).filter((g) => g !== id);
  },
  addCategory(d, name) {
    if (!d.categories.includes(name)) d.categories.push(name);
  },
  removeCategory(d, name) {
    d.categories = d.categories.filter((c) => c !== name);
  },
  saveRoom(d, room) {
    A.upsert(d, 'rooms', room, 'n');
    d.rooms.sort((a, b) => a.n.localeCompare(b.n));
  },

  // Mapa de mesas
  addTable(d, table) {
    d.tables.push(table);
  },
  addMapDecor(d, item) {
    d.mapDecor.push(item);
  },
  moveMapItem(d, kind, id, x, y) {
    if (kind === 'table') {
      const i = d.tables.findIndex((t) => t.id === id);
      d.tables[i] = { ...placed(d.tables[i], i), x, y };
    } else {
      Object.assign(byId(d.mapDecor, id), { x, y });
    }
  },
  renameCategory(d, from, to) {
    d.categories = d.categories.map((c) => (c === from ? to : c));
    for (const m of d.menu) if (m.cat === from) m.cat = to;
  },
};
