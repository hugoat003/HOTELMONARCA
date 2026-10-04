import { useState } from 'react';
import { INV_CATS, INV_MOVES, INV_UNITS } from '../data.js';
import { fmtDateTime } from '../lib/dates.js';
import { qtyFmt, stockStatus } from '../lib/inventory.js';
import DataTable, { rowClass } from './DataTable.jsx';
import Modal, { Field } from './ui/Modal.jsx';

// Piezas de existencias compartidas por Inventario (restaurante) y Tienda (recepción)

const STATUS_LABEL = { ok: 'OK', bajo: 'Bajo mínimo', agotado: 'Agotado' };

export function StockTag({ item }) {
  const st = stockStatus(item);
  return <span className={'tag stock-' + st}>{STATUS_LABEL[st]}</span>;
}

// Últimos movimientos. labels: nombre de cada tipo de movimiento
export function StockMoves({ moves, items, users, labels, limit = 12 }) {
  const name = (id) => items.find((i) => i.id === id)?.name || '—';
  const userName = (id) => users.find((u) => u.id === id)?.name || '—';
  const sign = (t) => (t === 'entrada' || t === 'devolucion' ? '+' : t === 'ajuste' ? '=' : '−');
  return (
    <DataTable title="Últimos movimientos" empty="Sin movimientos.">
      {[...moves]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, limit)
        .map((m) => (
          <div key={m.id} className={rowClass('inv-moves')}>
            <span className="panel-sub">{fmtDateTime(m.ts)}</span>
            <span>
              <strong>{labels[m.type]}</strong> · {name(m.itemId)}
            </span>
            <span className="panel-sub">
              {m.note || '—'} · {userName(m.userId)}
            </span>
            <span>
              {sign(m.type)}
              {qtyFmt(m.qty)}
            </span>
            <span className="panel-sub">queda {qtyFmt(m.after)}</span>
          </div>
        ))}
    </DataTable>
  );
}

// moves = tipos de movimiento permitidos
export function MoveModal({ item, type: initialType, moves = INV_MOVES, onClose, onSave }) {
  const [type, setType] = useState(initialType);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = parseFloat(qty) || 0;
  const after = type === 'entrada' ? item.stock + n : type === 'ajuste' ? n : item.stock - n;
  const presets = {
    entrada: ['Compra a proveedor', 'Compra en mercado', 'Devolución'],
    salida: ['Consumo de cocina', 'Consumo de bar', 'Evento'],
    merma: ['Producto vencido', 'Quebrado o dañado', 'Error de preparación'],
    ajuste: ['Conteo físico'],
  }[type];
  const keys = Object.keys(moves);
  const invalid = type === 'ajuste' ? n < 0 || qty === '' : n <= 0 || after < 0;
  return (
    <Modal
      title={item.name}
      aside={`${qtyFmt(item.stock)} ${item.unit}`}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={invalid} onClick={() => onSave(type, n, note.trim())}>
            Registrar
          </button>
        </>
      }
    >
      <div className="segmented row" style={{ gridTemplateColumns: `repeat(${keys.length}, 1fr)` }}>
        {Object.entries(moves).map(([k, l]) => (
          <button key={k} className={'seg-btn' + (type === k ? ' active' : '')} onClick={() => setType(k)}>
            {l.replace(' de conteo', '')}
          </button>
        ))}
      </div>
      <Field label={type === 'ajuste' ? 'Existencia contada' : 'Cantidad'} hint={item.unit}>
        <input
          className="input big"
          type="number"
          inputMode="decimal"
          min="0"
          autoFocus
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </Field>
      <Field label="Nota">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="chips">
        {presets.map((p) => (
          <button key={p} className="chip small" onClick={() => setNote(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="summary-bar">
        <span>
          Existencia actual {qtyFmt(item.stock)} {item.unit}
        </span>
        <strong className={after < item.min ? 'urgent' : ''}>
          Queda {qtyFmt(Math.max(0, after))} {item.unit}
        </strong>
      </div>
    </Modal>
  );
}

// withPrice agrega el precio de venta (tienda)
export function ItemModal({ item, cats = INV_CATS, withPrice = false, onClose, onSave, onDelete }) {
  const [v, setV] = useState(item);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const problem = !v.name.trim()
    ? 'Falta el nombre'
    : !(parseFloat(v.min) >= 0)
      ? 'Falta el mínimo'
      : !(parseFloat(v.cost) >= 0)
        ? 'Falta el costo'
        : withPrice && !(parseFloat(v.price) > 0)
          ? 'Falta el precio de venta'
          : '';
  const margin =
    withPrice && parseFloat(v.price) > 0
      ? Math.round(((parseFloat(v.price) - (parseFloat(v.cost) || 0)) / parseFloat(v.price)) * 100)
      : null;
  return (
    <Modal
      title={item.isNew ? 'Nuevo producto' : 'Editar producto'}
      onClose={onClose}
      width={560}
      footer={
        <>
          {!item.isNew ? (
            <button className="btn btn-quiet" onClick={onDelete}>
              Eliminar
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button className="btn btn-primary" disabled={!!problem} onClick={() => onSave(v)}>
            {problem || 'Guardar'}
          </button>
        </>
      }
    >
      <div className="form-grid two">
        <Field label="Nombre" className="span-2">
          <input className="input" autoFocus value={v.name} onChange={set('name')} />
        </Field>
        <Field label="Categoría">
          <select className="input" value={v.cat} onChange={set('cat')}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Unidad">
          <select className="input" value={v.unit} onChange={set('unit')}>
            {INV_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Existencia" hint={item.isNew ? 'inicial' : 'usa Ajuste para corregir'}>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={v.stock}
            disabled={!item.isNew}
            onChange={set('stock')}
          />
        </Field>
        <Field label="Mínimo" hint="avisa al bajar de aquí">
          <input className="input" type="number" inputMode="decimal" value={v.min} onChange={set('min')} />
        </Field>
        <Field label="Costo por unidad">
          <input className="input" type="number" inputMode="decimal" value={v.cost} onChange={set('cost')} />
        </Field>
        {withPrice && (
          <Field label="Precio de venta" hint={margin !== null ? `margen ${margin}%` : undefined}>
            <input className="input" type="number" inputMode="decimal" value={v.price} onChange={set('price')} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
