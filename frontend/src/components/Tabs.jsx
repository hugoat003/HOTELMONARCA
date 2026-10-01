// Pestañas: tabs = [[clave, etiqueta], ...]. children se muestra al final (acciones extra).
export default function Tabs({ tabs, value, onChange, children, className = '' }) {
  return (
    <div className={'tabs ' + className}>
      {tabs.map(([k, label]) => (
        <button key={k} className={'tab' + (value === k ? ' active' : '')} onClick={() => onChange(k)}>{label}</button>
      ))}
      {children}
    </div>
  );
}
