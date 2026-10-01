import { addDays, addMonths, nightsBetween, today } from './dates.js';
import { round2, sum } from './money.js';

export const isActiveRes = (r) => r.status === 'reservada' || r.status === 'hospedado';
const overlaps = (a1, b1, a2, b2) => a1 < b2 && a2 < b1;

export function isAvailable(reservations, roomN, checkIn, checkOut, ignoreId) {
  return !reservations.some(
    (r) =>
      r.id !== ignoreId && r.roomN === roomN && isActiveRes(r) && overlaps(checkIn, checkOut, r.checkIn, r.checkOut),
  );
}

// Estado operativo de una habitación para el día indicado
export function roomState(room, reservations, day) {
  const inHouse = reservations.find((r) => r.roomN === room.n && r.status === 'hospedado');
  if (inHouse) return { status: 'ocupada', res: inHouse };
  if (room.hk === 'fuera') return { status: 'fuera' };
  const arriving = reservations.find(
    (r) => r.roomN === room.n && r.status === 'reservada' && r.checkIn <= day && r.checkOut > day,
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

// ── Tarifa por noche ──
// Habitación que ocupaba la reserva una noche dada (roomHistory guarda las anteriores con su fecha de salida)
export function roomOn(res, date) {
  const prev = (res.roomHistory || []).find((h) => date < h.until);
  return prev ? prev.roomN : res.roomN;
}

const isWeekendNight = (date) => {
  const day = new Date(date + 'T12:00').getDay();
  return day === 5 || day === 6; // noches de viernes y sábado
};

// Precio de una noche sin impuestos y su descripción (temporada, fin de semana, persona extra)
export function nightRate(res, date, state) {
  const cfg = state.config;
  const tags = [];
  let rate;
  if (res.pricing === 'auto') {
    const room = state.rooms.find((r) => r.n === roomOn(res, date));
    const type = state.roomTypes.find((t) => t.id === room?.typeId);
    const season = (state.seasons || []).find((s) => s.from <= date && date <= s.to && s.rates?.[type?.id]);
    rate = season ? season.rates[type.id] : type?.rate || res.rate;
    if (season) tags.push(season.name);
    if (cfg.weekendPct && isWeekendNight(date)) {
      rate = round2(rate * (1 + cfg.weekendPct / 100));
      tags.push('fin de semana');
    }
  } else {
    // Tarifa fija pactada; un cambio de habitación puede fijar otra desde una fecha
    const change = [...(res.rateChanges || [])].reverse().find((c) => c.from <= date);
    rate = change ? change.rate : res.rate;
  }
  const extra = Math.max(0, res.adults + res.children - (cfg.extraPersonFrom || 99));
  if (extra && cfg.extraPersonRate) {
    rate = round2(rate + extra * cfg.extraPersonRate);
    tags.push(`${extra} persona${extra === 1 ? '' : 's'} extra`);
  }
  return { rate, label: tags.join(' · ') };
}

// Noches agrupadas por precio consecutivo: [{ from, nights, rate, label, amount }]
export function nightGroups(res, state) {
  const groups = [];
  for (let d = res.checkIn; d < res.checkOut; d = addDays(d, 1)) {
    const { rate, label } = nightRate(res, d, state);
    const last = groups.at(-1);
    if (last && last.rate === rate && last.label === label) last.nights++;
    else groups.push({ from: d, nights: 1, rate, label });
  }
  return groups.map((g) => ({ ...g, amount: round2(g.rate * g.nights) }));
}

// Tarifa equivalente de una noche (para ADR / RevPAR)
export const nightlyRate = (res, state, day = today()) =>
  res.rateType === 'mensual' ? round2(res.rate / 30) : nightRate(res, day, state).rate;

export function folio(res, state) {
  const config = state.config;
  const nights = Math.max(1, nightsBetween(res.checkIn, res.checkOut));
  const chargesTotal = sum(res.charges, (c) => c.amt);
  const paid = sum(res.payments, (p) => p.amount);
  let lodging,
    periods = null,
    groups = null,
    dueToday = null;
  if (res.rateType === 'mensual') {
    periods = monthlyPeriods(res.checkIn, res.checkOut).map((p) => ({ ...p, amount: round2(res.rate * p.frac) }));
    lodging = lodgingFromBase(
      sum(periods, (p) => p.amount),
      config,
    );
    // Lo que ya debería estar pagado: periodos iniciados + cargos
    const accrued = lodgingFromBase(
      sum(
        periods.filter((p) => p.start <= today()),
        (p) => p.amount,
      ),
      config,
    );
    dueToday = round2(accrued.total + chargesTotal - paid);
  } else {
    groups = nightGroups(res, state);
    lodging = lodgingFromBase(
      sum(groups, (g) => g.amount),
      config,
    );
  }
  const total = round2(lodging.total + chargesTotal);
  const months = periods ? round2(sum(periods, (p) => p.frac)) : 0;
  const label = periods
    ? `Hospedaje mensual · ${months} mes${months === 1 ? '' : 'es'}`
    : `Hospedaje ${nights} noche${nights === 1 ? '' : 's'}`;
  return {
    nights,
    lodging,
    chargesTotal,
    paid,
    total,
    balance: round2(total - paid),
    periods,
    groups,
    months,
    dueToday,
    label,
  };
}

// Estancias de un huésped (por ficha o, en datos antiguos, por documento)
export const guestStays = (guest, reservations) =>
  reservations.filter((r) => r.guestId === guest.id || (!r.guestId && guest.doc && r.guest.doc === guest.doc));

export const isFrequent = (guest, reservations) =>
  guestStays(guest, reservations).filter((r) => r.status === 'salida' || r.status === 'hospedado').length >= 3;

// "2 noches × Q 747.50 · fin de semana"
export const groupText = (g, fmt) =>
  `${g.nights} noche${g.nights === 1 ? '' : 's'} × ${fmt(g.rate)}${g.label ? ' · ' + g.label : ''}`;
