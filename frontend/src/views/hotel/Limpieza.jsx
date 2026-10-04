import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { HK_LABELS, ROOM_COLORS } from '@shared/data.js';
import { fmtDate, today } from '@shared/dates.js';
import { roomState } from '@shared/hotel.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

export default function Limpieza() {
  const { state, update } = useStore();
  const ui = useUI();
  const [filter, setFilter] = useState('todas');
  const d0 = today();

  const rows = state.rooms
    .map((room) => {
      const st = roomState(room, state.reservations, d0);
      const next = state.reservations
        .filter((r) => r.roomN === room.n && r.status === 'reservada' && r.checkOut > d0)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
      return { room, st, next };
    })
    .filter(({ room }) => filter === 'todas' || room.hk === filter);

  const count = (hk) => state.rooms.filter((r) => r.hk === hk).length;

  const setHk = (n, hk) => {
    update((d) => A.setHk(d, n, hk));
    ui.notify(`Habitación ${n}: ${HK_LABELS[hk].toLowerCase()}`);
  };

  return (
    <div className="page gap-20">
      <div className="chips">
        {[['todas', 'Todas', state.rooms.length], ...Object.entries(HK_LABELS).map(([k, l]) => [k, l, count(k)])].map(
          ([k, l, n]) => (
            <button key={k} className={'chip' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>
              {l} · {n}
            </button>
          ),
        )}
      </div>

      <DataTable variant="hk" columns={['Hab.', 'Tipo', 'Ocupación', 'Próxima llegada', 'Limpieza']}>
        {rows.map(({ room, st, next }) => (
          <div key={room.n} className="tx-row hk">
            <strong>{room.n}</strong>
            <span className="panel-sub">{state.roomTypes.find((t) => t.id === room.typeId)?.name}</span>
            <span>{st.status === 'ocupada' ? `Ocupada · ${st.res.guest.name}` : ROOM_COLORS[st.status][4]}</span>
            <span className={next?.checkIn <= d0 ? 'urgent' : 'panel-sub'}>
              {next ? (next.checkIn <= d0 ? 'Hoy · ' : fmtDate(next.checkIn) + ' · ') + next.guest.name : '—'}
            </span>
            <span className="segmented row hk-seg">
              {Object.entries(HK_LABELS).map(([k, l]) => (
                <button
                  key={k}
                  className={'seg-btn' + (room.hk === k ? ' active' : '')}
                  onClick={() => room.hk !== k && setHk(room.n, k)}
                >
                  {l.replace(' de servicio', '')}
                </button>
              ))}
            </span>
          </div>
        ))}
        {!rows.length && <div className="panel-sub pad-12">No hay habitaciones en este estado.</div>}
      </DataTable>
    </div>
  );
}
