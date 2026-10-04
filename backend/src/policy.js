// Permisos por rol, validados en el servidor: aunque alguien llame a la API directamente,
// un mesero no puede cerrar caja ni cambiar precios, y lo sensible pide el PIN de un gerente.

const RESTAURANTE = [
  'openTable',
  'openTakeout',
  'closeOrder',
  'addItem',
  'setCourtesy',
  'setOrderCustomer',
  'setOrderWaiter',
  'joinOrders',
  'transferLines',
  'changeQty',
  'setNote',
  'voidLine',
  'sendKitchen',
  'fireCourse',
  'setLineCourse',
  'moveOrder',
  'registerSale',
];

const RECEPCION = [
  ...RESTAURANTE,
  'voidSale',
  // Hotel
  'saveReservation',
  'saveGuest',
  'changeRoom',
  'moveReservation',
  'closeReservation',
  'checkInWith',
  'checkIn',
  'cancelReservation',
  'addCharge',
  'removeCharge',
  'addFolioPayment',
  'checkOut',
  'checkOutWith',
  'setHk',
  // Eventos
  'saveEvent',
  'setEventStatus',
  'cancelEvent',
  'syncEventRooms',
  'addEventPayment',
  // Inventario y tienda (solo entradas sin autorización)
  'invMove',
  'upsert',
  'remove',
  // Caja
  'openShift',
  'addMovement',
  'closeShift',
];

const ALLOWED = {
  mesero: new Set(RESTAURANTE),
  recepcion: new Set(RECEPCION),
};

// Catálogos que se editan con upsert/remove. Recepción solo toca inventario y tienda (con PIN).
const CATALOGS = new Set([
  'users',
  'menu',
  'modifierGroups',
  'roomTypes',
  'rooms',
  'venues',
  'eventMenus',
  'seasons',
  'tables',
  'mapDecor',
  'inventory',
  'shopItems',
]);
const STOCK_CATALOGS = new Set(['inventory', 'shopItems']);

// Las de sesión se resuelven en el dispositivo y en /api/login, nunca como operación
const NEVER = new Set(['login', 'logout']);

export class Forbidden extends Error {
  constructor(message) {
    super(message);
    this.name = 'Forbidden';
  }
}
const deny = (msg) => {
  throw new Forbidden(msg);
};

const findLine = (state, orderId, lineId) =>
  state.orders.find((o) => o.id === orderId)?.lines.find((l) => l.id === lineId);

// ¿La operación necesita el PIN de un gerente cuando la hace otra persona?
export function needsManager(state, { name, args }) {
  switch (name) {
    case 'voidLine': {
      const { orderId, lineId } = args[0] || {};
      return !!findLine(state, orderId, lineId)?.sent;
    }
    case 'setCourtesy':
      return !!args[2];
    case 'registerSale':
      return !!args[0]?.discount;
    case 'invMove':
      return args[0]?.type !== 'entrada';
    case 'upsert':
    case 'remove':
      return true; // recepción solo llega aquí con inventario o tienda
    case 'voidSale':
    case 'removeCharge':
    case 'closeShift':
      return true;
    default:
      return false;
  }
}

// Revisa que el rol pueda hacer la operación. Lanza Forbidden si no.
export function checkRole(user, { name, args }) {
  if (NEVER.has(name)) deny('Operación no permitida');
  if ((name === 'upsert' || name === 'remove') && !CATALOGS.has(args[0])) deny('Catálogo no válido');
  if (user.role === 'gerente') return;
  const allowed = ALLOWED[user.role];
  if (!allowed?.has(name)) deny('Tu usuario no tiene permiso para esta operación');
  if ((name === 'upsert' || name === 'remove') && !STOCK_CATALOGS.has(args[0]))
    deny('Tu usuario no tiene permiso para esta operación');
  if (name === 'registerSale' && user.role === 'mesero' && args[0]?.kind !== 'restaurante')
    deny('Tu usuario no tiene permiso para esta operación');
}

// Quién hizo la operación lo dice la sesión, no el dispositivo: se corrigen los campos que lo indican.
const ACTOR_KEYS = ['userId', 'cashierId'];
function stampActor(obj, userId) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const k of ACTOR_KEYS) if (k in obj) obj[k] = userId;
  if (obj.refund && typeof obj.refund === 'object') stampActor(obj.refund, userId);
}
export function stampActors(call, userId) {
  for (const a of call.args) stampActor(a, userId);
}

// Gerentes que la operación dice que autorizaron (authId, o authBy en el descuento)
export function claimedApprovers(call) {
  const ids = [];
  for (const a of call.args) {
    if (!a || typeof a !== 'object') continue;
    if (a.authId) ids.push(a.authId);
    if (a.discount?.authBy) ids.push(a.discount.authBy);
  }
  return ids;
}
