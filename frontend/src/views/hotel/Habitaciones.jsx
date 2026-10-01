import { useState } from 'react';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { ROOM_COLORS, ROOM_STATUS_ORDER } from '../../data.js';
import { fmtDate, today } from '../../lib/dates.js';
import { roomState } from '../../lib/hotel.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import ReservaForm from './ReservaForm.jsx';
import ReservaPanel from './ReservaPanel.jsx';

export default function Habitaciones() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [selRoom, setSelRoom] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // { mode, roomN }

  const d0 = today();
  const states = Object.fromEntries(state.rooms.map((r) => [r.n, roomState(r, state.reservations, d0)]));
  const floors = [...new Set(state.rooms.map((r) => r.n[0]))].sort();
  const arrivals = state.reservations.filter((r) => r.status === 'reservada' && r.checkIn === d0);
  const departures = state.reservations.filter((r) => r.status === 'hospedado' && r.checkOut <= d0);

  const q = search.trim().toLowerCase();
  const matches = q
    ? state.reservations.filter(
        (r) =>
          (r.status === 'hospedado' || r.status === 'reservada') &&
          (r.guest.name.toLowerCase().includes(q) || r.roomN.includes(q)),
      )
    : [];

  const room = state.rooms.find((r) => r.n === selRoom);
  const st = room && states[room.n];
  const nextRes =
    room &&
    state.reservations
      .filter((r) => r.roomN === room.n && r.status === 'reservada' && r.checkIn > d0)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];

  return (
    <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
      <div className="split-main">
        <div className="row items-center gap-12">
          <div className="chips gap-10">
            {ROOM_STATUS_ORDER.map((k) => {
              const [bg, , border, , label] = ROOM_COLORS[k];
              const n = Object.values(states).filter((s) => s.status === k).length;
              if (!n && k === 'fuera') return null;
              return (
                <span key={k} className="pill">
                  <span
                    style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: `1px solid ${border}` }}
                  />
                  {label} <strong>{n}</strong>
                </span>
              );
            })}
          </div>
          <input
            className="input search"
            style={{ maxWidth: 240 }}
            placeholder="Buscar huésped o habitación…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {q && (
          <div className="card" style={{ gap: 6, padding: 14 }}>
            {matches.map((r) => (
              <button
                key={r.id}
                className="list-btn"
                onClick={() => {
                  setSelRoom(r.roomN);
                  setSearch('');
                }}
              >
                <strong>{r.roomN}</strong> · {r.guest.name}{' '}
                <span className="panel-sub">
                  · {fmtDate(r.checkIn)} → {fmtDate(r.checkOut)} ·{' '}
                  {r.status === 'hospedado' ? 'Hospedado' : 'Reservada'}
                </span>
              </button>
            ))}
            {!matches.length && <div className="panel-sub">Sin resultados.</div>}
          </div>
        )}

        <div className="report-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card gap-8 pad-16">
            <div className="card-label">Llegadas de hoy · {arrivals.length}</div>
            {arrivals.map((r) => (
              <button key={r.id} className="list-btn" onClick={() => setSelRoom(r.roomN)}>
                <strong>{r.roomN}</strong> · {r.guest.name} <span className="panel-sub">· {r.channel}</span>
              </button>
            ))}
            {!arrivals.length && <div className="panel-sub">No hay llegadas pendientes.</div>}
          </div>
          <div className="card gap-8 pad-16">
            <div className="card-label">Salidas de hoy · {departures.length}</div>
            {departures.map((r) => (
              <button key={r.id} className="list-btn" onClick={() => setSelRoom(r.roomN)}>
                <strong>{r.roomN}</strong> · {r.guest.name}
              </button>
            ))}
            {!departures.length && <div className="panel-sub">No hay salidas pendientes.</div>}
          </div>
        </div>

        {floors.map((f) => (
          <section key={f} className="section">
            <h2 className="section-title">Piso {f}</h2>
            <div className="tile-grid">
              {state.rooms
                .filter((r) => r.n[0] === f)
                .map((r) => {
                  const s = states[r.n];
                  const [bg, fg, border, sub, label] = ROOM_COLORS[s.status];
                  const type = state.roomTypes.find((t) => t.id === r.typeId);
                  return (
                    <button
                      key={r.n}
                      className={'tile room' + (selRoom === r.n ? ' selected' : '')}
                      style={{ '--t-bg': bg, '--t-fg': fg, '--t-border': border, '--t-sub': sub }}
                      onClick={() => setSelRoom(r.n)}
                    >
                      <span className="tile-head">
                        <span className="tile-name">{r.n}</span>
                        <span className="tile-sub">{type?.name}</span>
                      </span>
                      <span className="tile-status">
                        {label}
                        {s.status === 'ocupada' && (
                          <span className="tile-sub fw-500">
                            {' '}
                            · sale {fmtDate(s.res.checkOut, { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </span>
                      <span className="tile-foot">
                        <span>{s.res?.guest.name || ''}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>

      <div className="side-panel room-panel">
        {!room && (
          <div className="stack">
            <div className="panel-empty">Selecciona una habitación para ver su detalle.</div>
            <button className="btn btn-primary" onClick={() => setForm({ mode: 'new' })}>
              Nueva reserva
            </button>
          </div>
        )}

        {room && (st.status === 'ocupada' || st.status === 'reservada') && (
          <ReservaPanel key={st.res.id} res={st.res} />
        )}

        {room && (st.status === 'libre' || st.status === 'limpieza' || st.status === 'fuera') && (
          <div className="stack gap-16">
            <div className="stack-tight">
              <div className="panel-title">Habitación {room.n}</div>
              <div className="panel-sub">
                {state.roomTypes.find((t) => t.id === room.typeId)?.name} ·{' '}
                {fmt(state.roomTypes.find((t) => t.id === room.typeId)?.rate)} / noche + impuestos
              </div>
              <div
                className="badge"
                style={{
                  background: ROOM_COLORS[st.status][0],
                  color: ROOM_COLORS[st.status][1],
                  border: '1px solid ' + ROOM_COLORS[st.status][2],
                }}
              >
                {ROOM_COLORS[st.status][4]}
              </div>
            </div>
            {st.res && (
              <div className="note-box">
                Hoy llega {st.res.guest.name}. Prepara la habitación para registrar la llegada.
              </div>
            )}
            {nextRes && !st.res && (
              <div className="note-box">
                Próxima reserva: {nextRes.guest.name}, {fmtDate(nextRes.checkIn)} → {fmtDate(nextRes.checkOut)}.
              </div>
            )}

            {st.status === 'libre' && (
              <>
                <button className="btn btn-primary" onClick={() => setForm({ mode: 'walkin', roomN: room.n })}>
                  Check-in sin reserva
                </button>
                <button className="btn" onClick={() => setForm({ mode: 'new', roomN: room.n })}>
                  Nueva reserva
                </button>
                <button className="btn btn-quiet" onClick={() => update((d) => A.setHk(d, room.n, 'fuera'))}>
                  Poner fuera de servicio
                </button>
              </>
            )}
            {st.status === 'limpieza' && (
              <>
                <div className="kv">
                  <span>Limpieza</span>
                  <strong>{room.hk === 'limpiando' ? 'En proceso' : 'Pendiente'}</strong>
                </div>
                {room.hk === 'sucia' && (
                  <button className="btn" onClick={() => update((d) => A.setHk(d, room.n, 'limpiando'))}>
                    Iniciar limpieza
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    update((d) => A.setHk(d, room.n, 'limpia'));
                    ui.notify(`Habitación ${room.n} lista`);
                  }}
                >
                  Marcar como lista
                </button>
              </>
            )}
            {st.status === 'fuera' && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  update((d) => A.setHk(d, room.n, 'limpia'));
                  ui.notify(`Habitación ${room.n} habilitada`);
                }}
              >
                Habilitar habitación
              </button>
            )}
          </div>
        )}
      </div>

      {form && (
        <ReservaForm
          mode={form.mode}
          roomN={form.roomN}
          onClose={() => setForm(null)}
          onSave={(r) => {
            update((d) => (form.mode === 'walkin' ? A.checkInWith(d, r) : A.saveReservation(d, r)));
            setForm(null);
            setSelRoom(r.roomN);
            ui.notify(
              form.mode === 'walkin'
                ? `Check-in · ${r.guest.name} en la ${r.roomN}`
                : `Reserva creada · ${r.guest.name}, Hab. ${r.roomN}`,
            );
          }}
        />
      )}
    </div>
  );
}
