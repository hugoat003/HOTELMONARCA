import { useState } from 'react';
import { Field } from '../../components/ui/Modal.jsx';
import TableMap from '../../components/TableMap.jsx';
import Tabs from '../../components/Tabs.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { uid } from '../../lib/dates.js';
import { clampPos, freeSpot, MAP_H, MAP_W, placed, SHAPES, sizeFor } from '../../lib/tablemap.js';
import { tableOrder } from '../../lib/orders.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

// Editor del plano: arrastrar mesas y elementos, agregar, cambiar forma y zona
export default function MapEditor({ onDone }) {
  const { state, update } = useStore();
  const ui = useUI();
  const zones = [...new Set([...state.tables.map((t) => t.zone), ...state.mapDecor.map((d) => d.zone)])];
  const [zone, setZone] = useState(zones[0] || 'Salón');
  const [sel, setSel] = useState(null); // { kind, id }
  const [newZone, setNewZone] = useState(null);

  const tables = state.tables.map(placed).filter((t) => t.zone === zone);
  const decor = state.mapDecor.filter((d) => d.zone === zone);
  const table = sel?.kind === 'table' ? state.tables.map(placed).find((t) => t.id === sel.id) : null;
  const item = sel?.kind === 'decor' ? state.mapDecor.find((d) => d.id === sel.id) : null;
  const hasOrder = (id) => !!tableOrder(state.orders, id);

  const saveTable = (patch) => update((d) => A.upsert(d, 'tables', { ...table, ...patch }));
  const saveDecor = (patch) => update((d) => A.upsert(d, 'mapDecor', { ...item, ...patch }));

  const addTable = () => {
    const id = Math.max(0, ...state.tables.map((t) => t.id)) + 1;
    const { w, h } = sizeFor('cuadrada', 4);
    const spot = freeSpot([...tables, ...decor], w, h);
    update((d) =>
      A.addTable(d, { id, name: 'Mesa ' + id, zone, seats: 4, shape: 'cuadrada', w, h, ...spot, reservedAt: null }),
    );
    setSel({ kind: 'table', id });
  };
  const addDecor = () => {
    const id = uid('d');
    const spot = freeSpot([...tables, ...decor], 160, 60);
    update((d) => A.addMapDecor(d, { id, zone, label: 'Nuevo elemento', w: 160, h: 60, ...spot }));
    setSel({ kind: 'decor', id });
  };
  const changeShapeOrSeats = (shape, seats) => {
    const { w, h } = sizeFor(shape, seats);
    const p = clampPos(table.x, table.y, w, h);
    saveTable({ shape, seats, w, h, ...p });
  };

  return (
    <div className="map-editor">
      <div className="map-editor-main">
        <div className="row items-center gap-12">
          <Tabs
            className="grow"
            tabs={(zones.includes(zone) ? zones : [...zones, zone]).map((z) => [z, z])}
            value={zone}
            onChange={(z) => {
              setZone(z);
              setSel(null);
            }}
          >
            {newZone === null ? (
              <button className="tab" onClick={() => setNewZone('')}>
                + Zona
              </button>
            ) : (
              <span className="inline-form" style={{ padding: 4 }}>
                <input
                  className="input small"
                  autoFocus
                  placeholder="Nombre"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newZone.trim()) {
                      setZone(newZone.trim());
                      setNewZone(null);
                    }
                    if (e.key === 'Escape') setNewZone(null);
                  }}
                />
                <button
                  className="btn small"
                  disabled={!newZone.trim()}
                  onClick={() => {
                    setZone(newZone.trim());
                    setNewZone(null);
                  }}
                >
                  Crear
                </button>
              </span>
            )}
          </Tabs>
          <div className="chips">
            <button className="btn small" onClick={addDecor}>
              + Elemento
            </button>
            <button className="btn btn-primary small" onClick={addTable}>
              + Mesa
            </button>
            {onDone && (
              <button className="btn small" onClick={onDone}>
                Listo
              </button>
            )}
          </div>
        </div>
        <TableMap
          tables={tables}
          decor={decor}
          edit
          selected={sel}
          onSelect={(kind, id) => setSel(kind ? { kind, id } : null)}
          onMove={(kind, id, x, y) => update((d) => A.moveMapItem(d, kind, id, x, y))}
        />
        <div className="panel-sub text-sm">
          Arrastra las mesas y elementos para acomodarlos como en el local. Toca uno para editarlo.{' '}
          {!tables.length && !decor.length && 'Esta zona está vacía: agrega mesas para crearla.'}
        </div>
      </div>

      <div className="card map-editor-side">
        {!sel && (
          <>
            <div className="card-label">Zona {zone}</div>
            <div className="kv">
              <span>Mesas</span>
              <strong>{tables.length}</strong>
              <span>Sillas</span>
              <strong>{tables.reduce((a, t) => a + t.seats, 0)}</strong>
            </div>
            <div className="panel-sub">Selecciona una mesa o elemento en el plano.</div>
          </>
        )}

        {table && (
          <>
            <div className="card-label">{table.name}</div>
            <Field label="Nombre">
              <input
                className="input"
                value={table.name}
                onChange={(e) => saveTable({ name: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && saveTable({ name: 'Mesa ' + table.id })}
              />
            </Field>
            <Field as="div" label="Forma">
              <div className="segmented row">
                {Object.entries(SHAPES).map(([k, l]) => (
                  <button
                    key={k}
                    className={'seg-btn' + (table.shape === k ? ' active' : '')}
                    onClick={() => changeShapeOrSeats(k, table.seats)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </Field>
            <Field as="div" label="Personas">
              <div className="stepper big">
                <button onClick={() => changeShapeOrSeats(table.shape, Math.max(1, table.seats - 1))}>−</button>
                <span>{table.seats}</span>
                <button onClick={() => changeShapeOrSeats(table.shape, Math.min(16, table.seats + 1))}>+</button>
              </div>
            </Field>
            <Field label="Zona">
              <select
                className="input"
                value={table.zone}
                onChange={(e) => {
                  const z = e.target.value;
                  const { x, y } = freeSpot(
                    state.tables.map(placed).filter((t) => t.zone === z),
                    table.w,
                    table.h,
                  );
                  saveTable({ zone: z, x, y });
                  setZone(z);
                }}
              >
                {zones.map((z) => (
                  <option key={z}>{z}</option>
                ))}
                {!zones.includes(zone) && <option>{zone}</option>}
              </select>
            </Field>
            <Field label="Reservada a las" hint="opcional">
              <input
                className="input"
                type="time"
                value={table.reservedAt || ''}
                onChange={(e) => saveTable({ reservedAt: e.target.value || null })}
              />
            </Field>
            <button
              className="btn btn-quiet"
              onClick={() => {
                if (hasOrder(table.id)) return ui.notify('La mesa tiene una cuenta abierta');
                ui.confirm(
                  {
                    title: 'Eliminar mesa',
                    message: `¿Eliminar ${table.name} del mapa?`,
                    confirmLabel: 'Eliminar',
                    danger: true,
                  },
                  () => {
                    update((d) => A.remove(d, 'tables', table.id));
                    setSel(null);
                  },
                );
              }}
            >
              Eliminar mesa
            </button>
          </>
        )}

        {item && (
          <>
            <div className="card-label">Elemento del plano</div>
            <Field label="Texto">
              <input className="input" value={item.label} onChange={(e) => saveDecor({ label: e.target.value })} />
            </Field>
            <div className="form-grid two">
              <Field label="Ancho">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="10"
                  value={item.w}
                  onChange={(e) => {
                    const w = Math.min(MAP_W, Math.max(40, parseInt(e.target.value) || 40));
                    saveDecor({ w, ...clampPos(item.x, item.y, w, item.h) });
                  }}
                />
              </Field>
              <Field label="Alto">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="10"
                  value={item.h}
                  onChange={(e) => {
                    const h = Math.min(MAP_H, Math.max(30, parseInt(e.target.value) || 30));
                    saveDecor({ h, ...clampPos(item.x, item.y, item.w, h) });
                  }}
                />
              </Field>
            </div>
            <div className="chips">
              {['Barra', 'Cocina', 'Entrada', 'Baños', 'Caja', 'Jardín', 'Escenario'].map((l) => (
                <button key={l} className="chip small" onClick={() => saveDecor({ label: l })}>
                  {l}
                </button>
              ))}
            </div>
            <button
              className="btn btn-quiet"
              onClick={() => {
                update((d) => A.remove(d, 'mapDecor', item.id));
                setSel(null);
              }}
            >
              Eliminar elemento
            </button>
          </>
        )}
      </div>
    </div>
  );
}
