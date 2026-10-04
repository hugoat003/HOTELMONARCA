import { useState } from 'react';
import KpiCard from '../../components/KpiCard.jsx';
import Tabs from '../../components/Tabs.jsx';
import DataTable from '../../components/DataTable.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { METHOD_LABELS } from '@shared/data.js';
import { dateOf, fmtDate, fmtDateTime, fmtTime } from '@shared/dates.js';
import { buildReport } from '@shared/report.js';
import { ReportDoc } from '../../print/Docs.jsx';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';
import RangeReport from './RangeReport.jsx';

const BAR_COLORS = ['#1B1917', '#6F675E', '#B8B0A6', '#D6CFC4'];

export default function Reporte({ go }) {
  const [tab, setTab] = usePersisted('reporte.pestana', 'turno');
  return (
    <div className="report">
      <Tabs
        tabs={[
          ['turno', 'Por turno'],
          ['rango', 'Por fechas'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'rango' ? <RangeReport /> : <ShiftReport go={go} />}
    </div>
  );
}

function ShiftReport({ go }) {
  const { state, fmt } = useStore();
  const ui = useUI();
  const shifts = [...(state.shift ? [state.shift] : []), ...state.shiftHistory];
  const [shiftId, setShiftId] = useState(shifts[0]?.id);
  const shift = shifts.find((s) => s.id === shiftId) || shifts[0];

  if (!shift)
    return (
      <div className="empty-state">
        <div>No hay turnos registrados.</div>
        <button className="btn btn-primary" onClick={() => go('caja')}>
          Ir a caja
        </button>
      </div>
    );

  const r = shift.closedAt ? shift.report : buildReport(state, shift);
  const kpis = [
    ['Ventas restaurante', fmt(r.restTotal), 'Sin propinas'],
    ['Cuentas cobradas', String(r.restCount), 'Ticket promedio ' + fmt(r.avgTicket)],
    ['Ocupación', r.hotel.occupancy + '%', `${r.hotel.occupied} de ${r.hotel.rooms} habitaciones`],
    ['Ingreso hospedaje', fmt(r.hotel.lodgingRevenue), 'Noche del día'],
    ['ADR', fmt(r.hotel.adr), 'Tarifa promedio por habitación ocupada'],
    ['RevPAR', fmt(r.hotel.revpar), 'Ingreso por habitación disponible'],
    ['Llegadas / Salidas', `${r.hotel.arrivals} / ${r.hotel.departures}`, 'Movimientos del día'],
    ['Producción total', fmt(r.production), 'Restaurante + hospedaje + eventos + tienda'],
  ];

  return (
    <>
      <div className="report-head">
        <div>
          <div className="report-title">Reporte Diario de Producción</div>
          <div className="panel-sub text-md">
            {shift.closedAt
              ? `Turno cerrado · ${fmtDateTime(shift.closedAt)}`
              : 'Turno abierto · se actualiza en tiempo real'}
          </div>
        </div>
        <div className="report-actions">
          <select className="input" value={shift.id} onChange={(e) => setShiftId(e.target.value)}>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.closedAt ? '' : 'En curso · '}
                {fmtDate(dateOf(s.openedAt), { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                {fmtTime(s.openedAt)}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() => ui.preview('Reporte de producción', <ReportDoc report={r} shift={shift} />, { wide: true })}
          >
            Imprimir
          </button>
          {!shift.closedAt && (
            <button className="btn btn-primary" onClick={() => go('caja')}>
              Cerrar caja
            </button>
          )}
        </div>
      </div>

      <div className="kpis">
        {kpis.map(([label, value, note]) => (
          <KpiCard key={label} label={label} value={value} note={note} />
        ))}
      </div>

      <BreakdownCards r={r} />

      <DataTable title="Cobros del turno" columns={['Hora', 'Cuenta', 'Forma de pago', 'Total']}>
        {r.sales.map((s) => (
          <div key={s.id} className={'tx-row' + (s.status === 'anulada' ? ' voided' : '')}>
            <span className="panel-sub">{fmtTime(s.ts)}</span>
            <span>{s.ref}</span>
            <span>{s.payments.map((p) => METHOD_LABELS[p.method]).join(' + ')}</span>
            <strong>{fmt(s.grand)}</strong>
          </div>
        ))}
      </DataTable>
    </>
  );
}

// Formas de pago, categorías, más vendidos y controles (compartido por turno y por fechas)
export function BreakdownCards({ r }) {
  const { fmt } = useStore();
  const maxCat = Math.max(1, ...r.byCategory.map((c) => c.amount));
  const methodTotal = Math.max(
    1,
    r.byMethod.reduce((a, m) => a + Math.max(0, m.amount), 0),
  );
  return (
    <div className="report-grid three">
      <div className="card">
        <div className="card-label">Cobros por forma de pago</div>
        {r.byMethod.map((m, i) => (
          <div key={m.key} className="stack-tight gap-6">
            <div className="row text-md">
              <span>
                {m.label} <span className="panel-sub">· {m.count}</span>
              </span>
              <strong>{fmt(m.amount)}</strong>
            </div>
            <div className="bar">
              <div style={{ background: BAR_COLORS[i], width: (m.amount / methodTotal) * 100 + '%' }} />
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-label">Ventas por categoría</div>
        {r.byCategory.map((c) => (
          <div key={c.cat} className="stack-tight gap-6">
            <div className="row text-md">
              <span>{c.cat}</span>
              <strong>{fmt(c.amount)}</strong>
            </div>
            <div className="bar">
              <div style={{ background: '#1B1917', width: (c.amount / maxCat) * 100 + '%' }} />
            </div>
          </div>
        ))}
        {!r.byCategory.length && <div className="panel-sub">Sin ventas.</div>}
      </div>
      <div className="card gap-10">
        <div className="card-label">Más vendidos</div>
        {r.topItems.map((t, i) => (
          <div key={t.name} className="row text-md">
            <span>
              <span className="panel-sub">{i + 1}.</span> {t.name}
            </span>
            <strong>{t.qty}</strong>
          </div>
        ))}
        <div className="card-label mt-8">Control</div>
        <div className="row text-md">
          <span>Descuentos</span>
          <strong>{fmt(r.discounts)}</strong>
        </div>
        <div className="row text-md">
          <span>Cortesías · {r.courtesies?.count || 0}</span>
          <strong>{fmt(r.courtesies?.amount)}</strong>
        </div>
        <div className="row text-md">
          <span>Propinas</span>
          <strong>{fmt(r.tips)}</strong>
        </div>
        <div className="row text-md">
          <span>Platillos anulados · {r.voids.lines}</span>
          <strong>{fmt(r.voids.linesAmount)}</strong>
        </div>
        <div className="row text-md">
          <span>Comprobantes anulados · {r.voids.sales}</span>
          <strong>{fmt(r.voids.salesAmount)}</strong>
        </div>
        <div className="row text-md">
          <span>Cobros de eventos · {r.events?.count || 0}</span>
          <strong>{fmt(r.events?.collected)}</strong>
        </div>
        <div className="row text-md">
          <span>Tienda · {r.shop?.count || 0} ventas</span>
          <strong>{fmt(r.shop?.total)}</strong>
        </div>
      </div>
    </div>
  );
}
