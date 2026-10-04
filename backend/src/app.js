// API de POS Monarca. Un solo servidor en el NUC: guarda los datos, valida PIN y permisos,
// y avisa al instante a todos los dispositivos (WebSocket) de cada cambio.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import { ActionError } from '../../shared/sync.js';
import { Auth } from './auth.js';
import { openDb } from './db.js';
import { Engine } from './engine.js';
import { checkRole, claimedApprovers, Forbidden, needsManager, stampActors } from './policy.js';
import { initialState } from './seed.js';

const ROLES = ['gerente', 'recepcion', 'mesero'];
const MAX_TEST_HOTELS = 300;

class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.name = 'BadRequest';
  }
}

// Un "hotel" es una base de datos con su estado, sus sesiones y los dispositivos conectados.
// En producción hay uno solo; en modo prueba cada prueba tiene el suyo (aislado por namespace).
function createHotel({ dbFile, seed }) {
  const db = openDb(dbFile);
  const engine = new Engine(db);
  const auth = new Auth(db);
  const hotel = { db, engine, auth, sockets: new Set() };
  if (!engine.initialized) install(hotel, initialState(seed));
  return hotel;
}

// Carga un estado completo. Los PIN que traiga (datos de ejemplo) pasan a credenciales con hash
// y se quitan del estado: el estado viaja a los dispositivos y nunca debe llevar PIN.
function install(hotel, state, { keepCredentials = false } = {}) {
  const users = (state.users || []).map(({ pin, ...u }) => {
    if (pin) hotel.auth.setPin(u.id, pin);
    return u;
  });
  if (!keepCredentials) {
    const ids = new Set(users.map((u) => u.id));
    for (const { user_id } of hotel.db.prepare('SELECT user_id FROM credentials').all())
      if (!ids.has(user_id)) hotel.auth.removeUser(user_id);
  }
  return hotel.engine.replaceAll({ ...state, users });
}

// Ejecuta fn con el reloj detenido en `now` (solo pruebas: fechas de ejemplo reproducibles)
function withClock(now, fn) {
  const Real = Date;
  class Fixed extends Real {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  globalThis.Date = Fixed;
  try {
    return fn();
  } finally {
    globalThis.Date = Real;
  }
}

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  active: u.active,
});

export async function buildApp({
  dbFile = ':memory:',
  seed = 'demo',
  staticDir = null,
  demo = false,
  test = false,
  logger = false,
} = {}) {
  const app = Fastify({ logger, bodyLimit: 50 * 1024 * 1024 });
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 1024 * 1024 },
  });

  const main = createHotel({ dbFile, seed });
  const testHotels = new Map();
  const nsOf = (req) => (test ? req.headers['x-monarca-ns'] || req.query?.ns || '' : '');
  const hotelFor = (req) => {
    const ns = nsOf(req);
    if (!ns) return main;
    let h = testHotels.get(ns);
    if (!h) {
      if (testHotels.size >= MAX_TEST_HOTELS) {
        const [oldest] = testHotels.keys();
        testHotels.get(oldest).db.close();
        testHotels.delete(oldest);
      }
      h = createHotel({ dbFile: ':memory:', seed });
      testHotels.set(ns, h);
    }
    return h;
  };

  const broadcast = (hotel, msg) => {
    const data = JSON.stringify(msg);
    for (const s of hotel.sockets) if (s.readyState === 1) s.send(data);
  };

  // ----- Sesión
  const tokenOf = (req) => {
    const h = req.headers.authorization || '';
    return h.startsWith('Bearer ') ? h.slice(7) : req.query?.token || '';
  };
  const activeUser = (hotel, userId) => hotel.engine.state.users.find((u) => u.id === userId && u.active) || null;

  // Exige sesión vigente de un usuario activo. Deja req.hotel, req.session, req.user.
  const requireUser = async (req, reply) => {
    const hotel = hotelFor(req);
    const session = hotel.auth.session(tokenOf(req));
    const user = session && activeUser(hotel, session.userId);
    if (!user) return reply.code(401).send({ error: 'Tu sesión terminó. Vuelve a ingresar tu PIN.' });
    req.hotel = hotel;
    req.session = session;
    req.user = user;
  };
  const requireManager = async (req, reply) => {
    await requireUser(req, reply);
    if (reply.sent) return;
    if (req.user.role !== 'gerente') return reply.code(403).send({ error: 'Solo gerencia puede hacer esto.' });
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ActionError) return reply.code(409).send({ error: err.message });
    if (err instanceof Forbidden) return reply.code(403).send({ error: err.message });
    if (err instanceof BadRequest) return reply.code(400).send({ error: err.message });
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: 'Solicitud no válida' });
    req.log.error(err);
    // Un error inesperado al aplicar una acción casi siempre es que otro dispositivo cambió los datos
    return reply.code(409).send({
      error: 'No se pudo completar la operación: los datos cambiaron. Intenta de nuevo.',
    });
  });

  app.get('/api/health', async (req) => ({
    ok: true,
    rev: hotelFor(req).engine.rev,
  }));

  // Lo que necesita la pantalla de ingreso antes de que alguien inicie sesión
  app.get('/api/public', async (req) => {
    const hotel = hotelFor(req);
    const { state } = hotel.engine;
    return {
      // lockedMs: el PIN de ese usuario está bloqueado por intentos fallidos
      users: state.users
        .filter((u) => u.active)
        .map((u) => ({
          ...publicUser(u),
          lockedMs: hotel.auth.lockedFor('login:' + u.id),
        })),
      config: {
        businessName: state.config.businessName,
        currency: state.config.currency,
      },
    };
  });

  const lockReply = (reply, ms) => reply.code(429).send({ error: 'Demasiados intentos', lockedMs: ms, left: 0 });

  app.post('/api/login', async (req, reply) => {
    const hotel = hotelFor(req);
    const { userId, pin } = req.body || {};
    const user = activeUser(hotel, userId);
    if (!user) return reply.code(400).send({ error: 'Usuario no válido' });
    const key = 'login:' + user.id;
    const locked = hotel.auth.lockedFor(key);
    if (locked) return lockReply(reply, locked);
    if (!hotel.auth.checkPin(user.id, pin)) {
      const left = hotel.auth.fail(key);
      if (!left) return lockReply(reply, hotel.auth.lockedFor(key));
      return reply.code(401).send({ error: 'PIN incorrecto', left });
    }
    hotel.auth.ok(key);
    return { token: hotel.auth.createSession(user.id), user: publicUser(user) };
  });

  app.post('/api/logout', async (req) => {
    hotelFor(req).auth.endSession(tokenOf(req));
    return { ok: true };
  });

  app.get('/api/state', { preHandler: requireUser }, async (req) => ({
    rev: req.hotel.engine.rev,
    state: req.hotel.engine.state,
    user: publicUser(req.user),
  }));

  // Un gerente teclea su PIN en el dispositivo de otra persona: queda autorizada la siguiente operación
  app.post('/api/authorize', { preHandler: requireUser }, async (req, reply) => {
    const { hotel, session } = req;
    const key = 'auth:' + session.id;
    const locked = hotel.auth.lockedFor(key);
    if (locked) return lockReply(reply, locked);
    const pin = String(req.body?.pin || '');
    const mgr = hotel.engine.state.users.find(
      (u) => u.active && u.role === 'gerente' && hotel.auth.checkPin(u.id, pin),
    );
    if (!mgr) {
      const left = hotel.auth.fail(key);
      if (!left) return lockReply(reply, hotel.auth.lockedFor(key));
      return reply.code(401).send({ error: 'PIN de gerente inválido', left });
    }
    hotel.auth.ok(key);
    hotel.auth.grant(session.id, mgr.id);
    return { user: publicUser(mgr) };
  });

  // ----- Operaciones
  app.post('/api/actions', { preHandler: requireUser }, async (req) => {
    const { hotel, session, user } = req;
    const { aid, calls } = req.body || {};
    if (typeof aid !== 'string' || aid.length < 8 || aid.length > 64)
      throw new BadRequest('Operación sin identificador');
    if (!Array.isArray(calls) || !calls.length || calls.length > 20) throw new BadRequest('Operación vacía');

    // Reintento de algo que ya se aplicó (se cortó la red antes de la respuesta)
    const done = hotel.engine.appliedRev(aid);
    if (done !== null) return { ok: true, rev: done, duplicate: true };

    const state = hotel.engine.state;
    for (const c of calls) {
      if (!c || typeof c.name !== 'string' || !Array.isArray(c.args)) throw new BadRequest('Operación no válida');
      if (c.ids !== undefined && !Array.isArray(c.ids)) throw new BadRequest('Operación no válida');
      checkRole(user, c);
      stampActors(c, user.id);
    }

    // Autorización de gerente: si la operación la pide (o dice que un gerente la autorizó),
    // tiene que haber un PIN de gerente validado en este dispositivo hace poco.
    // Una autorización sirve para una tanda; quien la dice haber dado debe ser quien tecleó el PIN.
    const claimed = [
      ...new Set(calls.flatMap(claimedApprovers).filter((id) => !(id === user.id && user.role === 'gerente'))),
    ];
    if (claimed.length > 1) throw new Forbidden('La autorización de gerente no es válida.');
    // Solo se gasta una autorización si la operación la necesita o dice tenerla: un cambio cualquiera
    // que llegue justo después del PIN no debe consumir la de la anulación que viene detrás.
    const needs = user.role !== 'gerente' && calls.some((c) => needsManager(state, c));
    let grant = needs || claimed.length ? hotel.auth.peekGrant(session.id, claimed[0]) : null;
    if (grant && !activeUser(hotel, grant.mgrId)) grant = null;
    if (claimed.length && !grant) throw new Forbidden('La autorización de gerente no es válida.');
    if (needs && !grant) throw new Forbidden('Esta operación necesita la autorización de un gerente.');

    // Usuarios: el PIN no entra al estado; se guarda aparte, con hash
    const credOps = [];
    for (const c of calls) {
      if (c.name === 'upsert' && c.args[0] === 'users') {
        const item = c.args[1] || {};
        const { pin } = item;
        delete item.pin;
        if (!item.id || typeof item.id !== 'string') throw new BadRequest('Usuario no válido');
        if (item.role !== undefined && !ROLES.includes(item.role)) throw new BadRequest('Rol no válido');
        const exists = state.users.some((u) => u.id === item.id);
        if (pin !== undefined && pin !== '') {
          if (!/^\d{4}$/.test(String(pin))) throw new ActionError('El PIN debe tener 4 dígitos');
          if (hotel.auth.pinTaken(String(pin), item.id)) throw new ActionError('Ese PIN ya lo usa otra persona');
          credOps.push(() => hotel.auth.setPin(item.id, String(pin)));
        } else if (!exists) throw new ActionError('Falta el PIN del usuario nuevo');
      }
      if (c.name === 'remove' && c.args[0] === 'users') credOps.push(() => hotel.auth.removeUser(c.args[1]));
    }

    const { rev, patches } = hotel.engine.apply({
      aid,
      calls,
      userId: user.id,
      beforeCommit: (next) => {
        if (!next.users.some((u) => u.active && u.role === 'gerente'))
          throw new ActionError('Debe quedar al menos un gerente activo');
        credOps.forEach((op) => op());
      },
    });
    if (grant) hotel.auth.useGrant(session.id, grant);
    if (patches.length) broadcast(hotel, { type: 'patch', rev, aid, patches });
    return { ok: true, rev };
  });

  // ----- Respaldo y datos de ejemplo (gerencia)
  const replaceState = (hotel, next) => {
    const rev = install(hotel, next, { keepCredentials: true });
    broadcast(hotel, { type: 'reload', rev });
    return rev;
  };
  app.post('/api/admin/restore', { preHandler: requireManager }, async (req) => {
    const next = req.body?.state;
    const cur = req.hotel.engine.state;
    if (!next || next.version !== cur.version || !Array.isArray(next.menu) || !Array.isArray(next.users))
      throw new BadRequest('El archivo no es un respaldo válido de POS Monarca');
    if (!next.users.some((u) => u.active && u.role === 'gerente'))
      throw new BadRequest('El respaldo no tiene un gerente activo');
    return { ok: true, rev: replaceState(req.hotel, next) };
  });
  app.post('/api/admin/reset-demo', { preHandler: requireManager }, async (req, reply) => {
    if (!demo && !test) return reply.code(404).send({ error: 'No disponible' });
    return { ok: true, rev: replaceState(req.hotel, initialState('demo')) };
  });

  // ----- Solo para las pruebas automáticas: leer y preparar el estado de un hotel de prueba
  if (test) {
    app.get('/api/test/state', async (req) => hotelFor(req).engine.state);
    app.put('/api/test/state', async (req) => ({
      rev: replaceState(hotelFor(req), req.body),
    }));
    // Datos de ejemplo como si hoy fuera `now` (pruebas visuales con el reloj fijo)
    app.post('/api/test/reset', async (req) => {
      const now = Number(req.body?.now) || Date.now();
      return {
        rev: replaceState(
          hotelFor(req),
          withClock(now, () => initialState('demo')),
        ),
      };
    });
  }

  // ----- Tiempo real
  app.get('/ws', { websocket: true }, (socket, req) => {
    const hotel = hotelFor(req);
    const session = hotel.auth.session(tokenOf(req));
    if (!session || !activeUser(hotel, session.userId)) return socket.close(4401, 'sesion');
    hotel.sockets.add(socket);
    socket.isAlive = true;
    socket.on('pong', () => (socket.isAlive = true));
    socket.on('close', () => hotel.sockets.delete(socket));
    socket.on('error', () => hotel.sockets.delete(socket));
    socket.send(JSON.stringify({ type: 'hello', rev: hotel.engine.rev }));
  });
  // Detecta tablets que se desconectaron sin avisar
  const heartbeat = setInterval(() => {
    for (const h of [main, ...testHotels.values()])
      for (const s of h.sockets) {
        if (!s.isAlive) {
          s.terminate();
          h.sockets.delete(s);
          continue;
        }
        s.isAlive = false;
        s.ping();
      }
    main.auth.purgeSessions();
  }, 30_000);
  heartbeat.unref();
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    for (const h of [main, ...testHotels.values()]) {
      for (const s of h.sockets) s.terminate();
      h.db.close();
    }
  });

  // ----- La aplicación web (compilada) se sirve desde el mismo servidor
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: staticDir,
      wildcard: false,
      setHeaders: (reply, path) => {
        // index.html siempre fresco; los archivos con hash en el nombre se pueden guardar en caché
        if (path.endsWith('.html')) reply.header('Cache-Control', 'no-cache');
        else if (path.includes('/assets/')) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') || req.method !== 'GET'
        ? reply.code(404).send({ error: 'No encontrado' })
        : reply.sendFile('index.html'),
    );
  }

  app.hotel = main;
  return app;
}
