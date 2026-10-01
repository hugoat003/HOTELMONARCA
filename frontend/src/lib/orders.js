// Utilidades de cuentas del restaurante (mesas, unión de mesas, modificadores)
import { round2, sum } from './money.js';

const byId = (arr, id) => arr.find((x) => x.id === id);

// Mesas que ocupa una cuenta: la principal y las que se le unieron
export const orderTables = (order) => (order.type === 'mesa' ? [order.tableId, ...(order.joined || [])] : []);

// Cuenta abierta que ocupa una mesa (como principal o unida)
export const tableOrder = (orders, tableId) =>
  orders.find((o) => o.type === 'mesa' && orderTables(o).includes(tableId)) || null;

export const orderLabel = (order, tables) =>
  order.type === 'mesa'
    ? orderTables(order)
        .map((id, i) =>
          i === 0 ? byId(tables, id)?.name || 'Mesa' : (byId(tables, id)?.name || '').replace('Mesa ', ''),
        )
        .join(' + ')
    : `Para llevar #${order.number}${order.customer ? ' · ' + order.customer : ''}`;

// Precio unitario de un platillo con sus modificadores
export const unitPrice = (basePrice, mods = []) => round2(basePrice + sum(mods, (m) => m.price));

// Las líneas iguales (mismo platillo, mismos modificadores, sin nota ni cortesía, sin enviar) se suman
export const sameLine = (l, mid, mods) =>
  l.mid === mid && !l.sent && !l.note && !l.courtesy && JSON.stringify(l.mods || []) === JSON.stringify(mods || []);

export const modsText = (mods = []) => mods.map((m) => (m.price ? `${m.name} (+${m.price})` : m.name)).join(' · ');
