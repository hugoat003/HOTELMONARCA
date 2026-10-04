// Cliente de sincronización con el servidor del hotel.
//
// Cada cambio se aplica al instante en esta pantalla (para que la tablet responda sin esperar) y se
// envía al servidor. El servidor lo valida, lo guarda y lo reparte a todos los dispositivos.
// Mientras no llega la confirmación, el cambio queda "pendiente" encima del último estado del servidor;
// si el servidor lo rechaza (permiso, caja cerrada, otro dispositivo ganó), se deshace y se avisa.
import { applyPatches, enablePatches, produce, setAutoFreeze } from 'immer';
import { ActionError, runCall } from '@shared/sync.js';
import { recording } from './actions.js';

enablePatches();
setAutoFreeze(false);

const SESSION_KEY = 'monarca-session';
const NS_KEY = 'monarca-ns'; // solo en pruebas automáticas: aísla los datos de cada prueba

const read = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k));
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: la sesión dura mientras la página está abierta */
  }
};
const newAid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class NetworkError extends Error {}
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export class SyncClient {
  constructor() {
    this.listeners = new Set();
    this.session = read(SESSION_KEY); // { token, userId }
    this.base = null; // último estado confirmado por el servidor
    this.rev = 0;
    this.pending = []; // [{ aid, calls, token, rev? }] cambios aún sin confirmar, en orden
    this.view = null; // base + pendientes: lo que se muestra
    this.publicData = null; // usuarios y negocio para la pantalla de ingreso
    this.status = 'connecting'; // connecting | online | offline
    this.notice = null; // { id, text } aviso para mostrar
    this.ws = null;
    this.retry = 0;
    this.sending = false;
    this.waiters = [];
    this.snapshot = this.makeSnapshot();
  }

  // ----- Suscripción para React (useSyncExternalStore)
  subscribe = (fn) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snapshot;
  makeSnapshot() {
    const loggedIn = !!(this.session && this.view);
    return {
      state: loggedIn
        ? this.view
        : this.publicData && { users: this.publicData.users, config: this.publicData.config, session: null },
      status: this.status,
      pending: this.pending.length,
      notice: this.notice,
    };
  }
  emit() {
    this.snapshot = this.makeSnapshot();
    this.listeners.forEach((fn) => fn());
    if (!this.pending.length) this.waiters.splice(0).forEach((r) => r());
  }
  say(text) {
    this.notice = { id: (this.notice?.id || 0) + 1, text };
  }

  // ----- Red
  headers(token) {
    const h = { 'content-type': 'application/json' };
    if (token) h.authorization = 'Bearer ' + token;
    const ns = read(NS_KEY);
    if (ns) h['x-monarca-ns'] = ns;
    return h;
  }
  // timeout: si el WiFi se cae a mitad de una petición, puede quedarse colgada para siempre;
  // se corta y se reintenta (el servidor reconoce el reintento por su aid y no lo duplica)
  async api(path, { body, token = this.session?.token, method, timeout = 10_000 } = {}) {
    let res;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      res = await fetch(path, {
        method: method || (body ? 'POST' : 'GET'),
        headers: this.headers(token),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      throw new NetworkError('Sin conexión con el servidor');
    } finally {
      clearTimeout(timer);
    }
    // 5xx: el servidor (o el túnel) no está disponible; se trata como falta de conexión
    if (res.status >= 500) throw new NetworkError('El servidor no responde');
    // El servidor respondió: hay conexión (aunque la respuesta sea un rechazo)
    if (this.status === 'offline') this.setStatus('online');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Error del servidor', res.status, data);
    return data;
  }
  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit();
  }

  // ----- Arranque
  async start() {
    if (this.started) return;
    this.started = true;
    if (this.session) await this.loadState();
    else await this.loadPublic();
  }
  async loadPublic() {
    for (;;) {
      try {
        this.publicData = await this.api('/api/public', { token: null });
        this.setStatus('online');
        this.emit();
        return;
      } catch {
        this.setStatus('offline');
        await sleep(2000);
      }
    }
  }
  async loadState() {
    for (;;) {
      if (!this.session) return this.loadPublic();
      try {
        const { rev, state } = await this.api('/api/state');
        this.setBase(state, rev);
        this.connect();
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return this.expire();
        this.setStatus('offline');
        await sleep(2000);
      }
    }
  }

  setBase(state, rev) {
    this.base = state;
    this.rev = rev;
    // Lo que el servidor ya confirmó viene incluido en este estado
    this.pending = this.pending.filter((p) => !(p.rev && p.rev <= rev));
    this.recompute();
    this.emit();
  }

  // Estado que se muestra: el del servidor más los cambios pendientes de esta pantalla
  // dropFailing: descarta los pendientes sin enviar que ya no se pueden aplicar
  // (dependían de un cambio que el servidor rechazó; fallarían igual allá)
  recompute({ dropFailing = false } = {}) {
    let s = this.base;
    for (const p of [...this.pending]) {
      try {
        s = produce(s, (d) => {
          for (const c of p.calls) runCall(d, { ...c, args: structuredClone(c.args) });
        });
      } catch {
        // ya no aplica sobre los datos nuevos: el servidor decidirá y avisará
        if (dropFailing && !p.rev) this.pending = this.pending.filter((x) => x !== p);
      }
    }
    this.view = s && { ...s, session: this.session ? { userId: this.session.userId } : null };
  }

  // ----- Tiempo real
  connect() {
    if (!this.session) return;
    this.ws?.close();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ns = read(NS_KEY);
    const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(this.session.token)}${ns ? '&ns=' + encodeURIComponent(ns) : ''}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (e.code === 4401) return this.expire();
      if (!this.session) return;
      this.setStatus('offline');
      const wait = Math.min(10_000, 1000 * 2 ** this.retry++);
      setTimeout(() => this.session && !this.ws && this.connect(), wait);
    };
  }
  onMessage(msg) {
    if (msg.type === 'hello') {
      this.retry = 0;
      this.setStatus('online');
      if (msg.rev !== this.rev) this.resync();
      this.flush();
    } else if (msg.type === 'reload') {
      this.resync();
    } else if (msg.type === 'patch') {
      if (msg.rev <= this.rev) return;
      if (msg.rev !== this.rev + 1 || !this.base) return this.resync(); // se perdió algo: estado completo
      this.base = applyPatches(this.base, msg.patches);
      this.rev = msg.rev;
      this.pending = this.pending.filter((p) => p.aid !== msg.aid && !(p.rev && p.rev <= msg.rev));
      this.recompute();
      this.emit();
    }
  }
  async resync() {
    try {
      const { rev, state } = await this.api('/api/state');
      this.setBase(state, rev);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) this.expire();
    }
  }

  // ----- Cambios
  // recipe: (d) => A.algo(d, …). Se graban las acciones que llama y se envían al servidor.
  update = (recipe) => {
    if (!this.view || !this.session) return;
    const calls = [];
    let next;
    try {
      next = produce(this.view, (d) => recording(calls, () => recipe(d)));
    } catch (e) {
      this.say(e instanceof ActionError ? e.message : 'No se pudo completar la operación');
      this.emit();
      return;
    }
    if (!calls.length) return;
    this.pending.push({ aid: newAid(), calls, token: this.session.token });
    this.view = next;
    this.emit();
    this.flush();
  };

  // Envía los pendientes en orden, de uno en uno (el segundo puede depender del primero)
  async flush() {
    if (this.sending) return;
    this.sending = true;
    try {
      for (;;) {
        const p = this.pending.find((x) => !x.rev);
        if (!p) break;
        try {
          const { rev } = await this.api('/api/actions', { body: { aid: p.aid, calls: p.calls }, token: p.token });
          p.rev = rev;
          if (rev <= this.rev || !this.session) {
            // El aviso en tiempo real ya llegó (o llegó otro más nuevo): ya está en la base
            this.pending = this.pending.filter((x) => x !== p);
            this.recompute();
            this.emit();
          }
        } catch (e) {
          if (e instanceof NetworkError) {
            this.setStatus('offline');
            setTimeout(() => this.flush(), 2000);
            break;
          }
          if (e.status === 401) {
            this.pending = this.pending.filter((x) => x.token !== p.token);
            this.expire();
            break;
          }
          // Rechazado: se deshace en esta pantalla (con lo que dependía de él) y se explica por qué
          this.pending = this.pending.filter((x) => x !== p);
          this.recompute({ dropFailing: true });
          this.say(e.message);
          this.emit();
        }
      }
    } finally {
      this.sending = false;
    }
  }

  // Promesa que se cumple cuando no queda nada por confirmar (la usan las pruebas)
  whenIdle() {
    return this.pending.length ? new Promise((r) => this.waiters.push(r)) : Promise.resolve();
  }

  // ----- Sesión
  async login(userId, pin) {
    try {
      const { token } = await this.api('/api/login', { body: { userId, pin }, token: null });
      this.session = { token, userId };
      write(SESSION_KEY, this.session);
      await this.loadState();
      return { ok: true };
    } catch (e) {
      if (e instanceof NetworkError) return { ok: false, error: 'Sin conexión con el servidor' };
      return { ok: false, error: e.message, ...e.data };
    }
  }
  // Valida el PIN de un gerente para autorizar la siguiente operación sensible de esta sesión
  async authorize(pin) {
    try {
      const { user } = await this.api('/api/authorize', { body: { pin } });
      return { ok: true, user };
    } catch (e) {
      if (e instanceof NetworkError) return { ok: false, error: 'Sin conexión con el servidor' };
      if (e.status === 401 && !e.data?.left) this.expire();
      return { ok: false, error: e.message, ...e.data };
    }
  }
  logout = () => {
    const token = this.session?.token;
    this.endSession();
    // Lo pendiente se sigue enviando con su sesión; al terminar, se cierra en el servidor
    if (token) this.whenIdle().then(() => this.api('/api/logout', { body: {}, token }).catch(() => {}));
  };
  // La sesión venció o el usuario fue desactivado
  expire() {
    if (!this.session) return;
    this.endSession();
    this.say('Tu sesión terminó. Vuelve a ingresar tu PIN.');
    this.emit();
  }
  endSession() {
    this.session = null;
    write(SESSION_KEY, null);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.base = null;
    this.view = null;
    this.rev = 0;
    this.emit();
    this.loadPublic();
  }

  // ----- Respaldo (gerencia)
  async restore(state) {
    await this.whenIdle();
    await this.api('/api/admin/restore', { body: { state }, timeout: 120_000 });
    await this.resync();
  }
  async resetDemo() {
    await this.whenIdle();
    await this.api('/api/admin/reset-demo', { body: {} });
    await this.resync();
  }
}
