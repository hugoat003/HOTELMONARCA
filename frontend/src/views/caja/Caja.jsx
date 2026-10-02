import { useState } from 'react';
import KpiCard from '../../components/KpiCard.jsx';
import DataTable from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { DEMO } from '../../config.js';
import { DENOMINATIONS } from '../../data.js';
import { fmtDateTime, fmtTime } from '../../lib/dates.js';
import { linesTotal, round2 } from '../../lib/money.js';
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
  const manager = user.role === 'gerente';
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  const report = shift && buildReport(state, shift);

  const closeShift = (counted, denominations, blind) => {
    const closed = {
      ...shift,
      closedAt: Date.now(),
      closedBy: user.id,
      counted,
      difference: round2(counted - report.cash.expected),
      ...blind,
    };
    update((d) =>
      A.closeShift(d, { counted, denominations, userId: user.id, authId: arqueo.authId, report, ...blind }),
    );
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
                onClick={() => {
                  const open = state.orders.filter((o) => o.lines.length);
                  const start = () => ui.authorize('Cerrar el turno de caja', (mgr) => setArqueo({ authId: mgr.id }));
                  if (!open.length) return start();
                  const amount = open.reduce((a, o) => a + linesTotal(o.lines), 0);
                  ui.confirm(
                    {
                      title: 'Hay cuentas abiertas',
                      message: `Quedan ${open.length} cuenta${open.length === 1 ? '' : 's'} sin cobrar por ${fmt(amount)}. Si cierras el turno, se cobrarán en el siguiente. ¿Cerrar de todos modos?`,
                      confirmLabel: 'Cerrar de todos modos',
                      danger: true,
                    },
                    start,
                  );
                }}
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
            ].map(([l, v], i) =>
              // Cierre ciego: solo gerencia ve el efectivo que debería haber
              !manager && (i === 1 || i === 4) ? (
                <KpiCard key={l} label={l} value="—" note="Lo ve gerencia" tone={i === 4 ? 'dark' : undefined} />
              ) : (
                <KpiCard key={l} label={l} value={fmt(v)} tone={i === 4 ? 'dark' : undefined} />
              ),
            )}
          </div>

          <div className="report-grid">
            <div className="card">
              <div className="card-label">Cobros por forma de pago</div>
              {report.byMethod.map((m) => (
                <div key={m.key} className="row text-md">
                  <span>
                    {m.label} <span className="panel-sub">· {m.count}</span>
                  </span>
                  <strong>{!manager && m.key === 'efectivo' ? '—' : fmt(m.amount)}</strong>
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
            <strong className={s.difference < 0 ? 'urgent' : ''} title={s.differenceNote || ''}>
              {fmt(s.difference)}
              {s.recounts > 0 && <span className="tag">recontado</span>}
            </strong>
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
            if (movement === 'salida' && amount > report.cash.expected + 0.004)
              return ui.notify('No hay tanto efectivo en caja para esa salida');
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

// Cierre ciego: primero se cuenta sin ver lo esperado; al confirmar el conteo aparece la diferencia.
// Recontar queda registrado (con el primer conteo) en el cierre y en la bitácora.
function ArqueoModal({ expected, fmt, onClose, onConfirm }) {
  const [counts, setCounts] = useState({});
  const [step, setStep] = useState('contar'); // 'contar' | 'resultado'
  const [firstCounted, setFirstCounted] = useState(null);
  const [recounts, setRecounts] = useState(0);
  const [note, setNote] = useState('');
  const counted = round2(DENOMINATIONS.reduce((a, d) => a + d * (parseInt(counts[d]) || 0), 0));
  const diff = round2(counted - expected);
  const needsNote = step === 'resultado' && diff !== 0 && !note.trim();

  if (step === 'resultado')
    return (
      <Modal
        title="Resultado del arqueo"
        onClose={onClose}
        width={520}
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setRecounts(recounts + 1);
                setStep('contar');
              }}
            >
              Volver a contar
            </button>
            <button
              className="btn btn-primary"
              disabled={needsNote}
              onClick={() => onConfirm(counted, counts, { firstCounted, recounts, note: note.trim() })}
            >
              {needsNote ? 'Explica la diferencia' : 'Cerrar turno'}
            </button>
          </>
        }
      >
        <div className="kv">
          <span>Contado</span>
          <strong>{fmt(counted)}</strong>
          <span>Esperado por el sistema</span>
          <strong>{fmt(expected)}</strong>
        </div>
        <div className={'arqueo-result' + (diff === 0 ? ' ok' : ' off')}>
          {diff === 0 ? 'La caja cuadra' : `${diff > 0 ? 'Sobrante' : 'Faltante'} de ${fmt(Math.abs(diff))}`}
        </div>
        {recounts > 0 && (
          <div className="panel-sub text-sm">
            Recontado {recounts} {recounts === 1 ? 'vez' : 'veces'} · primer conteo {fmt(firstCounted)}. Queda en la
            bitácora.
          </div>
        )}
        {diff !== 0 && (
          <Field label="Explicación de la diferencia">
            <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
      </Modal>
    );

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
          <button
            className="btn btn-primary"
            onClick={() => {
              if (firstCounted === null) setFirstCounted(counted);
              setStep('resultado');
            }}
          >
            Confirmar conteo · {fmt(counted)}
          </button>
        </>
      }
    >
      <div className="panel-sub text-sm">
        Cuenta el efectivo por denominación. El monto esperado se muestra al confirmar el conteo.
      </div>
      <div className="denoms">
        {DENOMINATIONS.map((d) => (
          <label key={d} className="denom">
            <span>{d >= 1 ? fmt(d).replace('.00', '') : fmt(d)}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
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
        <span>Total contado</span>
        <strong>{fmt(counted)}</strong>
      </div>
      {DEMO && (
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
      )}
    </Modal>
  );
}
