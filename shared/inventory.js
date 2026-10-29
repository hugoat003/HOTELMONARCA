// Estado de existencia según el mínimo configurado
export const stockStatus = (it) => (it.stock <= 0 ? 'agotado' : it.stock < it.min ? 'bajo' : 'ok');

// Cantidades sin decimales innecesarios: 3, 2.5, 0.25, 0.125
export const qtyFmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''));

// ----- Unidades: un insumo se compra en una unidad (kg) y las recetas lo gastan en otra (g).
// La existencia se lleva en la unidad de compra; perUnit dice cuántas unidades de uso trae una de compra.
// Equivalencia de cada unidad con la base de su tipo (g, ml o pieza)
const UNIT_DEFS = {
  g: ['peso', 1],
  kg: ['peso', 1000],
  oz: ['peso', 28.349523125],
  lb: ['peso', 453.59237],
  ml: ['volumen', 1],
  litro: ['volumen', 1000],
  'onza líquida': ['volumen', 29.5735295625],
  galón: ['volumen', 3785.411784],
  unidad: ['pieza', 1],
  docena: ['pieza', 12],
  ciento: ['pieza', 100],
};
export const USE_UNITS = Object.keys(UNIT_DEFS);

// Unidades de uso que trae una de compra cuando la equivalencia es fija (kg → g: 1000).
// null si depende del producto (cuántos ml trae la botella): eso lo escribe el usuario.
export function fixedFactor(buy, use) {
  if (buy === use) return 1;
  const a = UNIT_DEFS[buy];
  const b = UNIT_DEFS[use];
  return a && b && a[0] === b[0] ? a[1] / b[1] : null;
}
export const spendUnit = (it) => it?.useUnit || it?.unit || '';
export const perUnit = (it) => (it?.perUnit > 0 ? it.perUnit : 1);
// Cantidad de receta (unidad de uso) → existencia (unidad de compra)
export const toStock = (it, qty) => qty / perUnit(it);
// Costo de una unidad de uso
export const spendCost = (it) => (it?.cost || 0) / perUnit(it);

// Insumos ya comprometidos por platillos pedidos que aún no se envían a cocina: { itemId: cantidad }
// (en unidad de compra, como la existencia)
export function reservedStock(orders, menu, inventory) {
  const out = {};
  for (const l of orders.flatMap((o) => o.lines)) {
    if (l.sent) continue;
    for (const r of menu.find((m) => m.id === l.mid)?.recipe || []) {
      const it = inventory.find((i) => i.id === r.itemId);
      out[r.itemId] = (out[r.itemId] || 0) + toStock(it, r.qty) * l.qty;
    }
  }
  return out;
}

// ¿Alcanzan los insumos para una porción más? (platillos sin receta: siempre)
export const canMake = (menuItem, inventory, reserved = {}) =>
  (menuItem.recipe || []).every((r) => {
    const it = inventory.find((i) => i.id === r.itemId);
    return !it || it.stock - (reserved[r.itemId] || 0) >= toStock(it, r.qty) - 1e-9;
  });

// Costo de una porción según su receta y el costo actual de los insumos (null si no tiene receta)
export function dishCost(menuItem, inventory) {
  if (!menuItem?.recipe?.length) return null;
  const c = menuItem.recipe.reduce((a, r) => a + spendCost(inventory.find((i) => i.id === r.itemId)) * r.qty, 0);
  return Math.round(c * 100) / 100;
}

// Margen sobre el precio de venta, en % (null si no se puede calcular)
export const marginPct = (price, cost) => (cost === null || !price ? null : Math.round(((price - cost) / price) * 100));
