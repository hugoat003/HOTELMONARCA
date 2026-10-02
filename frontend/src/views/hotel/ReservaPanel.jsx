import { Fragment, useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { EXTRA_CHARGES, METHOD_LABELS, RES_STATUS } from '../../data.js';
import { fmtDate, fmtTime, nightsBetween, today, uid } from '../../lib/dates.js';
import { folio as calcFolio, groupText } from '../../lib/hotel.js';
import { refundSale } from '../../lib/sales.js';
import { FolioDoc, TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import Cobro, { AmountModal } from '../restaurante/Cobro.jsx';
import ReservaForm from './ReservaForm.jsx';
import { ChangeRoomModal, CloseReservationModal } from './ReservaModals.jsx';

// Detalle y operaciones de una reserva: check-in, folio, cargos, abonos y check-out
// onRoomChanged(roomN): avisa a la pantalla que el huésped cambió de habitación
export default function ReservaPanel({ res, onRoomChanged }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [form, setForm] = useState(null); // 'edit' | 'checkin'
  const [charging, setCharging] = useState(false);
  const [abono, setAbono] = useState(null); // null | 'monto' | número
  const [checkout, setCheckout] = useState(false);
  const [changing, setChanging] = useState(false);
  const [closing, setClosing] = useState(null); // 'noshow' | 'cancel'

  const f = calcFolio(res, state);
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
    id: uid('s'),
    number: state.counters.doc + 1,
    kind: 'hotel',
    ts: Date.now(),
    ref: label,
    resId: res.id,
    discount: null,
    tip: 0,
    cashierId: user.id,
    shiftId: state.shift.id,
    status: 'ok',
    ...res2,
  });

  const registerAbono = (amount, r) => {
    const sale = baseSale({
      docType: 'recibo',
      lines: [
        {
          name: res.status === 'reservada' ? 'Anticipo de reserva' : 'Abono a cuenta',
          qty: 1,
          price: amount,
          cat: 'Hospedaje',
        },
      ],
      subtotal: amount,
      ...r,
    });
    update((d) => A.addFolioPayment(d, res.id, sale));
    setAbono(null);
    ui.notify(`Abono registrado · ${fmt(sale.grand)}`);
    ui.preview('Recibo', <TicketDoc sale={sale} />);
  };

  const makeRefund = (amount, method, name) =>
    refundSale(state, user, { kind: 'hotel', ref: label, resId: res.id, amount, method, name });

  const closeReservation = ({ reason, refund }) => {
    if (refund && !state.shift) return ui.notify('Abre el turno de caja para registrar la devolución.');
    const status = closing === 'noshow' ? 'noshow' : 'cancelada';
    const sale = refund && makeRefund(refund.amount, refund.method, 'Devolución de anticipo');
    update((d) => A.closeReservation(d, res.id, { status, reason, refund: sale, userId: user.id }));
    setClosing(null);
    ui.notify(status === 'noshow' ? 'Reserva marcada como no-show' : 'Reserva cancelada');
    if (sale) ui.preview('Devolución', <TicketDoc sale={sale} />);
  };

  // En la salida anticipada el folio se calcula hasta hoy (la reserva no cambia si se cancela el check-out)
  const fOut = checkout?.early ? calcFolio({ ...res, checkOut: d0 }, state) : f;

  // r: resultado del cobro del saldo; refund: { method } para devolver el saldo a favor
  const finishCheckout = (r, refund) => {
    const f = fOut;
    let sale = null;
    if (r) {
      sale = baseSale({
        lines: [
          ...(f.groups
            ? f.groups.map((g) => ({
                name: `Hospedaje ${groupText(g, fmt)}`,
                qty: 1,
                price: g.amount,
                cat: 'Hospedaje',
              }))
            : [{ name: `${f.label} × ${fmt(res.rate)}`, qty: 1, price: f.lodging.base, cat: 'Hospedaje' }]),
          ...res.charges.map((c) => ({ name: c.desc, qty: 1, price: c.amt, cat: 'Cargos' })),
        ],
        credits: f.paid,
        subtotal: f.total,
        ...r,
      });
    }
    const back = refund ? makeRefund(-f.balance, refund.method, 'Devolución de saldo a favor') : null;
    if (back && sale) back.number = sale.number + 1;
    update((d) => A.checkOutWith(d, res.id, sale, { checkOut: checkout.early ? d0 : undefined, refund: back }));
    setCheckout(false);
    ui.notify(`Check-out · Habitación ${res.roomN}`);
    if (sale) ui.preview('Comprobante de salida', <TicketDoc sale={sale} />);
    else if (back) ui.preview('Devolución', <TicketDoc sale={back} />);
  };

  const startCheckout = () => {
    const usedNights = nightsBetween(res.checkIn, d0);
    const early = res.checkOut > d0 && usedNights >= 1;
    const balance = early ? calcFolio({ ...res, checkOut: d0 }, state).balance : f.balance;
    if (Math.abs(balance) > 0.004 && !needShift()) return;
    if (early) {
      ui.confirm(
        {
          title: 'Check-out anticipado',
          message: f.periods
            ? 'La estancia mensual se cobra hasta hoy: el último mes se prorratea por días. La salida se ajusta a hoy.'
            : `Se cobrarán ${usedNights} noche(s) hasta hoy en lugar de ${f.nights}. La salida se ajusta a hoy.`,
          confirmLabel: 'Continuar',
        },
        () => setCheckout({ early: true }),
      );
    } else setCheckout({ early: false });
  };

  // Otro huésped sigue en la habitación (salida tardía): no se puede registrar la llegada
  const occupant = state.reservations.find((x) => x.id !== res.id && x.roomN === res.roomN && x.status === 'hospedado');

  return (
    <div className="stack gap-16">
      <div className="stack-tight">
        <div className="panel-title">{res.guest.name}</div>
        <div className="panel-sub">
          Hab. {res.roomN} · {type?.name} · {fmt(res.rate)} / {f.periods ? 'mes' : 'noche'}
          {f.periods && <span className="tag">Mensual</span>}
        </div>
        <div
          className="badge"
          style={{
            background: res.status === 'hospedado' ? '#1B1917' : '#F0ECE5',
            color: res.status === 'hospedado' ? '#fff' : '#1B1917',
          }}
        >
          {RES_STATUS[res.status]}
        </div>
      </div>

      <div className="kv">
        <span>Estancia</span>
        <strong>
          {fmtDate(res.checkIn)} → {fmtDate(res.checkOut)} ·{' '}
          {f.periods ? `${f.months} mes${f.months === 1 ? '' : 'es'}` : `${f.nights} noche${f.nights > 1 ? 's' : ''}`}
        </strong>
        <span>Personas</span>
        <strong>
          {res.adults} adulto{res.adults > 1 ? 's' : ''}
          {res.children ? `, ${res.children} niño${res.children > 1 ? 's' : ''}` : ''}
        </strong>
        <span>Canal</span>
        <strong>{res.channel}</strong>
        {res.lateArrival && res.status === 'reservada' && (
          <>
            <span>Llegada</span>
            <strong>Avisó que llega tarde</strong>
          </>
        )}
        <span>Teléfono</span>
        <strong>{res.guest.phone || '—'}</strong>
        <span>Documento</span>
        <strong>{res.guest.doc || '—'}</strong>
        {res.notes && (
          <>
            <span>Notas</span>
            <strong>{res.notes}</strong>
          </>
        )}
        {(res.roomHistory || []).map((h) => (
          <Fragment key={h.until + h.roomN}>
            <span>Cambio</span>
            <strong>
              Hab. {h.roomN} → siguiente el {fmtDate(h.until, { day: 'numeric', month: 'short' })}
            </strong>
          </Fragment>
        ))}
        {res.cancelReason && (
          <>
            <span>{res.status === 'noshow' ? 'No-show' : 'Cancelación'}</span>
            <strong>{res.cancelReason}</strong>
          </>
        )}
      </div>

      {res.status === 'reservada' && (
        <>
          {f.paid > 0 && (
            <div className="row">
              <span className="panel-sub">Anticipo</span>
              <strong>{fmt(f.paid)}</strong>
            </div>
          )}
          <div className="row">
            <span className="panel-sub">Total estancia</span>
            <strong>{fmt(f.total)}</strong>
          </div>
          {res.checkIn <= d0 ? (
            occupant ? (
              <div className="note-box">
                {occupant.guest.name} sigue en la habitación {res.roomN}. Haz su check-out o cambia esta reserva de
                habitación.
              </div>
            ) : room?.hk === 'limpia' ? (
              <button className="btn btn-primary" onClick={() => setForm('checkin')}>
                Registrar llegada
              </button>
            ) : (
              <div className="note-box">
                La habitación aún no está lista ({room?.hk === 'fuera' ? 'fuera de servicio' : 'en limpieza'}).
              </div>
            )
          ) : (
            <div className="note-box">
              Llega el {fmtDate(res.checkIn, { weekday: 'long', day: 'numeric', month: 'long' })}.
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setForm('edit')}>
              Editar
            </button>
            <button className="btn" onClick={() => needShift() && setAbono('monto')}>
              Anticipo
            </button>
          </div>
          <div className="btn-row">
            {res.checkIn < d0 && (
              <button className="btn btn-quiet" onClick={() => setClosing('noshow')}>
                Marcar no-show
              </button>
            )}
            <button className="btn btn-quiet" onClick={() => setClosing('cancel')}>
              Cancelar reserva
            </button>
          </div>
        </>
      )}

      {res.status === 'hospedado' && (
        <>
          <div className="eyebrow">Folio</div>
          <div>
            {f.periods
              ? f.periods.map((p) => (
                  <div key={p.n} className={'folio-line' + (p.start > d0 ? ' muted' : '')}>
                    <span>
                      Mes {p.n} · {fmtDate(p.start, { day: 'numeric', month: 'short' })} –{' '}
                      {fmtDate(p.end, { day: 'numeric', month: 'short' })}
                      {p.frac < 1 ? ' (prorrateo)' : ''}
                      {p.start > d0 ? ' · por iniciar' : ''}
                    </span>
                    <strong>{fmt(p.amount)}</strong>
                  </div>
                ))
              : f.groups.map((g) => (
                  <div key={g.from} className="folio-line">
                    <span>
                      {fmtDate(g.from, { day: 'numeric', month: 'short' })} · {groupText(g, fmt)}
                    </span>
                    <strong>{fmt(g.amount)}</strong>
                  </div>
                ))}
            {res.charges.map((c) => (
              <div key={c.id} className="folio-line">
                <span>
                  {c.desc}
                  <span className="panel-sub"> · {fmtTime(c.ts)}</span>
                  {c.type === 'extra' && (
                    <button
                      className="link danger ml-8"
                      onClick={() =>
                        ui.authorize('Eliminar un cargo del folio', (mgr) =>
                          update((d) => A.removeCharge(d, res.id, c.id, { authId: mgr.id })),
                        )
                      }
                    >
                      quitar
                    </button>
                  )}
                </span>
                <strong>{fmt(c.amt)}</strong>
              </div>
            ))}
            {res.payments.map((p) => (
              <div key={p.id} className="folio-line muted">
                <span>
                  {p.desc} · {METHOD_LABELS[p.method]}
                </span>
                <strong>− {fmt(p.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="row text-total">
            <span>{f.periods ? 'Saldo de la estancia' : 'Saldo'}</span>
            <span>{fmt(f.balance)}</span>
          </div>
          {f.dueToday !== null && (
            <div className={'note-box' + (f.dueToday > 0.004 ? ' warn' : '')}>
              {f.dueToday > 0.004 ? (
                <>
                  Pendiente a hoy: <strong>{fmt(f.dueToday)}</strong> de los meses ya iniciados.
                </>
              ) : (
                <>
                  Al día: los meses iniciados están pagados
                  {f.dueToday < -0.004 ? ` (saldo a favor ${fmt(-f.dueToday)})` : ''}.
                </>
              )}
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => setCharging(true)}>
              Agregar cargo
            </button>
            <button className="btn" onClick={() => needShift() && setAbono('monto')}>
              Abono
            </button>
          </div>
          <div className="btn-row">
            <button className="btn btn-quiet" onClick={() => ui.preview('Estado de cuenta', <FolioDoc res={res} />)}>
              Estado de cuenta
            </button>
            <button className="btn btn-quiet" onClick={() => setForm('edit')}>
              Editar / extender
            </button>
          </div>
          <button className="btn btn-quiet" onClick={() => setChanging(true)}>
            Cambiar de habitación
          </button>
          <button className="btn btn-primary" onClick={startCheckout}>
            {res.checkOut > d0 ? 'Check-out anticipado' : 'Check-out y cobrar'}
          </button>
        </>
      )}

      {(res.status === 'salida' || res.status === 'cancelada') && (
        <button className="btn btn-quiet" onClick={() => ui.preview('Estado de cuenta', <FolioDoc res={res} />)}>
          Ver estado de cuenta
        </button>
      )}

      {form && (
        <ReservaForm
          mode={form}
          res={res}
          onClose={() => setForm(null)}
          onSave={(r) => {
            update((d) => (form === 'checkin' ? A.checkInWith(d, r) : A.saveReservation(d, r)));
            setForm(null);
            ui.notify(form === 'checkin' ? `Check-in · ${r.guest.name} en la ${r.roomN}` : 'Reserva actualizada');
          }}
        />
      )}
      {changing && (
        <ChangeRoomModal
          res={res}
          onClose={() => setChanging(false)}
          onConfirm={({ roomN, newRate }) => {
            update((d) => A.changeRoom(d, res.id, { roomN, newRate, userId: user.id }));
            setChanging(false);
            onRoomChanged?.(roomN);
            ui.notify(`${res.guest.name} pasó a la habitación ${roomN}`);
          }}
        />
      )}
      {closing && (
        <CloseReservationModal
          res={res}
          mode={closing}
          paid={f.paid}
          onClose={() => setClosing(null)}
          onConfirm={closeReservation}
        />
      )}
      {charging && (
        <ChargeModal
          fmt={fmt}
          onClose={() => setCharging(false)}
          onSave={(c) => {
            update((d) => A.addCharge(d, res.id, c));
            setCharging(false);
            ui.notify(`Cargo agregado · ${c.desc}`);
          }}
        />
      )}
      {abono === 'monto' && (
        <AmountModal
          title={res.status === 'reservada' ? 'Anticipo de reserva' : 'Abono a cuenta'}
          max={f.balance}
          suggest={f.dueToday > 0.004 && f.dueToday < f.balance - 0.004 ? [['Pendiente a hoy', f.dueToday]] : []}
          fmt={fmt}
          onClose={() => setAbono(null)}
          onNext={(v) => setAbono(v)}
        />
      )}
      {typeof abono === 'number' && (
        <Cobro
          title={res.status === 'reservada' ? 'Anticipo' : 'Abono'}
          amount={abono}
          invoice={{ name: res.guest.name }}
          onCancel={() => setAbono(null)}
          onConfirm={(r) => registerAbono(abono, r)}
        />
      )}
      {checkout &&
        (fOut.balance > 0.004 ? (
          <Cobro
            title={`Check-out Hab. ${res.roomN}`}
            amount={fOut.balance}
            invoice={{ name: res.guest.name }}
            onCancel={() => setCheckout(false)}
            onConfirm={(r) => finishCheckout(r)}
          />
        ) : fOut.balance < -0.004 ? (
          <RefundCheckoutModal
            res={res}
            credit={-fOut.balance}
            fmt={fmt}
            onClose={() => setCheckout(false)}
            onConfirm={(refund) => finishCheckout(null, refund)}
          />
        ) : (
          <Modal
            title={`Check-out Hab. ${res.roomN}`}
            onClose={() => setCheckout(false)}
            width={420}
            footer={
              <>
                <button className="btn" onClick={() => setCheckout(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={() => finishCheckout(null)}>
                  Hacer check-out
                </button>
              </>
            }
          >
            <div className="panel-sub text-md">La cuenta está saldada. La habitación pasará a limpieza.</div>
          </Modal>
        ))}
    </div>
  );
}

// Salida con saldo a favor (pagó de más o se va antes): devolver o dejarlo sin devolver
function RefundCheckoutModal({ res, credit, fmt, onClose, onConfirm }) {
  const [mode, setMode] = useState('devolver');
  const [method, setMethod] = useState('efectivo');
  return (
    <Modal
      title={`Check-out Hab. ${res.roomN}`}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(mode === 'devolver' ? { method } : null)}>
            {mode === 'devolver' ? `Devolver ${fmt(credit)} y salir` : 'Hacer check-out'}
          </button>
        </>
      }
    >
      <div className="note-box warn">
        {res.guest.name} tiene un saldo a favor de <strong>{fmt(credit)}</strong>.
      </div>
      <label className="check">
        <input type="radio" checked={mode === 'devolver'} onChange={() => setMode('devolver')} />
        <span>Devolver al huésped</span>
      </label>
      {mode === 'devolver' && (
        <div className="chips">
          {['efectivo', 'tarjeta', 'transferencia'].map((k) => (
            <button key={k} className={'chip small' + (method === k ? ' active' : '')} onClick={() => setMethod(k)}>
              {METHOD_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      <label className="check">
        <input type="radio" checked={mode === 'retener'} onChange={() => setMode('retener')} />
        <span>No devolver (política de cancelación)</span>
      </label>
    </Modal>
  );
}

function ChargeModal({ fmt, onClose, onSave }) {
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const ok = desc.trim() && parseFloat(amt) > 0;
  return (
    <Modal
      title="Agregar cargo"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => onSave({ desc: desc.trim(), amt: parseFloat(amt) })}
          >
            Agregar
          </button>
        </>
      }
    >
      <div className="chips">
        {EXTRA_CHARGES.map(([d, a]) => (
          <button
            key={d}
            className={'chip small' + (desc === d ? ' active' : '')}
            onClick={() => {
              setDesc(d);
              setAmt(String(a));
            }}
          >
            {d} · {fmt(a)}
          </button>
        ))}
      </div>
      <div className="form-grid two">
        <Field label="Concepto">
          <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <Field label="Monto">
          <input className="input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
