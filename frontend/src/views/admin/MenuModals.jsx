// Configuración → Menú: platillo con modificadores y receta, y grupos de modificadores
import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { uid } from '../../lib/dates.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

export function MenuItemModal({ item, onClose, onSave }) {
  const { state, fmt } = useStore();
  const [v, setV] = useState({ modGroups: [], recipe: [], ...item, price: String(item.price ?? '') });
  const set = (patch) => setV((x) => ({ ...x, ...patch }));
  const toggleGroup = (id) =>
    set({ modGroups: v.modGroups.includes(id) ? v.modGroups.filter((g) => g !== id) : [...v.modGroups, id] });
  const setRecipe = (i, patch) => set({ recipe: v.recipe.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const cost = v.recipe.reduce(
    (a, r) => a + (state.inventory.find((it) => it.id === r.itemId)?.cost || 0) * (parseFloat(r.qty) || 0),
    0,
  );
  const price = parseFloat(v.price) || 0;

  const problem = !v.name.trim()
    ? 'Falta el nombre'
    : !(price > 0)
      ? 'Precio inválido'
      : v.recipe.some((r) => !r.itemId || !(parseFloat(r.qty) > 0))
        ? 'Completa la receta'
        : '';

  return (
    <Modal
      title={item.isNew ? 'Nuevo platillo' : 'Editar platillo'}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!!problem}
            onClick={() =>
              onSave({
                ...v,
                name: v.name.trim(),
                price,
                recipe: v.recipe.map((r) => ({ itemId: r.itemId, qty: parseFloat(r.qty) })),
              })
            }
          >
            {problem || 'Guardar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nombre" className="span-3">
          <input className="input" autoFocus value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Categoría">
          <select className="input" value={v.cat} onChange={(e) => set({ cat: e.target.value })}>
            {state.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Precio">
          <input className="input" type="number" value={v.price} onChange={(e) => set({ price: e.target.value })} />
        </Field>
      </div>

      <Field as="div" label="Modificadores" hint="se eligen al pedir">
        <div className="chips">
          {state.modifierGroups.map((g) => (
            <button
              key={g.id}
              className={'chip small' + (v.modGroups.includes(g.id) ? ' active' : '')}
              onClick={() => toggleGroup(g.id)}
            >
              {g.name}
            </button>
          ))}
          {!state.modifierGroups.length && <span className="panel-sub">Crea grupos abajo, en “Modificadores”.</span>}
        </div>
      </Field>

      <Field as="div" label="Receta" hint="insumos por porción · se descuentan al enviar a cocina">
        <div className="stack-tight gap-8">
          {v.recipe.map((r, i) => {
            const it = state.inventory.find((x) => x.id === r.itemId);
            return (
              <div key={i} className="recipe-row">
                <select className="input" value={r.itemId} onChange={(e) => setRecipe(i, { itemId: e.target.value })}>
                  <option value="">Insumo…</option>
                  {state.inventory.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.unit})
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={r.qty}
                  onChange={(e) => setRecipe(i, { qty: e.target.value })}
                  placeholder="Cantidad"
                />
                <span className="panel-sub">{it?.unit || ''}</span>
                <button
                  className="icon-btn"
                  title="Quitar"
                  onClick={() => set({ recipe: v.recipe.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div className="row items-center">
            <button className="link" onClick={() => set({ recipe: [...v.recipe, { itemId: '', qty: '' }] })}>
              + Agregar insumo
            </button>
            {v.recipe.length > 0 && price > 0 && (
              <span className="panel-sub">
                Costo {fmt(cost)} · {Math.round(((price - cost) / price) * 100)}% de margen
              </span>
            )}
          </div>
        </div>
      </Field>
    </Modal>
  );
}

export function ModifierGroups() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null);
  const used = (id) => state.menu.filter((m) => (m.modGroups || []).includes(id)).length;
  return (
    <>
      <div className="row items-center">
        <span className="card-label">Modificadores</span>
        <button
          className="btn small"
          onClick={() =>
            setEdit({ id: uid('g'), name: '', required: false, multiple: false, options: [], isNew: true })
          }
        >
          + Grupo
        </button>
      </div>
      <DataTable variant="mods" columns={['Grupo', 'Opciones', 'Regla', 'Platillos', '']} empty="Sin modificadores.">
        {state.modifierGroups.map((g) => (
          <div key={g.id} className={rowClass('mods')}>
            <strong>{g.name}</strong>
            <span className="panel-sub">
              {g.options.map((o) => (o.price ? `${o.name} (+${fmt(o.price)})` : o.name)).join(' · ')}
            </span>
            <span>
              {g.required ? 'Obligatorio' : 'Opcional'} · {g.multiple ? 'varios' : 'uno'}
            </span>
            <span className="panel-sub">{used(g.id)}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setEdit(g)}>
                Editar
              </button>
            </span>
          </div>
        ))}
      </DataTable>
      {edit && (
        <GroupModal
          group={edit}
          fmt={fmt}
          onClose={() => setEdit(null)}
          onDelete={() =>
            ui.confirm(
              {
                title: 'Eliminar grupo',
                message: `¿Eliminar “${edit.name}”? Se quita de ${used(edit.id)} platillo(s).`,
                confirmLabel: 'Eliminar',
                danger: true,
              },
              () => {
                update((d) => A.removeModifierGroup(d, edit.id));
                setEdit(null);
              },
            )
          }
          onSave={({ isNew, ...g }) => {
            update((d) => A.upsert(d, 'modifierGroups', g));
            setEdit(null);
            ui.notify(isNew ? 'Grupo creado' : 'Grupo actualizado');
          }}
        />
      )}
    </>
  );
}

function GroupModal({ group, onClose, onSave, onDelete }) {
  const [g, setG] = useState({ ...group, options: group.options.map((o) => ({ ...o, price: String(o.price) })) });
  const setOpt = (i, patch) => setG({ ...g, options: g.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const problem = !g.name.trim()
    ? 'Falta el nombre'
    : !g.options.length
      ? 'Agrega al menos una opción'
      : g.options.some((o) => !o.name.trim())
        ? 'Hay opciones sin nombre'
        : '';
  return (
    <Modal
      title={group.isNew ? 'Nuevo grupo de modificadores' : 'Editar grupo'}
      onClose={onClose}
      width={560}
      footer={
        <>
          {!group.isNew ? (
            <button className="btn btn-quiet" onClick={onDelete}>
              Eliminar
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!!problem}
            onClick={() =>
              onSave({
                ...g,
                name: g.name.trim(),
                options: g.options.map((o) => ({ ...o, name: o.name.trim(), price: parseFloat(o.price) || 0 })),
              })
            }
          >
            {problem || 'Guardar'}
          </button>
        </>
      }
    >
      <Field label="Nombre del grupo">
        <input
          className="input"
          autoFocus
          value={g.name}
          onChange={(e) => setG({ ...g, name: e.target.value })}
          placeholder="Ej. Término, Extras, Tamaño"
        />
      </Field>
      <label className="check">
        <input type="checkbox" checked={g.required} onChange={(e) => setG({ ...g, required: e.target.checked })} />
        <span>Obligatorio: el mesero debe elegir una opción</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={g.multiple} onChange={(e) => setG({ ...g, multiple: e.target.checked })} />
        <span>Se pueden elegir varias opciones</span>
      </label>
      <Field as="div" label="Opciones" hint="precio adicional, 0 si no cuesta">
        <div className="stack-tight gap-8">
          {g.options.map((o, i) => (
            <div key={o.id} className="recipe-row">
              <input
                className="input"
                value={o.name}
                onChange={(e) => setOpt(i, { name: e.target.value })}
                placeholder="Nombre"
              />
              <input
                className="input"
                type="number"
                value={o.price}
                onChange={(e) => setOpt(i, { price: e.target.value })}
                placeholder="0"
              />
              <span />
              <button
                className="icon-btn"
                title="Quitar"
                onClick={() => setG({ ...g, options: g.options.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="link"
            onClick={() => setG({ ...g, options: [...g.options, { id: uid('o'), name: '', price: '0' }] })}
          >
            + Agregar opción
          </button>
        </div>
      </Field>
    </Modal>
  );
}
