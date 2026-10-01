import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { EXTRA_CHARGES, METHOD_LABELS, RES_STATUS } from '../../data.js';
import { fmtDate, fmtTime, nightsBetween, today, uid } from '../../lib/dates.js';
import { folio as calcFolio } from '../../lib/hotel.js';
import { FolioDoc, TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import Cobro, { AmountModal } from '../restaurante/Cobro.jsx';
import ReservaForm from './ReservaForm.jsx';

// Detalle y operaciones de una reserva: check-in, folio, cargos, abonos y check-out
export default function ReservaPanel({ res }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [form, setForm] = useState(null); // 'edit' | 'checkin'
  const [charging, setCharging] = useState(false);
  const [abono, setAbono] = useState(null); // null | 'monto' | número
  const [checkout, setCheckout] = useState(false);

  const f = calcFolio(res, state.config);
  const room = state.rooms.find((r) => r.n === res.roomN);
  const type = state.roomTypes.find((t) => t.id === room?.typeId);
  const d0 = today();
  const label = `Hab. ${res.roomN} · ${res.guest.name}`;

  const needShift = () => {
    if (state.shift) return true;
    ui.notify('Abre el turno de caja para registrar pagos.');
    return false;
  };

  const baseSale = (res2) => ({
    id: uid('s'), number: state.counters.doc + 1, kind: 'hotel', ts: Date.now(), ref: label, resId: res.id,
    discount: null, tip: 0, cashierId: user.id, shiftId: state.shift.id, status: 'ok', ...res2,
  });

  const registerAbono = (amount, r) => {
    const sale = baseSale({ docType: 'recibo', lines: [{ name: res.status === 'reservada' ? 'Anticipo de reserva' : 'Abono a cuenta', qty: 1, price: amount, cat: 'Hospedaje' }], subtotal: amount, ...r });
    update((d) => A.addFolioPayment(d, res.id, sale));
    setAbono(null);
    ui.notify(`Abono registrado · ${fmt(sale.grand)}`);
    ui.preview('Recibo', <TicketDoc sale={sale} />);
  };

  const finishCheckout = (r) => {
    let sale = null;
    if (r) {
      sale = baseSale({
        lines: [
          { name: `${f.label} × ${fmt(res.rate)}`, qty: 1, price: f.lodging.base, cat: 'Hospedaje' },
          ...res.charges.map((c) => ({ name: c.desc, qty: 1, price: c.amt, cat: 'Cargos' })),
        ],
        taxes: { iva: f.lodging.iva, inguat: f.lodging.inguat }, credits: f.paid, subtotal: f.total, ...r,
      });
    }
    update((d) => A.checkOutWith(d, res.id, sale));
    setCheckout(false);
    ui.notify(`Check-out · Habitación ${res.roomN}`);
    if (sale) ui.preview('Factura de salida', <TicketDoc sale={sale} />);
  };

  const startCheckout = () => {
    if (f.balance > 0.004 && !needShift()) return;
    const usedNights = nightsBetween(res.checkIn, d0);
    if (res.checkOut > d0 && usedNights >= 1) {
      ui.confirm({
        title: 'Check-out anticipado',
        message: f.periods
          ? 'La estancia mensual se cobra hasta hoy: el último mes se prorratea por días. La salida se ajusta a hoy.'
          : `Se cobrarán ${usedNights} noche(s) hasta hoy en lugar de ${f.nights}. La salida se ajusta a hoy.`,
        confirmLabel: 'Continuar',
      }, () => { update((d) => A.saveReservation(d, { id: res.id, checkOut: d0 })); setCheckout(true); });
    } else setCheckout(true);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack-tight">
        <div className="panel-title">{res.guest.name}</div>
        <div className="panel-sub">Hab. {res.roomN} · {type?.name} · {fmt(res.rate)} / {f.periods ? 'mes' : 'noche'}{f.periods && <span className="tag">Mensual</span>}</div>
        <div className="badge" style={{ background: res.status === 'hospedado' ? '#1B1917' : '#F0ECE5', color: res.status === 'hospedado' ? '#fff' : '#1B1917' }}>
          {RES_STATUS[res.status]}
        </div>
      </div>

      <div className="kv">
        <span>Estancia</span><strong>{fmtDate(res.checkIn)} → {fmtDate(res.checkOut)} · {f.periods ? `${f.months} mes${f.months === 1 ? '' : 'es'}` : `${f.nights} noche${f.nights > 1 ? 's' : ''}`}</strong>
        <span>Personas</span><strong>{res.adults} adulto{res.adults > 1 ? 's' : ''}{res.children ? `, ${res.children} niño${res.children > 1 ? 's' : ''}` : ''}</strong>
        <span>Canal</span><strong>{res.channel}</strong>
        <span>Teléfono</span><strong>{res.guest.phone || '—'}</strong>
        <span>Documento</span><strong>{res.guest.doc || '—'}</strong>
        {res.notes && <><span>Notas</span><strong>{res.notes}</strong></>}
        {res.cancelReason && <><span>Cancelación</span><strong>{res.cancelReason}</strong></>}
      </div>

      {res.status === 'reservada' && (
        <>
          {f.paid > 0 && <div className="row"><span className="panel-sub">Anticipo</span><strong>{fmt(f.paid)}</strong></div>}
          <div className="row"><span className="panel-sub">Total estancia</span><strong>{fmt(f.total)}</strong></div>
          {res.checkIn <= d0 ? (
            room?.hk === 'limpia'
              ? <button className="btn btn-primary" onClick={() => setForm('checkin')}>Registrar llegada</button>
              : <div className="note-box">La habitación aún no está lista ({room?.hk === 'fuera' ? 'fuera de servicio' : 'en limpieza'}).</div>
          ) : <div className="note-box">Llega el {fmtDate(res.checkIn, { weekday: 'long', day: 'numeric', month: 'long' })}.</div>}
          <div className="btn-row">
            <button className="btn" onClick={() => setForm('edit')}>Editar</button>
            <button className="btn" onClick={() => needShift() && setAbono('monto')}>Anticipo</button>
          </div>
          <button className="btn btn-quiet" onClick={() => ui.confirm({ title: 'Cancelar reserva', message: `¿Cancelar la reserva de ${res.guest.name}?`, confirmLabel: 'Cancelar reserva', danger: true },
            () => { update((d) => A.cancelReservation(d, res.id, 'Cancelada por recepción')); ui.notify('Reserva cancelada'); })}>Cancelar reserva</button>
        </>
      )}

      {res.status === 'hospedado' && (
        <>
          <div className="eyebrow">Folio</div>
          <div>
            {f.periods ? f.periods.map((p) => (
              <div key={p.n} className={'folio-line' + (p.start > d0 ? ' muted' : '')}>
                <span>Mes {p.n} · {fmtDate(p.start, { day: 'numeric', month: 'short' })} – {fmtDate(p.end, { day: 'numeric', month: 'short' })}{p.frac < 1 ? ' (prorrateo)' : ''}{p.start > d0 ? ' · por iniciar' : ''}</span>
                <strong>{fmt(p.amount)}</strong>
              </div>
            )) : <div className="folio-line"><span>Hospedaje {f.nights} × {fmt(res.rate)}</span><strong>{fmt(f.lodging.base)}</strong></div>}
            <div className="folio-line muted"><span>IVA {state.config.iva}% + INGUAT {state.config.inguat}%</span><strong>{fmt(f.lodging.iva + f.lodging.inguat)}</strong></div>
            {res.charges.map((c) => (
              <div key={c.id} className="folio-line">
                <span>{c.desc}<span className="panel-sub"> · {fmtTime(c.ts)}</span>
                  {c.type === 'extra' && <button className="link danger" style={{ marginLeft: 8 }} onClick={() => ui.authorize('Eliminar un cargo del folio', () => update((d) => A.removeCharge(d, res.id, c.id)))}>quitar</button>}
                </span>
                <strong>{fmt(c.amt)}</strong>
              </div>
            ))}
            {res.payments.map((p) => (
              <div key={p.id} className="folio-line muted"><span>{p.desc} · {METHOD_LABELS[p.method]}</span><strong>− {fmt(p.amount)}</strong></div>
            ))}
          </div>
          <div className="row" style={{ fontSize: 20, fontWeight: 600 }}><span>{f.periods ? 'Saldo de la estancia' : 'Saldo'}</span><span>{fmt(f.balance)}</span></div>
          {f.dueToday !== null && (
            <div className={'note-box' + (f.dueToday > 0.004 ? ' warn' : '')}>
              {f.dueToday > 0.004
                ? <>Pendiente a hoy: <strong>{fmt(f.dueToday)}</strong> de los meses ya iniciados.</>
                : <>Al día: los meses iniciados están pagados{f.dueToday < -0.004 ? ` (saldo a favor ${fmt(-f.dueToday)})` : ''}.</>}
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setCharging(true)}>Agregar cargo</button>
            <button className="btn" onClick={() => needShift() && setAbono('monto')}>Abono</button>
          </div>
          <div className="btn-row">
            <button className="btn btn-quiet" onClick={() => ui.preview('Estado de cuenta', <FolioDoc res={res} />)}>Estado de cuenta</button>
            <button className="btn btn-quiet" onClick={() => setForm('edit')}>Editar / extender</button>
          </div>
          <button className="btn btn-primary" onClick={startCheckout}>
            {res.checkOut > d0 ? 'Check-out anticipado' : 'Check-out y cobrar'}
          </button>
        </>
      )}

      {(res.status === 'salida' || res.status === 'cancelada') && (
        <button className="btn btn-quiet" onClick={() => ui.preview('Estado de cuenta', <FolioDoc res={res} />)}>Ver estado de cuenta</button>
      )}

      {form && (
        <ReservaForm mode={form} res={res} onClose={() => setForm(null)}
          onSave={(r) => {
            update((d) => (form === 'checkin' ? A.checkInWith(d, r) : A.saveReservation(d, r)));
            setForm(null);
            ui.notify(form === 'checkin' ? `Check-in · ${r.guest.name} en la ${r.roomN}` : 'Reserva actualizada');
          }} />
      )}
      {charging && (
        <ChargeModal fmt={fmt} onClose={() => setCharging(false)}
          onSave={(c) => { update((d) => A.addCharge(d, res.id, c)); setCharging(false); ui.notify(`Cargo agregado · ${c.desc}`); }} />
      )}
      {abono === 'monto' && (
        <AmountModal title={res.status === 'reservada' ? 'Anticipo de reserva' : 'Abono a cuenta'} max={f.dueToday > 0.004 ? f.dueToday : f.balance} fmt={fmt}
          onClose={() => setAbono(null)} onNext={(v) => setAbono(v)} />
      )}
      {typeof abono === 'number' && (
        <Cobro title={res.status === 'reservada' ? 'Anticipo' : 'Abono'} amount={abono} invoice={{ nit: res.guest.nit, name: res.guest.nit === 'CF' ? 'Consumidor Final' : res.guest.name }}
          onCancel={() => setAbono(null)} onConfirm={(r) => registerAbono(abono, r)} />
      )}
      {checkout && (f.balance > 0.004 ? (
        <Cobro title={`Check-out Hab. ${res.roomN}`} amount={f.balance} invoice={{ nit: res.guest.nit, name: res.guest.nit === 'CF' ? 'Consumidor Final' : res.guest.name }}
          onCancel={() => setCheckout(false)} onConfirm={finishCheckout} />
      ) : (
        <Modal title={`Check-out Hab. ${res.roomN}`} onClose={() => setCheckout(false)} width={420}
          footer={<><button className="btn" onClick={() => setCheckout(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => finishCheckout(null)}>Hacer check-out</button></>}>
          <div className="panel-sub" style={{ fontSize: 15 }}>La cuenta está saldada. La habitación pasará a limpieza.</div>
        </Modal>
      ))}
    </div>
  );
}

function ChargeModal({ fmt, onClose, onSave }) {
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const ok = desc.trim() && parseFloat(amt) > 0;
  return (
    <Modal title="Agregar cargo" onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!ok} onClick={() => onSave({ desc: desc.trim(), amt: parseFloat(amt) })}>Agregar</button></>}>
      <div className="chips">
        {EXTRA_CHARGES.map(([d, a]) => <button key={d} className={'chip small' + (desc === d ? ' active' : '')} onClick={() => { setDesc(d); setAmt(String(a)); }}>{d} · {fmt(a)}</button>)}
      </div>
      <div className="form-grid two">
        <Field label="Concepto"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Field label="Monto" hint="IVA incluido"><input className="input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
