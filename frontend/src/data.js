// Constantes fijas de la interfaz. Todo lo editable (menú, mesas, habitaciones,
// usuarios, configuración) vive en el store — ver src/store/seed.js.

export const NAV = [
  { key: 'dashboard', label: 'Resumen', group: 'General' },
  { key: 'mesas', label: 'Mesas', group: 'Restaurante' },
  { key: 'pedido', label: 'Pedido' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'habitaciones', label: 'Habitaciones', group: 'Hotel' },
  { key: 'reservas', label: 'Reservas' },
  { key: 'limpieza', label: 'Limpieza' },
  { key: 'tienda', label: 'Tienda' },
  { key: 'eventos', label: 'Eventos', group: 'Eventos' },
  { key: 'caja', label: 'Caja', group: 'Administración' },
  { key: 'reporte', label: 'Reporte / RDP' },
  { key: 'admin', label: 'Configuración' },
];
export const TITLES = {
  dashboard: 'Resumen',
  mesas: 'Mesas',
  pedido: 'Pedido',
  ventas: 'Ventas del turno',
  inventario: 'Inventario',
  habitaciones: 'Habitaciones',
  reservas: 'Reservas',
  limpieza: 'Limpieza',
  tienda: 'Tienda de recepción',
  eventos: 'Eventos',
  caja: 'Caja',
  reporte: 'Reporte diario',
  admin: 'Configuración',
};

export const ROLES = {
  mesero: ['mesas', 'pedido', 'ventas'],
  recepcion: [
    'mesas',
    'pedido',
    'ventas',
    'inventario',
    'habitaciones',
    'reservas',
    'limpieza',
    'tienda',
    'eventos',
    'caja',
  ],
  gerente: NAV.map((n) => n.key),
};
export const ROLE_LABELS = { mesero: 'Mesero', recepcion: 'Recepción', gerente: 'Gerente' };

export const RATE_TYPES = { noche: 'Por noche', mensual: 'Mensual' };

export const METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  habitacion: 'Cargo a habitación',
};

// [fondo, texto, borde, texto secundario, etiqueta]
export const TABLE_COLORS = {
  ocupada: ['#1B1917', '#fff', '#1B1917', '#B8B0A6', 'Ocupada'],
  reservada: ['#fff', '#1B1917', '#1B1917', '#6F675E', 'Reservada'],
  libre: ['#fff', '#1B1917', '#E4DED5', '#6F675E', 'Libre'],
};
export const ROOM_COLORS = {
  ocupada: ['#1B1917', '#fff', '#1B1917', '#B8B0A6', 'Ocupada'],
  reservada: ['#fff', '#1B1917', '#1B1917', '#6F675E', 'Llega hoy'],
  libre: ['#fff', '#1B1917', '#E4DED5', '#6F675E', 'Disponible'],
  limpieza: ['#ECEAE6', '#6F675E', '#DAD6CF', '#6F675E', 'En limpieza'],
  fuera: ['#F5F4F2', '#B8B0A6', '#DAD6CF', '#B8B0A6', 'Fuera de servicio'],
};
export const ROOM_STATUS_ORDER = ['libre', 'ocupada', 'reservada', 'limpieza', 'fuera'];

export const HK_LABELS = { limpia: 'Lista', sucia: 'Sucia', limpiando: 'Limpiando', fuera: 'Fuera de servicio' };

export const RES_STATUS = {
  reservada: 'Reservada',
  hospedado: 'Hospedado',
  salida: 'Salió',
  cancelada: 'Cancelada',
};
export const CHANNELS = ['Directo', 'Teléfono', 'WhatsApp', 'Booking.com', 'Expedia', 'Agencia'];

export const QUICK_NOTES = [
  'Sin cebolla',
  'Sin chile',
  'Sin hielo',
  'Término medio',
  'Bien cocido',
  'Para llevar',
  'Alergia: nueces',
];
export const EXTRA_CHARGES = [
  ['Lavandería', 75],
  ['Minibar', 45],
  ['Tour Antigua', 350],
  ['Traslado aeropuerto', 400],
  ['Late check-out', 200],
];

// Billetes y monedas de quetzal para el arqueo
export const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5, 0.25, 0.1, 0.05];

// Eventos
export const EVENT_STATUS = {
  cotizado: 'Cotizado',
  confirmado: 'Confirmado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};
export const EVENT_UNITS = { persona: 'por persona', pareja: 'por pareja', evento: 'por evento' };
export const EVENT_EXTRAS = [
  ['Decoración', 1200],
  ['Música / DJ', 1500],
  ['Pastel', 650],
  ['Barra libre (por hora)', 900],
  ['Proyector y sonido', 400],
];

// Inventario
export const INV_CATS = ['Insumos', 'Bebidas', 'Desechables', 'Utensilios', 'Limpieza'];
export const INV_UNITS = ['unidad', 'kg', 'lb', 'litro', 'galón', 'botella', 'paquete', 'caja', 'ciento'];
export const INV_MOVES = { entrada: 'Entrada', salida: 'Salida', merma: 'Merma', ajuste: 'Ajuste de conteo' };

// Tienda de recepción
export const SHOP_CATS = ['Snacks', 'Bebidas', 'Higiene personal', 'Limpieza', 'Souvenirs'];
export const SHOP_MOVES = { entrada: 'Entrada', merma: 'Merma', ajuste: 'Ajuste de conteo' };
export const SHOP_MOVE_LABELS = { ...SHOP_MOVES, venta: 'Venta', devolucion: 'Devolución por anulación' };
