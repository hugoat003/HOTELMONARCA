import { METHOD_LABELS } from '../data.js';
import { dateOf } from './dates.js';
import { nightlyRate } from './hotel.js';
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
  const shopCost = sum(shop.flatMap((s) => s.lines), (l) => (l.cost || 0) * l.qty);

  const restTotal = sum(rest, (s) => s.total);
  const tips = sum(rest, (s) => s.tip);
  const discounts = sum(rest, (s) => s.discount?.amount);

  const byMethod = Object.keys(METHOD_LABELS).map((k) => {
    const pays = ok.flatMap((s) => s.payments).filter((p) => p.method === k);
    return { key: k, label: METHOD_LABELS[k], count: pays.length, amount: sum(pays, (p) => p.amount) };
  });

  const cats = {};
  const items = {};
  for (const l of rest.flatMap((s) => s.lines)) {
    cats[l.cat] = round2((cats[l.cat] || 0) + l.price * l.qty);
    items[l.name] = (items[l.name] || 0) + l.qty;
  }
  const byCategory = Object.entries(cats).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  const topItems = Object.entries(items).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const lineVoids = state.voids.filter((v) => v.shiftId === shift.id);
  const voidedSales = sales.filter((s) => s.status === 'anulada');

  const cashSales = byMethod.find((m) => m.key === 'efectivo').amount;
  const entradas = sum(shift.movements.filter((m) => m.type === 'entrada'), (m) => m.amount);
  const salidas = sum(shift.movements.filter((m) => m.type === 'salida'), (m) => m.amount);

  const inHouse = state.reservations.filter((r) => r.status === 'hospedado');
  const lodgingRevenue = sum(inHouse, nightlyRate);
  const rooms = state.rooms.length;

  return {
    day,
    restTotal,
    restCount: rest.length,
    avgTicket: rest.length ? round2(restTotal / rest.length) : 0,
    tips,
    discounts,
    byMethod,
    byCategory,
    topItems,
    voids: { lines: lineVoids.length, linesAmount: sum(lineVoids, (v) => v.amount), sales: voidedSales.length, salesAmount: sum(voidedSales, (s) => s.grand) },
    cash: { float: shift.float, cashSales, entradas, salidas, expected: round2(shift.float + cashSales + entradas - salidas) },
    hotel: {
      rooms,
      occupied: inHouse.length,
      occupancy: rooms ? Math.round((inHouse.length / rooms) * 100) : 0,
      lodgingRevenue,
      adr: inHouse.length ? round2(lodgingRevenue / inHouse.length) : 0,
      revpar: rooms ? round2(lodgingRevenue / rooms) : 0,
      collected: sum(hotel, (s) => s.grand),
      inguat: sum(hotel, (s) => s.taxes?.inguat),
      arrivals: state.reservations.filter((r) => r.checkIn === day && (r.status === 'hospedado' || r.status === 'salida')).length,
      departures: state.reservations.filter((r) => r.status === 'salida' && r.checkedOutOn === day).length,
    },
    events: { collected: sum(events, (s) => s.grand), count: events.length },
    shop: { total: shopTotal, count: shop.length, margin: round2(shopTotal - shopCost) },
    production: round2(restTotal + lodgingRevenue + sum(events, (s) => s.grand) + shopTotal),
    sales: [...sales].sort((a, b) => b.ts - a.ts),
  };
}
