// Recetas para store.update(d => A.algo(d, ...)). Modifican el borrador directamente.
import { addDays, today, uid } from './dates.js';
import { isAvailable } from './hotel.js';
import { isHeldOnSend, orderLabel, sameLine, unitPrice } from './orders.js';
import { placed } from './tablemap.js';
import { COURSES } from './data.js';

const byId = (arr, id, key = 'id') => arr.find((x) => x[key] === id);

// Error de negocio: el mensaje se muestra tal cual a quien hizo la operación
export class ActionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActionError';
  }
}
const fail = (msg) => {
  throw new ActionError(msg);
};
// Busca un registro que la acción necesita; si ya no existe (otro dispositivo lo cerró), avisa
const need = (arr, id, what, key = 'id') => byId(arr, id, key) || fail(`${what} ya no existe. Actualiza la pantalla.`);

// Registra una venta con el siguiente número de ticket. El número lo asigna quien guarda la venta
// (el servidor), así dos cajas cobrando al mismo tiempo nunca repiten número.
function pushSale(d, sale) {
  if (!d.shift) fail('La caja está cerrada. Abre la caja para cobrar.');
  const s = { ...sale, number: d.counters.doc + 1 };
  d.counters.doc = s.number;
  d.sales.push(s);
  return s;
}

export { orderLabel } from './orders.js';

const money = (d, n) => `${d.config.currency} ${Number(n || 0).toFixed(2)}`;

// Bitácora: deja constancia de las operaciones sensibles (quién, cuándo, qué y quién autorizó)
function audit(d, type, { ref = '', detail = '', amount = null, authId = null, userId } = {}) {
  d.audit ||= [];
  d.audit.push({
    id: uid('au'),
    ts: Date.now(),
    type,
    userId: userId ?? d.session?.userId ?? null,
    authId: authId && authId !== (userId ?? d.session?.userId) ? authId : null,
    ref,
    detail,
    amount,
  });
}

// Campos de precio que se vigilan al editar catálogos
const PRICE_FIELDS = {
  menu: [['price', 'precio']],
  shopItems: [
    ['price', 'precio'],
    ['cost', 'costo'],
  ],
  inventory: [['cost', 'costo']],
  roomTypes: [
    ['rate', 'tarifa por noche'],
    ['monthlyRate', 'tarifa mensual'],
  ],
  venues: [['price', 'renta']],
  eventMenus: [['price', 'precio por persona']],
};
const CATALOG_LABELS = {
  menu: 'Menú',
  shopItems: 'Tienda',
  inventory: 'Inventario',
  roomTypes: 'Habitaciones',
  venues: 'Salones',
  eventMenus: 'Menús de eventos',
};

// Movimiento de inventario por la receta de un platillo (consumo al enviar a cocina o devolución)
function applyRecipe(d, mid, qty, sign, { type, note, userId }) {
  const m = byId(d.menu, mid);
  for (const r of m?.recipe || []) {
    const it = byId(d.inventory, r.itemId);
    if (!it) continue;
    const q = Math.round(r.qty * qty * 1000) / 1000;
    it.stock = Math.max(0, Math.round((it.stock + sign * q) * 1000) / 1000);
    d.invMoves.push({
      id: uid('im'),
      ts: Date.now(),
      itemId: it.id,
      type,
      qty: q,
      note,
      userId,
      after: it.stock,
    });
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
  openTable(d, { id, tableId, waiterId }) {
    const t = need(d.tables, tableId, 'La mesa');
    if (d.orders.some((o) => o.type === 'mesa' && (o.tableId === tableId || o.joined?.includes(tableId))))
      fail(`${t.name} ya tiene una cuenta abierta`);
    t.reservedAt = null;
    d.orders.push({
      id,
      type: 'mesa',
      tableId,
      waiterId,
      openedAt: Date.now(),
      lines: [],
    });
  },
  openTakeout(d, { id, customer, waiterId }) {
    d.counters.llevar++;
    d.orders.push({
      id,
      type: 'llevar',
      number: d.counters.llevar,
      customer: customer || '',
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
    const o = need(d.orders, orderId, 'La cuenta');
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
        course: d.config.catCourse?.[m.cat] || null,
        qty: 1,
        note: '',
        sent: false,
      });
  },
  // Cortesía: el platillo se cobra en Q0; queda registrado el motivo y quién autorizó
  setCourtesy(d, orderId, lineId, courtesy) {
    const l = need(need(d.orders, orderId, 'La cuenta').lines, lineId, 'El platillo');
    if (courtesy) {
      l.courtesy = {
        ...courtesy,
        price: l.courtesy?.price ?? l.price,
        ts: Date.now(),
      };
      l.price = 0;
      audit(d, 'cortesia', {
        ref: orderLabel(need(d.orders, orderId, 'La cuenta'), d.tables),
        detail: `${l.qty} × ${l.name} · ${courtesy.reason}`,
        amount: l.courtesy.price * l.qty,
        authId: courtesy.authId,
        userId: courtesy.userId,
      });
    } else if (l.courtesy) {
      l.price = l.courtesy.price;
      delete l.courtesy;
    }
  },
  setOrderCustomer(d, orderId, customer) {
    need(d.orders, orderId, 'La cuenta').customer = customer;
  },
  setOrderWaiter(d, orderId, waiterId) {
    need(d.orders, orderId, 'La cuenta').waiterId = waiterId;
  },
  // Une la cuenta de otra mesa a esta: pasan sus platillos y personas, y su mesa queda unida
  joinOrders(d, targetId, sourceId) {
    const t = byId(d.orders, targetId);
    const s = byId(d.orders, sourceId);
    t.lines.push(...s.lines);
    t.joined = [...(t.joined || []), s.tableId, ...(s.joined || [])];
    d.orders = d.orders.filter((o) => o.id !== sourceId);
  },
  // Pasa platillos a otra mesa. qtys: { lineId: cantidad }. Si la mesa está libre, se abre.
  transferLines(d, fromId, qtys, { toOrderId, newOrder }) {
    const from = byId(d.orders, fromId);
    if (newOrder) {
      byId(d.tables, newOrder.tableId).reservedAt = null;
      d.orders.push({
        type: 'mesa',
        openedAt: Date.now(),
        lines: [],
        ...newOrder,
      });
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
    const o = need(d.orders, orderId, 'La cuenta');
    const l = need(o.lines, lineId, 'El platillo');
    l.qty += delta;
    o.lines = o.lines.filter((x) => x.qty > 0);
  },
  setNote(d, orderId, lineId, note) {
    const o = need(d.orders, orderId, 'La cuenta');
    need(o.lines, lineId, 'El platillo').note = note;
  },
  // returnStock: el platillo no se preparó, sus insumos regresan al inventario
  voidLine(d, { orderId, lineId, qty, reason, userId, authId, label, returnStock = false }) {
    const o = need(d.orders, orderId, 'La cuenta');
    const l = need(o.lines, lineId, 'El platillo');
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
    audit(d, 'anulacion', {
      ref: label,
      detail: `${qty} × ${l.name} · ${reason}${l.sent ? '' : ' (sin enviar)'}`,
      amount: l.price * qty,
      authId,
      userId,
    });
    if (returnStock && l.sent)
      applyRecipe(d, l.mid, qty, +1, {
        type: 'devolucion',
        note: `Anulado sin preparar · ${label}`,
        userId,
      });
    l.qty -= qty;
    o.lines = o.lines.filter((x) => x.qty > 0);
  },
  // Envía lo pendiente a cocina y descuenta los insumos de las recetas.
  sendKitchen(d, orderId, { userId, label } = {}) {
    d.counters.comanda++;
    const o = need(d.orders, orderId, 'La cuenta');
    for (const l of o.lines) {
      if (l.sent) continue;
      l.held = isHeldOnSend(o, l);
      l.sent = true;
      applyRecipe(d, l.mid, l.qty, -1, {
        type: 'consumo',
        note: `Comanda #${d.counters.comanda} · ${label || ''}`,
        userId,
      });
    }
  },
  // Marchar un tiempo: cocina empieza a preparar los platillos que estaban en espera
  fireCourse(d, orderId, course) {
    const o = need(d.orders, orderId, 'La cuenta');
    d.counters.comanda++;
    o.fired = [...new Set([...(o.fired || []), course])];
    for (const l of o.lines) if (l.course === course) l.held = false;
  },
  setLineCourse(d, orderId, lineId, course) {
    const l = need(need(d.orders, orderId, 'La cuenta').lines, lineId, 'El platillo');
    if (!l.sent && (course === null || COURSES[course])) l.course = course;
  },
  setCatCourse(d, cat, course) {
    d.config.catCourse = { ...(d.config.catCourse || {}) };
    if (course) d.config.catCourse[cat] = course;
    else delete d.config.catCourse[cat];
  },
  moveOrder(d, orderId, tableId) {
    byId(d.tables, tableId).reservedAt = null;
    need(d.orders, orderId, 'La cuenta').tableId = tableId;
  },

  // Registra un cobro. paidQty: { lineId: cantidad } para cobros parciales (cuenta dividida)
  registerSale(d, sale, { orderId, paidQty } = {}) {
    // Si otro dispositivo ya cobró estos platillos, no se cobran dos veces
    if (orderId) {
      const o = need(d.orders, orderId, 'La cuenta');
      for (const [lineId, q] of Object.entries(paidQty || {}))
        if (q > 0 && (byId(o.lines, lineId)?.qty || 0) < q)
          fail('La cuenta cambió en otro dispositivo. Revisa los platillos antes de cobrar.');
    }
    for (const p of sale.payments)
      if (p.method === 'habitacion' && need(d.reservations, p.resId, 'La reserva').status !== 'hospedado')
        fail('El huésped ya no está hospedado: no se puede cargar a su habitación.');
    sale = pushSale(d, sale);
    if (sale.discount)
      audit(d, 'descuento', {
        ref: `${sale.ref} · Ticket #${sale.number}`,
        detail: [sale.discount.label, sale.discount.reason].filter(Boolean).join(' · '),
        amount: sale.discount.amount,
        authId: sale.discount.authBy,
        userId: sale.cashierId,
      });
    for (const p of sale.payments) {
      if (p.method === 'habitacion') {
        need(d.reservations, p.resId, 'La reserva').charges.push({
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
      const o = need(d.orders, orderId, 'La cuenta');
      for (const l of o.lines) l.qty -= paidQty[l.id] || 0;
      o.lines = o.lines.filter((l) => l.qty > 0);
      if (!o.lines.length) d.orders = d.orders.filter((x) => x.id !== orderId);
    }
  },
  // La factura se emite fuera del sistema; aquí solo se anota su número
  markInvoiced(d, saleId, { number, userId }) {
    Object.assign(need(d.sales, saleId, 'La venta').invoice, {
      number,
      invoicedAt: Date.now(),
      invoicedBy: userId,
    });
  },
  voidSale(d, saleId, { reason, authId }) {
    const s = need(d.sales, saleId, 'La venta');
    s.status = 'anulada';
    s.voidReason = reason;
    s.voidedAt = Date.now();
    s.voidAuth = authId;
    audit(d, 'comprobante', {
      ref: `Ticket #${s.number} · ${s.ref || ''}`,
      detail: reason,
      amount: s.grand ?? s.total,
      authId,
    });
    for (const r of d.reservations)
      if (r.charges.some((c) => c.saleId === saleId)) r.charges = r.charges.filter((c) => c.saleId !== saleId);
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
    // Las habitaciones bloqueadas para un evento no crean ficha hasta que llega el huésped real
    if (res.guest && !res.block) {
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
    const r = need(d.reservations, resId, 'La reserva');
    const date = today();
    r.roomHistory = [...(r.roomHistory || []), { roomN: r.roomN, until: date, userId }];
    byId(d.rooms, r.roomN, 'n').hk = 'sucia';
    r.roomN = roomN;
    if (newRate && r.pricing !== 'auto') r.rateChanges = [...(r.rateChanges || []), { from: date, rate: newRate }];
  },
  // Mover o extender una reserva (arrastrar en el calendario)
  moveReservation(d, resId, { roomN, checkIn, checkOut }) {
    Object.assign(need(d.reservations, resId, 'La reserva'), {
      roomN,
      checkIn,
      checkOut,
    });
  },
  // No-show o cancelación: refund (opcional) es la venta de devolución del anticipo, con monto negativo
  closeReservation(d, resId, { status, reason, refund, userId }) {
    const r = need(d.reservations, resId, 'La reserva');
    r.status = status;
    r.cancelReason = reason;
    r.closedBy = userId;
    audit(d, 'cancelacion', {
      ref: `Hab. ${r.roomN} · ${r.guest.name}`,
      detail: `${status === 'noshow' ? 'No-show' : 'Reserva cancelada'} · ${reason}`,
      userId,
    });
    if (refund) {
      audit(d, 'devolucion', {
        ref: `Hab. ${r.roomN} · ${r.guest.name}`,
        detail: `Devolución de anticipo · ${refund.payments[0].method}`,
        amount: Math.abs(refund.payments[0].amount),
        userId,
      });
      refund = pushSale(d, refund);
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
    const r = need(d.reservations, resId, 'La reserva');
    r.status = 'hospedado';
    r.checkedInAt = Date.now();
  },
  cancelReservation(d, resId, reason) {
    const r = need(d.reservations, resId, 'La reserva');
    r.status = 'cancelada';
    r.cancelReason = reason;
    audit(d, 'cancelacion', {
      ref: `Hab. ${r.roomN} · ${r.guest.name}`,
      detail: `Reserva cancelada · ${reason}`,
    });
  },
  addCharge(d, resId, { desc, amt }) {
    need(d.reservations, resId, 'La reserva').charges.push({
      id: uid('c'),
      ts: Date.now(),
      desc,
      amt,
      type: 'extra',
    });
  },
  removeCharge(d, resId, chargeId, { authId } = {}) {
    const r = need(d.reservations, resId, 'La reserva');
    const c = byId(r.charges, chargeId);
    if (c)
      audit(d, 'cargo', {
        ref: `Hab. ${r.roomN} · ${r.guest.name}`,
        detail: c.desc,
        amount: c.amt,
        authId,
      });
    r.charges = r.charges.filter((x) => x.id !== chargeId);
  },
  // Abono o liquidación: crea la venta (para caja) y el pago en el folio
  addFolioPayment(d, resId, sale) {
    sale = pushSale(d, sale);
    const r = need(d.reservations, resId, 'La reserva');
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
    const r = need(d.reservations, resId, 'La reserva');
    r.status = 'salida';
    r.checkedOutAt = Date.now();
    r.checkedOutOn = today();
    byId(d.rooms, r.roomN, 'n').hk = 'sucia';
  },
  // Check-out con su cobro final (sale puede ser null si la cuenta ya está saldada).
  // checkOut: nueva fecha de salida si se va antes. refund: venta de devolución del saldo a favor.
  checkOutWith(d, resId, sale, { checkOut, refund } = {}) {
    if (checkOut) need(d.reservations, resId, 'La reserva').checkOut = checkOut;
    if (sale) A.addFolioPayment(d, resId, sale);
    if (refund) {
      A.addFolioPayment(d, resId, refund);
      const r = need(d.reservations, resId, 'La reserva');
      audit(d, 'devolucion', {
        ref: `Hab. ${r.roomN} · ${r.guest.name}`,
        detail: `Saldo a favor al salir · ${refund.payments[0].method}`,
        amount: Math.abs(refund.grand),
        userId: refund.cashierId,
      });
    }
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
    A.syncEventRooms(d, ev.id);
  },
  setEventStatus(d, id, status) {
    const ev = need(d.events, id, 'El evento');
    ev.status = status;
    if (status === 'cancelado') audit(d, 'cancelacion', { ref: ev.name, detail: 'Evento cancelado' });
    A.syncEventRooms(d, id);
  },
  // Cancelar un evento: motivo y, si hubo anticipo, su devolución (venta con monto negativo)
  cancelEvent(d, id, { reason, refund }) {
    const ev = need(d.events, id, 'El evento');
    ev.status = 'cancelado';
    ev.cancelReason = reason;
    audit(d, 'cancelacion', {
      ref: ev.name,
      detail: `Evento cancelado · ${reason}`,
    });
    if (refund) {
      A.addEventPayment(d, id, refund);
      audit(d, 'devolucion', {
        ref: ev.name,
        detail: `Devolución de anticipo · ${refund.payments[0].method}`,
        amount: Math.abs(refund.grand),
        userId: refund.cashierId,
      });
    }
    A.syncEventRooms(d, id);
  },
  // Habitaciones bloqueadas para los invitados de un evento: crea, mueve o libera sus reservas.
  // Las que ya tienen un huésped real (block: false) no se tocan.
  syncEventRooms(d, eventId) {
    const ev = need(d.events, eventId, 'El evento');
    const rb = ev.roomBlock || { rooms: [], nights: 1, rate: '' };
    const active = ev.status !== 'cancelado';
    const checkIn = ev.date;
    const checkOut = addDays(ev.date, Math.max(1, rb.nights || 1));
    const linked = d.reservations.filter(
      (r) => r.eventId === eventId && (r.status === 'reservada' || r.status === 'hospedado'),
    );
    const special = Number(rb.rate) > 0;
    for (const r of linked) {
      if (!r.block || r.status !== 'reservada') continue;
      if (!active || !rb.rooms.includes(r.roomN)) {
        r.status = 'cancelada';
        r.cancelReason = active ? 'Liberada del bloqueo del evento' : 'Evento cancelado';
      } else if (isAvailable(d.reservations, r.roomN, checkIn, checkOut, r.id)) {
        Object.assign(r, {
          checkIn,
          checkOut,
          pricing: special ? 'fija' : 'auto',
          rate: special ? Number(rb.rate) : byId(d.roomTypes, byId(d.rooms, r.roomN, 'n').typeId).rate,
          guest: { ...r.guest, name: `Bloqueo · ${ev.name}` },
        });
      }
    }
    if (!active) return;
    for (const n of rb.rooms) {
      if (linked.some((r) => r.roomN === n && r.status !== 'cancelada')) continue;
      if (!isAvailable(d.reservations, n, checkIn, checkOut)) continue;
      const type = byId(d.roomTypes, byId(d.rooms, n, 'n').typeId);
      d.reservations.push({
        id: uid('r'),
        roomN: n,
        checkIn,
        checkOut,
        adults: 2,
        children: 0,
        channel: 'Evento',
        rateType: 'noche',
        pricing: special ? 'fija' : 'auto',
        rate: special ? Number(rb.rate) : type.rate,
        status: 'reservada',
        notes: `Invitados de ${ev.name}`,
        charges: [],
        payments: [],
        createdAt: Date.now(),
        eventId,
        block: true,
        guest: {
          name: `Bloqueo · ${ev.name}`,
          phone: ev.client.phone || '',
          email: '',
          doc: '',
          nationality: '',
        },
      });
    }
  },
  addEventPayment(d, eventId, sale) {
    sale = pushSale(d, sale);
    const ev = need(d.events, eventId, 'El evento');
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
  invMove(d, { itemId, type, qty, note, userId, authId }, coll = 'inventory', movesColl = 'invMoves') {
    const it = byId(d[coll], itemId);
    const q = Number(qty);
    const before = it.stock;
    it.stock = Math.max(
      0,
      Math.round((type === 'entrada' ? it.stock + q : type === 'ajuste' ? q : it.stock - q) * 1000) / 1000,
    );
    d[movesColl].push({
      id: uid('im'),
      ts: Date.now(),
      itemId,
      type,
      qty: q,
      note,
      userId,
      after: it.stock,
    });
    if (type !== 'entrada') {
      const lost = before - it.stock;
      audit(d, 'inventario', {
        ref: `${CATALOG_LABELS[coll]} · ${it.name}`,
        detail: `${type === 'ajuste' ? `Ajuste de conteo: ${before} → ${it.stock}` : `${type[0].toUpperCase() + type.slice(1)} de ${q} ${it.unit}`}${note ? ' · ' + note : ''}`,
        amount: Math.round(lost * (it.cost || 0) * 100) / 100,
        authId,
        userId,
      });
    }
  },

  // Caja
  openShift(d, { float, userId }) {
    if (d.shift) fail('La caja ya está abierta');
    d.shift = {
      id: uid('sh'),
      openedAt: Date.now(),
      openedBy: userId,
      float,
      movements: [],
    };
  },
  addMovement(d, { type, amount, reason, userId }) {
    if (!d.shift) fail('La caja está cerrada');
    d.shift.movements.push({
      id: uid('mv'),
      ts: Date.now(),
      type,
      amount,
      reason,
      userId,
    });
    if (type === 'salida')
      audit(d, 'caja', {
        ref: 'Salida de efectivo',
        detail: reason,
        amount,
        userId,
      });
  },
  // Cierre ciego: firstCounted es el primer conteo (antes de ver lo esperado); recounts, las veces que se recontó
  closeShift(d, { counted, denominations, userId, authId, report, firstCounted = counted, recounts = 0, note = '' }) {
    const s = d.shift || fail('La caja ya se cerró en otro dispositivo');
    const difference = Math.round((counted - report.cash.expected) * 100) / 100;
    Object.assign(s, {
      closedAt: Date.now(),
      closedBy: userId,
      counted,
      firstCounted,
      recounts,
      differenceNote: note,
      denominations,
      difference,
      report,
    });
    if (difference !== 0 || recounts > 0)
      audit(d, 'caja', {
        ref: 'Cierre de turno',
        detail: [
          difference === 0 ? 'Cuadró' : difference > 0 ? 'Sobrante' : 'Faltante',
          recounts
            ? `recontado ${recounts} ${recounts === 1 ? 'vez' : 'veces'} (primer conteo ${money(d, firstCounted)})`
            : '',
          note,
        ]
          .filter(Boolean)
          .join(' · '),
        amount: difference,
        authId,
        userId,
      });
    d.shiftHistory.unshift(s);
    d.shift = null;
  },

  // Administración
  // authId: gerente que autorizó el cambio (queda en la bitácora si cambia un precio)
  upsert(d, coll, item, key = 'id', { authId } = {}) {
    const i = d[coll].findIndex((x) => x[key] === item[key]);
    if (i >= 0 && PRICE_FIELDS[coll]) {
      const old = d[coll][i];
      for (const [f, label] of PRICE_FIELDS[coll])
        if (f in item && Number(item[f] || 0) !== Number(old[f] || 0))
          audit(d, 'precio', {
            ref: `${CATALOG_LABELS[coll]} · ${old.name}`,
            detail: `Cambio de ${label}: ${money(d, old[f])} → ${money(d, item[f])}`,
            amount: Number(item[f] || 0) - Number(old[f] || 0),
            authId,
          });
    }
    if (i >= 0) d[coll][i] = { ...d[coll][i], ...item };
    else d[coll].push(item);
  },
  remove(d, coll, value, key = 'id') {
    const old = d[coll].find((x) => x[key] === value);
    if (old && CATALOG_LABELS[coll])
      audit(d, 'catalogo', {
        ref: `${CATALOG_LABELS[coll]} · ${old.name}`,
        detail: 'Producto eliminado',
      });
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
    if (d.config.catCourse?.[from] && from !== to) {
      d.config.catCourse = {
        ...d.config.catCourse,
        [to]: d.config.catCourse[from],
      };
      delete d.config.catCourse[from];
    }
  },
};
