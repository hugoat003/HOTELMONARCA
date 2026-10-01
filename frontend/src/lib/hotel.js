import { addMonths, nightsBetween, today } from './dates.js';
import { round2, sum } from './money.js';

export const isActiveRes = (r) => r.status === 'reservada' || r.status === 'hospedado';
const overlaps = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;

export function isAvailable(reservations, roomN, checkIn, checkOut, ignoreId) {
  return !reservations.some(
    (r) => r.id !== ignoreId && r.roomN === roomN && isActiveRes(r) && overlaps(checkIn, checkOut, r.checkIn, r.checkOut)
  );
}

// Estado operativo de una habitación para el día indicado
export function roomState(room, reservations, day) {
  const inHouse = reservations.find((r) => r.roomN === room.n && r.status === 'hospedado');
  if (inHouse) return { status: 'ocupada', res: inHouse };
  if (room.hk === 'fuera') return { status: 'fuera' };
  const arriving = reservations.find(
    (r) => r.roomN === room.n && r.status === 'reservada' && r.checkIn <= day && r.checkOut > day
  );
  if (room.hk === 'sucia' || room.hk === 'limpiando') return { status: 'limpieza', res: arriving };
  if (arriving) return { status: 'reservada', res: arriving };
  return { status: 'libre' };
}

// Impuestos del hospedaje sobre la tarifa sin impuestos: IVA + INGUAT
export function lodgingFromBase(base, config) {
  base = round2(base);
  const iva = round2((base * config.iva) / 100);
  const inguat = round2((base * config.inguat) / 100);
  return { base, iva, inguat, total: round2(base + iva + inguat) };
}
export const lodgingTotals = (rate, nights, config) => lodgingFromBase(rate * nights, config);

// Estancia mensual partida en periodos; el último se prorratea por días
export function monthlyPeriods(checkIn, checkOut) {
  const out = [];
  let start = checkIn;
  while (start < checkOut && out.length < 36) {
    const full = addMonths(start, 1);
    const end = full < checkOut ? full : checkOut;
    const frac = end === full ? 1 : nightsBetween(start, end) / nightsBetween(start, full);
    out.push({ n: out.length + 1, start, end, frac });
    start = end;
  }
  return out;
}

// Tarifa equivalente por noche (para ADR / RevPAR)
export const nightlyRate = (res) => (res.rateType === 'mensual' ? round2(res.rate / 30) : res.rate);

export function folio(res, config) {
  const nights = Math.max(1, nightsBetween(res.checkIn, res.checkOut));
  const chargesTotal = sum(res.charges, (c) => c.amt);
  const paid = sum(res.payments, (p) => p.amount);
  let lodging, periods = null, dueToday = null;
  if (res.rateType === 'mensual') {
    periods = monthlyPeriods(res.checkIn, res.checkOut).map((p) => ({ ...p, amount: round2(res.rate * p.frac) }));
    lodging = lodgingFromBase(sum(periods, (p) => p.amount), config);
    // Lo que ya debería estar pagado: periodos iniciados + cargos
    const accrued = lodgingFromBase(sum(periods.filter((p) => p.start <= today()), (p) => p.amount), config);
    dueToday = round2(accrued.total + chargesTotal - paid);
  } else {
    lodging = lodgingTotals(res.rate, nights, config);
  }
  const total = round2(lodging.total + chargesTotal);
  const months = periods ? round2(sum(periods, (p) => p.frac)) : 0;
  const label = periods
    ? `Hospedaje mensual · ${months} mes${months === 1 ? '' : 'es'}`
    : `Hospedaje ${nights} noche${nights === 1 ? '' : 's'}`;
  return { nights, lodging, chargesTotal, paid, total, balance: round2(total - paid), periods, months, dueToday, label };
}

export const guestLabel = (res) => res.guest.name + (res.adults + res.children > 1 ? ` (${res.adults + res.children})` : '');
