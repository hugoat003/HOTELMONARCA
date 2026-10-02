// Pendientes del día para el Resumen: lo que alguien tiene que atender hoy, ordenado por urgencia.
// Cada pendiente: { area, text, view, level: 'high' | 'mid' | 'low' }
import { addDays, dateOf, fmtDate, today } from './dates.js';
import { eventTotals, isActiveEvent } from './events.js';
import { folio, monthlyPeriods } from './hotel.js';
import { stockStatus } from './inventory.js';
import { sum } from './money.js';

const LEVELS = { high: 0, mid: 1, low: 2 };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function buildReminders(state, fmt) {
  const d0 = today();
  const out = [];
  const add = (area, level, text, view) => out.push({ area, level, text, view });

  // Caja
  if (!state.shift) add('Caja', 'high', 'La caja está cerrada: no se puede cobrar.', 'caja');
  else if (dateOf(state.shift.openedAt) < d0)
    add('Caja', 'high', `El turno sigue abierto desde el ${fmtDate(dateOf(state.shift.openedAt))}.`, 'caja');
  const last = state.shiftHistory[0];
  if (last && last.difference && dateOf(last.closedAt) >= addDays(d0, -1))
    add(
      'Caja',
      last.difference < 0 ? 'high' : 'mid',
      `Último cierre con ${last.difference < 0 ? 'faltante' : 'sobrante'} de ${fmt(Math.abs(last.difference))}`,
      'caja',
    );

  // Hotel
  const res = state.reservations;
  for (const r of res.filter((x) => x.status === 'reservada' && x.checkIn < d0))
    add('Hotel', 'high', `Hab. ${r.roomN} · ${r.guest.name}: no llegó (${fmtDate(r.checkIn)}). ¿No-show?`, 'reservas');
  for (const r of res.filter((x) => x.status === 'hospedado' && x.checkOut <= d0)) {
    const f = folio(r, state);
    add(
      'Hotel',
      f.balance > 0.004 ? 'mid' : 'low',
      `Sale hoy Hab. ${r.roomN} · ${r.guest.name}${f.balance > 0.004 ? ` · saldo ${fmt(f.balance)}` : ''}`,
      'habitaciones',
    );
  }
  const noDeposit = res.filter(
    (x) => x.status === 'reservada' && x.checkIn === d0 && !x.block && sum(x.payments, (p) => p.amount) <= 0,
  );
  if (noDeposit.length)
    add(
      'Hotel',
      'low',
      `${plural(noDeposit.length, 'llegada', 'llegadas')} de hoy sin anticipo: ${noDeposit.map((x) => x.roomN).join(', ')}`,
      'habitaciones',
    );
  for (const r of res.filter((x) => x.status === 'hospedado' && x.rateType === 'mensual')) {
    const due = folio(r, state).dueToday;
    if (due > 0.004) {
      add('Hotel', 'high', `Hab. ${r.roomN} · ${r.guest.name}: mensualidad pendiente ${fmt(due)}`, 'habitaciones');
      continue;
    }
    const next = monthlyPeriods(r.checkIn, r.checkOut).find((p) => p.start > d0);
    if (next && next.start <= addDays(d0, 3))
      add(
        'Hotel',
        'low',
        `Hab. ${r.roomN} · ${r.guest.name}: su mes ${next.n} empieza el ${fmtDate(next.start)}`,
        'habitaciones',
      );
  }
  const dirty = state.rooms.filter((rm) => rm.hk === 'sucia' || rm.hk === 'limpiando');
  if (dirty.length) add('Hotel', 'low', `Por limpiar: ${dirty.map((x) => x.n).join(', ')}`, 'limpieza');

  // Eventos
  const tomorrow = addDays(d0, 1);
  for (const e of state.events.filter((x) => isActiveEvent(x) && (x.date === d0 || x.date === tomorrow)))
    add(
      'Eventos',
      'mid',
      `${e.date === d0 ? 'Hoy' : 'Mañana'} ${e.start}: ${e.name} · ${e.guests} invitados. Revisa la orden de servicio.`,
      'eventos',
    );
  for (const e of state.events.filter((x) => isActiveEvent(x) && x.date >= d0 && x.date <= addDays(d0, 14))) {
    const t = eventTotals(e, state);
    if (e.status === 'cotizado')
      add('Eventos', 'mid', `${e.name} (${fmtDate(e.date)}) sigue en cotización, sin anticipo`, 'eventos');
    else if (e.date <= addDays(d0, 7) && t.balance > 0.004)
      add('Eventos', 'mid', `${e.name} (${fmtDate(e.date)}): saldo ${fmt(t.balance)}`, 'eventos');
  }

  // Restaurante y tienda
  const toInvoice = state.sales.filter((x) => x.status === 'ok' && x.invoice && !x.invoice.number);
  if (toInvoice.length)
    add(
      'Ventas',
      'mid',
      `${plural(toInvoice.length, 'venta', 'ventas')} por facturar · ${fmt(sum(toInvoice, (x) => x.grand))}`,
      'ventas',
    );
  for (const it of state.inventory.filter((x) => stockStatus(x) !== 'ok'))
    add(
      'Inventario',
      it.stock <= 0 ? 'high' : 'mid',
      `${it.name}: ${it.stock <= 0 ? 'agotado' : `quedan ${it.stock} ${it.unit} (mínimo ${it.min})`}`,
      'inventario',
    );
  for (const it of (state.shopItems || []).filter((x) => stockStatus(x) !== 'ok'))
    add(
      'Tienda',
      it.stock <= 0 ? 'high' : 'mid',
      `${it.name}: ${it.stock <= 0 ? 'agotado' : `quedan ${it.stock} (mínimo ${it.min})`}`,
      'tienda',
    );

  // Control: operaciones sensibles de hoy
  const audit = (state.audit || []).filter((a) => dateOf(a.ts) === d0);
  if (audit.length)
    add(
      'Control',
      'low',
      `${plural(audit.length, 'registro', 'registros')} en la bitácora hoy (anulaciones, cortesías, descuentos…)`,
      'bitacora',
    );

  return out.map((x, i) => ({ ...x, i })).sort((a, b) => LEVELS[a.level] - LEVELS[b.level] || a.i - b.i);
}
