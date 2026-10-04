// Estado del hotel en memoria, con cada cambio guardado en SQLite y difundido a los dispositivos.
// Las operaciones son las mismas acciones de shared/actions.js que usa el frontend.
import { enablePatches, produceWithPatches, setAutoFreeze } from 'immer';
import { COLLECTIONS, runCall } from '../../shared/sync.js';

enablePatches();
setAutoFreeze(false);

const keyOf = (coll) => COLLECTIONS[coll];

export class Engine {
  constructor(db) {
    this.db = db;
    this.pos = {}; // coll → Map(id → posición guardada)
    this.q = {
      meta: db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: db.prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ),
      kvAll: db.prepare('SELECT key, data FROM kv'),
      kvSet: db.prepare('INSERT INTO kv (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data'),
      kvDel: db.prepare('DELETE FROM kv WHERE key = ?'),
      docsAll: db.prepare('SELECT coll, id, pos, data FROM docs ORDER BY coll, pos'),
      docSet: db.prepare(
        'INSERT INTO docs (coll, id, pos, data) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET pos = excluded.pos, data = excluded.data',
      ),
      docDel: db.prepare('DELETE FROM docs WHERE coll = ? AND id = ?'),
      action: db.prepare('SELECT rev FROM actions WHERE aid = ?'),
      logAction: db.prepare('INSERT INTO actions (aid, rev, ts, user_id, calls) VALUES (?, ?, ?, ?, ?)'),
    };
    this.load();
  }

  get initialized() {
    return !!this.q.meta.get('version');
  }

  load() {
    const state = {};
    for (const { key, data } of this.q.kvAll.all()) state[key] = JSON.parse(data);
    for (const coll of Object.keys(COLLECTIONS)) {
      state[coll] = [];
      this.pos[coll] = new Map();
    }
    for (const { coll, id, pos, data } of this.q.docsAll.all()) {
      if (!state[coll]) continue;
      state[coll].push(JSON.parse(data));
      this.pos[coll].set(id, pos);
    }
    this.state = state;
    this.rev = Number(this.q.meta.get('rev')?.value || 0);
  }

  // Reemplaza todo el estado (instalación inicial, datos de ejemplo o carga de un respaldo)
  replaceAll(next) {
    const { session: _s, ...clean } = next;
    this.db.transaction(() => {
      this.db.exec('DELETE FROM docs; DELETE FROM kv;');
      for (const coll of Object.keys(COLLECTIONS)) this.pos[coll] = new Map();
      for (const [key, value] of Object.entries(clean)) {
        if (COLLECTIONS[key]) {
          value.forEach((item, i) => {
            const id = String(item[keyOf(key)]);
            this.q.docSet.run(key, id, i, JSON.stringify(item));
            this.pos[key].set(id, i);
          });
        } else this.q.kvSet.run(key, JSON.stringify(value));
      }
      this.rev += 1;
      this.q.setMeta.run('rev', String(this.rev));
      this.q.setMeta.run('version', String(clean.version ?? ''));
    })();
    for (const coll of Object.keys(COLLECTIONS)) clean[coll] ||= [];
    this.state = clean;
    return this.rev;
  }

  // Rev en que se aplicó una operación ya recibida (reintento del dispositivo), o null
  appliedRev(aid) {
    return this.q.action.get(aid)?.rev ?? null;
  }

  // Aplica una tanda de operaciones de forma atómica: o se guardan todas o ninguna.
  // Devuelve { rev, patches }. Si una acción falla, lanza el error y nada cambia.
  apply({ aid, calls, userId, beforeCommit }) {
    const prev = this.state;
    const [next, raw] = produceWithPatches(prev, (d) => {
      d.session = { userId }; // la bitácora toma de aquí quién hizo la operación
      for (const c of calls) runCall(d, c);
      delete d.session;
    });
    const patches = raw.filter((p) => p.path[0] !== 'session');
    const rev = this.rev + 1;
    this.db.transaction(() => {
      beforeCommit?.(next); // validaciones finales y credenciales, dentro de la misma transacción
      this.persist(prev, next);
      this.q.setMeta.run('rev', String(rev));
      this.q.logAction.run(aid, rev, Date.now(), userId, JSON.stringify(calls));
    })();
    this.rev = rev;
    this.state = next;
    return { rev, patches };
  }

  // Guarda solo lo que cambió. Gracias a immer, lo que no se tocó conserva la misma referencia.
  persist(prev, next) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of keys) {
      if (prev[key] === next[key]) continue;
      if (COLLECTIONS[key]) this.persistCollection(key, prev[key] || [], next[key] || []);
      else if (next[key] === undefined) this.q.kvDel.run(key);
      else this.q.kvSet.run(key, JSON.stringify(next[key]));
    }
  }

  persistCollection(coll, prevArr, nextArr) {
    const k = keyOf(coll);
    const pos = this.pos[coll];
    const prevById = new Map(prevArr.map((x) => [String(x[k]), x]));
    const nextIds = nextArr.map((x) => String(x[k]));

    // ¿Los que ya existían siguen en el mismo orden? (si se reordenó la lista, se renumera)
    let last = -Infinity;
    let ordered = true;
    for (const id of nextIds) {
      const p = pos.get(id);
      if (p === undefined) continue;
      if (p <= last) {
        ordered = false;
        break;
      }
      last = p;
    }

    const newPos = new Map();
    if (ordered) {
      // Los nuevos quedan entre sus vecinos (al final, al inicio o en medio)
      let before = null;
      for (let i = 0; i < nextIds.length; i++) {
        const id = nextIds[i];
        if (pos.has(id)) {
          before = pos.get(id);
          continue;
        }
        let after = null;
        for (let j = i + 1; j < nextIds.length; j++)
          if (pos.has(nextIds[j])) {
            after = pos.get(nextIds[j]);
            break;
          }
        const p =
          before === null ? (after === null ? i : after - 1) : after === null ? before + 1 : (before + after) / 2;
        if (p === before || p === after) {
          ordered = false; // sin espacio entre vecinos: se renumera
          break;
        }
        newPos.set(id, p);
        before = p;
      }
    }

    const nextSet = new Set(nextIds);
    for (const id of prevById.keys())
      if (!nextSet.has(id)) {
        this.q.docDel.run(coll, id);
        pos.delete(id);
      }

    if (!ordered) {
      nextArr.forEach((item, i) => {
        const id = nextIds[i];
        this.q.docSet.run(coll, id, i, JSON.stringify(item));
        pos.set(id, i);
      });
      return;
    }
    nextArr.forEach((item, i) => {
      const id = nextIds[i];
      if (newPos.has(id)) {
        pos.set(id, newPos.get(id));
        this.q.docSet.run(coll, id, newPos.get(id), JSON.stringify(item));
      } else if (prevById.get(id) !== item) this.q.docSet.run(coll, id, pos.get(id), JSON.stringify(item));
    });
  }
}
