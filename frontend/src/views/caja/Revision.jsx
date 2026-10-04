// Revisiones de apertura y cierre de caja. Nada se resuelve solo: se muestra la lista y la persona decide.
import { useState } from 'react';
import Modal from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { fmtDate, today } from '@shared/dates.js';
import { eventTotals } from '@shared/events.js';
import { folio } from '@shared/hotel.js';
import { linesTotal, sum } from '@shared/money.js';
import { orderLabel } from '@shared/orders.js';
import { refundSale } from '@shared/sales.js';
import { TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { setPersisted } from '../../store/usePersisted.js';
import { CloseReservationModal } from '../hotel/ReservaModals.jsx';

const OTA = ['Booking.com', 'Expedia'];

// Abre una reserva en la pantalla de Reservas
function useOpenReservation(go) {
  const { user } = useStore();
  return (resId) => {
    setPersisted(user.id, 'reservas.seleccion', resId);
    go('reservas');
  };
}

// Lo que se revisa en la mañana: reservas que no llegaron y huéspedes que debían salir
export function morningItems(state) {
  const d0 = today();
  return {
    noShows: state.reservations
      .filter((r) => r.status === 'reservada' && r.checkIn < d0)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    overdue: state.reservations.filter((r) => r.status === 'hospedado' && r.checkOut < d0),
  };
}

export function MorningReview({ go }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const openRes = useOpenReservation(go);
  const [closing, setClosing] = useState(null); // reserva a marcar como no-show
  const { noShows, overdue } = morningItems(state);
  if (!noShows.length && !overdue.length) return null;

  const markNoShow = ({ reason, refund }) => {
    const r = closing;
    const sale =
      refund &&
      refundSale(state, user, {
        kind: 'hotel',
        ref: `Hab. ${r.roomN} · ${r.guest.name}`,
        resId: r.id,
        amount: refund.amount,
        method: refund.method,
        name: 'Devolución de anticipo',
      });
    update((d) => A.closeReservation(d, r.id, { status: 'noshow', reason, refund: sale, userId: user.id }));
    setClosing(null);
    ui.notify(`Hab. ${r.roomN} liberada · ${r.guest.name} no llegó`);
    if (sale) ui.preview('Devolución', <TicketDoc sale={sale} />);
  };

  return (
    <div className="card review">
      <div className="report-title">Revisión de la mañana</div>
      <div className="panel-sub text-md">Resuelve cada caso; lo que dejes queda en los pendientes del Resumen.</div>

      {noShows.length > 0 && (
        <div className="stack-tight">
          <div className="eyebrow">No llegaron · {noShows.length}</div>
          {noShows.map((r) => {
            const paid = sum(r.payments, (p) => p.amount);
            return (
              <div key={r.id} className="review-row">
                <span>
                  <strong>
                    Hab. {r.roomN} · {r.guest.name}
                  </strong>
                  <span className="panel-sub">
                    {' '}
                    · llegaba el {fmtDate(r.checkIn)} · {r.channel}
                    {paid > 0 ? ` · anticipo ${fmt(paid)}` : ''}
                  </span>
                  {r.lateArrival && <span className="tag status-cotizado">Avisó que llega tarde</span>}
                  {OTA.includes(r.channel) && (
                    <span className="review-note">Repórtalo también en {r.channel} para que cobren el no-show.</span>
                  )}
                </span>
                <span className="row-actions">
                  <button className="btn small" onClick={() => openRes(r.id)}>
                    Ver reserva
                  </button>
                  <button className="btn small btn-primary" onClick={() => setClosing(r)}>
                    Marcar no-show
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {overdue.length > 0 && (
        <div className="stack-tight">
          <div className="eyebrow">Debían salir y siguen registrados · {overdue.length}</div>
          {overdue.map((r) => (
            <div key={r.id} className="review-row">
              <span>
                <strong>
                  Hab. {r.roomN} · {r.guest.name}
                </strong>
                <span className="panel-sub">
                  {' '}
                  · salida {fmtDate(r.checkOut)} · saldo {fmt(folio(r, state).balance)}
                </span>
              </span>
              <span className="row-actions">
                <button className="btn small" onClick={() => openRes(r.id)}>
                  Check-out o extender
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {closing && (
        <CloseReservationModal
          res={closing}
          mode="noshow"
          paid={sum(closing.payments, (p) => p.amount)}
          onClose={() => setClosing(null)}
          onConfirm={markNoShow}
        />
      )}
    </div>
  );
}

// Lo que se revisa antes del arqueo: lo del día que tiene que ver con dinero
export function closingItems(state) {
  const d0 = today();
  const inHouse = state.reservations.filter((r) => r.status === 'hospedado');
  return {
    orders: state.orders.filter((o) => o.lines.length),
    departures: inHouse.filter((r) => r.checkOut <= d0),
    monthly: inHouse
      .filter((r) => r.rateType === 'mensual')
      .map((r) => ({ r, due: folio(r, state).dueToday }))
      .filter((x) => x.due > 0.004),
    events: state.events
      .filter((e) => e.date === d0 && e.status !== 'cancelado')
      .map((e) => ({ e, balance: eventTotals(e, state).balance }))
      .filter((x) => x.balance > 0.004),
  };
}

export function ClosingReview({ go, onClose, onContinue }) {
  const { state, fmt } = useStore();
  const openRes = useOpenReservation(go);
  const { orders, departures, monthly, events } = closingItems(state);
  const empty = !orders.length && !departures.length && !monthly.length && !events.length;
  const section = (title, rows) =>
    rows.length > 0 && (
      <div className="stack-tight">
        <div className="eyebrow">
          {title} · {rows.length}
        </div>
        {rows}
      </div>
    );

  return (
    <Modal
      title="Revisión antes del cierre"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Volver
          </button>
          <button className="btn btn-primary" onClick={onContinue}>
            Continuar al arqueo
          </button>
        </>
      }
    >
      {empty ? (
        <div className="note-box">Todo en orden: no quedan cuentas ni cobros pendientes del día.</div>
      ) : (
        <div className="panel-sub text-md">
          Revisa lo pendiente. Puedes cerrar de todos modos: lo que quede abierto pasa al siguiente turno.
        </div>
      )}
      {section(
        'Cuentas abiertas',
        orders.map((o) => (
          <div key={o.id} className="review-row">
            <span>{orderLabel(o, state.tables)}</span>
            <strong>{fmt(linesTotal(o.lines))}</strong>
          </div>
        )),
      )}
      {section(
        'Salen hoy y no han hecho check-out',
        departures.map((r) => (
          <div key={r.id} className="review-row">
            <span>
              Hab. {r.roomN} · {r.guest.name}
              <span className="panel-sub"> · saldo {fmt(folio(r, state).balance)}</span>
            </span>
            <button className="btn small" onClick={() => openRes(r.id)}>
              Ver
            </button>
          </div>
        )),
      )}
      {section(
        'Mensualidades vencidas',
        monthly.map(({ r, due }) => (
          <div key={r.id} className="review-row">
            <span>
              Hab. {r.roomN} · {r.guest.name}
              <span className="panel-sub"> · pendiente {fmt(due)}</span>
            </span>
            <button className="btn small" onClick={() => openRes(r.id)}>
              Ver
            </button>
          </div>
        )),
      )}
      {section(
        'Eventos de hoy con saldo',
        events.map(({ e, balance }) => (
          <div key={e.id} className="review-row">
            <span>
              {e.name}
              <span className="panel-sub"> · saldo {fmt(balance)}</span>
            </span>
            <button className="btn small" onClick={() => go('eventos')}>
              Ver
            </button>
          </div>
        )),
      )}
    </Modal>
  );
}
