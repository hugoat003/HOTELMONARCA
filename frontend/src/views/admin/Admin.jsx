import { useRef, useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { EVENT_UNITS, ROLE_LABELS } from '../../data.js';
import { uid } from '../../lib/dates.js';
import { isActiveRes } from '../../lib/hotel.js';
import { A } from '../../store/actions.js';
import { useStore, VERSION } from '../../store/store.jsx';
import MapEditor from '../restaurante/MapEditor.jsx';

const TABS = [['menu', 'Menú'], ['mesas', 'Mapa de mesas'], ['habitaciones', 'Habitaciones'], ['eventos', 'Eventos'], ['usuarios', 'Usuarios'], ['negocio', 'Negocio e impuestos'], ['datos', 'Datos de demo']];

export default function Admin() {
  const [tab, setTab] = useState('menu');
  return (
    <div className="page" style={{ gap: 20, maxWidth: 1100 }}>
      <div className="tabs">
        {TABS.map(([k, l]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'menu' && <MenuTab />}
      {tab === 'mesas' && <MesasTab />}
      {tab === 'habitaciones' && <HabitacionesTab />}
      {tab === 'eventos' && <EventosTab />}
      {tab === 'usuarios' && <UsuariosTab />}
      {tab === 'negocio' && <NegocioTab />}
      {tab === 'datos' && <DatosTab />}
    </div>
  );
}

// Formulario genérico: fields = [{ key, label, type, options, hint, span }]
function FormModal({ title, initial, fields, validate, onClose, onSave }) {
  const [v, setV] = useState(initial);
  const problem = validate?.(v) || '';
  return (
    <Modal title={title} onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!!problem} onClick={() => onSave(v)}>{problem || 'Guardar'}</button></>}>
      <div className="form-grid two">
        {fields.map((f, i) => (
          <Field key={f.key} label={f.label} hint={f.hint} style={f.span ? { gridColumn: 'span 2' } : undefined}>
            {f.type === 'select' ? (
              <select className="input" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
              </select>
            ) : (
              <input className="input" autoFocus={i === 0} type={f.type || 'text'} value={v[f.key] ?? ''} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
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
  const [filter, setFilter] = useState('Todos');
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
          {filter !== 'Todos' && <button className="btn small" onClick={() => setCatEdit({ from: filter, name: filter })}>Editar categoría</button>}
          <button className="btn small" onClick={() => setCatEdit({ from: null, name: '' })}>+ Categoría</button>
          <button className="btn btn-primary small" onClick={() => setEdit({ id: uid('m'), name: '', cat: filter === 'Todos' ? state.categories[0] : filter, price: '', active: true, isNew: true })}>+ Platillo</button>
        </div>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-menu"><span>Platillo</span><span>Categoría</span><span>Precio</span><span>Disponible</span><span /></div>
        {items.map((m) => (
          <div key={m.id} className="tx-row admin-menu">
            <span>{m.name}</span>
            <span className="panel-sub">{m.cat}</span>
            <strong>{fmt(m.price)}</strong>
            <span><button className={'toggle' + (m.active ? ' on' : '')} onClick={() => update((d) => A.upsert(d, 'menu', { ...m, active: !m.active }))}>{m.active ? 'Sí' : 'Agotado'}</button></span>
            <span className="row-actions">
              <button className="link" onClick={() => setEdit({ ...m, price: String(m.price) })}>Editar</button>
              <button className="link danger" onClick={() => ui.confirm({ title: 'Eliminar platillo', message: `¿Eliminar “${m.name}” del menú?`, confirmLabel: 'Eliminar', danger: true }, () => update((d) => A.remove(d, 'menu', m.id)))}>Eliminar</button>
            </span>
          </div>
        ))}
      </div>

      {edit && (
        <FormModal title={edit.isNew ? 'Nuevo platillo' : 'Editar platillo'} initial={edit} onClose={() => setEdit(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            { key: 'cat', label: 'Categoría', type: 'select', options: state.categories.map((c) => [c, c]) },
            { key: 'price', label: 'Precio', type: 'number', hint: 'IVA incluido' },
          ]}
          validate={(v) => (!v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.price) > 0) ? 'Precio inválido' : '')}
          onSave={({ isNew, ...v }) => { update((d) => A.upsert(d, 'menu', { ...v, name: v.name.trim(), price: parseFloat(v.price) })); setEdit(null); ui.notify(isNew ? 'Platillo agregado' : 'Platillo actualizado'); }} />
      )}
      {catEdit && (
        <Modal title={catEdit.from ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setCatEdit(null)} width={420}
          footer={<>
            {catEdit.from && (
              <button className="btn btn-quiet" onClick={() => {
                if (state.menu.some((m) => m.cat === catEdit.from)) return ui.notify('Mueve o elimina sus platillos primero');
                update((d) => A.removeCategory(d, catEdit.from));
                setCatEdit(null); setFilter('Todos');
              }}>Eliminar</button>
            )}
            <button className="btn btn-primary" disabled={!catEdit.name.trim() || (catEdit.name.trim() !== catEdit.from && state.categories.includes(catEdit.name.trim()))}
              onClick={() => {
                const name = catEdit.name.trim();
                update((d) => (catEdit.from ? A.renameCategory(d, catEdit.from, name) : A.addCategory(d, name)));
                setCatEdit(null); setFilter(name);
              }}>Guardar</button>
          </>}>
          <Field label="Nombre"><input className="input" autoFocus value={catEdit.name} onChange={(e) => setCatEdit({ ...catEdit, name: e.target.value })} /></Field>
        </Modal>
      )}
    </>
  );
}

function MesasTab() {
  return <MapEditor />;
}

function HabitacionesTab() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  return (
    <>
      <div className="row"><span className="card-label">Tipos y tarifas</span>
        <button className="btn small" onClick={() => setEditType({ id: uid('t'), name: '', rate: '', monthlyRate: '', isNew: true })}>+ Tipo</button>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-types"><span>Tipo</span><span>Por noche / mensual (sin impuestos)</span><span>Habitaciones</span><span /></div>
        {state.roomTypes.map((t) => (
          <div key={t.id} className="tx-row admin-types">
            <strong>{t.name}</strong><span>{fmt(t.rate)} / {fmt(t.monthlyRate || 0)}</span><span className="panel-sub">{state.rooms.filter((r) => r.typeId === t.id).map((r) => r.n).join(', ') || '—'}</span>
            <span className="row-actions"><button className="link" onClick={() => setEditType({ ...t, rate: String(t.rate), monthlyRate: String(t.monthlyRate || '') })}>Editar</button></span>
          </div>
        ))}
      </div>

      <div className="row"><span className="card-label">Habitaciones</span>
        <button className="btn btn-primary small" onClick={() => setEditRoom({ n: '', typeId: state.roomTypes[0]?.id, hk: 'limpia', isNew: true })}>+ Habitación</button>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-types"><span>Número</span><span>Tipo</span><span>Piso</span><span /></div>
        {state.rooms.map((r) => (
          <div key={r.n} className="tx-row admin-types">
            <strong>{r.n}</strong><span>{state.roomTypes.find((t) => t.id === r.typeId)?.name}</span><span className="panel-sub">Piso {r.n[0]}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setEditRoom({ ...r })}>Editar</button>
              <button className="link danger" onClick={() => {
                if (state.reservations.some((x) => x.roomN === r.n && isActiveRes(x))) return ui.notify('La habitación tiene reservas activas');
                ui.confirm({ title: 'Eliminar habitación', message: `¿Eliminar la habitación ${r.n}?`, confirmLabel: 'Eliminar', danger: true }, () => update((d) => A.remove(d, 'rooms', r.n, 'n')));
              }}>Eliminar</button>
            </span>
          </div>
        ))}
      </div>

      {editType && (
        <FormModal title={editType.isNew ? 'Nuevo tipo' : 'Editar tipo'} initial={editType} onClose={() => setEditType(null)}
          fields={[{ key: 'name', label: 'Nombre', span: true }, { key: 'rate', label: 'Tarifa por noche', type: 'number', hint: 'sin impuestos' }, { key: 'monthlyRate', label: 'Tarifa mensual', type: 'number', hint: 'sin impuestos' }]}
          validate={(v) => (!v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.rate) > 0) ? 'Tarifa inválida' : !(parseFloat(v.monthlyRate) > 0) ? 'Tarifa mensual inválida' : '')}
          onSave={({ isNew, ...v }) => { update((d) => A.upsert(d, 'roomTypes', { ...v, name: v.name.trim(), rate: parseFloat(v.rate), monthlyRate: parseFloat(v.monthlyRate) })); setEditType(null); ui.notify('Tarifa guardada. Aplica a reservas nuevas.'); }} />
      )}
      {editRoom && (
        <FormModal title={editRoom.isNew ? 'Nueva habitación' : `Habitación ${editRoom.n}`} initial={editRoom} onClose={() => setEditRoom(null)}
          fields={[
            ...(editRoom.isNew ? [{ key: 'n', label: 'Número', hint: 'el primer dígito es el piso' }] : []),
            { key: 'typeId', label: 'Tipo', type: 'select', options: state.roomTypes.map((t) => [t.id, t.name]) },
          ]}
          validate={(v) => (!/^\d{3}$/.test(v.n) ? 'Usa 3 dígitos, ej. 105' : v.isNew && state.rooms.some((r) => r.n === v.n) ? 'Ya existe' : '')}
          onSave={({ isNew, ...v }) => {
            update((d) => A.saveRoom(d, v));
            setEditRoom(null); ui.notify(isNew ? `Habitación ${v.n} agregada` : 'Habitación actualizada');
          }} />
      )}
    </>
  );
}

function EventosTab() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [venue, setVenue] = useState(null);
  const [menu, setMenu] = useState(null);
  const used = (key, id) => state.events.some((e) => e[key] === id && (e.status === 'cotizado' || e.status === 'confirmado'));
  return (
    <>
      <div className="row"><span className="card-label">Salones</span>
        <button className="btn small" onClick={() => setVenue({ id: uid('v'), name: '', capacity: '', price: '', isNew: true })}>+ Salón</button>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-types"><span>Salón</span><span>Renta (solo sin menú del hotel)</span><span>Capacidad</span><span /></div>
        {state.venues.map((v) => (
          <div key={v.id} className="tx-row admin-types">
            <strong>{v.name}</strong><span>{fmt(v.price)}</span><span className="panel-sub">{v.capacity} personas</span>
            <span className="row-actions">
              <button className="link" onClick={() => setVenue({ ...v, price: String(v.price), capacity: String(v.capacity) })}>Editar</button>
              <button className="link danger" onClick={() => used('venueId', v.id) ? ui.notify('El salón tiene eventos activos') :
                ui.confirm({ title: 'Eliminar salón', message: `¿Eliminar ${v.name}?`, confirmLabel: 'Eliminar', danger: true }, () => update((d) => A.remove(d, 'venues', v.id)))}>Eliminar</button>
            </span>
          </div>
        ))}
      </div>

      <div className="row"><span className="card-label">Menús y paquetes de eventos</span>
        <button className="btn btn-primary small" onClick={() => setMenu({ id: uid('em'), name: '', unit: 'persona', price: '', description: '', isNew: true })}>+ Menú o paquete</button>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-menu"><span>Nombre</span><span>Incluye</span><span>Precio</span><span>Cobro</span><span /></div>
        {state.eventMenus.map((m) => (
          <div key={m.id} className="tx-row admin-menu">
            <strong>{m.name}</strong><span className="panel-sub">{m.description}</span><strong>{fmt(m.price)}</strong><span>{EVENT_UNITS[m.unit]}</span>
            <span className="row-actions">
              <button className="link" onClick={() => setMenu({ ...m, price: String(m.price) })}>Editar</button>
              <button className="link danger" onClick={() => used('menuId', m.id) ? ui.notify('El menú está en eventos activos') :
                ui.confirm({ title: 'Eliminar menú', message: `¿Eliminar ${m.name}?`, confirmLabel: 'Eliminar', danger: true }, () => update((d) => A.remove(d, 'eventMenus', m.id)))}>Eliminar</button>
            </span>
          </div>
        ))}
      </div>

      {venue && (
        <FormModal title={venue.isNew ? 'Nuevo salón' : 'Editar salón'} initial={venue} onClose={() => setVenue(null)}
          fields={[{ key: 'name', label: 'Nombre', span: true }, { key: 'price', label: 'Renta del salón', type: 'number', hint: 'se cobra solo si no hay menú para todos' }, { key: 'capacity', label: 'Capacidad', type: 'number' }]}
          validate={(v) => (!v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.price) >= 0) ? 'Precio inválido' : !(parseInt(v.capacity) > 0) ? 'Capacidad inválida' : '')}
          onSave={({ isNew, ...v }) => { update((d) => A.upsert(d, 'venues', { ...v, name: v.name.trim(), price: parseFloat(v.price), capacity: parseInt(v.capacity) })); setVenue(null); ui.notify(isNew ? 'Salón agregado' : 'Salón actualizado'); }} />
      )}
      {menu && (
        <FormModal title={menu.isNew ? 'Nuevo menú o paquete' : 'Editar menú o paquete'} initial={menu} onClose={() => setMenu(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            { key: 'price', label: 'Precio', type: 'number', hint: 'IVA incluido' },
            { key: 'unit', label: 'Se cobra', type: 'select', options: Object.entries(EVENT_UNITS) },
            { key: 'description', label: 'Qué incluye', span: true },
          ]}
          validate={(v) => (!v.name.trim() ? 'Falta el nombre' : !(parseFloat(v.price) > 0) ? 'Precio inválido' : '')}
          onSave={({ isNew, ...v }) => { update((d) => A.upsert(d, 'eventMenus', { ...v, name: v.name.trim(), price: parseFloat(v.price) })); setMenu(null); ui.notify(isNew ? 'Menú agregado' : 'Menú actualizado'); }} />
      )}
    </>
  );
}

function UsuariosTab() {
  const { state, user, update } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div className="row"><span className="panel-sub">Cada usuario entra con su PIN de 4 dígitos. El rol define qué pantallas ve.</span>
        <button className="btn btn-primary small" onClick={() => setEdit({ id: uid('u'), name: '', role: 'mesero', pin: '', active: true, isNew: true })}>+ Usuario</button>
      </div>
      <div className="card tx-card">
        <div className="tx-row head admin-users"><span>Nombre</span><span>Rol</span><span>PIN</span><span>Activo</span><span /></div>
        {state.users.map((u) => (
          <div key={u.id} className="tx-row admin-users">
            <strong>{u.name}{u.id === user.id && <span className="tag">Tú</span>}</strong>
            <span>{ROLE_LABELS[u.role]}</span>
            <span className="panel-sub">••••</span>
            <span><button className={'toggle' + (u.active ? ' on' : '')} disabled={u.id === user.id} onClick={() => update((d) => A.upsert(d, 'users', { ...u, active: !u.active }))}>{u.active ? 'Sí' : 'No'}</button></span>
            <span className="row-actions">
              <button className="link" onClick={() => setEdit({ ...u })}>Editar</button>
              {u.id !== user.id && <button className="link danger" onClick={() => ui.confirm({ title: 'Eliminar usuario', message: `¿Eliminar a ${u.name}?`, confirmLabel: 'Eliminar', danger: true }, () => update((d) => A.remove(d, 'users', u.id)))}>Eliminar</button>}
            </span>
          </div>
        ))}
      </div>
      {edit && (
        <FormModal title={edit.isNew ? 'Nuevo usuario' : 'Editar usuario'} initial={edit} onClose={() => setEdit(null)}
          fields={[
            { key: 'name', label: 'Nombre', span: true },
            { key: 'role', label: 'Rol', type: 'select', options: Object.entries(ROLE_LABELS) },
            { key: 'pin', label: 'PIN', hint: '4 dígitos' },
          ]}
          validate={(v) => {
            if (!v.name.trim()) return 'Falta el nombre';
            if (!/^\d{4}$/.test(v.pin)) return 'El PIN debe tener 4 dígitos';
            if (state.users.some((x) => x.pin === v.pin && x.id !== v.id)) return 'Ese PIN ya lo usa otra persona';
            if (v.id === user.id && v.role !== 'gerente') return 'No puedes quitarte el rol de gerente';
            return '';
          }}
          onSave={({ isNew, ...v }) => { update((d) => A.upsert(d, 'users', { ...v, name: v.name.trim() })); setEdit(null); ui.notify(isNew ? 'Usuario creado' : 'Usuario actualizado'); }} />
      )}
    </>
  );
}

function NegocioTab() {
  const { state, update } = useStore();
  const ui = useUI();
  const [c, setC] = useState(state.config);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = () => {
    update((d) => A.setConfig(d, { ...c, iva: parseFloat(c.iva) || 0, inguat: parseFloat(c.inguat) || 0, tipPct: parseFloat(c.tipPct) || 0 }));
    ui.notify('Configuración guardada');
  };
  return (
    <div className="card" style={{ maxWidth: 760 }}>
      <div className="form-grid two">
        <Field label="Nombre comercial"><input className="input" value={c.businessName} onChange={set('businessName')} /></Field>
        <Field label="Razón social"><input className="input" value={c.legalName} onChange={set('legalName')} /></Field>
        <Field label="NIT"><input className="input" value={c.nit} onChange={set('nit')} /></Field>
        <Field label="Teléfono"><input className="input" value={c.phone} onChange={set('phone')} /></Field>
        <Field label="Dirección" className="span-2"><input className="input" value={c.address} onChange={set('address')} /></Field>
        <Field label="Leyenda al pie del ticket" className="span-2"><input className="input" value={c.footer} onChange={set('footer')} /></Field>
      </div>
      <div className="form-grid four">
        <Field label="Moneda"><input className="input" value={c.currency} onChange={set('currency')} /></Field>
        <Field label="IVA %"><input className="input" type="number" value={c.iva} onChange={set('iva')} /></Field>
        <Field label="INGUAT %" hint="hospedaje"><input className="input" type="number" value={c.inguat} onChange={set('inguat')} /></Field>
        <Field label="Propina sugerida %"><input className="input" type="number" value={c.tipPct} onChange={set('tipPct')} /></Field>
      </div>
      <div className="panel-sub text-sm">
        Los precios del restaurante incluyen IVA. La tarifa de hospedaje es sin impuestos: al cobrar se suman IVA e INGUAT.
      </div>
      <div><button className="btn btn-primary" onClick={save}>Guardar cambios</button></div>
    </div>
  );
}

function DatosTab() {
  const { state, replace, resetDemo } = useStore();
  const ui = useUI();
  const fileRef = useRef();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
      if (data.version !== VERSION || !Array.isArray(data.menu)) throw new Error();
      replace({ ...data, session: state.session });
      ui.notify('Datos importados');
    } catch {
      ui.notify('El archivo no es un respaldo válido de POS Monarca');
    }
  };

  return (
    <div className="card" style={{ maxWidth: 760, gap: 18 }}>
      <div>
        <div className="report-title" style={{ fontSize: 20 }}>Datos de la demostración</div>
        <div className="panel-sub text-md">
          Todo se guarda en este navegador. Antes de presentar, restaura los datos de ejemplo para empezar con mesas, reservas y ventas del día.
        </div>
      </div>
      <div className="kv">
        <span>Órdenes abiertas</span><strong>{state.orders.length}</strong>
        <span>Ventas registradas</span><strong>{state.sales.length}</strong>
        <span>Reservas</span><strong>{state.reservations.length}</strong>
        <span>Cierres de caja</span><strong>{state.shiftHistory.length}</strong>
      </div>
      <div className="chips">
        <button className="btn" onClick={exportJson}>Exportar respaldo (JSON)</button>
        <button className="btn" onClick={() => fileRef.current.click()}>Importar respaldo</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
        <button className="btn btn-primary btn-danger" onClick={() => ui.confirm({
          title: 'Restaurar datos de ejemplo',
          message: 'Se borran todos los cambios hechos en este navegador y se cargan los datos de ejemplo con fechas de hoy. Tendrás que volver a iniciar sesión.',
          confirmLabel: 'Restaurar', danger: true,
        }, resetDemo)}>Restaurar datos de ejemplo</button>
      </div>
    </div>
  );
}
