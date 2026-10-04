import { useRef, useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { RES_STATUS } from '@shared/data.js';
import { addDays, fmtDate, nightsBetween, today } from '@shared/dates.js';
import { isActiveRes, isAvailable } from '@shared/hotel.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import ReservaForm from './ReservaForm.jsx';
import ReservaPanel from './ReservaPanel.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const DAYS = 14;

export default function Reservas() {
  const { state, user, update } = useStore();
  const ui = useUI();
  const d0 = today();
  const [start, setStart] = useState(addDays(d0, -1));
  const [selId, setSelId] = usePersisted('reservas.seleccion', null);
  const [form, setForm] = useState(null); // { roomN, checkIn }
  const [list, setList] = usePersisted('reservas.lista', false);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const end = addDays(start, DAYS);
  const visible = state.reservations.filter(
    (r) => r.status !== 'cancelada' && r.status !== 'noshow' && r.checkIn < end && r.checkOut > start,
  );
  const calRef = useRef();
  const [drag, setDrag] = useState(null); // { id, mode, x0, y0, dx, dy, dayW, rowH }

  // ── Arrastrar reservas ──
  const startDrag = (e, r, mode) => {
    if (r.status === 'salida') return setSelId(r.id);
    e.stopPropagation();
    e.currentTarget.closest('.cal-bar').setPointerCapture(e.pointerId);
    const cal = calRef.current;
    const rowH = e.currentTarget.closest('.cal-row').offsetHeight;
    setDrag({ id: r.id, mode, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, dayW: (cal.clientWidth - 110) / DAYS, rowH });
  };
  const moveDrag = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0, dy: e.clientY - drag.y0 });
  const endDrag = () => {
    if (!drag) return;
    const g = drag;
    setDrag(null);
    const r = state.reservations.find((x) => x.id === g.id);
    if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) return setSelId(r.id); // fue un toque
    const dDays = Math.round(g.dx / g.dayW);
    const dRows = g.mode === 'move' ? Math.round(g.dy / g.rowH) : 0;
    const rooms = state.rooms;
    const roomIdx = rooms.findIndex((x) => x.n === r.roomN);
    const target = rooms[Math.min(rooms.length - 1, Math.max(0, roomIdx + dRows))];
    const fail = (msg) => ui.notify(msg);

    if (g.mode === 'resize') {
      const checkOut = addDays(r.checkOut, dDays);
      if (checkOut <= r.checkIn || (r.status === 'hospedado' && checkOut < d0))
        return fail('La salida no puede quedar antes');
      if (!isAvailable(state.reservations, r.roomN, r.checkIn, checkOut, r.id))
        return fail(`La ${r.roomN} está ocupada en esas fechas`);
      update((d) => A.moveReservation(d, r.id, { roomN: r.roomN, checkIn: r.checkIn, checkOut }));
      return ui.notify(`Estancia de ${r.guest.name}: salida el ${fmtDate(checkOut)}`);
    }
    if (r.status === 'hospedado') {
      // Hospedado: solo puede cambiar de habitación (las fechas ya empezaron)
      if (!dRows || target.n === r.roomN)
        return fail('Un huésped hospedado solo se puede cambiar de habitación o extender');
      if (target.hk !== 'limpia') return fail(`La ${target.n} no está lista`);
      if (!isAvailable(state.reservations, target.n, d0, r.checkOut, r.id))
        return fail(`La ${target.n} está ocupada en esas fechas`);
      return ui.confirm(
        {
          title: 'Cambiar de habitación',
          message: `¿Pasar a ${r.guest.name} de la ${r.roomN} a la ${target.n}? La ${r.roomN} quedará en limpieza.`,
          confirmLabel: 'Cambiar',
        },
        () => {
          update((d) => A.changeRoom(d, r.id, { roomN: target.n, userId: user.id }));
          ui.notify(`${r.guest.name} pasó a la ${target.n}`);
        },
      );
    }
    const checkIn = addDays(r.checkIn, dDays);
    const checkOut = addDays(r.checkOut, dDays);
    if (checkIn < d0) return fail('No se puede mover a una fecha pasada');
    if (target.hk === 'fuera') return fail(`La ${target.n} está fuera de servicio`);
    if (!isAvailable(state.reservations, target.n, checkIn, checkOut, r.id))
      return fail(`La ${target.n} está ocupada en esas fechas`);
    update((d) => A.moveReservation(d, r.id, { roomN: target.n, checkIn, checkOut }));
    ui.notify(`Reserva de ${r.guest.name}: Hab. ${target.n}, ${fmtDate(checkIn)} → ${fmtDate(checkOut)}`);
  };
  const sel = state.reservations.find((r) => r.id === selId);

  const upcoming = state.reservations.filter((r) => isActiveRes(r)).sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const occupancy = (day) => {
    const n = state.reservations.filter((r) => isActiveRes(r) && r.checkIn <= day && r.checkOut > day).length;
    return Math.round((n / state.rooms.length) * 100);
  };

  return (
    <div className={'split' + (sel ? '' : ' no-side')} style={{ '--side': '380px' }}>
      <div className="split-main gap-16">
        <div className="row items-center">
          <div className="chips">
            <button className="chip" onClick={() => setStart(addDays(start, -7))}>
              ‹ Semana
            </button>
            <button className="chip" onClick={() => setStart(addDays(d0, -1))}>
              Hoy
            </button>
            <button className="chip" onClick={() => setStart(addDays(start, 7))}>
              Semana ›
            </button>
            <span className="panel-sub" style={{ alignSelf: 'center', marginLeft: 6 }}>
              {fmtDate(start, { day: 'numeric', month: 'long' })} –{' '}
              {fmtDate(addDays(end, -1), { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="chips">
            <button className={'chip' + (list ? ' active' : '')} onClick={() => setList(!list)}>
              {list ? 'Ver calendario' : 'Ver lista'}
            </button>
            <button className="btn btn-primary small" onClick={() => setForm({})}>
              + Nueva reserva
            </button>
          </div>
        </div>

        {!list && (
          <div className="calendar" style={{ '--days': DAYS }} ref={calRef}>
            <div className="cal-row cal-head">
              <div className="cal-room">Hab.</div>
              {days.map((d, i) => (
                <div
                  key={d}
                  className={
                    'cal-day' +
                    (d === d0 ? ' today' : '') +
                    ([0, 6].includes(new Date(d + 'T12:00').getDay()) ? ' weekend' : '')
                  }
                  style={{ gridColumn: i + 2 }}
                >
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
                  <button
                    key={d}
                    className={'cal-cell' + (d === d0 ? ' today' : '') + (room.hk === 'fuera' ? ' blocked' : '')}
                    style={{ gridColumn: i + 2 }}
                    onClick={() => room.hk !== 'fuera' && setForm({ roomN: room.n, checkIn: d < d0 ? d0 : d })}
                    title="Nueva reserva"
                  />
                ))}
                {visible
                  .filter((r) => r.roomN === room.n)
                  .map((r) => {
                    const from = Math.max(0, nightsBetween(start, r.checkIn));
                    const dragging = drag?.id === r.id;
                    const stretch = dragging && drag.mode === 'resize' ? Math.round(drag.dx / drag.dayW) : 0;
                    const to = Math.max(from + 1, Math.min(DAYS, nightsBetween(start, r.checkOut) + stretch));
                    return (
                      <button
                        key={r.id}
                        className={
                          `cal-bar ${r.status}` +
                          (r.rateType === 'mensual' ? ' monthly' : '') +
                          (selId === r.id ? ' selected' : '') +
                          (dragging ? ' dragging' : '')
                        }
                        style={{
                          gridColumn: `${from + 2} / ${to + 2}`,
                          transform:
                            dragging && drag.mode === 'move' ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                        }}
                        onPointerDown={(e) => startDrag(e, r, 'move')}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={() => setDrag(null)}
                        title={`${r.guest.name} · ${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} · ${RES_STATUS[r.status]}`}
                      >
                        {r.rateType === 'mensual' && <span className="cal-tag">Mensual</span>}
                        {r.guest.name}
                        {r.status !== 'salida' && (
                          <span
                            className="cal-resize"
                            aria-label="Extender estancia"
                            onPointerDown={(e) => startDrag(e, r, 'resize')}
                          />
                        )}
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        )}

        {!list && (
          <div className="legend">
            <span>
              <span className="swatch" style={{ background: '#1B1917' }} />
              Hospedado
            </span>
            <span>
              <span className="swatch" style={{ border: '1.5px solid #1B1917' }} />
              Reservada
            </span>
            <span>
              <span className="swatch" style={{ background: '#E4DED5' }} />
              Salió
            </span>
            <span className="panel-sub">Toca un espacio vacío para crear una reserva.</span>
          </div>
        )}

        {list && (
          <DataTable variant="res" columns={['Hab.', 'Huésped', 'Entrada', 'Salida', 'Canal', 'Estado']}>
            {upcoming.map((r) => (
              <button
                key={r.id}
                className={'tx-row res list-row' + (selId === r.id ? ' selected' : '')}
                onClick={() => setSelId(r.id)}
              >
                <strong>{r.roomN}</strong>
                <span>{r.guest.name}</span>
                <span>{fmtDate(r.checkIn)}</span>
                <span>{fmtDate(r.checkOut)}</span>
                <span className="panel-sub">
                  {r.channel}
                  {r.rateType === 'mensual' ? ' · mensual' : ''}
                </span>
                <span>{RES_STATUS[r.status]}</span>
              </button>
            ))}
          </DataTable>
        )}
      </div>

      {sel && (
        <div className="side-panel room-panel">
          <div className="row">
            <span className="eyebrow">Reserva</span>
            <button className="link" onClick={() => setSelId(null)}>
              Cerrar ×
            </button>
          </div>
          <ReservaPanel key={sel.id} res={sel} />
        </div>
      )}

      {form && (
        <ReservaForm
          mode="new"
          roomN={form.roomN}
          checkIn={form.checkIn}
          onClose={() => setForm(null)}
          onSave={(r) => {
            update((d) => A.saveReservation(d, r));
            setForm(null);
            setSelId(r.id);
            ui.notify(`Reserva creada · ${r.guest.name}, Hab. ${r.roomN}`);
          }}
        />
      )}
    </div>
  );
}
