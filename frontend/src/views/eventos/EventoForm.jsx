import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { EVENT_EXTRAS, EVENT_UNITS } from '../../data.js';
import { addDays, fmtDate, today, uid } from '../../lib/dates.js';
import { eventTotals, venueConflict } from '../../lib/events.js';
import { useStore } from '../../store/store.jsx';

// Cantidad sugerida del menú según su unidad
const qtyFor = (menu, guests) => (!menu ? 0 : menu.unit === 'pareja' ? Math.ceil(guests / 2) : menu.unit === 'evento' ? 1 : guests);

export default function EventoForm({ ev, onClose, onSave }) {
  const { state, fmt } = useStore();
  const [f, setF] = useState(() =>
    ev
      ? { ...ev, client: { ...ev.client }, extras: [...ev.extras] }
      : {
          id: uid('e'), name: '', date: addDays(today(), 7), start: '18:00', end: '22:00', venueId: state.venues[0]?.id || '',
          menuId: state.eventMenus[0]?.id || '', guests: 20, menuQty: 20, status: 'cotizado',
          client: { name: '', phone: '', nit: 'CF' }, extras: [], payments: [], notes: '', createdAt: Date.now(),
        }
  );
  const [extra, setExtra] = useState({ desc: '', amt: '' });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setClient = (patch) => setF((x) => ({ ...x, client: { ...x.client, ...patch } }));

  const menu = state.eventMenus.find((m) => m.id === f.menuId);
  const venue = state.venues.find((v) => v.id === f.venueId);
  const t = eventTotals(f, state);
  const conflict = venueConflict(state.events, f);

  const changeGuests = (g) => set({ guests: g, menuQty: qtyFor(menu, g) });
  const changeMenu = (id) => set({ menuId: id, menuQty: qtyFor(state.eventMenus.find((m) => m.id === id), f.guests) });
  const addExtra = (desc, amt) => set({ extras: [...f.extras, { id: uid('x'), desc, amt: Number(amt) }] });

  let problem = '';
  if (!f.name.trim()) problem = 'Falta el nombre del evento';
  else if (!f.client.name.trim()) problem = 'Falta el cliente';
  else if (f.end <= f.start) problem = 'La hora de fin debe ser después del inicio';
  else if (conflict) problem = `${venue.name} ocupado: ${conflict.name}`;

  return (
    <Modal title={ev ? 'Editar evento' : 'Nuevo evento'} onClose={onClose} width={760}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={!!problem} onClick={() => onSave({ ...f, name: f.name.trim(), client: { ...f.client, name: f.client.name.trim() } })}>{problem || 'Guardar evento'}</button></>}>
      <div className="form-grid">
        <Field label="Nombre del evento" className="span-2">
          <input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Boda López – Pérez" />
        </Field>
        <Field label="Fecha" hint={fmtDate(f.date, { weekday: 'long' })}>
          <input className="input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Salón">
          <select className="input" value={f.venueId} onChange={(e) => set({ venueId: e.target.value })}>
            {state.venues.map((v) => <option key={v.id} value={v.id}>{v.name} · renta {fmt(v.price)}</option>)}
            <option value="">Sin salón (restaurante / terraza)</option>
          </select>
        </Field>
        <Field label="Inicio"><input className="input" type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Fin"><input className="input" type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} /></Field>
        <Field label="Menú o paquete" className="span-2">
          <select className="input" value={f.menuId} onChange={(e) => changeMenu(e.target.value)}>
            {state.eventMenus.map((m) => <option key={m.id} value={m.id}>{m.name} · {fmt(m.price)} {EVENT_UNITS[m.unit]}</option>)}
            <option value="">Sin menú</option>
          </select>
        </Field>
        <Field label="Invitados" hint={venue && f.guests > venue.capacity ? `capacidad ${venue.capacity}` : ''}>
          <input className="input" type="number" min="1" value={f.guests} onChange={(e) => changeGuests(Math.max(1, parseInt(e.target.value) || 1))} />
        </Field>
        <Field label={menu?.unit === 'pareja' ? 'Parejas' : menu?.unit === 'evento' ? 'Cantidad' : 'Platos'}>
          <input className="input" type="number" min="0" value={f.menuQty} disabled={!menu} onChange={(e) => set({ menuQty: Math.max(0, parseInt(e.target.value) || 0) })} />
        </Field>
        <Field label="Cliente"><input className="input" value={f.client.name} onChange={(e) => setClient({ name: e.target.value })} placeholder="Nombre o empresa" /></Field>
        <Field label="Teléfono"><input className="input" value={f.client.phone} onChange={(e) => setClient({ phone: e.target.value })} /></Field>
        <Field label="NIT"><input className="input" value={f.client.nit} onChange={(e) => setClient({ nit: e.target.value })} /></Field>
        <Field label="Notas" className="span-3">
          <input className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Montaje, horario de proveedores, alergias…" />
        </Field>
      </div>
      {menu?.description && <div className="panel-sub text-sm">{menu.name}: {menu.description}</div>}
      {venue && (t.venueWaived
        ? <div className="note-box">Renta del {venue.name} sin costo: el evento incluye comida del hotel para los {f.guests} invitados.</div>
        : <div className="note-box warn">Se cobra la renta del {venue.name} ({fmt(venue.price)}).{menu ? ` El menú cubre ${t.covered} de ${f.guests} invitados; con comida para todos, el salón no se cobra.` : ' Si el evento incluye comida del hotel para todos los invitados, el salón no se cobra.'}</div>)}
      {venue && f.guests > venue.capacity && <div className="note-box">Hay más invitados ({f.guests}) que la capacidad del {venue.name} ({venue.capacity}).</div>}

      <div className="stack-tight gap-8">
        <div className="eyebrow">Extras</div>
        <div className="chips">
          {EVENT_EXTRAS.map(([d, a]) => <button key={d} className="chip small" onClick={() => addExtra(d, a)}>+ {d} · {fmt(a)}</button>)}
        </div>
        {f.extras.map((x) => (
          <div key={x.id} className="row text-md">
            <span>{x.desc} <button className="link danger ml-8" onClick={() => set({ extras: f.extras.filter((y) => y.id !== x.id) })}>quitar</button></span>
            <strong>{fmt(x.amt)}</strong>
          </div>
        ))}
        <div className="inline-form">
          <input className="input grow" placeholder="Otro extra" value={extra.desc} onChange={(e) => setExtra({ ...extra, desc: e.target.value })} />
          <input className="input" style={{ width: 120 }} type="number" placeholder="Monto" value={extra.amt} onChange={(e) => setExtra({ ...extra, amt: e.target.value })} />
          <button className="btn small" disabled={!extra.desc.trim() || !(parseFloat(extra.amt) > 0)} onClick={() => { addExtra(extra.desc.trim(), extra.amt); setExtra({ desc: '', amt: '' }); }}>Agregar</button>
        </div>
      </div>

      <div className="summary-bar">
        <span>Salón {t.venueWaived ? 'sin costo' : fmt(t.venueAmt)}</span>
        <span>{menu ? `${f.menuQty} × ${fmt(menu.price)} = ${fmt(t.menuAmt)}` : 'Sin menú'}</span>
        <span>Extras {fmt(t.extrasAmt)}</span>
        <strong>Total {fmt(t.total)}</strong>
      </div>
    </Modal>
  );
}
