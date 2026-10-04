// Modales del panel de reserva: cambio de habitación y cierre (no-show / cancelación) con devolución
import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { METHOD_LABELS } from '../../data.js';
import { today } from '../../lib/dates.js';
import { isAvailable } from '../../lib/hotel.js';
import { round2 } from '../../lib/money.js';
import { useStore } from '../../store/store.jsx';

export function ChangeRoomModal({ res, onClose, onConfirm }) {
  const { state, fmt } = useStore();
  const d0 = today();
  const [roomN, setRoomN] = useState('');
  const [applyNew, setApplyNew] = useState(false);
  const typeOf = (n) => state.roomTypes.find((t) => t.id === state.rooms.find((r) => r.n === n)?.typeId);
  const options = state.rooms.filter(
    (r) => r.n !== res.roomN && r.hk === 'limpia' && isAvailable(state.reservations, r.n, d0, res.checkOut, res.id),
  );
  const fixed = res.pricing !== 'auto';
  const newRate = roomN ? typeOf(roomN)?.rate : 0;
  return (
    <Modal
      title={`Cambiar de habitación · ${res.guest.name}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!roomN}
            onClick={() => onConfirm({ roomN, newRate: fixed && applyNew ? newRate : null })}
          >
            {roomN ? `Pasar a la ${roomN}` : 'Elige la habitación'}
          </button>
        </>
      }
    >
      <div className="panel-sub text-sm">
        Libres y limpias hasta el {res.checkOut}. La habitación {res.roomN} pasará a limpieza.
      </div>
      {options.length ? (
        <div className="chips">
          {options.map((r) => (
            <button key={r.n} className={'chip' + (roomN === r.n ? ' active' : '')} onClick={() => setRoomN(r.n)}>
              {r.n} · {typeOf(r.n)?.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="note-box">No hay habitaciones libres y limpias para las noches restantes.</div>
      )}
      {roomN &&
        (fixed ? (
          <div className="stack-tight gap-8">
            <label className="check">
              <input type="radio" checked={!applyNew} onChange={() => setApplyNew(false)} />
              <span>Mantener la tarifa pactada ({fmt(res.rate)})</span>
            </label>
            <label className="check">
              <input type="radio" checked={applyNew} onChange={() => setApplyNew(true)} />
              <span>Aplicar la tarifa de la nueva habitación desde hoy ({fmt(newRate)})</span>
            </label>
          </div>
        ) : (
          <div className="panel-sub text-sm">Desde hoy el precio sigue al tipo de la nueva habitación.</div>
        ))}
    </Modal>
  );
}

// mode: 'noshow' | 'cancel' | 'evento'. onConfirm({ reason, refund: { amount, method } | null })
// subject: texto de lo que se cancela (para eventos); con una reserva se arma solo
export function CloseReservationModal({ res, subject, mode, paid, onClose, onConfirm }) {
  const label = { noshow: 'Marcar no-show', cancel: 'Cancelar reserva', evento: 'Cancelar evento' }[mode];
  const { fmt } = useStore();
  const [reason, setReason] = useState(mode === 'noshow' ? 'No se presentó' : '');
  const [refundMode, setRefundMode] = useState('retener');
  const [amount, setAmount] = useState(String(paid));
  const [method, setMethod] = useState('efectivo');
  const n = round2(parseFloat(amount) || 0);
  const problem = !reason.trim()
    ? 'Falta el motivo'
    : refundMode === 'devolver' && (n <= 0 || n > paid + 0.004)
      ? 'Monto de devolución inválido'
      : '';
  return (
    <Modal
      title={label}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Volver
          </button>
          <button
            className="btn btn-primary btn-danger"
            disabled={!!problem}
            onClick={() =>
              onConfirm({ reason: reason.trim(), refund: refundMode === 'devolver' ? { amount: n, method } : null })
            }
          >
            {problem || label}
          </button>
        </>
      }
    >
      <div className="panel-sub text-md">
        {subject || `${res.guest.name} · Hab. ${res.roomN}. La habitación queda libre para esas fechas.`}
      </div>
      {mode !== 'noshow' && (
        <Field label="Motivo">
          <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      {paid > 0 ? (
        <>
          <div className="row text-md">
            <span>Anticipo pagado</span>
            <strong>{fmt(paid)}</strong>
          </div>
          <label className="check">
            <input type="radio" checked={refundMode === 'retener'} onChange={() => setRefundMode('retener')} />
            <span>Retener el anticipo como penalidad</span>
          </label>
          <label className="check">
            <input type="radio" checked={refundMode === 'devolver'} onChange={() => setRefundMode('devolver')} />
            <span>Devolver</span>
          </label>
          {refundMode === 'devolver' && (
            <div className="form-grid two">
              <Field label="Monto a devolver">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Forma de devolución">
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {['efectivo', 'tarjeta', 'transferencia'].map((k) => (
                    <option key={k} value={k}>
                      {METHOD_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </>
      ) : (
        <div className="panel-sub text-sm">La reserva no tiene anticipo.</div>
      )}
    </Modal>
  );
}
