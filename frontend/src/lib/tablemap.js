// Geometría del mapa de mesas. Coordenadas en un lienzo lógico de MAP_W × MAP_H por zona.
export const MAP_W = 1000;
export const MAP_H = 460;
export const GRID = 10;

export const SHAPES = { cuadrada: 'Cuadrada', redonda: 'Redonda', rectangular: 'Rectangular' };

export function sizeFor(shape, seats) {
  if (shape === 'rectangular') return { w: Math.max(140, 40 * Math.ceil(seats / 2) + 40), h: 90 };
  const d = seats <= 2 ? 80 : seats <= 4 ? 100 : 120;
  return { w: d, h: d };
}

export const snap = (v) => Math.round(v / GRID) * GRID;
export const clampPos = (x, y, w, h) => ({
  x: Math.min(Math.max(0, snap(x)), MAP_W - w),
  y: Math.min(Math.max(0, snap(y)), MAP_H - h),
});

// Mesas sin posición (creadas antes del mapa) se acomodan en cuadrícula
export function placed(table, index) {
  if (table.x != null && table.y != null && table.w && table.h) return table;
  const shape = table.shape || (table.seats >= 6 ? 'rectangular' : 'cuadrada');
  const { w, h } = sizeFor(shape, table.seats);
  const col = index % 5;
  const row = Math.floor(index / 5);
  return { ...table, shape, w, h, x: 40 + col * 190, y: 40 + row * 180 };
}

// Posiciones de las sillas alrededor de la mesa (relativas a su esquina)
export function chairs(t) {
  const n = t.seats;
  const out = [];
  if (t.shape === 'redonda') {
    const r = t.w / 2 + 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      out.push({ cx: t.w / 2 + r * Math.cos(a), cy: t.h / 2 + r * Math.sin(a) });
    }
    return out;
  }
  // Rectangulares: sillas arriba y abajo. Cuadradas: repartidas en los cuatro lados.
  const sides = t.shape === 'rectangular' ? ['top', 'bottom'] : ['top', 'bottom', 'left', 'right'];
  const per = Object.fromEntries(sides.map((s) => [s, 0]));
  for (let i = 0; i < n; i++) per[sides[i % sides.length]]++;
  for (const side of sides) {
    const k = per[side];
    for (let i = 0; i < k; i++) {
      const f = (i + 1) / (k + 1);
      if (side === 'top') out.push({ cx: t.w * f, cy: -12 });
      if (side === 'bottom') out.push({ cx: t.w * f, cy: t.h + 12 });
      if (side === 'left') out.push({ cx: -12, cy: t.h * f });
      if (side === 'right') out.push({ cx: t.w + 12, cy: t.h * f });
    }
  }
  return out;
}

// Primer hueco libre de la zona para una mesa nueva
export function freeSpot(items, w, h) {
  for (let y = 30; y <= MAP_H - h - 20; y += 40) {
    for (let x = 30; x <= MAP_W - w - 20; x += 40) {
      const hit = items.some((o) => x < o.x + o.w + 30 && o.x < x + w + 30 && y < o.y + o.h + 30 && o.y < y + h + 30);
      if (!hit) return { x, y };
    }
  }
  return { x: 30, y: 30 };
}
