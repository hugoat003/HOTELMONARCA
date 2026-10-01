import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { METHOD_LABELS } from '../../data.js';
import { fmtDateTime, fmtTime } from '../../lib/dates.js';
import { sum } from '../../lib/money.js';
import { TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

export default function Ventas() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [scope, setScope] = useState('turno');
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');

  const sales = state.sales
    .filter((s) => scope === 'todas' || s.shiftId === state.shift?.id)
    .sort((a, b) => b.ts - a.ts);
  const ok = sales.filter((s) => s.status === 'ok');
  const voids = state.voids.filter((v) => scope === 'todas' || v.shiftId === state.shift?.id).sort((a, b) => b.ts - a.ts);
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  const doVoid = () => {
    const s = voiding;
    ui.authorize(`Anular la factura #${s.number}`, (mgr) => {
      update((d) => A.voidSale(d, s.id, { reason: reason.trim(), authId: mgr.id }));
      setVoiding(null);
      setReason('');
      ui.notify(`Factura #${s.number} anulada`);
    });
  };

  return (
    <div className="page gap-20">
      <div className="row items-center">
        <div className="segmented row two" style={{ width: 280 }}>
          <button className={'seg-btn' + (scope === 'turno' ? ' active' : '')} onClick={() => setScope('turno')}>Turno actual</button>
          <button className={'seg-btn' + (scope === 'todas' ? ' active' : '')} onClick={() => setScope('todas')}>Todas</button>
        </div>
        <div className="header-stats">
          <span className="pill">{ok.length} cobros</span>
          <span className="pill">Total {fmt(sum(ok, (s) => s.grand))}</span>
        </div>
      </div>

      {scope === 'turno' && !state.shift && <div className="note-box">No hay un turno de caja abierto.</div>}

      <div className="card tx-card">
        <div className="tx-row head sales"><span>No.</span><span>Hora</span><span>Cuenta</span><span>Forma de pago</span><span>Cajero</span><span>Total</span><span /></div>
        {sales.map((s) => (
          <div key={s.id} className={'tx-row sales' + (s.status === 'anulada' ? ' voided' : '')}>
            <span className="panel-sub">#{s.number}</span>
            <span className="panel-sub">{scope === 'todas' ? fmtDateTime(s.ts) : fmtTime(s.ts)}</span>
            <span>{s.ref}{s.kind === 'hotel' && <span className="tag">Hotel</span>}{s.kind === 'evento' && <span className="tag">Evento</span>}{s.kind === 'tienda' && <span className="tag">Tienda</span>}</span>
            <span>{s.payments.map((p) => METHOD_LABELS[p.method]).join(' + ') || '—'}</span>
            <span className="panel-sub">{userName(s.cashierId)}</span>
            <strong>{fmt(s.grand)}</strong>
            <span className="row-actions">
              <button className="link" onClick={() => ui.preview(`Factura #${s.number}`, <TicketDoc sale={s} />)}>Ver</button>
              {s.status === 'ok' && (s.kind === 'restaurante' || s.kind === 'tienda') && <button className="link danger" onClick={() => setVoiding(s)}>Anular</button>}
              {s.status === 'anulada' && <span className="tag">Anulada</span>}
            </span>
          </div>
        ))}
        {!sales.length && <div className="panel-sub pad-12">Sin cobros todavía.</div>}
      </div>

      {voids.length > 0 && (
        <div className="card tx-card">
          <div className="card-label">Platillos anulados</div>
          {voids.map((v) => (
            <div key={v.id} className="tx-row voids">
              <span className="panel-sub">{fmtTime(v.ts)}</span>
              <span>{v.qty} × {v.name} · {v.ref}</span>
              <span className="panel-sub">{v.reason} · autorizó {userName(v.authId)}</span>
              <strong>{fmt(v.amount)}</strong>
            </div>
          ))}
        </div>
      )}

      {voiding && (
        <Modal title={`Anular factura #${voiding.number}`} aside={fmt(voiding.grand)} onClose={() => setVoiding(null)} width={460}
          footer={<><button className="btn" onClick={() => setVoiding(null)}>Cancelar</button><button className="btn btn-primary btn-danger" disabled={!reason.trim()} onClick={doVoid}>Anular factura</button></>}>
          <div className="note-box">
            La factura queda marcada como anulada y sale de los totales del turno.
            {voiding.payments.some((p) => p.method === 'habitacion') && ' El cargo a la habitación también se elimina del folio.'}
            {voiding.kind === 'tienda' && ' Los productos regresan a la existencia de la tienda.'}
          </div>
          <Field label="Motivo"><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. cobro duplicado" /></Field>
        </Modal>
      )}
    </div>
  );
}
