import { round2, sum } from './money.js';

// Personas cubiertas por el menú o paquete (un paquete "por evento" cubre a todos)
export const menuCovers = (menu, qty, guests) =>
  !menu ? 0 : menu.unit === 'evento' ? (qty > 0 ? guests : 0) : menu.unit === 'pareja' ? qty * 2 : qty;

// Totales de un evento: menú o paquete + extras + renta del salón (IVA incluido).
// La renta del salón no se cobra si se sirve comida del hotel a todos los invitados.
export function eventTotals(ev, state) {
  const venue = state.venues.find((v) => v.id === ev.venueId);
  const menu = state.eventMenus.find((m) => m.id === ev.menuId);
  const covered = menuCovers(menu, ev.menuQty || 0, ev.guests);
  const venueWaived = !!venue && covered >= ev.guests;
  const venueAmt = venue && !venueWaived ? venue.price : 0;
  const menuAmt = menu ? round2(menu.price * (ev.menuQty || 0)) : 0;
  const extrasAmt = sum(ev.extras, (x) => x.amt);
  const total = round2(venueAmt + menuAmt + extrasAmt);
  const paid = sum(ev.payments, (p) => p.amount);
  return {
    venue,
    menu,
    venueWaived,
    covered,
    venueAmt,
    menuAmt,
    extrasAmt,
    total,
    paid,
    balance: round2(total - paid),
  };
}

export const isActiveEvent = (e) => e.status === 'cotizado' || e.status === 'confirmado';

// Otro evento activo en el mismo salón, mismo día y horario traslapado
export function venueConflict(events, ev) {
  if (!ev.venueId) return null;
  return (
    events.find(
      (e) =>
        e.id !== ev.id &&
        isActiveEvent(e) &&
        e.venueId === ev.venueId &&
        e.date === ev.date &&
        e.start < ev.end &&
        ev.start < e.end,
    ) || null
  );
}
