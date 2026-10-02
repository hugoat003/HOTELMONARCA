import { useState } from 'react';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { EVENT_STATUS, EVENT_UNITS, METHOD_LABELS } from '../../data.js';
import { dateOf, fmtDate, fmtTime, nightsBetween, today, uid } from '../../lib/dates.js';
import { eventTotals, isActiveEvent } from '../../lib/events.js';
import { BeoDoc, EventDoc, TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import Cobro, { AmountModal } from '../restaurante/Cobro.jsx';
import EventCalendar from './EventCalendar.jsx';
import EventoForm from './EventoForm.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const FILTERS = [
  ['proximos', 'Próximos'],
  ['cotizado', 'Cotizados'],
  ['confirmado', 'Confirmados'],
  ['realizado', 'Realizados'],
  ['cancelado', 'Cancelados'],
  ['todos', 'Todos'],
];

export default function Eventos() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [filter, setFilter] = usePersisted('eventos.filtro', 'proximos');
  const [selId, setSelId] = usePersisted('eventos.seleccion', null);
  const [form, setForm] = useState(null); // null | { date } (nuevo) | evento
  const [view, setView] = usePersisted('eventos.vista', 'lista');
  const [month, setMonth] = usePersisted('eventos.mes', today().slice(0, 8) + '01');

  const d0 = today();
  const list = state.events
    .filter((e) =>
      filter === 'todos' ? true : filter === 'proximos' ? isActiveEvent(e) && e.date >= d0 : e.status === filter,
    )
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const sel = state.events.find((e) => e.id === selId);

  const nextIn = (venueId) =>
    state.events
      .filter((e) => e.venueId === venueId && isActiveEvent(e) && e.date >= d0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <div className="split" style={{ '--side': '400px' }}>
      <div className="split-main gap-18">
        <div className="report-grid" style={{ gridTemplateColumns: `repeat(${state.venues.length || 1}, 1fr)` }}>
          {state.venues.map((v) => {
            const next = nextIn(v.id);
            return (
              <div key={v.id} className="card" style={{ gap: 4, padding: 16 }}>
                <div className="row">
                  <span className="card-label">{v.name}</span>
                  <strong>{fmt(v.price)}</strong>
                </div>
                <div className="panel-sub">
                  Capacidad {v.capacity} personas · sin costo si el evento consume menú del hotel
                </div>
                <div style={{ fontSize: 15, marginTop: 4 }}>
                  {next ? (
                    <>
                      Próximo: <strong>{next.name}</strong> · {fmtDate(next.date)}
                    </>
                  ) : (
                    <span className="panel-sub">Sin eventos próximos</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="row items-center">
          <div className="segmented row two" style={{ width: 220, padding: 3 }}>
            {[
              ['lista', 'Lista'],
              ['calendario', 'Calendario'],
            ].map(([k, l]) => (
              <button
                key={k}
                className={'seg-btn' + (view === k ? ' active' : '')}
                style={{ padding: '7px 4px' }}
                onClick={() => setView(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <button className="btn btn-primary small" onClick={() => setForm({})}>
            + Nuevo evento
          </button>
        </div>

        {view === 'calendario' && (
          <EventCalendar
            events={state.events.filter((e) => e.status !== 'cancelado')}
            venues={state.venues}
            month={month}
            onMonth={setMonth}
            selectedId={selId}
            onSelect={(e) => setSelId(e.id)}
            onNew={(date) => setForm({ date })}
          />
        )}

        {view === 'lista' && (
          <div className="row items-center">
            <div className="chips">
              {FILTERS.map(([k, l]) => (
                <button key={k} className={'chip small' + (filter === k ? ' active' : '')} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}

        {view === 'lista' && (
          <div className="stack-tight gap-10">
            {list.map((e) => {
              const t = eventTotals(e, state);
              return (
                <button
                  key={e.id}
                  className={'event-row' + (selId === e.id ? ' selected' : '')}
                  onClick={() => setSelId(e.id)}
                >
                  <span className="event-date">
                    <strong>{fmtDate(e.date, { day: 'numeric' })}</strong>
                    <span>{fmtDate(e.date, { month: 'short' })}</span>
                  </span>
                  <span className="event-main">
                    <strong>{e.name}</strong>
                    <span className="panel-sub">
                      {t.venue?.name || 'Restaurante / terraza'} · {e.start}–{e.end} · {e.guests} invitados
                      {t.menu ? ` · ${t.menu.name}` : ''}
                    </span>
                  </span>
                  <span className="event-money">
                    <span className={'tag status-' + e.status}>{EVENT_STATUS[e.status]}</span>
                    <strong>{fmt(t.total)}</strong>
                    {t.balance > 0.004 && e.status !== 'cancelado' && (
                      <span className="panel-sub">Saldo {fmt(t.balance)}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {!list.length && <div className="panel-sub">No hay eventos en esta vista.</div>}
          </div>
        )}
      </div>

      <div className="side-panel room-panel">
        {sel ? (
          <EventPanel key={sel.id} ev={sel} onEdit={() => setForm(sel)} />
        ) : (
          <div className="stack">
            <div className="panel-empty">
              Selecciona un evento para ver su detalle, registrar pagos o imprimir la cotización.
            </div>
            <button className="btn btn-primary" onClick={() => setForm({})}>
              Nuevo evento
            </button>
          </div>
        )}
      </div>

      {form && (
        <EventoForm
          ev={form.id ? form : null}
          date={form.date}
          onClose={() => setForm(null)}
          onSave={(ev) => {
            update((d) => A.saveEvent(d, ev));
            setForm(null);
            setSelId(ev.id);
            ui.notify(form.id ? 'Evento actualizado' : `Evento creado · ${ev.name}`);
          }}
        />
      )}
    </div>
  );
}

function EventPanel({ ev, onEdit }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [pay, setPay] = useState(null); // null | 'monto' | número
  const t = eventTotals(ev, state);

  const registerPayment = (amount, r) => {
    const final = amount >= t.balance - 0.004;
    const lines = final
      ? [
          ...(t.venue
            ? [
                {
                  name: `Renta ${t.venue.name}${t.venueWaived ? ' (incluida con el menú)' : ''}`,
                  qty: 1,
                  price: t.venueAmt,
                  cat: 'Eventos',
                },
              ]
            : []),
          ...(t.menu
            ? [
                {
                  name: `${t.menu.name} (${EVENT_UNITS[t.menu.unit]})`,
                  qty: ev.menuQty,
                  price: t.menu.price,
                  cat: 'Eventos',
                },
              ]
            : []),
          ...ev.extras.map((x) => ({ name: x.desc, qty: 1, price: x.amt, cat: 'Eventos' })),
        ]
      : [{ name: t.paid > 0 ? 'Abono a evento' : 'Anticipo de evento', qty: 1, price: amount, cat: 'Eventos' }];
    const sale = {
      id: uid('s'),
      number: state.counters.doc + 1,
      kind: 'evento',
      ts: Date.now(),
      ref: ev.name,
      eventId: ev.id,
      docType: final ? undefined : 'recibo',
      lines,
      subtotal: final ? t.total : amount,
      credits: final ? t.paid : 0,
      discount: null,
      tip: 0,
      cashierId: user.id,
      shiftId: state.shift.id,
      status: 'ok',
      ...r,
    };
    update((d) => A.addEventPayment(d, ev.id, sale));
    setPay(null);
    ui.notify(`Pago registrado · ${fmt(sale.grand)}`);
    ui.preview(final ? 'Comprobante del evento' : 'Recibo', <TicketDoc sale={sale} />);
  };

  const rooms = state.reservations
    .filter((r) => r.eventId === ev.id && (r.status === 'reservada' || r.status === 'hospedado'))
    .sort((a, b) => a.roomN.localeCompare(b.roomN));

  const setStatus = (status, msg) => {
    update((d) => A.setEventStatus(d, ev.id, status));
    ui.notify(msg);
  };

  return (
    <div className="stack gap-16">
      <div className="stack-tight">
        <div className="panel-title">{ev.name}</div>
        <div className="panel-sub">
          {fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {ev.start}–{ev.end}
        </div>
        <div className={'badge status-' + ev.status}>{EVENT_STATUS[ev.status]}</div>
      </div>

      <div className="kv">
        <span>Salón</span>
        <strong>{t.venue?.name || 'Restaurante / terraza'}</strong>
        <span>Invitados</span>
        <strong>{ev.guests}</strong>
        <span>Cliente</span>
        <strong>{ev.client.name}</strong>
        <span>Teléfono</span>
        <strong>{ev.client.phone || '—'}</strong>
        {rooms.length > 0 && (
          <>
            <span>Habitaciones</span>
            <strong>
              {rooms.map((r) => (r.block ? r.roomN : `${r.roomN} (${r.guest.name})`)).join(', ')} ·{' '}
              {nightsBetween(rooms[0].checkIn, rooms[0].checkOut)} noche
              {nightsBetween(rooms[0].checkIn, rooms[0].checkOut) === 1 ? '' : 's'}
            </strong>
          </>
        )}
        {ev.notes && (
          <>
            <span>Notas</span>
            <strong>{ev.notes}</strong>
          </>
        )}
      </div>

      <div>
        <div className="eyebrow mb-4">Cotización</div>
        {t.venue && (
          <div className="folio-line">
            <span>
              Renta {t.venue.name}
              {t.venueWaived && <span className="panel-sub"> · incluida con el menú</span>}
            </span>
            <strong>
              {t.venueWaived ? (
                <>
                  <s className="panel-sub">{fmt(t.venue.price)}</s> {fmt(0)}
                </>
              ) : (
                fmt(t.venueAmt)
              )}
            </strong>
          </div>
        )}
        {t.menu && (
          <div className="folio-line">
            <span>
              {t.menu.name} · {ev.menuQty} × {fmt(t.menu.price)}
            </span>
            <strong>{fmt(t.menuAmt)}</strong>
          </div>
        )}
        {ev.extras.map((x) => (
          <div key={x.id} className="folio-line">
            <span>{x.desc}</span>
            <strong>{fmt(x.amt)}</strong>
          </div>
        ))}
        <div className="folio-line">
          <span>
            <strong>Total</strong>
          </span>
          <strong>{fmt(t.total)}</strong>
        </div>
        {ev.payments.map((p) => (
          <div key={p.id} className="folio-line muted">
            <span>
              {p.desc} · {METHOD_LABELS[p.method]} · {fmtDate(dateOf(p.ts), { day: 'numeric', month: 'short' })}{' '}
              {fmtTime(p.ts)}
            </span>
            <strong>− {fmt(p.amount)}</strong>
          </div>
        ))}
      </div>
      <div className="row text-total">
        <span>Saldo</span>
        <span>{fmt(t.balance)}</span>
      </div>

      {isActiveEvent(ev) && (
        <>
          <div className="btn-row">
            <button className="btn" onClick={onEdit}>
              Editar
            </button>
            <button
              className="btn"
              disabled={t.balance <= 0.004}
              onClick={() => (state.shift ? setPay('monto') : ui.notify('Abre el turno de caja para registrar pagos.'))}
            >
              Registrar pago
            </button>
          </div>
          {ev.status === 'cotizado' && (
            <button
              className="btn btn-primary"
              onClick={() => setStatus('confirmado', `Evento confirmado · ${ev.name}`)}
            >
              Confirmar evento
            </button>
          )}
          {ev.status === 'confirmado' && ev.date <= today() && (
            <button className="btn btn-primary" onClick={() => setStatus('realizado', 'Evento marcado como realizado')}>
              Marcar como realizado
            </button>
          )}
        </>
      )}
      <button className="btn btn-quiet" onClick={() => ui.preview('Orden de servicio', <BeoDoc ev={ev} />)}>
        Orden de servicio (BEO)
      </button>
      <button
        className="btn btn-quiet"
        onClick={() =>
          ui.preview(ev.payments.length ? 'Estado de cuenta del evento' : 'Cotización del evento', <EventDoc ev={ev} />)
        }
      >
        {ev.payments.length ? 'Imprimir estado de cuenta' : 'Imprimir cotización'}
      </button>
      {isActiveEvent(ev) && (
        <button
          className="btn btn-quiet"
          onClick={() =>
            ui.confirm(
              {
                title: 'Cancelar evento',
                message: `¿Cancelar “${ev.name}”? El salón y las habitaciones apartadas quedan libres.`,
                confirmLabel: 'Cancelar evento',
                danger: true,
              },
              () => setStatus('cancelado', 'Evento cancelado'),
            )
          }
        >
          Cancelar evento
        </button>
      )}

      {pay === 'monto' && (
        <AmountModal
          title={t.paid > 0 ? 'Abono al evento' : 'Anticipo del evento'}
          max={t.balance}
          fmt={fmt}
          onClose={() => setPay(null)}
          onNext={(v) => setPay(Math.min(v, t.balance))}
        />
      )}
      {typeof pay === 'number' && (
        <Cobro
          title={pay >= t.balance - 0.004 ? 'Liquidar evento' : 'Anticipo del evento'}
          amount={pay}
          invoice={{ name: ev.client.name }}
          onCancel={() => setPay(null)}
          onConfirm={(r) => registerPayment(pay, r)}
        />
      )}
    </div>
  );
}
