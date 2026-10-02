// Venta de devolución (montos negativos): sale de caja y baja lo pagado en el folio o el evento
import { uid } from './dates.js';

export function refundSale(state, user, { kind, ref, amount, method, name, resId, eventId }) {
  return {
    id: uid('s'),
    number: state.counters.doc + 1,
    kind,
    docType: 'devolucion',
    ts: Date.now(),
    ref,
    ...(resId && { resId }),
    ...(eventId && { eventId }),
    lines: [{ name, qty: 1, price: -amount, cat: kind === 'evento' ? 'Eventos' : 'Hospedaje' }],
    subtotal: -amount,
    total: -amount,
    tip: 0,
    grand: -amount,
    discount: null,
    payments: [{ method, amount: -amount }],
    change: 0,
    invoice: null,
    cashierId: user.id,
    shiftId: state.shift?.id,
    status: 'ok',
  };
}
