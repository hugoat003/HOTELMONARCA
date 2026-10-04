import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { ItemModal, MoveModal, StockMoves, StockTag } from '../../components/Stock.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { INV_CATS, INV_MOVE_LABELS, INV_MOVES } from '@shared/data.js';
import { today, uid } from '@shared/dates.js';
import { exportXlsx } from '../../lib/excel.js';
import { qtyFmt, stockStatus } from '@shared/inventory.js';
import { sum } from '@shared/money.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';

export default function Inventario() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = usePersisted('inventario.categoria', 'Todas');
  const [search, setSearch] = usePersisted('inventario.busqueda', '');
  const [onlyLow, setOnlyLow] = usePersisted('inventario.bajos', false);
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
  const exportExcel = () =>
    exportXlsx(`Monarca inventario ${today()}`, [
      {
        name: 'Inventario',
        rows: [...state.inventory]
          .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
          .map((it) => ({
            Producto: it.name,
            Categoría: it.cat,
            Unidad: it.unit,
            Existencia: it.stock,
            Mínimo: it.min,
            Estado: stockStatus(it) === 'ok' ? 'OK' : stockStatus(it) === 'bajo' ? 'Bajo mínimo' : 'Agotado',
            'Costo unitario': it.cost,
            Valor: Math.round(it.stock * it.cost * 100) / 100,
          })),
      },
    ]);
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
          <span className="chips">
            <button className="btn small" onClick={exportExcel}>
              Exportar a Excel
            </button>
            <button
              className="btn btn-primary small"
              onClick={() =>
                ui.authorize('Agregar un producto al inventario', () =>
                  setEdit({
                    id: uid('i'),
                    name: '',
                    cat: cat === 'Todas' ? INV_CATS[0] : cat,
                    unit: 'unidad',
                    stock: '0',
                    min: '',
                    cost: '',
                    isNew: true,
                  }),
                )
              }
            >
              + Producto
            </button>
          </span>
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
                    ui.authorize(`Editar ${it.name}`, (mgr) =>
                      setEdit({
                        ...it,
                        stock: String(it.stock),
                        min: String(it.min),
                        cost: String(it.cost),
                        authId: mgr.id,
                      }),
                    )
                  }
                >
                  Editar
                </button>
              </span>
            </div>
          );
        })}
      </DataTable>

      <StockMoves moves={state.invMoves} items={state.inventory} users={state.users} labels={INV_MOVE_LABELS} />

      {move && (
        <MoveModal
          {...move}
          onClose={() => setMove(null)}
          onSave={(type, qty, note) => {
            const run = (mgr) => {
              update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id, authId: mgr?.id }));
              setMove(null);
              ui.notify(`${INV_MOVES[type]} registrada · ${move.item.name}`);
            };
            // Recepción solo registra entradas; lo demás lo autoriza gerencia
            if (type === 'entrada') run();
            else ui.authorize(`${INV_MOVES[type]} de ${move.item.name}`, run);
          }}
        />
      )}
      {edit && (
        <ItemModal
          item={edit}
          onClose={() => setEdit(null)}
          onDelete={() => {
            const used = state.menu.filter((m) => (m.recipe || []).some((r) => r.itemId === edit.id));
            if (used.length)
              return ui.notify(`Está en la receta de ${used.map((m) => m.name).join(', ')}. Quítalo de ahí primero.`);
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
            );
          }}
          onSave={({ isNew, authId, ...v }) => {
            update((d) =>
              A.upsert(
                d,
                'inventory',
                {
                  ...v,
                  name: v.name.trim(),
                  stock: parseFloat(v.stock) || 0,
                  min: parseFloat(v.min) || 0,
                  cost: parseFloat(v.cost) || 0,
                },
                'id',
                { authId },
              ),
            );
            setEdit(null);
            ui.notify(isNew ? 'Producto agregado' : 'Producto actualizado');
          }}
        />
      )}
    </div>
  );
}
