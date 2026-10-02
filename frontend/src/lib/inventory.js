// Estado de existencia según el mínimo configurado
export const stockStatus = (it) => (it.stock <= 0 ? 'agotado' : it.stock < it.min ? 'bajo' : 'ok');

// Cantidades sin decimales innecesarios: 3, 2.5, 0.25
export const qtyFmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

// Insumos ya comprometidos por platillos pedidos que aún no se envían a cocina: { itemId: cantidad }
export function reservedStock(orders, menu) {
  const out = {};
  for (const l of orders.flatMap((o) => o.lines)) {
    if (l.sent) continue;
    for (const r of menu.find((m) => m.id === l.mid)?.recipe || [])
      out[r.itemId] = (out[r.itemId] || 0) + r.qty * l.qty;
  }
  return out;
}

// ¿Alcanzan los insumos para una porción más? (platillos sin receta: siempre)
export const canMake = (menuItem, inventory, reserved = {}) =>
  (menuItem.recipe || []).every((r) => {
    const it = inventory.find((i) => i.id === r.itemId);
    return !it || it.stock - (reserved[r.itemId] || 0) >= r.qty - 1e-9;
  });
