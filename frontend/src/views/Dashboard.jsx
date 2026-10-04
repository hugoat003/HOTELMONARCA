import BarChart from '../components/BarChart.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { EVENT_STATUS } from '@shared/data.js';
import { addDays, fmtDate, fmtTime, today } from '@shared/dates.js';
import { eventTotals, isActiveEvent } from '@shared/events.js';
import { roomState } from '@shared/hotel.js';
import { linesTotal, sum } from '@shared/money.js';
import { buildReminders } from '@shared/reminders.js';
import { buildReport, dailySeries } from '@shared/report.js';
import { useStore } from '../store/store.jsx';
import { usePersisted } from '../store/usePersisted.js';

// Resumen del día para gerencia. En el teléfono se muestra solo esta pantalla.
export default function Dashboard({ go, mobile = false }) {
  const { state, user, fmt } = useStore();
  const d0 = today();
  const r = state.shift ? buildReport(state, state.shift) : null;
  const [trendDays, setTrendDays] = usePersisted('resumen.tendencia', 7);
  const series = dailySeries(state, addDays(d0, -(trendDays - 1)), d0);
  const shortDay = (d) => (trendDays <= 7 ? fmtDate(d, { weekday: 'short' }) : fmtDate(d, { day: 'numeric' }));
  const link = (view) => (mobile || !go ? undefined : () => go(view));

  const openTotal = sum(state.orders, (o) => linesTotal(o.lines));
  const inHouse = state.reservations.filter((x) => x.status === 'hospedado');
  const arrivals = state.reservations.filter((x) => x.status === 'reservada' && x.checkIn === d0);
  const departures = inHouse.filter((x) => x.checkOut <= d0);
  const occupied = state.rooms.filter((rm) => roomState(rm, state.reservations, d0).status === 'ocupada').length;
  const occ = state.rooms.length ? Math.round((occupied / state.rooms.length) * 100) : 0;

  const dirty = state.rooms.filter((rm) => rm.hk === 'sucia' || rm.hk === 'limpiando');
  const events = state.events
    .filter((e) => isActiveEvent(e) && e.date >= d0 && e.date <= addDays(d0, 30))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

  const alerts = buildReminders(state, fmt);

  const methodTotal = r
    ? Math.max(
        1,
        sum(r.byMethod, (m) => m.amount),
      )
    : 1;

  return (
    <div className={'dash' + (mobile ? ' mobile' : '')}>
      <div className="dash-head">
        <div>
          <div className="dash-hello">Hola, {user.name.split(' ')[0]}</div>
          <div className="panel-sub">
            Actualizado a las {fmtTime(Date.now())}
            {r ? '' : ' · caja cerrada'}
          </div>
        </div>
      </div>

      <div className="dash-kpis">
        <KpiCard
          className="dash-kpi"
          label="Ventas restaurante"
          value={fmt(r?.restTotal || 0)}
          note={r ? `${r.restCount} cuentas · ticket ${fmt(r.avgTicket)}` : 'Sin turno abierto'}
          onClick={link('reporte')}
        />
        <KpiCard
          className="dash-kpi"
          label="Ocupación"
          value={occ + '%'}
          note={`${occupied} de ${state.rooms.length} habitaciones`}
          onClick={link('habitaciones')}
        />
        <KpiCard
          className="dash-kpi"
          label="Producción del día"
          value={fmt(r?.production || 0)}
          note="Restaurante, hospedaje, eventos y tienda"
          onClick={link('reporte')}
        />
        <KpiCard
          className="dash-kpi"
          label="Efectivo en caja"
          value={r ? fmt(r.cash.expected) : 'Cerrada'}
          note={r ? `Fondo ${fmt(r.cash.float)}` : 'Abre el turno en Caja'}
          tone="dark"
          onClick={link('caja')}
        />
      </div>

      <section className="card dash-card">
        <div className="row items-center">
          <span className="card-label">Tendencia</span>
          <div className="segmented row two" style={{ width: 200, padding: 3 }}>
            {[7, 30].map((n) => (
              <button
                key={n}
                className={'seg-btn' + (trendDays === n ? ' active' : '')}
                style={{ padding: '6px 4px' }}
                onClick={() => setTrendDays(n)}
              >
                {n} días
              </button>
            ))}
          </div>
        </div>
        <div className="dash-grid">
          <BarChart
            title="Ventas por día"
            data={series.map((x) => ({ label: shortDay(x.day), tooltipLabel: fmtDate(x.day), value: x.sales }))}
            format={fmt}
            axisFormat={(n) => (n >= 1000 ? `Q${Math.round(n / 100) / 10}k` : `Q${Math.round(n)}`)}
            highlight={series.length - 1}
            height={170}
          />
          <BarChart
            title="Ocupación por día"
            data={series.map((x) => ({ label: shortDay(x.day), tooltipLabel: fmtDate(x.day), value: x.occupancy }))}
            format={(v) => `${v}%`}
            highlight={series.length - 1}
            height={170}
          />
        </div>
      </section>

      <div className="dash-grid">
        <section className="card dash-card">
          <div className="card-label">En este momento</div>
          <DashRow
            label="Mesas ocupadas"
            value={`${state.orders.filter((o) => o.type === 'mesa').length} / ${state.tables.length}`}
            onClick={link('mesas')}
          />
          <DashRow label="Consumo abierto en mesas" value={fmt(openTotal)} onClick={link('mesas')} />
          <DashRow label="Huéspedes hospedados" value={inHouse.length} onClick={link('habitaciones')} />
          <DashRow label="Llegadas pendientes hoy" value={arrivals.length} onClick={link('habitaciones')} />
          <DashRow label="Salidas pendientes hoy" value={departures.length} onClick={link('habitaciones')} />
          <DashRow label="Habitaciones por limpiar" value={dirty.length} onClick={link('limpieza')} />
          <DashRow label="Ventas de la tienda (turno)" value={fmt(r?.shop?.total || 0)} onClick={link('tienda')} />
        </section>

        <section className="card dash-card">
          <div className="card-label">Pendientes · {alerts.length}</div>
          {alerts.map((a, i) => (
            <button key={i} className={'dash-alert ' + a.level} onClick={link(a.view)} disabled={!link(a.view)}>
              <span className="dash-alert-area">{a.area}</span>
              {a.text}
            </button>
          ))}
          {!alerts.length && <div className="panel-sub">Todo en orden.</div>}
        </section>

        <section className="card dash-card">
          <div className="card-label">Próximos eventos</div>
          {events.slice(0, 5).map((e) => {
            const t = eventTotals(e, state);
            return (
              <button key={e.id} className="dash-row" onClick={link('eventos')} disabled={!link('eventos')}>
                <span>
                  <strong>{e.name}</strong>
                  <span className="panel-sub">
                    {' '}
                    · {fmtDate(e.date)} {e.start} · {t.venue?.name || 'Restaurante'} · {EVENT_STATUS[e.status]}
                  </span>
                </span>
                <strong>{fmt(t.total)}</strong>
              </button>
            );
          })}
          {!events.length && <div className="panel-sub">Sin eventos en los próximos 30 días.</div>}
        </section>

        <section className="card dash-card">
          <div className="card-label">Cobros del turno por forma de pago</div>
          {r ? (
            r.byMethod.map((m, i) => (
              <div key={m.key} className="stack-tight" style={{ gap: 5 }}>
                <div className="row text-md">
                  <span>
                    {m.label} <span className="panel-sub">· {m.count}</span>
                  </span>
                  <strong>{fmt(m.amount)}</strong>
                </div>
                <div className="bar">
                  <div
                    style={{
                      background: ['#1B1917', '#6F675E', '#B8B0A6', '#D6CFC4'][i],
                      width: (m.amount / methodTotal) * 100 + '%',
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <div className="panel-sub">No hay turno abierto.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function DashRow({ label, value, onClick }) {
  return (
    <button className="dash-row" onClick={onClick} disabled={!onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}
