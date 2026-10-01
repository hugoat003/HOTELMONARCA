// Límite de intentos de PIN por dispositivo: tras MAX_FAILS fallidos se bloquea LOCK_MS.
// Se guarda en el navegador para que recargar la página no reinicie el contador.
export const MAX_FAILS = 5;
export const LOCK_MS = 2 * 60 * 1000;
const KEY = 'monarca-pin-guard';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* sin almacenamiento: el límite solo dura mientras la página está abierta */
  }
}

// Milisegundos que faltan de bloqueo (0 si no está bloqueado)
export function lockedFor(key, now = Date.now()) {
  const g = read()[key];
  return g?.until && g.until > now ? g.until - now : 0;
}

// Registra un intento fallido; devuelve los intentos que quedan (0 = quedó bloqueado)
export function registerFail(key, now = Date.now()) {
  const data = read();
  const g = data[key] && (!data[key].until || data[key].until > now) ? data[key] : { fails: 0 };
  g.fails = (g.fails || 0) + 1;
  if (g.fails >= MAX_FAILS) g.until = now + LOCK_MS;
  data[key] = g;
  write(data);
  return Math.max(0, MAX_FAILS - g.fails);
}

export function registerOk(key) {
  const data = read();
  delete data[key];
  write(data);
}
