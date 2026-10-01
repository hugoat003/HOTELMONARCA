import { EVENT_STATUS } from '../data.js';
import { addDays, fmtDate, fmtTime, today } from '../lib/dates.js';
import { eventTotals, isActiveEvent } from '../lib/events.js';
import { folio, roomState } from '../lib/hotel.js';
import { stockStatus } from '../lib/inventory.js';
import { linesTotal, sum } from '../lib/money.js';
import { buildReport } from '../lib/report.js';
import { useStore } from '../store/store.jsx';

// Resumen del día para gerencia. En el teléfono se muestra solo esta pantalla.
export default function Dashboard({ go, mobile = false }) {
  const { state, user, fmt } = useStore();
  const d0 = today();
  const r = state.shift ? buildReport(state, state.shift) : null;
  const link = (view) => (mobile || !go ? undefined : () => go(view));

  const openTotal = sum(state.orders, (o) => linesTotal(o.lines));
  const inHouse = state.reservations.filter((x) => x.status === 'hospedado');
  const arrivals = state.reservations.filter((x) => x.status === 'reservada' && x.checkIn === d0);
  const departures = inHouse.filter((x) => x.checkOut <= d0);
  const occupied = state.rooms.filter((rm) => roomState(rm, state.reservations, d0).status === 'ocupada').length;
  const occ = state.rooms.length ? Math.round((occupied / state.rooms.length) * 100) : 0;

  const lowStock = state.inventory.filter((it) => stockStatus(it) !== 'ok');
  const shopLow = (state.shopItems || []).filter((it) => stockStatus(it) !== 'ok');
  const dirty = state.rooms.filter((rm) => rm.hk === 'sucia' || rm.hk === 'limpiando');
  const monthlyDue = inHouse
    .filter((x) => x.rateType === 'mensual')
    .map((x) => ({ res: x, due: folio(x, state.config).dueToday }))
    .filter((x) => x.due > 0.004);
  const events = state.events
    .filter((e) => isActiveEvent(e) && e.date >= d0 && e.date <= addDays(d0, 30))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const eventsDue = events.filter((e) => e.date <= addDays(d0, 7) && eventTotals(e, state).balance > 0.004);

  const alerts = [
    !state.shift && { text: 'La caja está cerrada: no se puede cobrar.', view: 'caja', level: 'high' },
    ...monthlyDue.map((x) => ({ text: `Hab. ${x.res.roomN} · ${x.res.guest.name}: pendiente de su mensualidad ${fmt(x.due)}`, view: 'habitaciones', level: 'high' })),
    ...eventsDue.map((e) => ({ text: `${e.name} (${fmtDate(e.date)}): saldo ${fmt(eventTotals(e, state).balance)}`, view: 'eventos', level: 'mid' })),
    ...lowStock.map((it) => ({ text: `${it.name}: ${it.stock <= 0 ? 'agotado' : `quedan ${it.stock} ${it.unit} (mínimo ${it.min})`}`, view: 'inventario', level: it.stock <= 0 ? 'high' : 'mid' })),
    ...shopLow.map((it) => ({ text: `Tienda · ${it.name}: ${it.stock <= 0 ? 'agotado' : `quedan ${it.stock} (mínimo ${it.min})`}`, view: 'tienda', level: it.stock <= 0 ? 'high' : 'mid' })),
    dirty.length > 0 && { text: `${dirty.length} habitación(es) por limpiar: ${dirty.map((x) => x.n).join(', ')}`, view: 'limpieza', level: 'low' },
  ].filter(Boolean);

  const methodTotal = r ? Math.max(1, sum(r.byMethod, (m) => m.amount)) : 1;

  return (
    <div className={'dash' + (mobile ? ' mobile' : '')}>
      <div className="dash-head">
        <div>
          <div className="dash-hello">Hola, {user.name.split(' ')[0]}</div>
          <div className="panel-sub">Actualizado a las {fmtTime(Date.now())}{r ? '' : ' · caja cerrada'}</div>
        </div>
      </div>

      <div className="dash-kpis">
        <Kpi label="Ventas restaurante" value={fmt(r?.restTotal || 0)} note={r ? `${r.restCount} cuentas · ticket ${fmt(r.avgTicket)}` : 'Sin turno abierto'} onClick={link('reporte')} />
        <Kpi label="Ocupación" value={occ + '%'} note={`${occupied} de ${state.rooms.length} habitaciones`} onClick={link('habitaciones')} />
        <Kpi label="Producción del día" value={fmt(r?.production || 0)} note="Restaurante, hospedaje, eventos y tienda" onClick={link('reporte')} />
        <Kpi label="Efectivo en caja" value={r ? fmt(r.cash.expected) : 'Cerrada'} note={r ? `Fondo ${fmt(r.cash.float)}` : 'Abre el turno en Caja'} dark onClick={link('caja')} />
      </div>

      <div className="dash-grid">
        <section className="card dash-card">
          <div className="card-label">En este momento</div>
          <DashRow label="Mesas ocupadas" value={`${state.orders.filter((o) => o.type === 'mesa').length} / ${state.tables.length}`} onClick={link('mesas')} />
          <DashRow label="Consumo abierto en mesas" value={fmt(openTotal)} onClick={link('mesas')} />
          <DashRow label="Huéspedes hospedados" value={inHouse.length} onClick={link('habitaciones')} />
          <DashRow label="Llegadas pendientes hoy" value={arrivals.length} onClick={link('habitaciones')} />
          <DashRow label="Salidas pendientes hoy" value={departures.length} onClick={link('habitaciones')} />
          <DashRow label="Habitaciones por limpiar" value={dirty.length} onClick={link('limpieza')} />
          <DashRow label="Ventas de la tienda (turno)" value={fmt(r?.shop?.total || 0)} onClick={link('tienda')} />
        </section>

        <section className="card dash-card">
          <div className="card-label">Alertas · {alerts.length}</div>
          {alerts.map((a, i) => (
            <button key={i} className={'dash-alert ' + a.level} onClick={link(a.view)} disabled={!link(a.view)}>{a.text}</button>
          ))}
          {!alerts.length && <div className="panel-sub">Todo en orden.</div>}
        </section>

        <section className="card dash-card">
          <div className="card-label">Próximos eventos</div>
          {events.slice(0, 5).map((e) => {
            const t = eventTotals(e, state);
            return (
              <button key={e.id} className="dash-row" onClick={link('eventos')} disabled={!link('eventos')}>
                <span><strong>{e.name}</strong><span className="panel-sub"> · {fmtDate(e.date)} {e.start} · {t.venue?.name || 'Restaurante'} · {EVENT_STATUS[e.status]}</span></span>
                <strong>{fmt(t.total)}</strong>
              </button>
            );
          })}
          {!events.length && <div className="panel-sub">Sin eventos en los próximos 30 días.</div>}
        </section>

        <section className="card dash-card">
          <div className="card-label">Cobros del turno por forma de pago</div>
          {r ? r.byMethod.map((m, i) => (
            <div key={m.key} className="stack-tight" style={{ gap: 5 }}>
              <div className="row text-md"><span>{m.label} <span className="panel-sub">· {m.count}</span></span><strong>{fmt(m.amount)}</strong></div>
              <div className="bar"><div style={{ background: ['#1B1917', '#6F675E', '#B8B0A6', '#D6CFC4'][i], width: (m.amount / methodTotal) * 100 + '%' }} /></div>
            </div>
          )) : <div className="panel-sub">No hay turno abierto.</div>}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, note, dark, onClick }) {
  return (
    <button className={'card kpi dash-kpi' + (dark ? ' dark' : '')} onClick={onClick} disabled={!onClick}>
      <div className="card-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-note">{note}</div>
    </button>
  );
}

function DashRow({ label, value, onClick }) {
  return (
    <button className="dash-row" onClick={onClick} disabled={!onClick}>
      <span>{label}</span><strong>{value}</strong>
    </button>
  );
}
