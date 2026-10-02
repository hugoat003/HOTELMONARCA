import { addDays, addMonths, today } from '../lib/dates.js';
import { linesTotal, round2 } from '../lib/money.js';
import { buildReport } from '../lib/report.js';
import { A } from './actions.js';

export const VERSION = 10;

const CATEGORIES = ['Desayunos', 'Entradas', 'Platos fuertes', 'Postres', 'Bebidas', 'Bar', 'Especiales'];

const MENU = [
  ['m1', 'Desayunos', 'Chilaquiles verdes', 65],
  ['m2', 'Desayunos', 'Desayuno chapín', 70],
  ['m3', 'Desayunos', 'Molletes Monarca', 55],
  ['m4', 'Desayunos', 'Pancakes con fruta', 60],
  ['m5', 'Entradas', 'Guacamole de la casa', 55],
  ['m6', 'Entradas', 'Sopa de tortilla', 48],
  ['m7', 'Entradas', 'Ceviche de camarón', 85],
  ['m8', 'Platos fuertes', 'Pepián de pollo', 95],
  ['m9', 'Platos fuertes', 'Lomito a la parrilla', 165],
  ['m10', 'Platos fuertes', 'Salmón a las finas hierbas', 150],
  ['m11', 'Platos fuertes', 'Kak’ik de chompipe', 110],
  ['m12', 'Postres', 'Rellenitos de plátano', 35],
  ['m13', 'Postres', 'Flan de la casa', 38],
  ['m14', 'Bebidas', 'Café de Antigua', 22],
  ['m15', 'Bebidas', 'Jugo natural', 28],
  ['m16', 'Bebidas', 'Limonada con soda', 25],
  ['m17', 'Bebidas', 'Gaseosa', 18],
  ['m18', 'Bar', 'Margarita', 60],
  ['m19', 'Bar', 'Ron Zacapa 23', 75],
  ['m20', 'Bar', 'Cerveza Gallo', 25],
  ['m21', 'Especiales', 'Cena de parejas (2 pers.)', 450],
  ['m22', 'Especiales', 'Copa de vino tinto', 55],
].map(([id, cat, name, price]) => ({ id, cat, name, price, active: true }));
MENU.find((m) => m.id === 'm7').active = false; // agotado, para mostrarlo en la demo

// Modificadores: grupos que se eligen al pedir un platillo
const MODIFIER_GROUPS = [
  {
    id: 'g1',
    name: 'Término',
    required: true,
    multiple: false,
    options: [
      { id: 'o1', name: 'Rojo', price: 0 },
      { id: 'o2', name: 'Término medio', price: 0 },
      { id: 'o3', name: 'Tres cuartos', price: 0 },
      { id: 'o4', name: 'Bien cocido', price: 0 },
    ],
  },
  {
    id: 'g2',
    name: 'Extras',
    required: false,
    multiple: true,
    options: [
      { id: 'o5', name: 'Aguacate', price: 10 },
      { id: 'o6', name: 'Queso', price: 8 },
      { id: 'o7', name: 'Tocino', price: 12 },
    ],
  },
  {
    id: 'g3',
    name: 'Preparación',
    required: false,
    multiple: false,
    options: [
      { id: 'o8', name: 'Con hielo', price: 0 },
      { id: 'o9', name: 'Sin hielo', price: 0 },
    ],
  },
];
const MODS = { m1: ['g2'], m2: ['g2'], m9: ['g1', 'g2'], m15: ['g3'], m16: ['g3'] };

// Recetas: insumos de Inventario que consume cada platillo (por porción)
const RECIPES = {
  m1: [
    ['i5', 0.08],
    ['i1', 0.1],
  ],
  m5: [['i4', 2]],
  m8: [
    ['i1', 0.35],
    ['i5', 0.05],
  ],
  m9: [['i2', 0.3]],
  m10: [['i3', 0.25]],
  m14: [['i6', 0.04]],
  m17: [['i9', 1]],
  m19: [['i10', 0.06]],
  m20: [['i8', 1]],
  m22: [['i12', 0.2]],
};
for (const m of MENU) {
  m.modGroups = MODS[m.id] || [];
  m.recipe = (RECIPES[m.id] || []).map(([itemId, qty]) => ({ itemId, qty }));
}
const BYID = Object.fromEntries(MENU.map((m) => [m.id, m]));

const USERS = [
  { id: 'u1', name: 'Marta Gerente', role: 'gerente', pin: '1111', active: true },
  { id: 'u2', name: 'Luis Recepción', role: 'recepcion', pin: '2222', active: true },
  { id: 'u3', name: 'Juan', role: 'mesero', pin: '3333', active: true },
  { id: 'u4', name: 'Ana', role: 'mesero', pin: '4444', active: true },
];

// Mesas con su ubicación en el mapa (lienzo de 1000 × 460 por zona)
const T = (id, zone, seats, shape, x, y, reservedAt = null) => {
  const size = shape === 'rectangular' ? { w: 170, h: 90 } : seats <= 2 ? { w: 80, h: 80 } : { w: 100, h: 100 };
  return { id, name: 'Mesa ' + id, zone, seats, shape, x, y, ...size, reservedAt };
};
const TABLES = [
  T(1, 'Salón', 4, 'cuadrada', 80, 60),
  T(2, 'Salón', 2, 'cuadrada', 270, 70),
  T(3, 'Salón', 4, 'redonda', 430, 60),
  T(4, 'Salón', 6, 'rectangular', 80, 280),
  T(5, 'Salón', 4, 'redonda', 330, 270),
  T(6, 'Salón', 2, 'cuadrada', 520, 280),
  T(7, 'Terraza', 4, 'redonda', 90, 80),
  T(8, 'Terraza', 2, 'cuadrada', 300, 90),
  T(9, 'Terraza', 6, 'rectangular', 460, 80, '20:00'),
  T(10, 'Terraza', 4, 'cuadrada', 290, 280),
];
// Elementos fijos del mapa (barra, cocina, entrada…)
const MAP_DECOR = [
  { id: 'd1', zone: 'Salón', label: 'Barra', x: 760, y: 40, w: 190, h: 70 },
  { id: 'd2', zone: 'Salón', label: 'Cocina', x: 760, y: 150, w: 190, h: 130 },
  { id: 'd3', zone: 'Salón', label: 'Entrada', x: 380, y: 420, w: 180, h: 40 },
  { id: 'd4', zone: 'Terraza', label: 'Jardín', x: 700, y: 250, w: 250, h: 170 },
  { id: 'd5', zone: 'Terraza', label: 'Acceso desde salón', x: 40, y: 420, w: 200, h: 40 },
];

const ROOM_TYPES = [
  { id: 'std', name: 'Estándar', rate: 650, monthlyRate: 7500 },
  { id: 'dlx', name: 'Deluxe', rate: 900, monthlyRate: 9500 },
  { id: 'ste', name: 'Suite', rate: 1400, monthlyRate: 14000 },
];
const ROOMS = [
  ['101', 'std'],
  ['102', 'std'],
  ['103', 'std'],
  ['104', 'dlx'],
  ['201', 'dlx'],
  ['202', 'dlx'],
  ['203', 'dlx'],
  ['204', 'ste'],
  ['301', 'ste'],
  ['302', 'ste'],
].map(([n, typeId]) => ({ n, typeId, hk: n === '203' ? 'sucia' : 'limpia' }));
const RATE = Object.fromEntries(ROOMS.map((r) => [r.n, ROOM_TYPES.find((t) => t.id === r.typeId).rate]));

// Generador pseudoaleatorio con semilla: el historial de ejemplo sale igual en cada carga
const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const PAST_GUESTS = [
  ['Jorge Morales', 'DPI 1844 22331 0101'],
  ['Claudia Herrera', 'DPI 2091 55418 0101'],
  ['Emily Carter', 'Pasaporte 561200874'],
  ['Familia Chen', 'Pasaporte E33018842'],
  ['Andrés Rodas', 'DPI 2610 77120 0301'],
  ['Lucía Barrios', 'DPI 2345 10982 0101'],
  ['Marc Dubois', 'Pasaporte 19FR22871'],
  ['Silvia Paz', 'DPI 1987 44120 0101'],
];

const at = (day, time) => new Date(`${day}T${time}:00`).getTime();
const line = (mid, qty, sent = true, note = '', mods = []) => {
  const m = BYID[mid];
  return {
    id: 'l_' + mid + '_' + qty + Math.random().toString(36).slice(2, 6),
    mid,
    name: m.name,
    cat: m.cat,
    basePrice: m.price,
    mods,
    price: m.price + mods.reduce((a, x) => a + x.price, 0),
    qty,
    note,
    sent,
  };
};

export function seed() {
  const d0 = today();
  const y = addDays(d0, -1);

  const guest = (name, phone, doc, extra = {}) => ({
    name,
    phone,
    email: '',
    doc,
    nationality: 'Guatemala',
    ...extra,
  });
  const R = (id, roomN, g, checkIn, checkOut, status, extra = {}) => ({
    id,
    roomN,
    guest: g,
    adults: 2,
    children: 0,
    checkIn,
    checkOut,
    channel: 'Directo',
    rate: RATE[roomN],
    // 'auto': precio por noche según tipo, temporada y fin de semana; 'fija': tarifa pactada
    pricing: 'auto',
    status,
    notes: '',
    charges: [],
    payments: [],
    createdAt: at(addDays(checkIn, -7), '10:00'),
    ...extra,
  });
  const reservations = [
    R(
      'r1',
      '101',
      guest('Laura Méndez', '5512 3344', 'DPI 2456 78901 0101'),
      addDays(d0, -1),
      addDays(d0, 1),
      'hospedado',
    ),
    R('r2', '104', guest('Familia Ortega', '4021 8890', 'DPI 1987 65432 0101'), addDays(d0, -2), d0, 'hospedado', {
      adults: 2,
      children: 2,
    }),
    R(
      'r3',
      '202',
      guest('Ana Torres', '+1 415 555 0182', 'Pasaporte 548120973', {
        nationality: 'Estados Unidos',
        email: 'ana.torres@mail.com',
      }),
      addDays(d0, -1),
      addDays(d0, 3),
      'hospedado',
      { channel: 'Booking.com' },
    ),
    R('r4', '204', guest('Roberto Salas', '3300 1122', 'DPI 3012 44556 0108'), d0, addDays(d0, 2), 'hospedado', {
      adults: 1,
    }),
    R('r5', '103', guest('Carlos Ruiz', '5890 7766', 'DPI 2233 11009 0101'), d0, addDays(d0, 3), 'reservada', {
      channel: 'Teléfono',
    }),
    R(
      'r6',
      '302',
      guest('Sofía Lara', '+52 55 1234 5678', 'Pasaporte G08812345', { nationality: 'México' }),
      d0,
      addDays(d0, 1),
      'reservada',
      { channel: 'Expedia' },
    ),
    R(
      'r7',
      '102',
      guest('Pedro Castillo', '4477 9900', 'DPI 1122 33445 0501'),
      addDays(d0, 3),
      addDays(d0, 5),
      'reservada',
      { channel: 'WhatsApp' },
    ),
    R(
      'r8',
      '201',
      guest('Ing. Mariela Gómez', '5566 1234', 'DPI 2780 11223 0101'),
      addDays(d0, -12),
      addMonths(addDays(d0, -12), 2),
      'hospedado',
      {
        channel: 'Directo',
        adults: 1,
        rateType: 'mensual',
        rate: 9500,
        notes: 'Estancia larga por proyecto. Paga en abonos durante el mes.',
      },
    ),
    R(
      'r9',
      '301',
      guest('Thomas Becker', '+49 170 555 0199', 'Pasaporte C4F1R22K7', { nationality: 'Alemania' }),
      addDays(d0, 2),
      addDays(d0, 4),
      'reservada',
      { channel: 'Expedia', adults: 1 },
    ),
    R(
      'r10',
      '203',
      guest('Grupo Asturias', '2233 4455', 'DPI 1509 98765 0101'),
      addDays(d0, 7),
      addDays(d0, 10),
      'reservada',
      { channel: 'Agencia', adults: 3 },
    ),
    R(
      'r11',
      '101',
      guest('Diego Paz', '5544 3322', 'DPI 2001 55667 0101'),
      addDays(d0, 4),
      addDays(d0, 6),
      'reservada',
    ),
    // Estancias pasadas (historial de huéspedes)
    R(
      'h1',
      '101',
      guest('Laura Méndez', '5512 3344', 'DPI 2456 78901 0101'),
      addDays(d0, -200),
      addDays(d0, -198),
      'salida',
    ),
    R(
      'h2',
      '102',
      guest('Laura Méndez', '5512 3344', 'DPI 2456 78901 0101'),
      addDays(d0, -120),
      addDays(d0, -117),
      'salida',
    ),
    R(
      'h3',
      '101',
      guest('Laura Méndez', '5512 3344', 'DPI 2456 78901 0101'),
      addDays(d0, -45),
      addDays(d0, -43),
      'salida',
    ),
    R(
      'h4',
      '204',
      guest('Roberto Salas', '3300 1122', 'DPI 3012 44556 0108'),
      addDays(d0, -90),
      addDays(d0, -88),
      'salida',
      { adults: 1 },
    ),
  ];

  // Historial de ocupación de los últimos 30 días: estancias ya cerradas, sin traslapes por habitación
  const rnd = mulberry32(20261001);
  ROOMS.forEach((room, ri) => {
    const firstCurrent = reservations
      .filter((r) => r.roomN === room.n && r.checkIn >= addDays(d0, -30))
      .map((r) => r.checkIn)
      .sort()[0];
    const limit = firstCurrent && firstCurrent < addDays(d0, -1) ? firstCurrent : addDays(d0, -1);
    let day = addDays(d0, -30 + Math.floor(rnd() * 3));
    let n = 0;
    while (day < limit) {
      const nights = 1 + Math.floor(rnd() * 4);
      const out = addDays(day, nights);
      if (out > limit) break;
      if (rnd() < 0.62) {
        const [name, docId] = PAST_GUESTS[Math.floor(rnd() * PAST_GUESTS.length)];
        const channel = ['Directo', 'Booking.com', 'Expedia', 'WhatsApp'][Math.floor(rnd() * 4)];
        reservations.push(R(`hx${ri}_${n++}`, room.n, guest(name, '', docId), day, out, 'salida', { channel }));
      }
      day = addDays(out, Math.floor(rnd() * 3));
    }
  });
  // Las reservas de OTA llegan con tarifa pactada
  for (const r of reservations) if (r.channel === 'Booking.com' || r.channel === 'Expedia') r.pricing = 'fija';
  for (const r of reservations) if (r.status === 'salida') r.checkedOutOn = r.checkOut;

  // Fichas de huésped: una por documento, enlazadas a sus reservas
  const guests = [];
  for (const r of reservations) {
    let g = guests.find((x) => x.doc === r.guest.doc);
    if (!g) {
      g = { id: 'gst' + (guests.length + 1), ...r.guest, notes: '', createdAt: r.createdAt };
      guests.push(g);
    }
    r.guestId = g.id;
  }
  guests.find((g) => g.name === 'Laura Méndez').notes = 'Prefiere habitación en primer piso, lejos del bar.';

  // Temporadas: precio por tipo de habitación en esas fechas
  const year = Number(d0.slice(0, 4));
  const seasons = [
    {
      id: 't1',
      name: 'Temporada alta de octubre',
      from: addDays(d0, 5),
      to: addDays(d0, 9),
      rates: { std: 850, dlx: 1150, ste: 1750 },
    },
    {
      id: 't2',
      name: 'Fiestas de fin de año',
      from: `${year}-12-20`,
      to: `${year + 1}-01-02`,
      rates: { std: 950, dlx: 1300, ste: 1950 },
    },
  ];
  // Anticipos
  reservations
    .find((r) => r.id === 'r5')
    .payments.push({ id: 'p_r5', ts: at(y, '16:20'), method: 'transferencia', amount: 500, desc: 'Anticipo' });
  reservations
    .find((r) => r.id === 'r8')
    .payments.push(
      { id: 'p_r8a', ts: at(addDays(d0, -12), '15:00'), method: 'transferencia', amount: 5000, desc: 'Abono mes 1' },
      { id: 'p_r8b', ts: at(addDays(d0, -4), '10:30'), method: 'tarjeta', amount: 4000, desc: 'Abono mes 1' },
    );
  reservations
    .find((r) => r.id === 'r3')
    .payments.push({ id: 'p_r3', ts: at(y, '15:05'), method: 'tarjeta', amount: 1500, desc: 'Anticipo' });

  // Turno de ayer (cerrado) y turno de hoy (abierto)
  const shiftY = { id: 'sh_y', openedAt: at(y, '07:00'), openedBy: 'u1', float: 1000, movements: [] };
  const shift = {
    id: 'sh_' + d0,
    openedAt: at(d0, '07:00'),
    openedBy: 'u1',
    float: 1000,
    movements: [
      {
        id: 'mv1',
        ts: at(d0, '09:40'),
        type: 'salida',
        amount: 150,
        reason: 'Compra de hielo y garrafones',
        userId: 'u2',
      },
    ],
  };

  let doc = 0;
  const sale = (shiftId, day, time, ref, items, method, opts = {}) => {
    const lines = items.map(([mid, qty]) => line(mid, qty));
    const total = linesTotal(lines);
    const tip = opts.tip ? round2(total * 0.1) : 0;
    const grand = round2(total + tip);
    doc++;
    return {
      id: 's' + doc,
      number: doc,
      kind: 'restaurante',
      ts: at(day, time),
      ref,
      lines,
      subtotal: total,
      discount: null,
      total,
      tip,
      grand,
      payments: [{ method, amount: grand, ...(opts.pay || {}) }],
      change: 0,
      invoice: opts.invoice || null,
      waiterId: opts.waiter || 'u3',
      cashierId: 'u2',
      shiftId,
      status: 'ok',
    };
  };
  // Historial de ventas: un turno cerrado por día durante los últimos 30 días (antes de ayer)
  const DISHES = [
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'm6',
    'm8',
    'm9',
    'm10',
    'm11',
    'm12',
    'm13',
    'm14',
    'm15',
    'm16',
    'm17',
    'm18',
    'm19',
    'm20',
  ];
  const historyShifts = [];
  const historySales = [];
  for (let k = 30; k >= 2; k--) {
    const day = addDays(d0, -k);
    const sh = { id: 'sh_h' + k, openedAt: at(day, '07:00'), openedBy: 'u1', float: 1000, movements: [] };
    historyShifts.push(sh);
    const weekend = [5, 6, 0].includes(new Date(day + 'T12:00').getDay());
    const count = 5 + Math.floor(rnd() * 6) + (weekend ? 4 : 0);
    for (let i = 0; i < count; i++) {
      const items = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => [
        DISHES[Math.floor(rnd() * DISHES.length)],
        1 + Math.floor(rnd() * 2),
      ]);
      const r = rnd();
      const method = r < 0.4 ? 'efectivo' : r < 0.9 ? 'tarjeta' : 'transferencia';
      const hh = String(7 + Math.floor((i / count) * 14)).padStart(2, '0');
      const mm = String(Math.floor(rnd() * 60)).padStart(2, '0');
      historySales.push(
        sale(sh.id, day, `${hh}:${mm}`, `Mesa ${1 + Math.floor(rnd() * 10)}`, items, method, {
          tip: rnd() < 0.6,
          waiter: rnd() < 0.5 ? 'u3' : 'u4',
        }),
      );
    }
  }

  const sales = [
    ...historySales,
    sale(
      shiftY.id,
      y,
      '08:15',
      'Mesa 2',
      [
        ['m2', 2],
        ['m14', 2],
      ],
      'efectivo',
    ),
    sale(
      shiftY.id,
      y,
      '13:30',
      'Mesa 5',
      [
        ['m9', 2],
        ['m20', 3],
        ['m5', 1],
      ],
      'tarjeta',
      {
        tip: true,
        waiter: 'u4',
        // Factura ya emitida por la gerencia
        invoice: {
          nit: '1234567-8',
          name: 'Agencia de Viajes Maya',
          email: '',
          number: 'A-10458',
          invoicedAt: at(y, '18:00'),
          invoicedBy: 'u1',
        },
      },
    ),
    sale(
      shiftY.id,
      y,
      '19:45',
      'Mesa 7',
      [
        ['m8', 2],
        ['m18', 2],
        ['m13', 2],
      ],
      'efectivo',
      { tip: true },
    ),
    sale(
      shift.id,
      d0,
      '08:42',
      'Mesa 4',
      [
        ['m1', 2],
        ['m14', 3],
        ['m15', 2],
      ],
      'efectivo',
      { tip: true },
    ),
    sale(
      shift.id,
      d0,
      '09:15',
      'Mesa 1',
      [
        ['m2', 3],
        ['m4', 1],
        ['m14', 4],
      ],
      'tarjeta',
      {
        tip: true,
        waiter: 'u4',
        invoice: {
          nit: '8765432-1',
          name: 'Transportes del Sur, S.A.',
          email: 'contabilidad@transportesdelsur.gt',
          number: null,
        },
      },
    ),
    sale(
      shift.id,
      d0,
      '10:05',
      'Mesa 3',
      [
        ['m3', 2],
        ['m16', 2],
      ],
      'habitacion',
      { pay: { resId: 'r2', roomN: '104' } },
    ),
    sale(
      shift.id,
      d0,
      '12:30',
      'Mesa 6',
      [
        ['m10', 1],
        ['m11', 1],
        ['m19', 2],
        ['m12', 2],
      ],
      'tarjeta',
      { tip: true, waiter: 'u4' },
    ),
  ];
  const roomSale = sales.find((x) => x.payments[0].method === 'habitacion');
  reservations
    .find((r) => r.id === 'r2')
    .charges.push({
      id: 'c1',
      ts: roomSale.ts,
      desc: `Restaurante · Mesa 3 · Ticket #${roomSale.number}`,
      amt: roomSale.grand,
      saleId: roomSale.id,
      type: 'restaurante',
    });

  // Tienda de recepción
  const S = (id, name, cat, price, cost, stock, min) => ({
    id,
    name,
    cat,
    unit: 'unidad',
    price,
    cost,
    stock,
    min,
    active: true,
  });
  const shopItems = [
    S('t1', 'Agua pura 600 ml', 'Bebidas', 10, 4, 36, 24),
    S('t2', 'Agua con gas', 'Bebidas', 15, 7, 12, 12),
    S('t3', 'Gaseosa lata', 'Bebidas', 12, 5.5, 30, 24),
    S('t4', 'Gatorade', 'Bebidas', 18, 9, 9, 12),
    S('t5', 'Cerveza Gallo lata', 'Bebidas', 22, 9, 24, 12),
    S('t6', 'Papalinas', 'Snacks', 8, 3.5, 40, 20),
    S('t7', 'Chocolate Tortrix', 'Snacks', 10, 4.5, 18, 15),
    S('t8', 'Galletas Chiky', 'Snacks', 6, 2.5, 4, 15),
    S('t9', 'Manías saladas', 'Snacks', 12, 5, 20, 10),
    S('t10', 'Cepillo de dientes', 'Higiene personal', 15, 5, 14, 10),
    S('t11', 'Pasta dental viaje', 'Higiene personal', 18, 7, 10, 10),
    S('t12', 'Desodorante', 'Higiene personal', 35, 18, 6, 5),
    S('t13', 'Bloqueador solar', 'Higiene personal', 85, 48, 0, 4),
    S('t14', 'Toallitas húmedas', 'Limpieza', 25, 11, 8, 6),
    S('t15', 'Repelente', 'Limpieza', 45, 22, 7, 5),
    S('t16', 'Llavero Monarca', 'Souvenirs', 35, 12, 22, 10),
    S('t17', 'Café de Antigua 1 lb', 'Souvenirs', 95, 52, 11, 6),
  ];
  const shopMoves = [
    {
      id: 'sm1',
      ts: at(y, '10:00'),
      itemId: 't1',
      type: 'entrada',
      qty: 48,
      note: 'Compra a distribuidora',
      userId: 'u1',
      after: 48,
    },
    {
      id: 'sm2',
      ts: at(d0, '08:30'),
      itemId: 't7',
      type: 'merma',
      qty: 2,
      note: 'Producto vencido',
      userId: 'u2',
      after: 18,
    },
  ];
  const shopSale = (time, items, method, extra = {}) => {
    const lines = items.map(([itemId, qty]) => {
      const it = shopItems.find((x) => x.id === itemId);
      return { itemId, name: it.name, cat: it.cat, price: it.price, cost: it.cost, qty };
    });
    const total = linesTotal(lines);
    doc++;
    return {
      id: 's' + doc,
      number: doc,
      kind: 'tienda',
      ts: at(d0, time),
      ref: extra.ref || 'Tienda de recepción',
      lines,
      subtotal: total,
      discount: null,
      total,
      tip: 0,
      grand: total,
      payments: [{ method, amount: total, ...(extra.pay || {}) }],
      change: 0,
      invoice: null,
      cashierId: 'u2',
      shiftId: shift.id,
      status: 'ok',
    };
  };
  const shopSales = [
    shopSale(
      '09:05',
      [
        ['t1', 2],
        ['t6', 1],
      ],
      'efectivo',
    ),
    shopSale(
      '11:40',
      [
        ['t13', 1],
        ['t15', 1],
        ['t1', 2],
      ],
      'habitacion',
      { ref: 'Tienda · Hab. 202', pay: { resId: 'r3', roomN: '202' } },
    ),
  ];
  for (const sl of shopSales) {
    sales.push(sl);
    for (const l of sl.lines)
      shopMoves.push({
        id: 'sm_' + sl.id + l.itemId,
        ts: sl.ts,
        itemId: l.itemId,
        type: 'venta',
        qty: l.qty,
        note: `Ticket #${sl.number}`,
        userId: 'u2',
        after: shopItems.find((x) => x.id === l.itemId).stock,
        saleId: sl.id,
      });
  }
  reservations
    .find((r) => r.id === 'r3')
    .charges.push({
      id: 'c2',
      ts: shopSales[1].ts,
      desc: `Tienda de recepción · Ticket #${shopSales[1].number}`,
      amt: shopSales[1].grand,
      saleId: shopSales[1].id,
      type: 'tienda',
    });

  const orders = [
    {
      id: 'o1',
      type: 'mesa',
      tableId: 2,
      guests: 2,
      waiterId: 'u3',
      openedAt: at(d0, '13:10'),
      lines: [line('m8', 2), line('m16', 2)],
    },
    {
      id: 'o2',
      type: 'mesa',
      tableId: 5,
      guests: 4,
      waiterId: 'u4',
      openedAt: at(d0, '13:25'),
      lines: [
        line('m9', 1, true, '', [{ group: 'Término', name: 'Término medio', price: 0 }]),
        line('m18', 2),
        line('m5', 1),
        line('m11', 2, true, 'Sin chile'),
      ],
    },
    {
      id: 'o3',
      type: 'mesa',
      tableId: 7,
      guests: 3,
      waiterId: 'u3',
      openedAt: at(d0, '13:40'),
      lines: [line('m1', 1), line('m14', 2, false)],
    },
    {
      id: 'o4',
      type: 'llevar',
      number: 1,
      customer: 'Sr. Morales',
      guests: 1,
      waiterId: 'u4',
      openedAt: at(d0, '13:50'),
      lines: [line('m8', 1), line('m17', 1)],
    },
  ];

  const venues = [
    { id: 'v1', name: 'Salón Mariposa', capacity: 80, price: 3500 },
    { id: 'v2', name: 'Salón Jardín', capacity: 40, price: 2000 },
  ];
  const eventMenus = [
    {
      id: 'em1',
      name: 'Menú clásico',
      unit: 'persona',
      price: 165,
      description: 'Entrada, plato fuerte, postre y bebida',
    },
    {
      id: 'em2',
      name: 'Menú premium',
      unit: 'persona',
      price: 245,
      description: 'Tres tiempos con lomito o salmón, postre y copa de bienvenida',
    },
    {
      id: 'em3',
      name: 'Coffee break',
      unit: 'persona',
      price: 55,
      description: 'Café de Antigua, bocadillos dulces y salados',
    },
    {
      id: 'em4',
      name: 'Cena de parejas',
      unit: 'pareja',
      price: 450,
      description: 'Cena a tres tiempos para dos, copa de vino y postre para compartir',
    },
  ];
  const E = (id, name, date, start, end, venueId, menuId, guests, menuQty, status, client, extra = {}) => ({
    id,
    name,
    date,
    start,
    end,
    venueId,
    menuId,
    guests,
    menuQty,
    status,
    client,
    extras: [],
    payments: [],
    notes: '',
    createdAt: at(addDays(d0, -10), '11:00'),
    ...extra,
  });
  const events = [
    E(
      'e1',
      'Boda Castillo – Rivera',
      addDays(d0, 9),
      '17:00',
      '23:00',
      'v1',
      'em2',
      70,
      70,
      'confirmado',
      { name: 'Andrea Castillo', phone: '5512 8890' },
      {
        extras: [
          { id: 'x1', desc: 'Decoración', amt: 1200 },
          { id: 'x2', desc: 'Música / DJ', amt: 1500 },
        ],
        payments: [
          { id: 'ep1', ts: at(addDays(d0, -10), '11:30'), method: 'transferencia', amount: 8000, desc: 'Anticipo' },
        ],
        roomBlock: { rooms: ['301', '302'], nights: 1, rate: 900 },
      },
    ),
    E(
      'e2',
      'Capacitación Banco Industrial',
      addDays(d0, 2),
      '08:00',
      '13:00',
      'v2',
      'em3',
      25,
      25,
      'cotizado',
      { name: 'Banco Industrial, S.A.', phone: '2420 3000' },
      { extras: [{ id: 'x3', desc: 'Proyector y sonido', amt: 400 }] },
    ),
    E(
      'e4',
      'Presentación de libro',
      addDays(d0, 5),
      '18:00',
      '21:00',
      'v2',
      '',
      35,
      0,
      'cotizado',
      { name: 'Editorial Cholsamaj', phone: '2232 5959' },
      { notes: 'Solo uso del salón; el cliente trae su propio brindis.' },
    ),
    E(
      'e3',
      'Noche de parejas',
      addDays(d0, 14),
      '19:00',
      '22:30',
      '',
      'em4',
      24,
      12,
      'confirmado',
      { name: 'Venta abierta (restaurante)', phone: '' },
      { notes: 'Cupo de 12 parejas en terraza con música en vivo.' },
    ),
  ];

  const I = (id, name, cat, unit, stock, min, cost) => ({ id, name, cat, unit, stock, min, cost });
  const inventory = [
    I('i1', 'Pollo', 'Insumos', 'kg', 18, 10, 32),
    I('i2', 'Lomito de res', 'Insumos', 'kg', 6, 8, 95),
    I('i3', 'Salmón', 'Insumos', 'kg', 4, 3, 140),
    I('i4', 'Aguacate', 'Insumos', 'unidad', 25, 20, 4),
    I('i5', 'Tortillas', 'Insumos', 'ciento', 3, 4, 25),
    I('i6', 'Café de Antigua', 'Insumos', 'lb', 12, 5, 45),
    I('i7', 'Leche', 'Insumos', 'litro', 10, 12, 11),
    I('i8', 'Cerveza Gallo', 'Bebidas', 'unidad', 96, 48, 9),
    I('i9', 'Gaseosa', 'Bebidas', 'unidad', 40, 24, 5),
    I('i10', 'Ron Zacapa 23', 'Bebidas', 'botella', 3, 2, 420),
    I('i11', 'Tequila', 'Bebidas', 'botella', 1, 2, 260),
    I('i12', 'Vino tinto', 'Bebidas', 'botella', 14, 10, 95),
    I('i13', 'Contenedores para llevar', 'Desechables', 'unidad', 120, 100, 2.5),
    I('i14', 'Servilletas', 'Desechables', 'paquete', 0, 5, 18),
    I('i15', 'Copas de vino', 'Utensilios', 'unidad', 46, 48, 35),
    I('i16', 'Platos base', 'Utensilios', 'unidad', 60, 50, 45),
    I('i17', 'Desinfectante', 'Limpieza', 'galón', 4, 2, 60),
  ];
  const invMoves = [
    {
      id: 'im1',
      ts: at(y, '09:10'),
      itemId: 'i8',
      type: 'entrada',
      qty: 48,
      note: 'Compra a distribuidora',
      userId: 'u1',
      after: 120,
    },
    {
      id: 'im2',
      ts: at(y, '21:40'),
      itemId: 'i8',
      type: 'salida',
      qty: 24,
      note: 'Consumo del día',
      userId: 'u2',
      after: 96,
    },
    {
      id: 'im3',
      ts: at(d0, '08:05'),
      itemId: 'i15',
      type: 'merma',
      qty: 2,
      note: 'Copas quebradas en servicio',
      userId: 'u2',
      after: 46,
    },
    {
      id: 'im4',
      ts: at(d0, '10:20'),
      itemId: 'i1',
      type: 'entrada',
      qty: 10,
      note: 'Compra en mercado',
      userId: 'u1',
      after: 18,
    },
  ];

  const state = {
    version: VERSION,
    session: null,
    config: {
      businessName: 'Monarca Hotel Boutique',
      legalName: 'Inversiones Monarca, S.A.',
      nit: '9876543-2',
      address: '5a Avenida Norte #12, Antigua Guatemala',
      phone: '7832 0000',
      footer: '¡Gracias por su visita! Propina no incluida en el precio del menú.',
      currency: 'Q',
      tipPct: 10,
      lockMinutes: 5,
      weekendPct: 15,
      extraPersonFrom: 2,
      extraPersonRate: 150,
      catCourse: { Entradas: 'entrada', 'Platos fuertes': 'fuerte', Postres: 'postre', Especiales: 'fuerte' },
    },
    users: USERS,
    categories: CATEGORIES,
    menu: MENU,
    modifierGroups: MODIFIER_GROUPS,
    tables: TABLES,
    mapDecor: MAP_DECOR,
    roomTypes: ROOM_TYPES,
    rooms: ROOMS,
    reservations,
    guests,
    seasons,
    venues,
    eventMenus,
    events,
    inventory,
    invMoves,
    shopItems,
    shopMoves,
    orders,
    sales,
    voids: [],
    audit: [
      {
        id: 'au1',
        ts: at(addDays(d0, -2), '16:20'),
        type: 'precio',
        userId: 'u1',
        authId: null,
        ref: 'Menú · Lomito a la parrilla',
        detail: 'Cambio de precio: Q 155.00 → Q 165.00',
        amount: 10,
      },
      {
        id: 'au2',
        ts: at(y, '13:42'),
        type: 'anulacion',
        userId: 'u3',
        authId: 'u1',
        ref: 'Mesa 4',
        detail: '1 × Limonada con soda · Error del mesero (sin enviar)',
        amount: 25,
      },
      {
        id: 'au3',
        ts: at(y, '20:15'),
        type: 'cortesia',
        userId: 'u4',
        authId: 'u1',
        ref: 'Mesa 7',
        detail: '1 × Flan de la casa · Cumpleaños',
        amount: 38,
      },
      {
        id: 'au4',
        ts: at(d0, '09:10'),
        type: 'inventario',
        userId: 'u2',
        authId: 'u1',
        ref: 'Tienda · Agua pura 600 ml',
        detail: 'Merma de 2 unidad · Botellas dañadas',
        amount: 8,
      },
    ],
    shift,
    shiftHistory: [],
    counters: { doc, comanda: 14, llevar: 1 },
  };

  // Cierre de ayer con su reporte guardado
  shiftY.closedAt = at(y, '22:05');
  shiftY.closedBy = 'u1';
  const repY = buildReport(state, shiftY);
  // Ayer faltaron Q20 en el arqueo: aparece en Caja, en la bitácora y en los pendientes
  shiftY.counted = round2(repY.cash.expected - 20);
  shiftY.firstCounted = shiftY.counted;
  shiftY.recounts = 0;
  shiftY.differenceNote = 'Vuelto mal dado en la tarde';
  shiftY.difference = -20;
  state.audit.push({
    id: 'au5',
    ts: shiftY.closedAt,
    type: 'caja',
    userId: 'u1',
    authId: null,
    ref: 'Cierre de turno',
    detail: 'Faltante · Vuelto mal dado en la tarde',
    amount: -20,
  });
  shiftY.report = repY;
  state.shiftHistory.push(shiftY);
  // Cierres de los días anteriores (más reciente primero)
  for (const sh of historyShifts.reverse()) {
    sh.closedAt = sh.openedAt + 15 * 3600 * 1000;
    sh.closedBy = 'u1';
    sh.report = buildReport(state, sh);
    sh.counted = sh.report.cash.expected;
    sh.difference = 0;
    state.shiftHistory.push(sh);
  }

  // Habitaciones apartadas para los invitados de la boda
  A.syncEventRooms(state, 'e1');

  return state;
}
