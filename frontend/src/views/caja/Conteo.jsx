// Reporte → Conteo físico: hoja imprimible (o PDF) para contar el inventario a mano
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { INV_CATS, SHOP_CATS } from '@shared/data.js';
import { qtyFmt } from '@shared/inventory.js';
import { CountSheetDoc } from '../../print/Docs.jsx';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const SOURCES = {
  inventory: { label: 'Inventario de cocina', cats: INV_CATS },
  shopItems: { label: 'Tienda', cats: SHOP_CATS },
};

export default function Conteo() {
  const { state } = useStore();
  const ui = useUI();
  const [source, setSource] = usePersisted('conteo.origen', 'inventory');
  const [cat, setCat] = usePersisted('conteo.categoria', 'Todas');
  const [withStock, setWithStock] = usePersisted('conteo.sistema', false);
  const src = SOURCES[source] || SOURCES.inventory;
  const items = (state[source] || [])
    .filter((it) => cat === 'Todas' || it.cat === cat)
    .sort(
      (a, b) =>
        src.cats.indexOf(a.cat) - src.cats.indexOf(b.cat) || a.name.localeCompare(b.name, 'es', { numeric: true }),
    );
  const title = src.label + (cat === 'Todas' ? '' : ` · ${cat}`);

  return (
    <>
      <div className="report-head">
        <div>
          <div className="report-title">Conteo físico</div>
          <div className="panel-sub text-md">
            Imprime la hoja, cuenta lo que hay y anota. En la vista previa elige “Guardar como PDF” si la quieres en
            archivo.
          </div>
        </div>
        <div className="report-actions">
          <button
            className="btn btn-primary"
            disabled={!items.length}
            onClick={() =>
              ui.preview('Hoja de conteo', <CountSheetDoc title={title} items={items} withStock={withStock} />, {
                wide: true,
              })
            }
          >
            Imprimir hoja / PDF
          </button>
        </div>
      </div>

      <div className="row items-center">
        <div className="chips">
          {Object.entries(SOURCES).map(([k, s]) => (
            <button
              key={k}
              className={'chip' + (source === k ? ' active' : '')}
              onClick={() => {
                setSource(k);
                setCat('Todas');
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={withStock} onChange={(e) => setWithStock(e.target.checked)} />
          <span>Mostrar la existencia del sistema en la hoja</span>
        </label>
      </div>
      <div className="chips">
        {['Todas', ...src.cats].map((c) => (
          <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      {!withStock && (
        <div className="panel-sub">
          Sin la existencia del sistema, quien cuenta no sabe cuánto “debería” haber: el conteo sale más honesto.
        </div>
      )}

      <DataTable
        variant="count"
        columns={['Producto', 'Categoría', 'Unidad', 'En sistema']}
        empty="No hay productos en esta vista."
      >
        {items.map((it) => (
          <div key={it.id} className={rowClass('count')}>
            <strong>{it.name}</strong>
            <span className="panel-sub">{it.cat}</span>
            <span>{it.unit}</span>
            <span>{qtyFmt(it.stock)}</span>
          </div>
        ))}
      </DataTable>
    </>
  );
}
