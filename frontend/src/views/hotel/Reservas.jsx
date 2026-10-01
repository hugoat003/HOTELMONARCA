import { useState } from 'react';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { RES_STATUS } from '../../data.js';
import { addDays, fmtDate, nightsBetween, today } from '../../lib/dates.js';
import { isActiveRes } from '../../lib/hotel.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import ReservaForm from './ReservaForm.jsx';
import ReservaPanel from './ReservaPanel.jsx';

const DAYS = 14;

export default function Reservas() {
  const { state, update } = useStore();
  const ui = useUI();
  const d0 = today();
  const [start, setStart] = useState(addDays(d0, -1));
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null); // { roomN, checkIn }
  const [list, setList] = useState(false);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const end = addDays(start, DAYS);
  const visible = state.reservations.filter((r) => r.status !== 'cancelada' && r.checkIn < end && r.checkOut > start);
  const sel = state.reservations.find((r) => r.id === selId);

  const upcoming = state.reservations
    .filter((r) => isActiveRes(r))
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const occupancy = (day) => {
    const n = state.reservations.filter((r) => isActiveRes(r) && r.checkIn <= day && r.checkOut > day).length;
    return Math.round((n / state.rooms.length) * 100);
  };

  return (
    <div className="split" style={{ gridTemplateColumns: sel ? 'minmax(0,1fr) 380px' : 'minmax(0,1fr)' }}>
      <div className="split-main" style={{ gap: 16 }}>
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="chips">
            <button className="chip" onClick={() => setStart(addDays(start, -7))}>‹ Semana</button>
            <button className="chip" onClick={() => setStart(addDays(d0, -1))}>Hoy</button>
            <button className="chip" onClick={() => setStart(addDays(start, 7))}>Semana ›</button>
            <span className="panel-sub" style={{ alignSelf: 'center', marginLeft: 6 }}>
              {fmtDate(start, { day: 'numeric', month: 'long' })} – {fmtDate(addDays(end, -1), { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="chips">
            <button className={'chip' + (list ? ' active' : '')} onClick={() => setList(!list)}>{list ? 'Ver calendario' : 'Ver lista'}</button>
            <button className="btn btn-primary small" onClick={() => setForm({})}>+ Nueva reserva</button>
          </div>
        </div>

        {!list && (
          <div className="calendar" style={{ '--days': DAYS }}>
            <div className="cal-row cal-head">
              <div className="cal-room">Hab.</div>
              {days.map((d, i) => (
                <div key={d} className={'cal-day' + (d === d0 ? ' today' : '') + ([0, 6].includes(new Date(d + 'T12:00').getDay()) ? ' weekend' : '')} style={{ gridColumn: i + 2 }}>
                  <span>{fmtDate(d, { weekday: 'short' })}</span>
                  <strong>{fmtDate(d, { day: 'numeric' })}</strong>
                  <em>{occupancy(d)}%</em>
                </div>
              ))}
            </div>
            {state.rooms.map((room) => (
              <div key={room.n} className="cal-row">
                <div className="cal-room">
                  <strong>{room.n}</strong>
                  <span>{state.roomTypes.find((t) => t.id === room.typeId)?.name}</span>
                </div>
                {days.map((d, i) => (
                  <button key={d} className={'cal-cell' + (d === d0 ? ' today' : '') + (room.hk === 'fuera' ? ' blocked' : '')} style={{ gridColumn: i + 2 }}
                    onClick={() => room.hk !== 'fuera' && setForm({ roomN: room.n, checkIn: d < d0 ? d0 : d })} title="Nueva reserva" />
                ))}
                {visible.filter((r) => r.roomN === room.n).map((r) => {
                  const from = Math.max(0, nightsBetween(start, r.checkIn));
                  const to = Math.min(DAYS, nightsBetween(start, r.checkOut));
                  return (
                    <button key={r.id} className={`cal-bar ${r.status}` + (r.rateType === 'mensual' ? ' monthly' : '') + (selId === r.id ? ' selected' : '')}
                      style={{ gridColumn: `${from + 2} / ${to + 2}` }} onClick={() => setSelId(r.id)}
                      title={`${r.guest.name} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} · ${RES_STATUS[r.status]}`}>
                      {r.rateType === 'mensual' && <span className="cal-tag">Mensual</span>}{r.guest.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {!list && (
          <div className="legend">
            <span><span className="swatch" style={{ background: '#1B1917' }} />Hospedado</span>
            <span><span className="swatch" style={{ border: '1.5px solid #1B1917' }} />Reservada</span>
            <span><span className="swatch" style={{ background: '#E4DED5' }} />Salió</span>
            <span className="panel-sub">Toca un espacio vacío para crear una reserva.</span>
          </div>
        )}

        {list && (
          <div className="card tx-card">
            <div className="tx-row head res"><span>Hab.</span><span>Huésped</span><span>Entrada</span><span>Salida</span><span>Canal</span><span>Estado</span></div>
            {upcoming.map((r) => (
              <button key={r.id} className={'tx-row res list-row' + (selId === r.id ? ' selected' : '')} onClick={() => setSelId(r.id)}>
                <strong>{r.roomN}</strong><span>{r.guest.name}</span><span>{fmtDate(r.checkIn)}</span><span>{fmtDate(r.checkOut)}</span>
                <span className="panel-sub">{r.channel}{r.rateType === 'mensual' ? ' · mensual' : ''}</span><span>{RES_STATUS[r.status]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <div className="side-panel room-panel">
          <div className="row"><span className="eyebrow">Reserva</span><button className="link" onClick={() => setSelId(null)}>Cerrar ×</button></div>
          <ReservaPanel key={sel.id} res={sel} />
        </div>
      )}

      {form && (
        <ReservaForm mode="new" roomN={form.roomN} checkIn={form.checkIn} onClose={() => setForm(null)}
          onSave={(r) => {
            update((d) => A.saveReservation(d, r));
            setForm(null);
            setSelId(r.id);
            ui.notify(`Reserva creada · ${r.guest.name}, Hab. ${r.roomN}`);
          }} />
      )}
    </div>
  );
}
