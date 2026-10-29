import { useEffect, useRef, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import Tabs from '../../components/Tabs.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { DEMO } from '../../config.js';
import { COURSES, EVENT_UNITS, isManager, isOwner, PASSWORD_MIN, ROLE_LABELS } from '@shared/data.js';
import { dishCost, marginPct } from '@shared/inventory.js';
import { fmtDateTime, uid } from '@shared/dates.js';
import { isActiveRes } from '@shared/hotel.js';
import { A } from '../../store/actions.js';
import { useStore, VERSION } from '../../store/store.jsx';
import MapEditor from '../restaurante/MapEditor.jsx';
import { MenuItemModal, ModifierGroups } from './MenuModals.jsx';
import Impresoras from './Impresoras.jsx';
import InsumosTab from './Insumos.jsx';
import { Existencias as TiendaTab } from '../hotel/Tienda.jsx';
import Seasons from './Seasons.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const TABS = [
  ['menu', 'Menú'],
  ['modificadores', 'Modificadores'],
  ['insumos', 'Insumos'],
  ['tienda', 'Tienda'],
  ['mesas', 'Mapa de mesas'],
  ['habitaciones', 'Habitaciones'],
  ['eventos', 'Eventos'],
  ['usuarios', 'Usuarios'],
  ['negocio', 'Negocio'],
  ['impresoras', 'Impresoras'],
  ['datos', DEMO ? 'Datos de demo' : 'Respaldo'],
];
// Datos del negocio y respaldos: solo la administración general
const OWNER_TABS = new Set(['negocio', 'datos']);
const LOCKED_HINT = 'solo administración general';

export default function Admin() {
  const { user } = useStore();
  const tabs = TABS.filter(([k]) => isOwner(user.role) || !OWNER_TABS.has(k));
  const [saved, setTab] = usePersisted('config.pestana', 'menu');
  const tab = tabs.some(([k]) => k === saved) ? saved : 'menu';
  return (
    <div className="page" style={{ gap: 20, maxWidth: 1100 }}>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'menu' && <MenuTab />}
      {tab === 'modificadores' && <ModifierGroups />}
      {tab === 'insumos' && <InsumosTab />}
      {tab === 'tienda' && <TiendaTab />}
      {tab === 'mesas' && <MesasTab />}
      {tab === 'habitaciones' && <HabitacionesTab />}
      {tab === 'eventos' && <EventosTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'negocio' && <NegocioTab />}
      {tab === 'impresoras' && <Impresoras />}
      {tab === 'datos' && <DatosTab />}
    </div>
  );
}

// Formulario genérico: fields = [{ key, label, type, options, hint, span, disabled }],
// o una función (valores actuales) → campos, si cambian según lo que se elige
function FormModal({ title, initial, fields, validate, onClose, onSave }) {
  const [v, setV] = useState(initial);
  const problem = validate?.(v) || '';
  const list = typeof fields === 'function' ? fields(v) : fields;
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!!problem} onClick={() => onSave(v)}>
            {problem || 'Guardar'}
          </button>
        </>
      }
    >
      <div className="form-grid two">
        {list.map((f, i) => (
          <Field key={f.key} label={f.label} hint={f.hint} style={f.span ? { gridColumn: 'span 2' } : undefined}>
            {f.type === 'select' ? (
              <select
                className="input"
                value={v[f.key]}
                disabled={f.disabled}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              >
                {f.options.map(([val, l]) => (
                  <option key={val} value={val}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                autoFocus={i === 0}
                type={f.type || 'text'}
                autoComplete={f.type === 'password' ? 'new-password' : undefined}
                disabled={f.disabled}
                value={v[f.key] ?? ''}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
}

function MenuTab() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null);
  const [catEdit, setCatEdit] = useState(null);
  const [filter, setFilter] = usePersisted('config.menu.categoria', 'Todos');
  const items = state.menu.filter((m) => filter === 'Todos' || m.cat === filter);

  return (
    <>
      <div className="row items-center">
        <div className="chips">
          {['Todos', ...state.categories].map((c) => (
            <button key={c} className={'chip' + (filter === c ? ' active' : '')} onClick={() => setFilter(c)}>
              {c} {c !== 'Todos' && <span className="panel-sub">· {state.menu.filter((m) => m.cat === c).length}</span>}
            </button>
          ))}
        </div>
        <div className="chips">
          {filter !== 'Todos' && (
            <button
              className="btn small"
              onClick={() => setCatEdit({ from: filter, name: filter, course: state.config.catCourse?.[filter] || '' })}
            >
              Editar categoría
            </button>
          )}
          <button className="btn small" onClick={() => setCatEdit({ from: null, name: '', course: '' })}>
            + Categoría
          </button>
          <button
            className="btn btn-primary small"
            onClick={() =>
              setEdit({
                id: uid('m'),
                name: '',
                cat: filter === 'Todos' ? state.categories[0] : filter,
                price: '',
                active: true,
                isNew: true,
              })
            }
          >
            + Platillo
          </button>
        </div>
      </div>
      <DataTable
        variant="admin-menu"
        columns={['Platillo', 'Categoría', 'Precio', 'Costo', 'Margen', 'Disponible', '']}
      >
        {items.map((m) => {
          const cost = dishCost(m, state.inventory);
          const margin = marginPct(m.price, cost);
          return (
            <div key={m.id} className="tx-row admin-menu">
              <span>{m.name}</span>
              <span className="panel-sub">{m.cat}</span>
              <strong>{fmt(m.price)}</strong>
              <span className="panel-sub">{cost === null ? 'Sin receta' : fmt(cost)}</span>
              <span className={margin !== null && margin < 50 ? 'urgent' : ''}>
                {margin === null ? '—' : margin + '%'}
              </span>
              <span>
                <button
                  className={'toggle' + (m.active ? ' on' : '')}
                  onClick={() => update((d) => A.upsert(d, 'menu', { ...m, active: !m.active }))}
                >
                  {m.active ? 'Sí' : 'Agotado'}
                </button>
              </span>
              <span className="row-actions">
                <button className="link" onClick={() => setEdit({ ...m, price: String(m.price) })}>
                  Editar
                </button>
                <button
                  className="link danger"
                  onClick={() =>
                    ui.confirm(
                      {
                        title: 'Eliminar platillo',
                        message: `¿Eliminar “${m.name}” del menú?`,
                        confirmLabel: 'Eliminar',
                        danger: true,
                      },
                      () => update((d) => A.remove(d, 'menu', m.id)),
                    )
                  }
                >
                  Eliminar
                </button>
              </span>
            </div>
          );
        })}
      </DataTable>

      {edit && (
        <MenuItemModal
          item={edit}
          onClose={() => setEdit(null)}
          onSave={({ isNew, ...v }) => {
            update((d) => A.upsert(d, 'menu', v));
            setEdit(null);
            ui.notify(isNew ? 'Platillo agregado' : 'Platillo actualizado');
          }}
        />
      )}
      {catEdit && (
        <Modal
          title={catEdit.from ? 'Editar categoría' : 'Nueva categoría'}
          onClose={() => setCatEdit(null)}
          width={420}
          footer={
            <>
              {catEdit.from && (
                <button
                  className="btn btn-quiet"
                  onClick={() => {
                    if (state.menu.some((m) => m.cat === catEdit.from))
                      return ui.notify('Mueve o elimina sus platillos primero');
                    update((d) => A.removeCategory(d, catEdit.from));
                    setCatEdit(null);
                    setFilter('Todos');
                  }}
                >
                  Eliminar
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={
                  !catEdit.name.trim() ||
                  (catEdit.name.trim() !== catEdit.from && state.categories.includes(catEdit.name.trim()))
                }
                onClick={() => {
                  const name = catEdit.name.trim();
                  update((d) => {
                    if (catEdit.from) A.renameCategory(d, catEdit.from, name);
                    else A.addCategory(d, name);
                    A.setCatCourse(d, name, catEdit.course);
                  });
                  setCatEdit(null);
                  setFilter(name);
                }}
              >
                Guardar
              </button>
            </>
          }
        >
          <Field label="Nombre">
            <input
              className="input"
              autoFocus
              value={catEdit.name}
              onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })}
            />
          </Field>
          <Field as="div" label="Tiempo en la comanda" hint="los fuertes y postres esperan hasta marcharlos">
            <div className="chips">
              {[['', 'Sin tiempo'], ...Object.entries(COURSES)].map(([k, l]) => (
                <button
                  key={k}
                  className={'chip' + (catEdit.course === k ? ' active' : '')}
                  onClick={() => setCatEdit({ ...catEdit, course: k })}
                >
                  {l}
                </button>
              ))}
            </div>
          </Field>
        </Modal>
      )}
    </>
  );
}

function MesasTab() {
  return <MapEditor />;
}

function HabitacionesTab() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  const owner = isOwner(user.role);
  return (
    <>
      {/* Temporadas y recargos son tarifas: las define la administración general */}
      {owner && <Seasons />}

      <div className="row">
        <span className="card-label">Tipos y tarifas</span>
        <button
          className="btn small"
          onClick={() => setEditType({ id: uid('t'), name: '', rate: '', monthlyRate: '', isNew: true })}
        >
          + Tipo
        </button>
      </div>
      <DataTable variant="admin-types" columns={['Tipo', 'Por noche / mensual', 'Habitaciones', '']}>
        {state.roomTypes.map((t) => (
          <div key={t.id} className="tx-row admin-types">
            <strong>{t.name}</strong>
            <span>
              {fmt(t.rate)} / {fmt(t.monthlyRate || 0)}
            </span>
            <span className="panel-sub">
              {state.rooms
                .filter((r) => r.typeId === t.id)
                .map((r) => r.n)
                .join(', ') || '—'}
            </span>
            <span className="row-actions">
              <button
                className="link"
                onClick={() => setEditType({ ...t, rate: String(t.rate), monthlyRate: String(t.monthlyRate || '') })}
              >
                Editar
              </button>
            </span>
          </div>
        ))}
      </DataTable>

      <div className="row">
        <span className="card-label">Habitaciones</span>
        <button
          className="btn btn-primary small"
          onClick={() => setEditRoom({ n: '', typeId: state.roomTypes[0]?.id, hk: 'limpia', isNew: true })}
        >
          + Habitación
        </button>
      </div>
      <DataTable variant="admin-types" columns={['Número', 'Tipo', 'Piso', '']}>
        {state.rooms.map((r) => (
          <div key={r.n} className="tx-row admin-types">
            <strong>{r.n}</strong>
            <span>{state.roomTypes.find((t) => t.id === r.typeId)?.name}</span>
            <span className="panel-sub">Piso {r.n[0]}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setEditRoom({ ...r })}>
                Editar
              </button>
              <button
                className="link danger"
                onClick={() => {
                  if (state.reservations.some((x) => x.roomN === r.n && isActiveRes(x)))
                    return ui.notify('La habitación tiene reservas activas');
                  ui.confirm(
                    {
                      title: 'Eliminar habitación',
                      message: `¿Eliminar la habitación ${r.n}?`,
                      confirmLabel: 'Eliminar',
                      danger: true,
                    },
                    () => update((d) => A.remove(d, 'rooms', r.n, 'n')),
                  );
                }}
              >
                Eliminar
              </button>
            </span>
          </div>
        ))}
      </DataTable>

      {editType && (
        <FormModal
          title={editType.isNew ? 'Nuevo tipo' : 'Editar tipo'}
          initial={editType}
          onClose={() => setEditType(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            ...[
              { key: 'rate', label: 'Tarifa por noche', type: 'number' },
              { key: 'monthlyRate', label: 'Tarifa mensual', type: 'number' },
            ].map((f) => (owner || editType.isNew ? f : { ...f, disabled: true, hint: LOCKED_HINT })),
          ]}
          validate={(v) =>
            !v.name.trim()
              ? 'Falta el nombre'
              : !(parseFloat(v.rate) > 0)
                ? 'Tarifa inválida'
                : !(parseFloat(v.monthlyRate) > 0)
                  ? 'Tarifa mensual inválida'
                  : ''
          }
          onSave={({ isNew, ...v }) => {
            update((d) =>
              A.upsert(d, 'roomTypes', {
                ...v,
                name: v.name.trim(),
                rate: parseFloat(v.rate),
                monthlyRate: parseFloat(v.monthlyRate),
              }),
            );
            setEditType(null);
            ui.notify('Tarifa guardada. Aplica a reservas nuevas.');
          }}
        />
      )}
      {editRoom && (
        <FormModal
          title={editRoom.isNew ? 'Nueva habitación' : `Habitación ${editRoom.n}`}
          initial={editRoom}
          onClose={() => setEditRoom(null)}
          fields={[
            ...(editRoom.isNew ? [{ key: 'n', label: 'Número', hint: 'el primer dígito es el piso' }] : []),
            { key: 'typeId', label: 'Tipo', type: 'select', options: state.roomTypes.map((t) => [t.id, t.name]) },
          ]}
          validate={(v) =>
            !/^\d{3}$/.test(v.n)
              ? 'Usa 3 dígitos, ej. 105'
              : v.isNew && state.rooms.some((r) => r.n === v.n)
                ? 'Ya existe'
                : !v.typeId
                  ? 'Primero crea un tipo de habitación'
                  : ''
          }
          onSave={({ isNew, ...v }) => {
            update((d) => A.saveRoom(d, v));
            setEditRoom(null);
            ui.notify(isNew ? `Habitación ${v.n} agregada` : 'Habitación actualizada');
          }}
        />
      )}
    </>
  );
}

function EventosTab() {
  const { state, user, fmt, update } = useStore();
  const lockPrice = (isNew) => (isOwner(user.role) || isNew ? {} : { disabled: true, hint: LOCKED_HINT });
  const ui = useUI();
  const [venue, setVenue] = useState(null);
  const [menu, setMenu] = useState(null);
  const used = (key, id) =>
    state.events.some((e) => e[key] === id && (e.status === 'cotizado' || e.status === 'confirmado'));
  return (
    <>
      <div className="row">
        <span className="card-label">Salones</span>
        <button
          className="btn small"
          onClick={() => setVenue({ id: uid('v'), name: '', capacity: '', price: '', isNew: true })}
        >
          + Salón
        </button>
      </div>
      <DataTable variant="admin-types" columns={['Salón', 'Renta (solo sin menú del hotel)', 'Capacidad', '']}>
        {state.venues.map((v) => (
          <div key={v.id} className="tx-row admin-types">
            <strong>{v.name}</strong>
            <span>{fmt(v.price)}</span>
            <span className="panel-sub">{v.capacity} personas</span>
            <span className="row-actions">
              <button
                className="link"
                onClick={() => setVenue({ ...v, price: String(v.price), capacity: String(v.capacity) })}
              >
                Editar
              </button>
              <button
                className="link danger"
                onClick={() =>
                  used('venueId', v.id)
                    ? ui.notify('El salón tiene eventos activos')
                    : ui.confirm(
                        {
                          title: 'Eliminar salón',
                          message: `¿Eliminar ${v.name}?`,
                          confirmLabel: 'Eliminar',
                          danger: true,
                        },
                        () => update((d) => A.remove(d, 'venues', v.id)),
                      )
                }
              >
                Eliminar
              </button>
            </span>
          </div>
        ))}
      </DataTable>

      <div className="row">
        <span className="card-label">Menús y paquetes de eventos</span>
        <button
          className="btn btn-primary small"
          onClick={() => setMenu({ id: uid('em'), name: '', unit: 'persona', price: '', description: '', isNew: true })}
        >
          + Menú o paquete
        </button>
      </div>
      <DataTable variant="admin-menu" columns={['Nombre', 'Incluye', 'Precio', 'Cobro', '']}>
        {state.eventMenus.map((m) => (
          <div key={m.id} className="tx-row admin-menu">
            <strong>{m.name}</strong>
            <span className="panel-sub">{m.description}</span>
            <strong>{fmt(m.price)}</strong>
            <span>{EVENT_UNITS[m.unit]}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setMenu({ ...m, price: String(m.price) })}>
                Editar
              </button>
              <button
                className="link danger"
                onClick={() =>
                  used('menuId', m.id)
                    ? ui.notify('El menú está en eventos activos')
                    : ui.confirm(
                        {
                          title: 'Eliminar menú',
                          message: `¿Eliminar ${m.name}?`,
                          confirmLabel: 'Eliminar',
                          danger: true,
                        },
                        () => update((d) => A.remove(d, 'eventMenus', m.id)),
                      )
                }
              >
                Eliminar
              </button>
            </span>
          </div>
        ))}
      </DataTable>

      {venue && (
        <FormModal
          title={venue.isNew ? 'Nuevo salón' : 'Editar salón'}
          initial={venue}
          onClose={() => setVenue(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            {
              key: 'price',
              label: 'Renta del salón',
              type: 'number',
              hint: 'se cobra solo si no hay menú para todos',
              ...lockPrice(venue.isNew),
            },
            { key: 'capacity', label: 'Capacidad', type: 'number' },
          ]}
          validate={(v) =>
            !v.name.trim()
              ? 'Falta el nombre'
              : !(parseFloat(v.price) >= 0)
                ? 'Precio inválido'
                : !(parseInt(v.capacity) > 0)
                  ? 'Capacidad inválida'
                  : ''
          }
          onSave={({ isNew, ...v }) => {
            update((d) =>
              A.upsert(d, 'venues', {
                ...v,
                name: v.name.trim(),
                price: parseFloat(v.price),
                capacity: parseInt(v.capacity),
              }),
            );
            setVenue(null);
            ui.notify(isNew ? 'Salón agregado' : 'Salón actualizado');
          }}
        />
      )}
      {menu && (
        <FormModal
          title={menu.isNew ? 'Nuevo menú o paquete' : 'Editar menú o paquete'}
          initial={menu}
          onClose={() => setMenu(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            { key: 'price', label: 'Precio', type: 'number', ...lockPrice(menu.isNew) },
            { key: 'unit', label: 'Se cobra', type: 'select', options: Object.entries(EVENT_UNITS) },
            { key: 'description', label: 'Qué incluye', span: true },
          ]}
          validate={(v) => (!v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.price) > 0) ? 'Precio inválido' : '')}
          onSave={({ isNew, ...v }) => {
            update((d) => A.upsert(d, 'eventMenus', { ...v, name: v.name.trim(), price: parseFloat(v.price) }));
            setMenu(null);
            ui.notify(isNew ? 'Menú agregado' : 'Menú actualizado');
          }}
        />
      )}
    </>
  );
}

function UsuariosTab() {
  const { state, user, update } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null);
  const owner = isOwner(user.role);
  // El gerente administra al personal (meseros y recepción) y su propia cuenta; gerencia, la dueña
  const canEdit = (u) => owner || u.id === user.id || !isManager(u.role);
  const roleOptions = Object.entries(ROLE_LABELS).filter(([r]) => owner || !isManager(r));
  return (
    <>
      <div className="row">
        <span className="panel-sub">
          El personal entra con un PIN de 4 dígitos; gerencia, con su correo y contraseña. El rol define qué pantallas
          ve.
        </span>
        <button
          className="btn btn-primary small"
          onClick={() =>
            setEdit({
              id: uid('u'),
              name: '',
              role: 'mesero',
              pin: '',
              email: '',
              password: '',
              active: true,
              isNew: true,
            })
          }
        >
          + Usuario
        </button>
      </div>
      <DataTable variant="admin-users" columns={['Nombre', 'Rol', 'Ingreso', 'Activo', '']}>
        {state.users.map((u) => (
          <div key={u.id} className="tx-row admin-users">
            <strong>
              {u.name}
              {u.id === user.id && <span className="tag">Tú</span>}
            </strong>
            <span>{ROLE_LABELS[u.role]}</span>
            <span className="panel-sub">{isManager(u.role) ? u.email : 'PIN'}</span>
            <span>
              <button
                className={'toggle' + (u.active ? ' on' : '')}
                disabled={u.id === user.id || !canEdit(u)}
                onClick={() => update((d) => A.upsert(d, 'users', { ...u, active: !u.active }))}
              >
                {u.active ? 'Sí' : 'No'}
              </button>
            </span>
            <span className="row-actions">
              {canEdit(u) && (
                <button className="link" onClick={() => setEdit({ ...u, email: u.email || '', pin: '', password: '' })}>
                  Editar
                </button>
              )}
              {u.id !== user.id && canEdit(u) && (
                <button
                  className="link danger"
                  onClick={() =>
                    ui.confirm(
                      {
                        title: 'Eliminar usuario',
                        message: `¿Eliminar a ${u.name}?`,
                        confirmLabel: 'Eliminar',
                        danger: true,
                      },
                      () => update((d) => A.remove(d, 'users', u.id)),
                    )
                  }
                >
                  Eliminar
                </button>
              )}
            </span>
          </div>
        ))}
      </DataTable>
      {edit && (
        <FormModal
          title={edit.isNew ? 'Nuevo usuario' : 'Editar usuario'}
          initial={edit}
          onClose={() => setEdit(null)}
          fields={(v) => {
            // Pasar de PIN a contraseña (o al revés) pide la credencial nueva
            const fresh = edit.isNew || isManager(v.role) !== isManager(edit.role);
            return [
              { key: 'name', label: 'Nombre', span: true },
              {
                key: 'role',
                label: 'Rol',
                type: 'select',
                options: v.id === user.id ? [[user.role, ROLE_LABELS[user.role]]] : roleOptions,
                disabled: v.id === user.id,
              },
              ...(isManager(v.role)
                ? [
                    { key: 'email', label: 'Correo', type: 'email' },
                    {
                      key: 'password',
                      label: fresh ? 'Contraseña' : 'Contraseña nueva',
                      type: 'password',
                      hint: fresh ? `${PASSWORD_MIN} caracteres o más` : 'Déjala vacía para no cambiarla',
                    },
                  ]
                : [
                    {
                      key: 'pin',
                      label: fresh ? 'PIN' : 'PIN nuevo',
                      hint: fresh ? '4 dígitos' : 'Déjalo vacío para no cambiarlo',
                    },
                  ]),
            ];
          }}
          validate={(v) => {
            if (!v.name.trim()) return 'Falta el nombre';
            const fresh = edit.isNew || isManager(v.role) !== isManager(edit.role);
            if (isManager(v.role)) {
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return 'Falta un correo válido';
              // El servidor revisa que el correo no lo use otra persona
              if ((fresh || v.password) && (v.password || '').length < PASSWORD_MIN)
                return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`;
            } else if ((fresh || v.pin) && !/^\d{4}$/.test(v.pin || '')) return 'El PIN debe tener 4 dígitos';
            // El servidor revisa que el PIN no lo use otra persona (los PIN no salen del servidor)
            return '';
          }}
          onSave={({ isNew, pin, password, email, ...v }) => {
            const secret = isManager(v.role)
              ? { email: email.trim().toLowerCase(), ...(password ? { password } : {}) }
              : pin
                ? { pin }
                : {};
            update((d) => A.upsert(d, 'users', { ...v, name: v.name.trim(), ...secret }));
            setEdit(null);
            ui.notify(isNew ? 'Usuario creado' : 'Usuario actualizado');
          }}
        />
      )}
    </>
  );
}

function NegocioTab() {
  const { state, update } = useStore();
  const ui = useUI();
  const [c, setC] = useState({ lockMinutes: 5, ...state.config });
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = () => {
    const { printers: _p, catCourse: _cc, ...fields } = c;
    update((d) =>
      A.setConfig(d, {
        ...fields,
        tipPct: parseFloat(c.tipPct) || 0,
        lockMinutes: Math.max(0, parseInt(c.lockMinutes) || 0),
      }),
    );
    ui.notify('Configuración guardada');
  };
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <div className="form-grid two">
        <Field label="Nombre comercial">
          <input className="input" value={c.businessName} onChange={set('businessName')} />
        </Field>
        <Field label="Razón social">
          <input className="input" value={c.legalName} onChange={set('legalName')} />
        </Field>
        <Field label="NIT">
          <input className="input" value={c.nit} onChange={set('nit')} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={c.phone} onChange={set('phone')} />
        </Field>
        <Field label="Dirección" className="span-2">
          <input className="input" value={c.address} onChange={set('address')} />
        </Field>
        <Field label="Leyenda al pie del ticket" className="span-2">
          <input className="input" value={c.footer} onChange={set('footer')} />
        </Field>
      </div>
      <div className="form-grid four">
        <Field label="Moneda">
          <input className="input" value={c.currency} onChange={set('currency')} />
        </Field>
        <Field label="Propina sugerida %">
          <input className="input" type="number" inputMode="decimal" value={c.tipPct} onChange={set('tipPct')} />
        </Field>
      </div>
      <div className="form-grid four">
        <Field label="Bloquear tras" hint="minutos sin uso · 0 = nunca">
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            value={c.lockMinutes}
            onChange={set('lockMinutes')}
          />
        </Field>
      </div>
      <div className="panel-sub text-sm">
        Todos los precios (restaurante, hospedaje, eventos y tienda) incluyen impuestos.
      </div>
      <div>
        <button className="btn btn-primary" onClick={save}>
          Guardar cambios
        </button>
      </div>
    </div>
  );
}

function DatosTab() {
  const { state, restore, resetDemo } = useStore();
  const ui = useUI();
  const fileRef = useRef();

  const exportJson = () => {
    const { session: _s, ...data } = state;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `monarca-pos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      // Un respaldo de una versión anterior lo actualiza el servidor al cargarlo
      if (!(data.version <= VERSION) || !Array.isArray(data.menu)) throw new Error();
      // Reemplaza todo: se confirma antes, con lo que trae el respaldo
      ui.confirm(
        {
          title: 'Cargar respaldo',
          message: `Se reemplazan todos los datos actuales por los del archivo (${data.sales.length} ventas, ${data.reservations.length} reservas). Lo que no esté en el respaldo se pierde.`,
          confirmLabel: 'Cargar respaldo',
          danger: true,
        },
        () =>
          restore(data).then(
            () => ui.notify('Datos importados'),
            (e) => ui.notify(e.message || 'No se pudo cargar el respaldo'),
          ),
      );
    } catch {
      ui.notify('El archivo no es un respaldo válido de POS Monarca');
    }
  };

  return (
    <div className="stack gap-20" style={{ maxWidth: 760 }}>
      <BackupStatus />
      <div className="card" style={{ gap: 18 }}>
        <div>
          <div className="report-title" style={{ fontSize: 20 }}>
            {DEMO ? 'Datos de la demostración' : 'Copia manual'}
          </div>
          <div className="panel-sub text-md">
            {DEMO
              ? 'Los datos viven en el servidor del hotel y los ven todos los dispositivos. Antes de presentar, restaura los datos de ejemplo para empezar con mesas, reservas y ventas del día.'
              : 'Descarga una copia de toda la información o carga una copia anterior.'}
          </div>
        </div>
        <div className="kv">
          <span>Órdenes abiertas</span>
          <strong>{state.orders.length}</strong>
          <span>Ventas registradas</span>
          <strong>{state.sales.length}</strong>
          <span>Reservas</span>
          <strong>{state.reservations.length}</strong>
          <span>Cierres de caja</span>
          <strong>{state.shiftHistory.length}</strong>
        </div>
        <div className="chips">
          <button className="btn" onClick={exportJson}>
            Exportar respaldo (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current.click()}>
            Importar respaldo
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
          {DEMO && (
            <button
              className="btn btn-primary btn-danger"
              onClick={() =>
                ui.confirm(
                  {
                    title: 'Restaurar datos de ejemplo',
                    message:
                      'Se borran todos los cambios (en todos los dispositivos) y se cargan los datos de ejemplo con fechas de hoy.',
                    confirmLabel: 'Restaurar',
                    danger: true,
                  },
                  () =>
                    resetDemo().then(
                      () => ui.notify('Datos de ejemplo restaurados'),
                      (e) => ui.notify(e.message || 'No se pudo restaurar'),
                    ),
                )
              }
            >
              Restaurar datos de ejemplo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const kbs = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Respaldo automático: cada noche en la mini PC y, cifrado, fuera del hotel
function BackupStatus() {
  const { backups, runBackup } = useStore();
  const ui = useUI();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    backups().then(setInfo);
  }, [backups]);

  const now = async () => {
    setBusy(true);
    const r = await runBackup();
    setBusy(false);
    if (!r.ok) return ui.notify(r.error);
    setInfo((i) => ({ ...i, ...r.status }));
    ui.notify(r.uploaded ? 'Respaldo listo, también fuera del hotel' : 'Respaldo listo en la mini PC');
  };

  return (
    <div className="card gap-12">
      <div className="row items-center">
        <div className="report-title" style={{ fontSize: 20 }}>
          Respaldo automático
        </div>
        {info && !info.error && (
          <button className="btn small" disabled={busy} onClick={now}>
            {busy ? 'Respaldando…' : 'Respaldar ahora'}
          </button>
        )}
      </div>
      {!info ? (
        <div className="panel-sub">Consultando…</div>
      ) : info.error ? (
        <div className="panel-sub">{info.error}.</div>
      ) : (
        <>
          {info.ok ? (
            <div className="note-box">Todo en orden: hay copia reciente en la mini PC y fuera del hotel.</div>
          ) : (
            <div className="note-box warn" role="alert">
              {info.problems.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
          )}
          <div className="kv">
            <span>Cada noche a las</span>
            <strong>{info.hour}:00</strong>
            <span>Último en la mini PC</span>
            <strong>{info.lastOk ? `${fmtDateTime(info.lastOk.at)} · ${kbs(info.lastOk.size)}` : 'Ninguno'}</strong>
            <span>Último fuera del hotel</span>
            <strong>
              {!info.remote
                ? 'No configurado'
                : info.remoteOk
                  ? `${fmtDateTime(info.remoteOk.at)} · ${kbs(info.remoteOk.size)} cifrado`
                  : 'Ninguno'}
            </strong>
            <span>Copias en la mini PC</span>
            <strong>{info.local?.length ?? 0}</strong>
          </div>
        </>
      )}
    </div>
  );
}
