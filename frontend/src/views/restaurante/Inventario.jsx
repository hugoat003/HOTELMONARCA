import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { INV_CATS, INV_MOVES, INV_UNITS } from '../../data.js';
import { fmtDateTime, uid } from '../../lib/dates.js';
import { stockStatus } from '../../lib/inventory.js';
import { sum } from '../../lib/money.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

const STATUS_LABEL = { ok: 'OK', bajo: 'Bajo mínimo', agotado: 'Agotado' };
export const qtyFmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

export default function Inventario() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = useState('Todas');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [move, setMove] = useState(null); // { item, type }
  const [edit, setEdit] = useState(null);

  const q = search.trim().toLowerCase();
  const items = state.inventory
    .filter((it) => (cat === 'Todas' || it.cat === cat) && (!q || it.name.toLowerCase().includes(q)) && (!onlyLow || stockStatus(it) !== 'ok'))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const low = state.inventory.filter((it) => stockStatus(it) !== 'ok');
  const value = sum(state.inventory, (it) => it.stock * it.cost);
  const itemName = (id) => state.inventory.find((i) => i.id === id)?.name || '—';
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';
  const moves = [...state.invMoves].sort((a, b) => b.ts - a.ts).slice(0, 12);

  return (
    <div className="page" style={{ gap: 20 }}>
      <div className="kpis">
        <div className="card kpi"><div className="card-label">Productos</div><div className="kpi-value">{state.inventory.length}</div><div className="kpi-note">{INV_CATS.length} categorías</div></div>
        <div className={'card kpi' + (low.length ? ' alert' : '')}><div className="card-label">Bajo mínimo</div><div className="kpi-value">{low.length}</div><div className="kpi-note">{((n) => `${n} agotado${n === 1 ? '' : 's'}`)(low.filter((i) => i.stock <= 0).length)}</div></div>
        <div className="card kpi"><div className="card-label">Valor del inventario</div><div className="kpi-value">{fmt(value)}</div><div className="kpi-note">A costo de compra</div></div>
        <div className="card kpi"><div className="card-label">Mermas registradas</div><div className="kpi-value">{fmt(sum(state.invMoves.filter((m) => m.type === 'merma'), (m) => m.qty * (state.inventory.find((i) => i.id === m.itemId)?.cost || 0)))}</div><div className="kpi-note">Histórico</div></div>
      </div>

      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <div className="chips">
          {['Todas', ...INV_CATS].map((c) => <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>)}
          <button className={'chip small' + (onlyLow ? ' active' : '')} onClick={() => setOnlyLow(!onlyLow)}>Solo bajo mínimo</button>
        </div>
        <div className="chips">
          <input className="input search" style={{ width: 220 }} placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-primary small" onClick={() => setEdit({ id: uid('i'), name: '', cat: cat === 'Todas' ? INV_CATS[0] : cat, unit: 'unidad', stock: '0', min: '', cost: '', isNew: true })}>+ Producto</button>
        </div>
      </div>

      <div className="card tx-card">
        <div className="tx-row head inv"><span>Producto</span><span>Categoría</span><span>Existencia</span><span>Mínimo</span><span>Estado</span><span>Valor</span><span /></div>
        {items.map((it) => {
          const st = stockStatus(it);
          return (
            <div key={it.id} className="tx-row inv">
              <strong>{it.name}</strong>
              <span className="panel-sub">{it.cat}</span>
              <span><strong>{qtyFmt(it.stock)}</strong> <span className="panel-sub">{it.unit}</span></span>
              <span className="panel-sub">{qtyFmt(it.min)}</span>
              <span><span className={'tag stock-' + st}>{STATUS_LABEL[st]}</span></span>
              <span>{fmt(it.stock * it.cost)}</span>
              <span className="row-actions">
                <button className="link" onClick={() => setMove({ item: it, type: 'entrada' })}>Entrada</button>
                <button className="link" onClick={() => setMove({ item: it, type: 'salida' })}>Salida</button>
                <button className="link" onClick={() => setMove({ item: it, type: 'merma' })}>Merma</button>
                <button className="link" onClick={() => setEdit({ ...it, stock: String(it.stock), min: String(it.min), cost: String(it.cost) })}>Editar</button>
              </span>
            </div>
          );
        })}
        {!items.length && <div className="panel-sub" style={{ padding: 12 }}>Sin productos en esta vista.</div>}
      </div>

      <div className="card tx-card">
        <div className="card-label">Últimos movimientos</div>
        {moves.map((m) => (
          <div key={m.id} className="tx-row inv-moves">
            <span className="panel-sub">{fmtDateTime(m.ts)}</span>
            <span><strong>{INV_MOVES[m.type]}</strong> · {itemName(m.itemId)}</span>
            <span className="panel-sub">{m.note || '—'} · {userName(m.userId)}</span>
            <span>{m.type === 'entrada' ? '+' : m.type === 'ajuste' ? '=' : '−'}{qtyFmt(m.qty)}</span>
            <span className="panel-sub">queda {qtyFmt(m.after)}</span>
          </div>
        ))}
      </div>

      {move && (
        <MoveModal {...move} onClose={() => setMove(null)}
          onSave={(type, qty, note) => {
            if (type === 'merma' && user.role !== 'gerente') {
              return ui.authorize(`Registrar merma de ${move.item.name}`, () => { update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id })); setMove(null); ui.notify('Merma registrada'); });
            }
            update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id }));
            setMove(null);
            ui.notify(`${INV_MOVES[type]} registrada · ${move.item.name}`);
          }} />
      )}
      {edit && (
        <ItemModal item={edit} onClose={() => setEdit(null)}
          onDelete={() => ui.confirm({ title: 'Eliminar producto', message: `¿Eliminar ${edit.name} del inventario?`, confirmLabel: 'Eliminar', danger: true },
            () => { update((d) => A.remove(d, 'inventory', edit.id)); setEdit(null); })}
          onSave={({ isNew, ...v }) => {
            update((d) => A.upsert(d, 'inventory', { ...v, name: v.name.trim(), stock: parseFloat(v.stock) || 0, min: parseFloat(v.min) || 0, cost: parseFloat(v.cost) || 0 }));
            setEdit(null);
            ui.notify(isNew ? 'Producto agregado' : 'Producto actualizado');
          }} />
      )}
    </div>
  );
}

// Compartido con la tienda: moves = tipos de movimiento permitidos
export function MoveModal({ item, type: initialType, moves = INV_MOVES, onClose, onSave }) {
  const [type, setType] = useState(initialType);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = parseFloat(qty) || 0;
  const after = type === 'entrada' ? item.stock + n : type === 'ajuste' ? n : item.stock - n;
  const presets = { entrada: ['Compra a proveedor', 'Compra en mercado', 'Devolución'], salida: ['Consumo de cocina', 'Consumo de bar', 'Evento'], merma: ['Producto vencido', 'Quebrado o dañado', 'Error de preparación'], ajuste: ['Conteo físico'] }[type];
  const keys = Object.keys(moves);
  const invalid = type === 'ajuste' ? n < 0 || qty === '' : n <= 0 || after < 0;
  return (
    <Modal title={item.name} aside={`${qtyFmt(item.stock)} ${item.unit}`} onClose={onClose} width={480}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={invalid} onClick={() => onSave(type, n, note.trim())}>Registrar</button></>}>
      <div className="segmented row" style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
        {Object.entries(moves).map(([k, l]) => <button key={k} className={'seg-btn' + (type === k ? ' active' : '')} onClick={() => setType(k)}>{l.replace(' de conteo', '')}</button>)}
      </div>
      <Field label={type === 'ajuste' ? 'Existencia contada' : 'Cantidad'} hint={item.unit}>
        <input className="input big" type="number" min="0" autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Field label="Nota"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="chips">{presets.map((p) => <button key={p} className="chip small" onClick={() => setNote(p)}>{p}</button>)}</div>
      <div className="summary-bar">
        <span>Existencia actual {qtyFmt(item.stock)} {item.unit}</span>
        <strong className={after < item.min ? 'urgent' : ''}>Queda {qtyFmt(Math.max(0, after))} {item.unit}</strong>
      </div>
    </Modal>
  );
}

// Compartido con la tienda: withPrice agrega el precio de venta
export function ItemModal({ item, cats = INV_CATS, withPrice = false, onClose, onSave, onDelete }) {
  const [v, setV] = useState(item);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const problem = !v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.min) >= 0) ? 'Falta el mínimo' : !(parseFloat(v.cost) >= 0) ? 'Falta el costo'
    : withPrice && !(parseFloat(v.price) > 0) ? 'Falta el precio de venta' : '';
  const margin = withPrice && parseFloat(v.price) > 0 ? Math.round(((parseFloat(v.price) - (parseFloat(v.cost) || 0)) / parseFloat(v.price)) * 100) : null;
  return (
    <Modal title={item.isNew ? 'Nuevo producto' : 'Editar producto'} onClose={onClose} width={560}
      footer={<>
        {!item.isNew ? <button className="btn btn-quiet" onClick={onDelete}>Eliminar</button> : <button className="btn" onClick={onClose}>Cancelar</button>}
        <button className="btn btn-primary" disabled={!!problem} onClick={() => onSave(v)}>{problem || 'Guardar'}</button>
      </>}>
      <div className="form-grid two">
        <Field label="Nombre" style={{ gridColumn: 'span 2' }}><input className="input" autoFocus value={v.name} onChange={set('name')} /></Field>
        <Field label="Categoría"><select className="input" value={v.cat} onChange={set('cat')}>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Unidad"><select className="input" value={v.unit} onChange={set('unit')}>{INV_UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Existencia" hint={item.isNew ? 'inicial' : 'usa Ajuste para corregir'}><input className="input" type="number" value={v.stock} disabled={!item.isNew} onChange={set('stock')} /></Field>
        <Field label="Mínimo" hint="avisa al bajar de aquí"><input className="input" type="number" value={v.min} onChange={set('min')} /></Field>
        <Field label="Costo por unidad"><input className="input" type="number" value={v.cost} onChange={set('cost')} /></Field>
        {withPrice && (
          <Field label="Precio de venta" hint={margin !== null ? `margen ${margin}%` : 'IVA incluido'}>
            <input className="input" type="number" value={v.price} onChange={set('price')} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
