import { useState } from 'react';
import KpiCard from '../../components/KpiCard.jsx';
import DataTable from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { DENOMINATIONS } from '../../data.js';
import { fmtDateTime, fmtTime } from '../../lib/dates.js';
import { round2 } from '../../lib/money.js';
import { buildReport } from '../../lib/report.js';
import { ReportDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

export default function Caja() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [float, setFloat] = useState('1000');
  const [movement, setMovement] = useState(null); // 'entrada' | 'salida'
  const [arqueo, setArqueo] = useState(false);
  const shift = state.shift;
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  const report = shift && buildReport(state, shift);

  const closeShift = (counted, denominations) => {
    const closed = {
      ...shift,
      closedAt: Date.now(),
      closedBy: user.id,
      counted,
      difference: round2(counted - report.cash.expected),
    };
    update((d) => A.closeShift(d, { counted, denominations, userId: user.id, report }));
    setArqueo(false);
    ui.notify('Turno cerrado');
    ui.preview('Reporte de cierre', <ReportDoc report={report} shift={closed} />, { wide: true });
  };

  return (
    <div className="page" style={{ gap: 22, maxWidth: 1100 }}>
      {!shift && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="report-title">Caja cerrada</div>
          <div className="panel-sub text-md">Abre un turno para poder cobrar en restaurante y recepción.</div>
          <Field label="Fondo inicial en efectivo">
            <input className="input big" type="number" value={float} onChange={(e) => setFloat(e.target.value)} />
          </Field>
          <button
            className="btn btn-primary"
            onClick={() => {
              update((d) => A.openShift(d, { float: parseFloat(float) || 0, userId: user.id }));
              ui.notify('Turno abierto');
            }}
          >
            Abrir turno
          </button>
        </div>
      )}

      {shift && (
        <>
          <div className="report-head">
            <div>
              <div className="report-title">Turno en curso</div>
              <div className="panel-sub text-md">
                Abierto {fmtDateTime(shift.openedAt)} por {userName(shift.openedBy)}
              </div>
            </div>
            <div className="report-actions">
              <button className="btn" onClick={() => setMovement('entrada')}>
                Entrada de efectivo
              </button>
              <button className="btn" onClick={() => setMovement('salida')}>
                Salida de efectivo
              </button>
              <button
                className="btn btn-primary"
                onClick={() => ui.authorize('Cerrar el turno de caja', () => setArqueo(true))}
              >
                Cerrar turno
              </button>
            </div>
          </div>

          <div className="kpis five">
            {[
              ['Fondo inicial', report.cash.float],
              ['Cobros en efectivo', report.cash.cashSales],
              ['Entradas', report.cash.entradas],
              ['Salidas', report.cash.salidas],
              ['Efectivo esperado', report.cash.expected],
            ].map(([l, v], i) => (
              <KpiCard key={l} label={l} value={fmt(v)} tone={i === 4 ? 'dark' : undefined} />
            ))}
          </div>

          <div className="report-grid">
            <div className="card">
              <div className="card-label">Cobros por forma de pago</div>
              {report.byMethod.map((m) => (
                <div key={m.key} className="row text-md">
                  <span>
                    {m.label} <span className="panel-sub">· {m.count}</span>
                  </span>
                  <strong>{fmt(m.amount)}</strong>
                </div>
              ))}
            </div>
            <DataTable title="Movimientos de efectivo">
              {shift.movements.map((m) => (
                <div key={m.id} className="tx-row voids">
                  <span className="panel-sub">{fmtTime(m.ts)}</span>
                  <span>{m.reason}</span>
                  <span className="panel-sub">
                    {m.type === 'entrada' ? 'Entrada' : 'Salida'} · {userName(m.userId)}
                  </span>
                  <strong>
                    {m.type === 'salida' ? '− ' : ''}
                    {fmt(m.amount)}
                  </strong>
                </div>
              ))}
              {!shift.movements.length && <div className="panel-sub">Sin movimientos.</div>}
            </DataTable>
          </div>
        </>
      )}

      <DataTable
        title="Cierres anteriores"
        variant="shifts"
        columns={['Apertura', 'Cierre', 'Cerró', 'Esperado', 'Contado', 'Diferencia', '']}
      >
        {state.shiftHistory.map((s) => (
          <div key={s.id} className="tx-row shifts">
            <span>{fmtDateTime(s.openedAt)}</span>
            <span>{fmtDateTime(s.closedAt)}</span>
            <span className="panel-sub">{userName(s.closedBy)}</span>
            <span>{fmt(s.report.cash.expected)}</span>
            <span>{fmt(s.counted)}</span>
            <strong className={s.difference < 0 ? 'urgent' : ''}>{fmt(s.difference)}</strong>
            <button
              className="link"
              onClick={() => ui.preview('Reporte de cierre', <ReportDoc report={s.report} shift={s} />, { wide: true })}
            >
              Ver reporte
            </button>
          </div>
        ))}
        {!state.shiftHistory.length && <div className="panel-sub">Aún no hay cierres.</div>}
      </DataTable>

      {movement && (
        <MovementModal
          type={movement}
          onClose={() => setMovement(null)}
          onSave={(amount, reason) => {
            update((d) => A.addMovement(d, { type: movement, amount, reason, userId: user.id }));
            setMovement(null);
            ui.notify(`${movement === 'entrada' ? 'Entrada' : 'Salida'} registrada · ${fmt(amount)}`);
          }}
        />
      )}
      {arqueo && (
        <ArqueoModal
          expected={report.cash.expected}
          fmt={fmt}
          onClose={() => setArqueo(false)}
          onConfirm={closeShift}
        />
      )}
    </div>
  );
}

function MovementModal({ type, onClose, onSave }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const n = parseFloat(amount) || 0;
  const presets =
    type === 'salida'
      ? ['Compra de insumos', 'Pago a proveedor', 'Propinas a meseros', 'Retiro a caja fuerte']
      : ['Cambio / sencillo', 'Reposición de fondo'];
  return (
    <Modal
      title={type === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo'}
      onClose={onClose}
      width={440}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={n <= 0 || !reason.trim()}
            onClick={() => onSave(n, reason.trim())}
          >
            Registrar
          </button>
        </>
      }
    >
      <Field label="Monto">
        <input
          className="input big"
          type="number"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Motivo">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="chips">
        {presets.map((p) => (
          <button key={p} className="chip small" onClick={() => setReason(p)}>
            {p}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ArqueoModal({ expected, fmt, onClose, onConfirm }) {
  const [counts, setCounts] = useState({});
  const counted = round2(DENOMINATIONS.reduce((a, d) => a + d * (parseInt(counts[d]) || 0), 0));
  const diff = round2(counted - expected);
  return (
    <Modal
      title="Arqueo de caja"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(counted, counts)}>
            Cerrar turno
          </button>
        </>
      }
    >
      <div className="panel-sub text-sm">Cuenta el efectivo por denominación.</div>
      <div className="denoms">
        {DENOMINATIONS.map((d) => (
          <label key={d} className="denom">
            <span>{d >= 1 ? fmt(d).replace('.00', '') : fmt(d)}</span>
            <input
              className="input"
              type="number"
              min="0"
              placeholder="0"
              value={counts[d] || ''}
              onChange={(e) => setCounts({ ...counts, [d]: e.target.value })}
            />
            <span className="panel-sub">{fmt(d * (parseInt(counts[d]) || 0))}</span>
          </label>
        ))}
      </div>
      <div className="summary-bar">
        <span>
          Esperado <strong>{fmt(expected)}</strong>
        </span>
        <span>
          Contado <strong>{fmt(counted)}</strong>
        </span>
        <span className={diff === 0 ? '' : 'urgent'}>
          {diff === 0 ? 'Cuadra' : diff > 0 ? 'Sobrante' : 'Faltante'} <strong>{fmt(Math.abs(diff))}</strong>
        </span>
      </div>
      <button
        className="link"
        onClick={() => {
          // llena el arqueo con el monto esperado usando billetes grandes primero
          let rest = Math.round(expected * 100);
          const c = {};
          for (const d of DENOMINATIONS) {
            const cents = Math.round(d * 100);
            const n = Math.floor(rest / cents);
            if (n) {
              c[d] = String(n);
              rest -= n * cents;
            }
          }
          setCounts(c);
        }}
      >
        Llenar con el monto esperado (demo)
      </button>
    </Modal>
  );
}
