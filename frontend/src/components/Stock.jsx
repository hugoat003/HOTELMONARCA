import { useState } from 'react';
import { INV_CATS, INV_MOVES, INV_UNITS } from '@shared/data.js';
import { fmtDateTime } from '@shared/dates.js';
import { fixedFactor, perUnit, qtyFmt, stockStatus, USE_UNITS, spendUnit } from '@shared/inventory.js';
import { A } from '../store/actions.js';
import { useStore } from '../store/store.jsx';
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
// priceLocked: el precio de venta de un producto que ya existe lo cambia la administración general
// Si cambia la unidad en que se gasta un insumo, las recetas que lo llevan se pasan a la nueva
// (la misma cantidad real: 0.25 kg → 250 g). Se llama dentro de update().
export function rescaleRecipes(d, menu, old, next) {
  if (!old || spendUnit(old) === spendUnit(next)) return;
  const f = fixedFactor(spendUnit(old), spendUnit(next)) ?? perUnit(next) / perUnit(old);
  for (const m of menu) {
    if (!(m.recipe || []).some((r) => r.itemId === next.id)) continue;
    const recipe = m.recipe.map((r) => (r.itemId === next.id ? { ...r, qty: Math.round(r.qty * f * 1e6) / 1e6 } : r));
    A.upsert(d, 'menu', { id: m.id, recipe });
  }
}

// withUse: insumos de cocina, que se compran en una unidad y se gastan en otra (kg → g)
export function ItemModal({
  item,
  cats = INV_CATS,
  withPrice = false,
  withUse = false,
  priceLocked = false,
  onClose,
  onSave,
  onDelete,
}) {
  const { fmt } = useStore();
  const [v, setV] = useState({
    ...item,
    useUnit: item.useUnit || item.unit,
    perUnit: item.perUnit && item.useUnit ? String(item.perUnit) : '',
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  // Al cambiar la unidad de compra, si se gastaba en la misma, se sigue gastando en la misma
  const setUnit = (e) =>
    setV({ ...v, unit: e.target.value, useUnit: v.useUnit === v.unit ? e.target.value : v.useUnit });
  const fixed = fixedFactor(v.unit, v.useUnit);
  const per = fixed ?? parseFloat(v.perUnit);
  const unitCost = per > 0 ? (parseFloat(v.cost) || 0) / per : null;
  const problem = !v.name.trim()
    ? 'Falta el nombre'
    : !(parseFloat(v.min) >= 0)
      ? 'Falta el mínimo'
      : !(parseFloat(v.cost) >= 0)
        ? 'Falta el costo'
        : withPrice && !(parseFloat(v.price) > 0)
          ? 'Falta el precio de venta'
          : withUse && !(per > 0)
            ? `Falta cuánto trae cada ${v.unit}`
            : '';
  const save = () => {
    const { useUnit: uu, perUnit: _, ...rest } = v;
    onSave(withUse ? { ...rest, useUnit: uu, perUnit: per } : rest);
  };
  const margin =
    withPrice && parseFloat(v.price) > 0
      ? Math.round(((parseFloat(v.price) - (parseFloat(v.cost) || 0)) / parseFloat(v.price)) * 100)
      : null;
  return (
    <Modal
      title={(item.isNew ? 'Nuevo ' : 'Editar ') + (withUse ? 'insumo' : 'producto')}
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
          <button className="btn btn-primary" disabled={!!problem} onClick={save}>
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
        <Field label={withUse ? 'Se compra en' : 'Unidad'} hint={withUse ? 'así se cuenta la existencia' : undefined}>
          <select className="input" value={v.unit} onChange={withUse ? setUnit : set('unit')}>
            {INV_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        {withUse && (
          <>
            <Field label="Se gasta en" hint="así se escribe en las recetas">
              <select className="input" value={v.useUnit} onChange={set('useUnit')}>
                {[...new Set([v.unit, ...USE_UNITS])].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            {fixed !== null ? (
              <div className="unit-note">
                {fixed === 1
                  ? `Se gasta en la misma unidad en que se compra (${v.unit}).`
                  : `1 ${v.unit} = ${qtyFmt(fixed)} ${v.useUnit}. El sistema convierte solo.`}
              </div>
            ) : (
              <Field label={`¿Cuántos ${v.useUnit} trae cada ${v.unit}?`}>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={v.perUnit}
                  onChange={set('perUnit')}
                  placeholder={`Ej. 750`}
                />
              </Field>
            )}
          </>
        )}
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
        <Field
          label={withUse ? `Costo por ${v.unit}` : 'Costo por unidad'}
          hint={withUse && unitCost !== null && v.useUnit !== v.unit ? `${fmt(unitCost)} por ${v.useUnit}` : undefined}
        >
          <input className="input" type="number" inputMode="decimal" value={v.cost} onChange={set('cost')} />
        </Field>
        {withPrice && (
          <Field
            label="Precio de venta"
            hint={priceLocked ? 'solo administración general' : margin !== null ? `margen ${margin}%` : undefined}
          >
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={v.price}
              disabled={priceLocked}
              onChange={set('price')}
            />
          </Field>
        )}
      </div>
    </Modal>
  );
}
