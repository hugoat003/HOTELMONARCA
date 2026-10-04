import { METHOD_LABELS } from './data.js';
import { addDays, dateOf, nightsBetween, today } from './dates.js';
import { nightlyRate } from './hotel.js';
import { dishCost } from './inventory.js';
import { round2, sum } from './money.js';

// Reporte Diario de Producción de un turno (abierto o cerrado)
export function buildReport(state, shift) {
  const day = dateOf(shift.openedAt);
  const sales = state.sales.filter((s) => s.shiftId === shift.id);
  const ok = sales.filter((s) => s.status === 'ok');
  const rest = ok.filter((s) => s.kind === 'restaurante');
  const hotel = ok.filter((s) => s.kind === 'hotel');
  const events = ok.filter((s) => s.kind === 'evento');
  const shop = ok.filter((s) => s.kind === 'tienda');
  const shopTotal = sum(shop, (s) => s.total);
  const shopCost = sum(
    shop.flatMap((s) => s.lines),
    (l) => (l.cost || 0) * l.qty,
  );

  const restTotal = sum(rest, (s) => s.total);
  const tips = sum(rest, (s) => s.tip);
  const discounts = sum(rest, (s) => s.discount?.amount);
  const courtesyLines = rest.flatMap((s) => s.lines).filter((l) => l.courtesy);
  const courtesies = {
    count: courtesyLines.reduce((a, l) => a + l.qty, 0),
    amount: sum(courtesyLines, (l) => l.courtesy.price * l.qty),
  };

  const byMethod = Object.keys(METHOD_LABELS).map((k) => {
    const pays = ok.flatMap((s) => s.payments).filter((p) => p.method === k);
    return {
      key: k,
      label: METHOD_LABELS[k],
      count: pays.length,
      amount: sum(pays, (p) => p.amount),
    };
  });

  const cats = {};
  const items = {};
  for (const l of rest.flatMap((s) => s.lines)) {
    cats[l.cat] = round2((cats[l.cat] || 0) + l.price * l.qty);
    items[l.name] = (items[l.name] || 0) + l.qty;
  }
  const byCategory = Object.entries(cats)
    .map(([cat, amount]) => ({ cat, amount }))
    .sort((a, b) => b.amount - a.amount);
  const topItems = Object.entries(items)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const lineVoids = state.voids.filter((v) => v.shiftId === shift.id);
  const voidedSales = sales.filter((s) => s.status === 'anulada');

  const cashSales = byMethod.find((m) => m.key === 'efectivo').amount;
  const entradas = sum(
    shift.movements.filter((m) => m.type === 'entrada'),
    (m) => m.amount,
  );
  const salidas = sum(
    shift.movements.filter((m) => m.type === 'salida'),
    (m) => m.amount,
  );

  const inHouse = state.reservations.filter((r) => r.status === 'hospedado');
  const lodgingRevenue = sum(inHouse, (r) => nightlyRate(r, state, day));
  const rooms = state.rooms.length;

  return {
    day,
    restTotal,
    restCount: rest.length,
    avgTicket: rest.length ? round2(restTotal / rest.length) : 0,
    tips,
    discounts,
    courtesies,
    byMethod,
    byCategory,
    topItems,
    voids: {
      lines: lineVoids.length,
      linesAmount: sum(lineVoids, (v) => v.amount),
      sales: voidedSales.length,
      salesAmount: sum(voidedSales, (s) => s.grand),
    },
    cash: {
      float: shift.float,
      cashSales,
      entradas,
      salidas,
      expected: round2(shift.float + cashSales + entradas - salidas),
    },
    hotel: {
      rooms,
      occupied: inHouse.length,
      occupancy: rooms ? Math.round((inHouse.length / rooms) * 100) : 0,
      lodgingRevenue,
      adr: inHouse.length ? round2(lodgingRevenue / inHouse.length) : 0,
      revpar: rooms ? round2(lodgingRevenue / rooms) : 0,
      collected: sum(hotel, (s) => s.grand),
      arrivals: state.reservations.filter(
        (r) => r.checkIn === day && (r.status === 'hospedado' || r.status === 'salida'),
      ).length,
      departures: state.reservations.filter((r) => r.status === 'salida' && r.checkedOutOn === day).length,
    },
    events: { collected: sum(events, (s) => s.grand), count: events.length },
    shop: {
      total: shopTotal,
      count: shop.length,
      margin: round2(shopTotal - shopCost),
    },
    production: round2(restTotal + lodgingRevenue + sum(events, (s) => s.grand) + shopTotal),
    sales: [...sales].sort((a, b) => b.ts - a.ts),
  };
}

// ── Reporte por rango de fechas (varios turnos) ──
const inRange = (day, from, to) => day >= from && day <= to;

// Ocupación e ingreso de hospedaje noche por noche (solo hasta hoy: el futuro aún no se produce)
function lodgingByDay(state, from, to) {
  const out = [];
  const last = to < today() ? to : today();
  for (let d = from; d <= last; d = addDays(d, 1)) {
    const stays = state.reservations.filter(
      (r) => (r.status === 'hospedado' || r.status === 'salida') && r.checkIn <= d && d < r.checkOut,
    );
    out.push({
      day: d,
      occupied: stays.length,
      revenue: sum(stays, (r) => nightlyRate(r, state, d)),
    });
  }
  return out;
}

// Ventas (restaurante + tienda) y ocupación por día, para las gráficas de tendencia
export function dailySeries(state, from, to) {
  const lodging = Object.fromEntries(lodgingByDay(state, from, to).map((x) => [x.day, x]));
  const rooms = state.rooms.length || 1;
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const sales = state.sales.filter(
      (s) => s.status === 'ok' && (s.kind === 'restaurante' || s.kind === 'tienda') && dateOf(s.ts) === d,
    );
    out.push({
      day: d,
      sales: sum(sales, (s) => s.total),
      occupancy: lodging[d] ? Math.round((lodging[d].occupied / rooms) * 100) : null,
    });
  }
  return out;
}

export function buildRangeReport(state, from, to) {
  const sales = state.sales.filter((s) => inRange(dateOf(s.ts), from, to));
  const ok = sales.filter((s) => s.status === 'ok');
  const rest = ok.filter((s) => s.kind === 'restaurante');
  const hotel = ok.filter((s) => s.kind === 'hotel');
  const events = ok.filter((s) => s.kind === 'evento');
  const shop = ok.filter((s) => s.kind === 'tienda');

  const rangeVoids = state.voids.filter((v) => inRange(dateOf(v.ts), from, to));
  const voidedSales = sales.filter((s) => s.status === 'anulada');
  const restTotal = sum(rest, (s) => s.total);
  const tips = sum(rest, (s) => s.tip);
  const courtesyLines = rest.flatMap((s) => s.lines).filter((l) => l.courtesy);

  const byMethod = Object.keys(METHOD_LABELS).map((k) => {
    const pays = ok.flatMap((s) => s.payments).filter((p) => p.method === k);
    return {
      key: k,
      label: METHOD_LABELS[k],
      count: pays.length,
      amount: sum(pays, (p) => p.amount),
    };
  });
  const cats = {};
  const items = {};
  for (const l of rest.flatMap((s) => s.lines)) {
    cats[l.cat] = round2((cats[l.cat] || 0) + l.price * l.qty);
    items[l.name] = (items[l.name] || 0) + l.qty;
  }

  // Ventas y propinas por mesero; reparto según la configuración
  const waiters = {};
  for (const s of rest) {
    const w = (waiters[s.waiterId] ||= {
      waiterId: s.waiterId,
      count: 0,
      total: 0,
      tips: 0,
    });
    w.count++;
    w.total = round2(w.total + s.total);
    w.tips = round2(w.tips + s.tip);
  }
  const split = state.config.tipSplit || 'propio';
  const byWaiter = Object.values(waiters)
    .map((w) => ({
      ...w,
      name: state.users.find((u) => u.id === w.waiterId)?.name || '—',
      avg: w.count ? round2(w.total / w.count) : 0,
    }))
    .sort((a, b) => b.total - a.total);
  const share = byWaiter.length ? round2(tips / byWaiter.length) : 0;
  for (const w of byWaiter) w.tipShare = split === 'iguales' ? share : w.tips;

  // Rentabilidad por platillo: lo vendido contra el costo de su receta (las cortesías cuestan aunque no se cobren)
  const dishMap = {};
  for (const l of rest.flatMap((s) => s.lines)) {
    const m = state.menu.find((x) => x.id === l.mid);
    const unit = dishCost(m, state.inventory);
    if (unit === null) continue;
    const x = (dishMap[l.mid] ||= {
      mid: l.mid,
      name: m.name,
      cat: m.cat,
      qty: 0,
      sales: 0,
      cost: 0,
    });
    x.qty += l.qty;
    x.sales = round2(x.sales + l.price * l.qty);
    x.cost = round2(x.cost + unit * l.qty);
  }
  const dishes = Object.values(dishMap)
    .map((x) => ({
      ...x,
      profit: round2(x.sales - x.cost),
      margin: x.sales ? Math.round(((x.sales - x.cost) / x.sales) * 100) : 0,
    }))
    .sort((a, b) => b.profit - a.profit);

  const lodging = lodgingByDay(state, from, to);
  const rooms = state.rooms.length;
  const roomNights = sum(lodging, (x) => x.occupied);
  const lodgingRevenue = sum(lodging, (x) => x.revenue);
  const available = rooms * lodging.length;

  return {
    from,
    to,
    days: nightsBetween(from, to) + 1,
    restTotal,
    restCount: rest.length,
    avgTicket: rest.length ? round2(restTotal / rest.length) : 0,
    tips,
    tipSplit: split,
    discounts: sum(rest, (s) => s.discount?.amount),
    courtesies: {
      count: courtesyLines.reduce((a, l) => a + l.qty, 0),
      amount: sum(courtesyLines, (l) => l.courtesy.price * l.qty),
    },
    byMethod,
    byCategory: Object.entries(cats)
      .map(([cat, amount]) => ({ cat, amount }))
      .sort((a, b) => b.amount - a.amount),
    topItems: Object.entries(items)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
    byWaiter,
    dishes,
    voids: {
      lines: rangeVoids.length,
      linesAmount: sum(rangeVoids, (v) => v.amount),
      sales: voidedSales.length,
      salesAmount: sum(voidedSales, (s) => s.grand),
    },
    hotel: {
      rooms,
      roomNights,
      occupancy: available ? Math.round((roomNights / available) * 100) : 0,
      lodgingRevenue,
      adr: roomNights ? round2(lodgingRevenue / roomNights) : 0,
      revpar: available ? round2(lodgingRevenue / available) : 0,
      collected: sum(hotel, (s) => s.grand),
    },
    events: { collected: sum(events, (s) => s.grand), count: events.length },
    shop: { total: sum(shop, (s) => s.total), count: shop.length },
    production: round2(restTotal + lodgingRevenue + sum(events, (s) => s.grand) + sum(shop, (s) => s.total)),
    series: dailySeries(state, from, to),
    sales: [...sales].sort((a, b) => b.ts - a.ts),
  };
}
