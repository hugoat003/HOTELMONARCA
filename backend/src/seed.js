// Estado con el que arranca una base nueva.
// demo: datos de ejemplo con fechas de hoy. vacio: catálogos de ejemplo sin movimientos
// (punto de partida para cargar los datos reales del hotel).
import { seed } from '../../shared/seed.js';

export function initialState(kind = 'demo') {
  const s = seed();
  return kind === 'demo' ? s : clearOperations(s);
}

// Quita todo lo operativo (ventas, cuentas, reservas, huéspedes, eventos, turnos, movimientos,
// bitácora) y conserva los catálogos y la configuración: menú, mesas, habitaciones, salones,
// usuarios, inventario y tienda (con sus existencias actuales), impresoras y negocio.
// Se usa para una base nueva y para borrar los datos de prueba antes de abrir.
export function clearOperations(s) {
  return {
    ...s,
    tables: s.tables.map((t) => ({ ...t, reservedAt: null })),
    rooms: s.rooms.map((r) => ({ ...r, hk: 'limpia' })),
    reservations: [],
    guests: [],
    events: [],
    invMoves: [],
    shopMoves: [],
    orders: [],
    sales: [],
    voids: [],
    audit: [],
    shift: null,
    shiftHistory: [],
    counters: { doc: 0, comanda: 0, llevar: 0 },
  };
}
