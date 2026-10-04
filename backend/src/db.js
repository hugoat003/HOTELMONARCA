// Base de datos SQLite (un archivo en el NUC). Guarda el estado del hotel registro por registro,
// las credenciales (solo el hash del PIN), las sesiones abiertas y el historial de operaciones.
import Database from 'better-sqlite3';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- Registros de las colecciones (ventas, reservas, mesas…). pos conserva el orden de la lista.
  CREATE TABLE IF NOT EXISTS docs (
    coll TEXT NOT NULL,
    id TEXT NOT NULL,
    pos REAL NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (coll, id)
  );
  CREATE INDEX IF NOT EXISTS docs_order ON docs (coll, pos);
  -- Valores sueltos: configuración, contadores, turno de caja abierto, categorías…
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS credentials (user_id TEXT PRIMARY KEY, pin_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  -- Cada operación aplicada: quién, cuándo y qué. aid evita aplicar dos veces un reintento.
  CREATE TABLE IF NOT EXISTS actions (
    aid TEXT PRIMARY KEY,
    rev INTEGER NOT NULL,
    ts INTEGER NOT NULL,
    user_id TEXT,
    calls TEXT NOT NULL
  );
`;

export function openDb(file = ':memory:') {
  const db = new Database(file);
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL');
    // FULL: cada cobro queda en disco antes de responder (con WAL sigue siendo rápido)
    db.pragma('synchronous = FULL');
  }
  db.exec(SCHEMA);
  return db;
}
