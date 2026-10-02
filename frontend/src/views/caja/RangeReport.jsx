import BarChart from '../../components/BarChart.jsx';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { METHOD_LABELS } from '../../data.js';
import { addDays, fmtDate, fmtDateTime, today } from '../../lib/dates.js';
import { exportXlsx } from '../../lib/excel.js';
import { buildRangeReport } from '../../lib/report.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';
import { BreakdownCards } from './Reporte.jsx';

const KIND = { restaurante: 'Restaurante', hotel: 'Hotel', evento: 'Evento', tienda: 'Tienda' };

// Rangos rápidos
export function preset(key) {
  const d0 = today();
  const first = d0.slice(0, 8) + '01';
  if (key === 'hoy') return [d0, d0];
  if (key === 'ayer') return [addDays(d0, -1), addDays(d0, -1)];
  if (key === '7') return [addDays(d0, -6), d0];
  if (key === '30') return [addDays(d0, -29), d0];
  if (key === 'mes') return [first, d0];
  if (key === 'mes-pasado') {
    const lastPrev = addDays(first, -1);
    return [lastPrev.slice(0, 8) + '01', lastPrev];
  }
  return null;
}
export const PRESETS = [
  ['hoy', 'Hoy'],
  ['ayer', 'Ayer'],
  ['7', 'Últimos 7 días'],
  ['30', 'Últimos 30 días'],
  ['mes', 'Este mes'],
  ['mes-pasado', 'Mes pasado'],
];

export default function RangeReport() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [range, setRange] = usePersisted('reporte.rango', { key: '7', from: '', to: '' });
  const [from, to] = preset(range.key) || [range.from || today(), range.to || today()];
  const r = buildRangeReport(state, from, to);
  const short = (d) => fmtDate(d, { day: 'numeric', month: 'short' });
  const compact = (n) => (n >= 1000 ? `Q${Math.round(n / 100) / 10}k` : `Q${Math.round(n)}`);
  const todayIdx = r.series.findIndex((x) => x.day === today());
  const lastIdx = todayIdx >= 0 ? todayIdx : r.series.length - 1;

  const exportExcel = () =>
    exportXlsx(`Monarca reporte ${from} a ${to}`, [
      {
        name: 'Resumen',
        rows: [
          ['Ventas restaurante', r.restTotal],
          ['Cuentas cobradas', r.restCount],
          ['Ticket promedio', r.avgTicket],
          ['Propinas', r.tips],
          ['Descuentos', r.discounts],
          ['Cortesías', r.courtesies.amount],
          ['Ocupación promedio %', r.hotel.occupancy],
          ['Noches ocupadas', r.hotel.roomNights],
          ['Ingreso hospedaje', r.hotel.lodgingRevenue],
          ['ADR', r.hotel.adr],
          ['RevPAR', r.hotel.revpar],
          ['Eventos cobrados', r.events.collected],
          ['Tienda', r.shop.total],
          ['Producción total', r.production],
        ].map(([Concepto, Valor]) => ({ Concepto, Valor })),
      },
      {
        name: 'Por día',
        rows: r.series.map((x) => ({
          Fecha: x.day,
          'Ventas restaurante y tienda': x.sales,
          'Ocupación %': x.occupancy ?? '',
        })),
      },
      {
        name: 'Por mesero',
        rows: r.byWaiter.map((w) => ({
          Mesero: w.name,
          Cuentas: w.count,
          Total: w.total,
          'Ticket promedio': w.avg,
          'Propinas generadas': w.tips,
          'Propinas que le corresponden': w.tipShare,
        })),
      },
      { name: 'Por categoría', rows: r.byCategory.map((c) => ({ Categoría: c.cat, Total: c.amount })) },
      {
        name: 'Cobros',
        rows: r.sales.map((s) => ({
          No: s.number,
          Fecha: fmtDateTime(s.ts),
          Tipo: KIND[s.kind] || s.kind,
          Cuenta: s.ref,
          'Forma de pago': s.payments.map((p) => METHOD_LABELS[p.method]).join(' + '),
          Total: s.total,
          Propina: s.tip || 0,
          Cobrado: s.grand,
          Estado: s.status === 'ok' ? 'Cobrado' : 'Anulado',
        })),
      },
    ]).then(() => ui.notify('Reporte descargado en Excel'));

  return (
    <>
      <div className="report-head">
        <div>
          <div className="report-title">Reporte por fechas</div>
          <div className="panel-sub text-md">
            {fmtDate(from, { day: 'numeric', month: 'long', year: 'numeric' })}
            {from !== to ? ` – ${fmtDate(to, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''} · {r.days} día
            {r.days === 1 ? '' : 's'}
          </div>
        </div>
        <div className="report-actions">
          <button className="btn" onClick={exportExcel}>
            Exportar a Excel
          </button>
        </div>
      </div>

      <div className="chips">
        {PRESETS.map(([k, l]) => (
          <button
            key={k}
            className={'chip small' + (range.key === k ? ' active' : '')}
            onClick={() => setRange({ ...range, key: k })}
          >
            {l}
          </button>
        ))}
        <button
          className={'chip small' + (range.key === 'libre' ? ' active' : '')}
          onClick={() => setRange({ key: 'libre', from, to })}
        >
          Personalizado
        </button>
      </div>
      {range.key === 'libre' && (
        <div className="form-grid four">
          <Field label="Desde">
            <input
              className="input"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
          </Field>
          <Field label="Hasta">
            <input
              className="input"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
        </div>
      )}

      <div className="kpis">
        <KpiCard
          label="Ventas restaurante"
          value={fmt(r.restTotal)}
          note={`${r.restCount} cuentas · ticket ${fmt(r.avgTicket)}`}
        />
        <KpiCard
          label="Ocupación promedio"
          value={r.hotel.occupancy + '%'}
          note={`${r.hotel.roomNights} noches ocupadas`}
        />
        <KpiCard label="Ingreso hospedaje" value={fmt(r.hotel.lodgingRevenue)} />
        <KpiCard
          label="Producción total"
          value={fmt(r.production)}
          note="Restaurante, hospedaje, eventos y tienda"
          tone="dark"
        />
        <KpiCard label="ADR" value={fmt(r.hotel.adr)} note="Tarifa promedio por noche ocupada" />
        <KpiCard label="RevPAR" value={fmt(r.hotel.revpar)} note="Ingreso por habitación disponible" />
        <KpiCard label="Tienda" value={fmt(r.shop.total)} note={`${r.shop.count} ventas`} />
        <KpiCard label="Eventos cobrados" value={fmt(r.events.collected)} note={`${r.events.count} pagos`} />
      </div>

      {r.series.length > 1 && (
        <div className="report-grid">
          <div className="card">
            <BarChart
              title="Ventas por día"
              data={r.series.map((x) => ({ label: short(x.day), tooltipLabel: fmtDate(x.day), value: x.sales }))}
              format={fmt}
              axisFormat={compact}
              highlight={lastIdx}
            />
          </div>
          <div className="card">
            <BarChart
              title="Ocupación por día"
              data={r.series.map((x) => ({ label: short(x.day), tooltipLabel: fmtDate(x.day), value: x.occupancy }))}
              format={(v) => `${v}%`}
              highlight={lastIdx}
            />
          </div>
        </div>
      )}

      <div className="row items-center">
        <span className="card-label">Ventas por mesero y propinas</span>
        <div className="segmented row two" style={{ width: 340 }}>
          {[
            ['propio', 'Cada quien sus propinas'],
            ['iguales', 'Partes iguales'],
          ].map(([k, l]) => (
            <button
              key={k}
              className={'seg-btn' + (r.tipSplit === k ? ' active' : '')}
              onClick={() => update((d) => A.setConfig(d, { tipSplit: k }))}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <DataTable
        variant="waiters"
        columns={['Mesero', 'Cuentas', 'Total vendido', 'Ticket promedio', 'Propinas generadas', 'Le corresponde']}
        empty="Sin ventas en estas fechas."
      >
        {r.byWaiter.map((w) => (
          <div key={w.waiterId} className={rowClass('waiters')}>
            <strong>{w.name}</strong>
            <span>{w.count}</span>
            <span>{fmt(w.total)}</span>
            <span>{fmt(w.avg)}</span>
            <span>{fmt(w.tips)}</span>
            <strong>{fmt(w.tipShare)}</strong>
          </div>
        ))}
      </DataTable>

      <BreakdownCards r={r} />
    </>
  );
}
