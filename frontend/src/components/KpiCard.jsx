// Indicador: etiqueta, valor grande y nota. tone: 'dark' | 'alert'. Con onClick se vuelve botón.
export default function KpiCard({ label, value, note, tone, onClick, className = '' }) {
  const cls = `card kpi${tone ? ' ' + tone : ''}${onClick ? ' kpi-button' : ''} ${className}`;
  const body = (
    <>
      <div className="card-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note && <div className="kpi-note">{note}</div>}
    </>
  );
  return onClick ? <button className={cls} onClick={onClick}>{body}</button> : <div className={cls}>{body}</div>;
}
