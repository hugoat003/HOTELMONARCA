const pad = (n) => String(n).padStart(2, '0');

const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toDateStr(new Date());
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
};
// Suma meses respetando el fin de mes (31 ene + 1 mes = 28/29 feb)
export const addMonths = (s, n) => {
  const d = parse(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateStr(d);
};
export const nightsBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parse(s).toLocaleDateString('es-GT', opts);
export const fmtLongDate = (d = new Date()) =>
  d.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtTime = (ts) => new Date(ts).toTimeString().slice(0, 5);
export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dateOf = (ts) => toDateStr(new Date(ts));

export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
