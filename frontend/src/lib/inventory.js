// Estado de existencia según el mínimo configurado
export const stockStatus = (it) => (it.stock <= 0 ? 'agotado' : it.stock < it.min ? 'bajo' : 'ok');

// Cantidades sin decimales innecesarios: 3, 2.5, 0.25
export const qtyFmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

// ¿Alcanzan los insumos para preparar una porción? (platillos sin receta: siempre)
export const canMake = (menuItem, inventory) =>
  (menuItem.recipe || []).every((r) => {
    const it = inventory.find((i) => i.id === r.itemId);
    return !it || it.stock >= r.qty;
  });
