// Cola de impresión: cada ticket se guarda en la base antes de enviarse. Si la impresora no
// responde (sin papel, apagada, cable suelto), el ticket espera y se reintenta solo; nada se pierde
// aunque se reinicie el NUC. En modo simulado el ticket solo queda guardado para verlo en pantalla.
import { PRINTER_NAMES, printerConfig, ticketText } from '../../../shared/tickets.js';
import { render } from './escpos.js';
import { sendNetwork, sendUsb } from './transport.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS print_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    data BLOB NOT NULL,
    status TEXT NOT NULL,          -- pendiente | impreso | simulado | descartado
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    user_id TEXT,
    created_at INTEGER NOT NULL,
    printed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS print_jobs_pending ON print_jobs (printer, status, id);
`;
const KEEP_DAYS = 30;

export class PrintQueue {
  // getConfig: () => config del hotel (se lee en cada envío: los cambios aplican sin reiniciar)
  constructor(db, { getConfig, onChange = () => {}, retryMs = [2000, 5000, 15000, 30000, 60000], send } = {}) {
    db.exec(SCHEMA);
    this.db = db;
    this.getConfig = getConfig;
    this.onChange = onChange;
    this.retryMs = retryMs;
    this.send = send || ((p, data) => (p.mode === 'usb' ? sendUsb(p.device, data) : sendNetwork(p.host, p.port, data)));
    this.workers = {}; // impresora → { busy, timer, error, lastOk }
    this.closed = false;
    this.q = {
      insert: db.prepare(
        'INSERT INTO print_jobs (printer, title, text, data, status, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ),
      next: db.prepare("SELECT * FROM print_jobs WHERE printer = ? AND status = 'pendiente' ORDER BY id LIMIT 1"),
      done: db.prepare(
        'UPDATE print_jobs SET status = ?, printed_at = ?, error = NULL, attempts = attempts + 1 WHERE id = ?',
      ),
      failed: db.prepare('UPDATE print_jobs SET attempts = attempts + 1, error = ? WHERE id = ?'),
      setStatus: db.prepare('UPDATE print_jobs SET status = ? WHERE id = ?'),
      get: db.prepare('SELECT * FROM print_jobs WHERE id = ?'),
      pending: db.prepare("SELECT printer, COUNT(*) n FROM print_jobs WHERE status = 'pendiente' GROUP BY printer"),
      recent: db.prepare(
        'SELECT id, printer, title, text, status, attempts, error, user_id, created_at, printed_at FROM print_jobs ORDER BY id DESC LIMIT ?',
      ),
      last: db.prepare('SELECT MAX(id) id, SUM(printed_at) p FROM print_jobs'),
      purge: db.prepare("DELETE FROM print_jobs WHERE status != 'pendiente' AND created_at < ?"),
    };
    this.q.purge.run(Date.now() - KEEP_DAYS * 864e5);
    // Lo que quedó pendiente antes de un reinicio se vuelve a intentar
    for (const name of Object.keys(PRINTER_NAMES)) this.kick(name);
  }

  printer(name) {
    return printerConfig(this.getConfig())[name];
  }

  // Agrega un ticket a la cola. Devuelve el id del trabajo, o null si esa impresora está apagada.
  enqueue(name, ticket, { userId = null, drawer = false, copies = 1 } = {}) {
    const cfg = printerConfig(this.getConfig());
    const p = cfg[name];
    if (!p || p.mode === 'apagada') return null;
    const data = render(ticket, { columns: p.columns, logo: cfg.logo, drawer, copies });
    const text = ticketText(ticket, p.columns) + (drawer ? '\n[abre la gaveta]' : '');
    const sim = p.mode === 'simulada';
    const { lastInsertRowid } = this.q.insert.run(
      name,
      ticket.title,
      text,
      data,
      sim ? 'simulado' : 'pendiente',
      userId,
      Date.now(),
    );
    if (sim) this.onChange();
    else this.kick(name);
    return Number(lastInsertRowid);
  }

  worker(name) {
    return (this.workers[name] ||= { busy: false, timer: null, error: null, failures: 0, lastOk: null });
  }

  // Envía lo pendiente de una impresora, de uno en uno y en orden
  kick(name) {
    const w = this.worker(name);
    if (w.busy || this.closed) return;
    clearTimeout(w.timer);
    w.timer = null;
    w.busy = true;
    this.drain(name).finally(() => {
      w.busy = false;
    });
  }

  async drain(name) {
    const w = this.worker(name);
    for (;;) {
      if (this.closed) return;
      const job = this.q.next.get(name);
      if (!job) return;
      const p = this.printer(name);
      if (p.mode === 'apagada' || p.mode === 'simulada') {
        // Se cambió la impresora mientras había pendientes: quedan como simulados
        this.q.setStatus.run(p.mode === 'simulada' ? 'simulado' : 'descartado', job.id);
        this.onChange();
        continue;
      }
      try {
        await this.send(p, job.data);
        this.q.done.run('impreso', Date.now(), job.id);
        w.error = null;
        w.failures = 0;
        w.lastOk = Date.now();
        this.onChange();
      } catch (e) {
        this.q.failed.run(e.message, job.id);
        w.error = e.message;
        const wait = this.retryMs[Math.min(w.failures, this.retryMs.length - 1)];
        w.failures += 1;
        this.onChange();
        if (!this.closed) {
          w.timer = setTimeout(() => this.kick(name), wait);
          w.timer.unref?.();
        }
        return;
      }
    }
  }

  // "Reintentar ahora" (después de poner papel o reconectar)
  retry(name) {
    const w = this.worker(name);
    w.failures = 0;
    this.kick(name);
  }
  discard(id) {
    const job = this.q.get.get(id);
    if (!job || job.status !== 'pendiente') return false;
    this.q.setStatus.run('descartado', id);
    this.onChange();
    return true;
  }
  reprint(id, userId) {
    const job = this.q.get.get(id);
    if (!job) return null;
    const p = this.printer(job.printer);
    if (p.mode === 'apagada') return null;
    const sim = p.mode === 'simulada';
    const { lastInsertRowid } = this.q.insert.run(
      job.printer,
      'Reimpresión · ' + job.title.replace(/^Reimpresión · /, ''),
      job.text,
      job.data,
      sim ? 'simulado' : 'pendiente',
      userId,
      Date.now(),
    );
    if (sim) this.onChange();
    else this.kick(job.printer);
    return Number(lastInsertRowid);
  }

  // Estado para las pantallas: por impresora, si responde y cuántos tickets esperan
  status({ recent = 20 } = {}) {
    const cfg = printerConfig(this.getConfig());
    const pending = Object.fromEntries(this.q.pending.all().map((r) => [r.printer, r.n]));
    const printers = Object.fromEntries(
      Object.keys(PRINTER_NAMES).map((name) => {
        const w = this.worker(name);
        return [
          name,
          {
            mode: cfg[name].mode,
            pending: pending[name] || 0,
            error: pending[name] ? w.error : null,
            lastOk: w.lastOk,
          },
        ];
      }),
    );
    // version: cambia con cada ticket nuevo o impreso (las pantallas recargan la lista solo si cambió)
    const v = this.q.last.get();
    return { printers, version: `${v.id || 0}-${v.p || 0}`, jobs: recent ? this.q.recent.all(recent) : [] };
  }

  close() {
    this.closed = true;
    for (const w of Object.values(this.workers)) clearTimeout(w.timer);
  }
}
