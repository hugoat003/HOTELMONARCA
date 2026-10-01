import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { ItemModal, MoveModal, StockMoves, StockTag } from '../../components/Stock.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { INV_CATS, INV_MOVES } from '../../data.js';
import { uid } from '../../lib/dates.js';
import { qtyFmt, stockStatus } from '../../lib/inventory.js';
import { sum } from '../../lib/money.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

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
    .filter(
      (it) =>
        (cat === 'Todas' || it.cat === cat) &&
        (!q || it.name.toLowerCase().includes(q)) &&
        (!onlyLow || stockStatus(it) !== 'ok'),
    )
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const low = state.inventory.filter((it) => stockStatus(it) !== 'ok');
  const value = sum(state.inventory, (it) => it.stock * it.cost);
  const outOfStock = low.filter((i) => i.stock <= 0).length;
  const waste = sum(
    state.invMoves.filter((m) => m.type === 'merma'),
    (m) => m.qty * (state.inventory.find((i) => i.id === m.itemId)?.cost || 0),
  );

  return (
    <div className="page gap-20">
      <div className="kpis">
        <KpiCard label="Productos" value={state.inventory.length} note={`${INV_CATS.length} categorías`} />
        <KpiCard
          label="Bajo mínimo"
          value={low.length}
          note={`${outOfStock} agotado${outOfStock === 1 ? '' : 's'}`}
          tone={low.length ? 'alert' : undefined}
        />
        <KpiCard label="Valor del inventario" value={fmt(value)} note="A costo de compra" />
        <KpiCard label="Mermas registradas" value={fmt(waste)} note="Histórico" />
      </div>

      <div className="row items-center gap-12">
        <div className="chips">
          {['Todas', ...INV_CATS].map((c) => (
            <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
          <button className={'chip small' + (onlyLow ? ' active' : '')} onClick={() => setOnlyLow(!onlyLow)}>
            Solo bajo mínimo
          </button>
        </div>
        <div className="chips">
          <input
            className="input search"
            style={{ width: 220 }}
            placeholder="Buscar producto…"
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
            + Producto
          </button>
        </div>
      </div>

      <DataTable
        variant="inv"
        columns={['Producto', 'Categoría', 'Existencia', 'Mínimo', 'Estado', 'Valor', '']}
        empty="Sin productos en esta vista."
      >
        {items.map((it) => {
          return (
            <div key={it.id} className={rowClass('inv')}>
              <strong>{it.name}</strong>
              <span className="panel-sub">{it.cat}</span>
              <span>
                <strong>{qtyFmt(it.stock)}</strong> <span className="panel-sub">{it.unit}</span>
              </span>
              <span className="panel-sub">{qtyFmt(it.min)}</span>
              <span>
                <StockTag item={it} />
              </span>
              <span>{fmt(it.stock * it.cost)}</span>
              <span className="row-actions">
                <button className="link" onClick={() => setMove({ item: it, type: 'entrada' })}>
                  Entrada
                </button>
                <button className="link" onClick={() => setMove({ item: it, type: 'salida' })}>
                  Salida
                </button>
                <button className="link" onClick={() => setMove({ item: it, type: 'merma' })}>
                  Merma
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

      <StockMoves moves={state.invMoves} items={state.inventory} users={state.users} labels={INV_MOVES} />

      {move && (
        <MoveModal
          {...move}
          onClose={() => setMove(null)}
          onSave={(type, qty, note) => {
            if (type === 'merma' && user.role !== 'gerente') {
              return ui.authorize(`Registrar merma de ${move.item.name}`, () => {
                update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id }));
                setMove(null);
                ui.notify('Merma registrada');
              });
            }
            update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id }));
            setMove(null);
            ui.notify(`${INV_MOVES[type]} registrada · ${move.item.name}`);
          }}
        />
      )}
      {edit && (
        <ItemModal
          item={edit}
          onClose={() => setEdit(null)}
          onDelete={() =>
            ui.confirm(
              {
                title: 'Eliminar producto',
                message: `¿Eliminar ${edit.name} del inventario?`,
                confirmLabel: 'Eliminar',
                danger: true,
              },
              () => {
                update((d) => A.remove(d, 'inventory', edit.id));
                setEdit(null);
              },
            )
          }
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
            ui.notify(isNew ? 'Producto agregado' : 'Producto actualizado');
          }}
        />
      )}
    </div>
  );
}
