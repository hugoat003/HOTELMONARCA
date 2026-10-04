import { addDays, addMonths, fmtDate, today } from '@shared/dates.js';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

// Calendario mensual de eventos. month: 'YYYY-MM-01'. Tocar un día vacío crea un evento.
export default function EventCalendar({ events, venues, month, onMonth, selectedId, onSelect, onNew }) {
  const d0 = today();
  // Desde el lunes de la semana del día 1 hasta el domingo de la semana del último día
  const first = new Date(month + 'T12:00');
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(month, -offset);
  const last = addDays(addMonths(month, 1), -1);
  const lastOffset = 6 - ((new Date(last + 'T12:00').getDay() + 6) % 7);
  const end = addDays(last, lastOffset);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const venueName = (id) => venues.find((v) => v.id === id)?.name || 'Restaurante';

  return (
    <div className="ev-cal">
      <div className="row items-center">
        <div className="chips">
          <button className="chip small" onClick={() => onMonth(addMonths(month, -1))}>
            ‹ Mes
          </button>
          <button className="chip small" onClick={() => onMonth(d0.slice(0, 8) + '01')}>
            Hoy
          </button>
          <button className="chip small" onClick={() => onMonth(addMonths(month, 1))}>
            Mes ›
          </button>
        </div>
        <strong className="ev-cal-title">{fmtDate(month, { month: 'long', year: 'numeric' })}</strong>
      </div>
      <div className="ev-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="ev-weekday">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const dayEvents = events.filter((e) => e.date === d).sort((a, b) => a.start.localeCompare(b.start));
          const outside = d.slice(0, 7) !== month.slice(0, 7);
          return (
            <div
              key={d}
              className={'ev-day' + (outside ? ' outside' : '') + (d === d0 ? ' today' : '') + (d < d0 ? ' past' : '')}
            >
              <button
                className="ev-day-num"
                disabled={d < d0}
                title={d < d0 ? '' : 'Nuevo evento este día'}
                onClick={() => onNew(d)}
              >
                {Number(d.slice(8))}
              </button>
              {dayEvents.map((e) => (
                <button
                  key={e.id}
                  className={'ev-chip status-' + e.status + (selectedId === e.id ? ' selected' : '')}
                  onClick={() => onSelect(e)}
                  title={`${e.name} · ${e.start}–${e.end} · ${venueName(e.venueId)}`}
                >
                  <span>{e.start}</span> {e.name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
