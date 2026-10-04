import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { RES_STATUS } from '@shared/data.js';
import { fmtDate } from '@shared/dates.js';
import { folio, guestStays, isFrequent } from '@shared/hotel.js';
import { sum } from '@shared/money.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';
import ReservaForm from './ReservaForm.jsx';

const counted = (r) => r.status === 'salida' || r.status === 'hospedado';

// Fichas de huéspedes: búsqueda, historial de estancias y gasto
export default function Huespedes() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [search, setSearch] = usePersisted('huespedes.busqueda', '');
  const [selId, setSelId] = usePersisted('huespedes.seleccion', null);
  const [edit, setEdit] = useState(null);
  const [booking, setBooking] = useState(null);

  const guests = state.guests || [];
  const info = (g) => {
    const stays = guestStays(g, state.reservations).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const done = stays.filter(counted);
    return {
      stays,
      count: done.length,
      last: done[0]?.checkIn,
      spent: sum(done, (r) => folio(r, state).total),
      frequent: isFrequent(g, state.reservations),
    };
  };
  const q = search.trim().toLowerCase();
  const rows = guests
    .filter((g) => !q || [g.name, g.doc, g.phone, g.email].some((v) => (v || '').toLowerCase().includes(q)))
    .map((g) => ({ g, ...info(g) }))
    .sort((a, b) => (b.last || '').localeCompare(a.last || '') || a.g.name.localeCompare(b.g.name));
  const selGuest = guests.find((g) => g.id === selId);
  const sel = selGuest ? { g: selGuest, ...info(selGuest) } : null;

  return (
    <div className="split" style={{ '--side': '420px' }}>
      <div className="split-main gap-16">
        <div className="row items-center gap-12">
          <input
            className="input search"
            placeholder="Buscar por nombre, documento, teléfono o correo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="pill">
            {guests.length} huéspedes · {guests.filter((g) => isFrequent(g, state.reservations)).length} frecuentes
          </span>
        </div>
        <DataTable
          variant="guests"
          columns={['Huésped', 'Documento', 'Nacionalidad', 'Estancias', 'Última visita', 'Gasto']}
          empty="No hay huéspedes que coincidan."
        >
          {rows.map(({ g, count, last, spent, frequent }) => (
            <button
              key={g.id}
              className={rowClass('guests', 'list-row' + (selId === g.id ? ' selected' : ''))}
              onClick={() => setSelId(g.id)}
            >
              <strong>
                {g.name}
                {frequent && <span className="tag status-confirmado">Frecuente</span>}
              </strong>
              <span className="panel-sub">{g.doc || '—'}</span>
              <span>{g.nationality || '—'}</span>
              <span>{count}</span>
              <span className="panel-sub">
                {last ? fmtDate(last, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
              </span>
              <strong>{fmt(spent)}</strong>
            </button>
          ))}
        </DataTable>
      </div>

      <div className="side-panel room-panel">
        {!sel ? (
          <div className="panel-empty">Selecciona un huésped para ver su ficha e historial.</div>
        ) : (
          <div className="stack gap-16">
            <div className="stack-tight">
              <div className="panel-title">{sel.g.name}</div>
              <div className="panel-sub">
                {sel.count} estancia{sel.count === 1 ? '' : 's'} · {fmt(sel.spent)} en total
              </div>
              {sel.frequent && <div className="badge status-confirmado">Huésped frecuente</div>}
            </div>
            <div className="kv">
              <span>Documento</span>
              <strong>{sel.g.doc || '—'}</strong>
              <span>Nacionalidad</span>
              <strong>{sel.g.nationality || '—'}</strong>
              <span>Teléfono</span>
              <strong>{sel.g.phone || '—'}</strong>
              <span>Correo</span>
              <strong>{sel.g.email || '—'}</strong>
              {sel.g.notes && (
                <>
                  <span>Notas</span>
                  <strong>{sel.g.notes}</strong>
                </>
              )}
            </div>
            <div className="btn-row">
              <button className="btn" onClick={() => setEdit({ ...sel.g })}>
                Editar ficha
              </button>
              <button className="btn btn-primary" onClick={() => setBooking(sel.g)}>
                Nueva reserva
              </button>
            </div>
            <div className="eyebrow">Estancias</div>
            <div>
              {sel.stays.map((r) => (
                <div key={r.id} className="folio-line">
                  <span>
                    {fmtDate(r.checkIn, { day: 'numeric', month: 'short', year: 'numeric' })} →{' '}
                    {fmtDate(r.checkOut, { day: 'numeric', month: 'short' })} · Hab. {r.roomN}
                    <span className="panel-sub"> · {RES_STATUS[r.status]}</span>
                  </span>
                  <strong>{counted(r) ? fmt(folio(r, state).total) : '—'}</strong>
                </div>
              ))}
              {!sel.stays.length && <div className="panel-sub">Sin estancias registradas.</div>}
            </div>
          </div>
        )}
      </div>

      {edit && (
        <GuestModal
          guest={edit}
          onClose={() => setEdit(null)}
          onSave={(g) => {
            update((d) => A.saveGuest(d, g));
            setEdit(null);
            ui.notify('Ficha actualizada');
          }}
        />
      )}
      {booking && (
        <ReservaForm
          mode="new"
          guest={booking}
          onClose={() => setBooking(null)}
          onSave={(r) => {
            update((d) => A.saveReservation(d, r));
            setBooking(null);
            ui.notify(`Reserva creada · ${r.guest.name}, Hab. ${r.roomN}`);
          }}
        />
      )}
    </div>
  );
}

function GuestModal({ guest, onClose, onSave }) {
  const [g, setG] = useState(guest);
  const set = (k) => (e) => setG({ ...g, [k]: e.target.value });
  return (
    <Modal
      title="Ficha del huésped"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={g.name.trim().length < 2}
            onClick={() => onSave({ ...g, name: g.name.trim() })}
          >
            Guardar
          </button>
        </>
      }
    >
      <div className="form-grid two">
        <Field label="Nombre" className="span-2">
          <input className="input" autoFocus value={g.name} onChange={set('name')} />
        </Field>
        <Field label="Documento">
          <input className="input" value={g.doc || ''} onChange={set('doc')} />
        </Field>
        <Field label="Nacionalidad">
          <input className="input" value={g.nationality || ''} onChange={set('nationality')} />
        </Field>
        <Field label="Teléfono">
          <input className="input" value={g.phone || ''} onChange={set('phone')} />
        </Field>
        <Field label="Correo">
          <input className="input" value={g.email || ''} onChange={set('email')} />
        </Field>
        <Field label="Notas" hint="preferencias, alergias…" className="span-2">
          <input className="input" value={g.notes || ''} onChange={set('notes')} />
        </Field>
      </div>
    </Modal>
  );
}
