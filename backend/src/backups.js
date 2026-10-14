// Respaldo automático: cada noche copia la base en la mini PC y, si está configurado, sube una copia
// comprimida y cifrada fuera del hotel (Cloudflare R2 u otro almacenamiento compatible con S3).
// También se puede pedir uno en cualquier momento (Configuración → Respaldo, o `monarca-respaldo`).
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pack, snapshot, stamp } from './backup.js';

export const KEEP_LOCAL = { diario: 30, manual: 10 }; // archivos que se conservan en la mini PC
export const KEEP_REMOTE_DAYS = 30; // fuera del hotel: los últimos 30, más uno por mes del último año
export const KEEP_REMOTE_MONTHS = 12;
const STALE_MS = 36 * 60 * 60 * 1000; // sin un respaldo correcto en 36 h: aviso
const RETRY_MS = 15 * 60 * 1000; // tras un error, espera antes de reintentar
const REMOTE_RETRY_MS = 60 * 60 * 1000; // si solo falló la subida, la reintenta cada hora

export class BackupService {
  // db: conexión abierta. dir: carpeta de respaldos locales. hour: hora del respaldo nocturno (0-23).
  // remote: instancia de S3 (o null). secret: clave para cifrar lo que sale del hotel.
  constructor({ db, dir, hour = 3, remote = null, secret = '', prefix = 'monarca/', now = () => new Date(), log }) {
    Object.assign(this, { db, dir, hour, remote, secret, prefix, now });
    this.log = log || { info() {}, error() {} };
    this.running = null;
    this.q = {
      get: db.prepare("SELECT value FROM meta WHERE key = 'respaldo'"),
      set: db.prepare(
        "INSERT INTO meta (key, value) VALUES ('respaldo', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ),
    };
  }

  get remoteReady() {
    return !!(this.remote && this.secret);
  }

  // ----- Estado (se guarda en la base y en respaldos/estado.json para monarca-estado)
  saved() {
    try {
      return JSON.parse(this.q.get.get()?.value || '{}');
    } catch {
      return {};
    }
  }
  save(patch) {
    const s = { ...this.saved(), ...patch };
    this.q.set.run(JSON.stringify(s));
    try {
      writeFileSync(join(this.dir, 'estado.json'), JSON.stringify(this.status(), null, 2));
    } catch {
      /* la carpeta puede no existir todavía */
    }
    return s;
  }

  status() {
    const s = this.saved();
    const t = this.now().getTime();
    const problems = [];
    if (!s.lastOk || t - Date.parse(s.lastOk.at) > STALE_MS) problems.push('No hay un respaldo reciente en la mini PC');
    if (s.lastError && (!s.lastOk || s.lastError.at > s.lastOk.at)) problems.push(s.lastError.message);
    if (!this.remote) problems.push('La copia fuera del hotel no está configurada');
    else if (!this.secret) problems.push('Falta la clave de respaldo: la copia fuera del hotel está detenida');
    else if (s.remoteError && (!s.remoteOk || s.remoteError.at > s.remoteOk.at)) problems.push(s.remoteError.message);
    else if (!s.remoteOk || t - Date.parse(s.remoteOk.at) > STALE_MS)
      problems.push('No hay una copia reciente fuera del hotel');
    return {
      hour: this.hour,
      remote: !!this.remote,
      lastOk: s.lastOk || null,
      lastError: s.lastError || null,
      remoteOk: s.remoteOk || null,
      remoteError: s.remoteError || null,
      problems,
      ok: problems.length === 0,
    };
  }

  local() {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.endsWith('.db'))
        .map((f) => {
          const st = statSync(join(this.dir, f));
          return { name: f, size: st.size, at: st.mtime.toISOString() };
        })
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  // ----- Respaldo
  // kind: 'diario' (el automático) o 'manual'. Si ya hay uno en curso, espera ese.
  run(kind = 'manual') {
    this.running ||= this.doRun(kind).finally(() => (this.running = null));
    return this.running;
  }

  async doRun(kind) {
    const at = this.now();
    const name = `${kind}-${stamp(at)}.db`;
    const file = join(this.dir, name);
    let info;
    try {
      info = await snapshot(this.db, file);
      const size = statSync(file).size;
      this.save({ lastOk: { at: at.toISOString(), name, size, rev: info.rev, kind } });
      this.log.info(`Respaldo ${name} (${size} bytes)`);
      this.pruneLocal();
    } catch (e) {
      this.save({ lastError: { at: at.toISOString(), message: 'No se pudo respaldar: ' + e.message } });
      this.log.error(e, 'respaldo');
      throw e;
    }
    const uploaded = this.remoteReady ? await this.upload(name) : null;
    return { name, size: statSync(file).size, rev: info.rev, uploaded };
  }

  // Sube a fuera del hotel un respaldo local (comprimido y cifrado). Devuelve { key, size } o null si falló.
  async upload(name) {
    const key = `${this.prefix}${name}.gz.enc`;
    try {
      const body = pack(readFileSync(join(this.dir, name)), this.secret);
      await this.remote.put(key, body);
      this.save({ remoteOk: { at: this.now().toISOString(), key, size: body.length } });
      await this.pruneRemote().catch((e) => this.log.error(e, 'limpieza de respaldos externos'));
      return { key, size: body.length };
    } catch (e) {
      this.save({ remoteError: { at: this.now().toISOString(), message: 'Copia fuera del hotel: ' + e.message } });
      this.log.error(e, 'respaldo externo');
      return null;
    }
  }

  pruneLocal() {
    for (const [kind, keep] of Object.entries(KEEP_LOCAL))
      this.local()
        .filter((f) => f.name.startsWith(kind + '-'))
        .slice(keep)
        .forEach((f) => rmSync(join(this.dir, f.name), { force: true }));
  }

  // Fuera del hotel: los últimos KEEP_REMOTE_DAYS y, de los más viejos, el primero de cada mes del último año
  async pruneRemote() {
    const items = (await this.remote.list(this.prefix))
      .filter((o) => /-(\d{8})-\d{6}\.db\.gz\.enc$/.test(o.key))
      .sort((a, b) => basename(b.key).localeCompare(basename(a.key)));
    const day = (o) => /-(\d{8})-\d{6}\.db/.exec(o.key)[1];
    const keep = new Set(items.slice(0, KEEP_REMOTE_DAYS).map((o) => o.key));
    const months = new Map(); // AAAAMM → el más antiguo de ese mes
    for (const o of items) months.set(day(o).slice(0, 6), o.key);
    [...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, KEEP_REMOTE_MONTHS)
      .forEach(([, key]) => keep.add(key));
    for (const o of items) if (!keep.has(o.key)) await this.remote.del(o.key);
  }

  // ----- Programación: revisa cada minuto si ya toca el respaldo de hoy
  due() {
    const now = this.now();
    if (now.getHours() < this.hour) return false;
    const last = this.saved().lastDaily;
    const today = stamp(now).slice(0, 8);
    return last !== today;
  }
  async tick() {
    if (this.running) return;
    const s = this.saved();
    const t = this.now().getTime();
    const since = (x) => (x ? t - Date.parse(x.at) : Infinity);
    if (this.due()) {
      if (since(s.lastError) < RETRY_MS) return;
      const today = stamp(this.now()).slice(0, 8);
      try {
        await this.run('diario');
        this.save({ lastDaily: today });
      } catch {
        /* queda anotado en el estado; se reintenta en unos minutos */
      }
      return;
    }
    // El respaldo local salió bien pero la subida no: se reintenta (sin internet, por ejemplo)
    const pending = s.lastOk && (!s.remoteOk || s.remoteOk.at < s.lastOk.at);
    if (this.remoteReady && pending && since(s.remoteError) >= REMOTE_RETRY_MS) {
      this.running = this.upload(s.lastOk.name).finally(() => (this.running = null));
      await this.running;
    }
  }
  start(everyMs = 60_000) {
    this.timer = setInterval(() => this.tick(), everyMs);
    this.timer.unref();
    return this;
  }
  stop() {
    clearInterval(this.timer);
  }
}
