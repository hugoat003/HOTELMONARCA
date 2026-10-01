// Tabla en tarjeta: encabezado opcional + filas. Las columnas se definen en CSS
// con la clase .tx-row.<variant>; las filas usan rowClass(variant).
export const rowClass = (variant, extra = '') => `tx-row ${variant}${extra ? ' ' + extra : ''}`;

export default function DataTable({ title, variant = '', columns, empty, children, className = '' }) {
  const hasRows = Array.isArray(children) ? children.flat().some(Boolean) : !!children;
  return (
    <div className={'card tx-card ' + className}>
      {title && <div className="card-label">{title}</div>}
      {columns && (
        <div className={rowClass(variant, 'head')}>
          {columns.map((c, i) => <span key={i}>{c}</span>)}
        </div>
      )}
      {children}
      {!hasRows && empty && <div className="panel-sub pad-12">{empty}</div>}
    </div>
  );
}
