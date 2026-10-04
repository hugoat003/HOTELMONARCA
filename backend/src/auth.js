// PIN, sesiones y autorizaciones de gerente. El PIN nunca se guarda: solo su hash (scrypt con sal).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const MAX_FAILS = 5;
export const LOCK_MS = 2 * 60 * 1000;
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000; // sin uso por 12 h, la sesión vence
export const GRANT_MS = 10 * 60 * 1000; // la autorización de un gerente sirve para una operación en 10 min

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPin(pin, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const got = scryptSync(String(pin), Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, got);
}

const sha = (s) => createHash('sha256').update(s).digest('hex');

export class Auth {
  constructor(db, { now = () => Date.now() } = {}) {
    this.db = db;
    this.now = now;
    this.guards = new Map(); // intentos fallidos de PIN: clave → { fails, until }
    this.grants = new Map(); // sesión → [{ mgrId, until }] (una por cada PIN tecleado)
    this.q = {
      getCred: db.prepare('SELECT pin_hash FROM credentials WHERE user_id = ?'),
      allCreds: db.prepare('SELECT user_id, pin_hash FROM credentials'),
      setCred: db.prepare(
        'INSERT INTO credentials (user_id, pin_hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET pin_hash = excluded.pin_hash',
      ),
      delCred: db.prepare('DELETE FROM credentials WHERE user_id = ?'),
      newSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)'),
      getSession: db.prepare('SELECT user_id, last_seen FROM sessions WHERE token_hash = ?'),
      touch: db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?'),
      delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
      delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
      purge: db.prepare('DELETE FROM sessions WHERE last_seen < ?'),
    };
  }

  // ----- Credenciales
  setPin(userId, pin) {
    this.q.setCred.run(userId, hashPin(pin));
  }
  removeUser(userId) {
    this.q.delCred.run(userId);
    this.q.delUserSessions.run(userId);
  }
  checkPin(userId, pin) {
    const row = this.q.getCred.get(userId);
    return !!row && verifyPin(pin, row.pin_hash);
  }
  // ¿Otro usuario ya usa este PIN? (el PIN identifica a la persona al autorizar)
  pinTaken(pin, exceptUserId) {
    return this.q.allCreds.all().some((r) => r.user_id !== exceptUserId && verifyPin(pin, r.pin_hash));
  }

  // ----- Límite de intentos
  lockedFor(key) {
    const g = this.guards.get(key);
    return g?.until && g.until > this.now() ? g.until - this.now() : 0;
  }
  fail(key) {
    const prev = this.guards.get(key);
    const g = prev && (!prev.until || prev.until > this.now()) ? prev : { fails: 0 };
    g.fails += 1;
    if (g.fails >= MAX_FAILS) g.until = this.now() + LOCK_MS;
    this.guards.set(key, g);
    return Math.max(0, MAX_FAILS - g.fails);
  }
  ok(key) {
    this.guards.delete(key);
  }

  // ----- Sesiones
  createSession(userId) {
    const token = randomBytes(24).toString('base64url');
    const t = this.now();
    this.q.newSession.run(sha(token), userId, t, t);
    return token;
  }
  // Devuelve { id, userId } de una sesión vigente, o null
  session(token) {
    if (!token) return null;
    const id = sha(token);
    const row = this.q.getSession.get(id);
    if (!row) return null;
    const t = this.now();
    if (t - row.last_seen > SESSION_IDLE_MS) {
      this.q.delSession.run(id);
      return null;
    }
    // No se escribe en cada consulta: basta con anotar el uso cada minuto
    if (t - row.last_seen > 60_000) this.q.touch.run(t, id);
    return { id, userId: row.user_id };
  }
  endSession(token) {
    if (token) this.q.delSession.run(sha(token));
  }
  purgeSessions() {
    this.q.purge.run(this.now() - SESSION_IDLE_MS);
  }

  // ----- Autorización de gerente: un gerente teclea su PIN en el dispositivo de otra persona
  // Se acumulan: si se autorizan dos cosas seguidas, cada una tiene la suya
  grant(sessionId, mgrId) {
    const list = (this.grants.get(sessionId) || []).filter((g) => g.until > this.now());
    list.push({ mgrId, until: this.now() + GRANT_MS });
    this.grants.set(sessionId, list);
  }
  // La autorización vigente más antigua (de ese gerente, si se indica)
  peekGrant(sessionId, mgrId) {
    return (
      (this.grants.get(sessionId) || []).find((g) => g.until > this.now() && (!mgrId || g.mgrId === mgrId)) || null
    );
  }
  useGrant(sessionId, grant) {
    const list = (this.grants.get(sessionId) || []).filter((g) => g !== grant && g.until > this.now());
    if (list.length) this.grants.set(sessionId, list);
    else this.grants.delete(sessionId);
  }
}
