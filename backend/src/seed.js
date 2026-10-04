// Estado con el que arranca una base nueva.
// demo: datos de ejemplo con fechas de hoy. vacio: catálogos de ejemplo sin movimientos
// (punto de partida para cargar los datos reales del hotel).
import { seed } from '../../shared/seed.js';

export function initialState(kind = 'demo') {
  const s = seed();
  if (kind === 'demo') return s;
  for (const t of s.tables) t.reservedAt = null;
  return {
    ...s,
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
