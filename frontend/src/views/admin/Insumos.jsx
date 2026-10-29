// Configuración → Insumos: catálogo de insumos y en qué platillos se usan (receta por porción)
import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import { ItemModal } from '../../components/Stock.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { INV_CATS } from '@shared/data.js';
import { uid } from '@shared/dates.js';
import { qtyFmt } from '@shared/inventory.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const usedIn = (menu, itemId) => menu.filter((m) => (m.recipe || []).some((r) => r.itemId === itemId));

export default function InsumosTab() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = usePersisted('config.insumos.categoria', 'Todas');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [assign, setAssign] = useState(null);

  const q = search.trim().toLowerCase();
  const items = state.inventory
    .filter((it) => (cat === 'Todas' || it.cat === cat) && (!q || it.name.toLowerCase().includes(q)))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  return (
    <>
      <div className="row items-center">
        <div className="chips">
          {['Todas', ...INV_CATS].map((c) => (
            <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="chips">
          <input
            className="input search"
            style={{ width: 200 }}
            placeholder="Buscar insumo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="btn btn-primary small"
            onClick={() =>
              setEdit({
                id: uid('i'),
                name: '',
                cat: cat === 'Todas' ? INV_CATS[0] : cat,
                unit: 'unidad',
                stock: '0',
                min: '',
                cost: '',
                isNew: true,
              })
            }
          >
            + Insumo
          </button>
        </div>
      </div>
      <div className="panel-sub">
        Cada insumo se descuenta del inventario al enviar a cocina, según la cantidad por porción de cada platillo. Las
        existencias se manejan en Inventario.
      </div>

      <DataTable
        variant="insumos"
        columns={['Insumo', 'Categoría', 'Costo', 'Platillos', '']}
        empty={state.inventory.length ? 'Sin insumos en esta vista.' : 'Aún no hay insumos. Crea el primero.'}
      >
        {items.map((it) => {
          const dishes = usedIn(state.menu, it.id);
          return (
            <div key={it.id} className={rowClass('insumos')}>
              <strong>{it.name}</strong>
              <span className="panel-sub">{it.cat}</span>
              <span>
                {fmt(it.cost)} <span className="panel-sub">/ {it.unit}</span>
              </span>
              <span className="panel-sub">
                {dishes.length ? dishes.map((m) => m.name).join(' · ') : 'En ningún platillo'}
              </span>
              <span className="row-actions">
                <button className="link" onClick={() => setAssign(it)}>
                  Platillos
                </button>
                <button
                  className="link"
                  onClick={() =>
                    setEdit({ ...it, stock: String(it.stock), min: String(it.min), cost: String(it.cost) })
                  }
                >
                  Editar
                </button>
              </span>
            </div>
          );
        })}
      </DataTable>

      {edit && (
        <ItemModal
          item={edit}
          onClose={() => setEdit(null)}
          onDelete={() => {
            const used = usedIn(state.menu, edit.id);
            if (used.length)
              return ui.notify(`Está en la receta de ${used.map((m) => m.name).join(', ')}. Quítalo de ahí primero.`);
            ui.confirm(
              {
                title: 'Eliminar insumo',
                message: `¿Eliminar ${edit.name} del inventario?`,
                confirmLabel: 'Eliminar',
                danger: true,
              },
              () => {
                update((d) => A.remove(d, 'inventory', edit.id));
                setEdit(null);
              },
            );
          }}
          onSave={({ isNew, ...v }) => {
            update((d) =>
              A.upsert(d, 'inventory', {
                ...v,
                name: v.name.trim(),
                stock: parseFloat(v.stock) || 0,
                min: parseFloat(v.min) || 0,
                cost: parseFloat(v.cost) || 0,
              }),
            );
            setEdit(null);
            ui.notify(isNew ? 'Insumo agregado' : 'Insumo actualizado');
          }}
        />
      )}
      {assign && (
        <AssignModal
          item={assign}
          onClose={() => setAssign(null)}
          onSave={(qtys) => {
            update((d) => {
              // Solo se tocan los platillos cuya receta cambia
              for (const m of state.menu) {
                const recipe = m.recipe || [];
                const old = recipe.find((r) => r.itemId === assign.id)?.qty || 0;
                const qty = qtys[m.id] || 0;
                if (old === qty) continue;
                const rest = recipe.filter((r) => r.itemId !== assign.id);
                A.upsert(d, 'menu', { id: m.id, recipe: qty ? [...rest, { itemId: assign.id, qty }] : rest });
              }
            });
            setAssign(null);
            ui.notify(`Recetas actualizadas · ${assign.name}`);
          }}
        />
      )}
    </>
  );
}

// Cantidad del insumo por porción en cada platillo (vacío = no lo lleva)
function AssignModal({ item, onClose, onSave }) {
  const { state } = useStore();
  const [qtys, setQtys] = useState(() =>
    Object.fromEntries(
      state.menu.flatMap((m) => {
        const r = (m.recipe || []).find((x) => x.itemId === item.id);
        return r ? [[m.id, qtyFmt(r.qty)]] : [];
      }),
    ),
  );
  const [cat, setCat] = useState('Con este insumo');
  const parsed = Object.fromEntries(
    Object.entries(qtys)
      .map(([id, v]) => [id, parseFloat(v)])
      .filter(([, n]) => n > 0),
  );
  const bad = Object.values(qtys).some((v) => v !== '' && !(parseFloat(v) >= 0));
  const count = Object.keys(parsed).length;
  const dishes = state.menu.filter((m) => (cat === 'Con este insumo' ? m.id in qtys : m.cat === cat));

  return (
    <Modal
      title={`¿En qué platillos va ${item.name}?`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={bad} onClick={() => onSave(parsed)}>
            {bad ? 'Hay cantidades inválidas' : `Guardar · ${count} platillo${count === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <div className="panel-sub">Escribe cuánto lleva una porción, en {item.unit}. Deja vacío lo que no lo lleva.</div>
      <div className="chips">
        {['Con este insumo', ...state.categories].map((c) => (
          <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="stack-tight gap-8">
        {dishes.map((m) => (
          <div key={m.id} className="recipe-row">
            <span>
              {m.name} {cat === 'Con este insumo' && <span className="panel-sub">· {m.cat}</span>}
            </span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={qtys[m.id] ?? ''}
              onChange={(e) => setQtys({ ...qtys, [m.id]: e.target.value })}
              placeholder="—"
              aria-label={`Cantidad en ${m.name}`}
            />
            <span className="panel-sub">{item.unit}</span>
            <span />
          </div>
        ))}
        {!dishes.length && (
          <span className="panel-sub">
            {cat === 'Con este insumo' ? 'Aún no va en ningún platillo. Elige una categoría.' : 'Sin platillos.'}
          </span>
        )}
      </div>
    </Modal>
  );
}
