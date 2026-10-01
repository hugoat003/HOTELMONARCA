// Documentos imprimibles (ticket, comanda, precuenta, folio y reporte de cierre)
import { EVENT_STATUS, EVENT_UNITS, METHOD_LABELS } from '../data.js';
import { fmtDate, fmtDateTime, fmtTime } from '../lib/dates.js';
import { eventTotals } from '../lib/events.js';
import { folio as calcFolio } from '../lib/hotel.js';
import { ivaIncluded, linesTotal, round2 } from '../lib/money.js';
import { useStore } from '../store/store.jsx';

const userName = (users, id) => users.find((u) => u.id === id)?.name || '—';

function Header() {
  const { state } = useStore();
  const c = state.config;
  return (
    <div className="doc-header">
      <img src="/logo-monarca.png" alt="" />
      <div>{c.legalName}</div>
      <div>NIT {c.nit}</div>
      <div>{c.address}</div>
      <div>Tel. {c.phone}</div>
    </div>
  );
}

const Row = ({ l, r, strong }) => (
  <div className={'doc-row' + (strong ? ' strong' : '')}>
    <span>{l}</span>
    <span>{r}</span>
  </div>
);

export function TicketDoc({ sale }) {
  const { state, fmt } = useStore();
  const hotel = sale.kind === 'hotel';
  const refLabel = hotel
    ? 'Habitación'
    : sale.kind === 'evento'
      ? 'Evento'
      : sale.kind === 'tienda'
        ? 'Venta'
        : 'Cuenta';
  return (
    <div className="doc">
      <Header />
      <div className="doc-title">
        {sale.docType === 'recibo' ? 'Recibo' : 'Factura'} No. {String(sale.number).padStart(6, '0')}
      </div>
      <div className="doc-center doc-small">
        {sale.docType === 'recibo'
          ? 'Se aplicará en la factura de salida'
          : 'Documento Tributario Electrónico (demostración)'}
      </div>
      {sale.status === 'anulada' && <div className="doc-void">ANULADA · {sale.voidReason}</div>}
      <div className="doc-sep" />
      <Row l="Fecha" r={fmtDateTime(sale.ts)} />
      <Row l="NIT" r={sale.invoice.nit} />
      <Row l="Nombre" r={sale.invoice.name} />
      <Row l={refLabel} r={sale.ref} />
      {sale.kind === 'restaurante' && <Row l="Atendió" r={userName(state.users, sale.waiterId)} />}
      <div className="doc-sep" />
      {sale.lines.map((l, i) => (
        <div key={i} className="doc-line">
          <span>
            {l.qty} × {l.name}
            {l.note ? <em> ({l.note})</em> : null}
          </span>
          <span>{fmt(l.price * l.qty)}</span>
        </div>
      ))}
      <div className="doc-sep" />
      {sale.discount && (
        <>
          <Row l="Subtotal" r={fmt(sale.subtotal)} />
          <Row l={`Descuento ${sale.discount.label}`} r={'− ' + fmt(sale.discount.amount)} />
        </>
      )}
      {hotel && sale.taxes && (
        <>
          <Row l={`IVA (${state.config.iva}%) hospedaje`} r={fmt(sale.taxes.iva)} />
          <Row l={`INGUAT (${state.config.inguat}%)`} r={fmt(sale.taxes.inguat)} />
        </>
      )}
      {sale.credits > 0 && (
        <>
          <Row l={hotel ? 'Total estancia' : 'Total del evento'} r={fmt(sale.subtotal)} />
          <Row l="Anticipos y abonos" r={'− ' + fmt(sale.credits)} />
        </>
      )}
      <Row l={sale.credits > 0 ? 'Saldo pagado' : 'Total'} r={fmt(sale.total)} strong />
      {!hotel && <Row l={`IVA incluido (${state.config.iva}%)`} r={fmt(ivaIncluded(sale.total, state.config.iva))} />}
      {sale.tip > 0 && (
        <>
          <Row l="Propina" r={fmt(sale.tip)} />
          <Row l="Total pagado" r={fmt(sale.grand)} strong />
        </>
      )}
      <div className="doc-sep" />
      {sale.payments.map((p, i) => (
        <Row
          key={i}
          l={METHOD_LABELS[p.method] + (p.roomN ? ' ' + p.roomN : '') + (p.ref ? ' · ' + p.ref : '')}
          r={fmt(p.amount + (p.method === 'efectivo' ? sale.change || 0 : 0))}
        />
      ))}
      {sale.change > 0 && <Row l="Cambio" r={fmt(sale.change)} />}
      <div className="doc-sep" />
      <div className="doc-center doc-small">{state.config.footer}</div>
    </div>
  );
}

export function ComandaDoc({ label, lines, number, waiterId, guests }) {
  const { state } = useStore();
  return (
    <div className="doc comanda">
      <div className="doc-title">Comanda #{number}</div>
      <Row l={label} r={fmtTime(Date.now())} strong />
      <Row l={`Mesero: ${userName(state.users, waiterId)}`} r={`${guests} pers.`} />
      <div className="doc-sep" />
      {lines.map((l) => (
        <div key={l.id} className="comanda-line">
          <strong>
            {l.qty} × {l.name}
          </strong>
          {l.note && <div>→ {l.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function PrecuentaDoc({ label, lines, waiterId, guests }) {
  const { state, fmt } = useStore();
  const total = linesTotal(lines);
  const tip = round2((total * state.config.tipPct) / 100);
  return (
    <div className="doc">
      <Header />
      <div className="doc-title">Precuenta</div>
      <div className="doc-center doc-small">No es un documento fiscal</div>
      <div className="doc-sep" />
      <Row l={label} r={fmtDateTime(Date.now())} />
      <Row l={`Atendió: ${userName(state.users, waiterId)}`} r={`${guests} pers.`} />
      <div className="doc-sep" />
      {lines.map((l) => (
        <div key={l.id} className="doc-line">
          <span>
            {l.qty} × {l.name}
          </span>
          <span>{fmt(l.price * l.qty)}</span>
        </div>
      ))}
      <div className="doc-sep" />
      <Row l="Total" r={fmt(total)} strong />
      <Row l={`Propina sugerida (${state.config.tipPct}%)`} r={fmt(tip)} />
      <Row l="Total con propina" r={fmt(total + tip)} />
    </div>
  );
}

export function FolioDoc({ res }) {
  const { state, fmt } = useStore();
  const f = calcFolio(res, state.config);
  return (
    <div className="doc">
      <Header />
      <div className="doc-title">Estado de cuenta · Hab. {res.roomN}</div>
      <div className="doc-sep" />
      <Row l="Huésped" r={res.guest.name} />
      <Row l="Estancia" r={`${fmtDate(res.checkIn)} → ${fmtDate(res.checkOut)}`} />
      <div className="doc-sep" />
      {f.periods ? (
        f.periods.map((p) => (
          <Row
            key={p.n}
            l={`Mes ${p.n}: ${fmtDate(p.start, { day: 'numeric', month: 'short' })} – ${fmtDate(p.end, { day: 'numeric', month: 'short' })}${p.frac < 1 ? ' (prorrateo)' : ''}`}
            r={fmt(p.amount)}
          />
        ))
      ) : (
        <Row l={`Hospedaje ${f.nights} noche(s) × ${fmt(res.rate)}`} r={fmt(f.lodging.base)} />
      )}
      <Row l={`IVA (${state.config.iva}%)`} r={fmt(f.lodging.iva)} />
      <Row l={`INGUAT (${state.config.inguat}%)`} r={fmt(f.lodging.inguat)} />
      {res.charges.map((c) => (
        <Row key={c.id} l={c.desc} r={fmt(c.amt)} />
      ))}
      <Row l="Total cargos" r={fmt(f.total)} strong />
      {res.payments.map((p) => (
        <Row key={p.id} l={`${p.desc} · ${METHOD_LABELS[p.method]}`} r={'− ' + fmt(p.amount)} />
      ))}
      <div className="doc-sep" />
      <Row l="Saldo de la estancia" r={fmt(f.balance)} strong />
      {f.dueToday !== null && <Row l="Saldo pendiente a hoy" r={fmt(Math.max(0, f.dueToday))} strong />}
    </div>
  );
}

export function ReportDoc({ report: r, shift }) {
  const { state, fmt } = useStore();
  return (
    <div className="doc report-doc">
      <Header />
      <div className="doc-title">Reporte Diario de Producción</div>
      <div className="doc-center">
        {fmtDate(r.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Turno abierto{' '}
        {fmtTime(shift.openedAt)} por {userName(state.users, shift.openedBy)}
        {shift.closedAt
          ? ` · cerrado ${fmtTime(shift.closedAt)} por ${userName(state.users, shift.closedBy)}`
          : ' · en curso'}
      </div>
      <div className="doc-cols">
        <div>
          <h4>Restaurante</h4>
          <Row l="Ventas (IVA incluido)" r={fmt(r.restTotal)} />
          <Row l="Cuentas cobradas" r={r.restCount} />
          <Row l="Ticket promedio" r={fmt(r.avgTicket)} />
          <Row l="Descuentos" r={fmt(r.discounts)} />
          <Row l="Propinas" r={fmt(r.tips)} />
          <Row l={`Anulaciones de platillos (${r.voids.lines})`} r={fmt(r.voids.linesAmount)} />
          <Row l={`Cuentas anuladas (${r.voids.sales})`} r={fmt(r.voids.salesAmount)} />
          <h4>Ventas por categoría</h4>
          {r.byCategory.map((c) => (
            <Row key={c.cat} l={c.cat} r={fmt(c.amount)} />
          ))}
          <h4>Más vendidos</h4>
          {r.topItems.map((t) => (
            <Row key={t.name} l={t.name} r={t.qty} />
          ))}
        </div>
        <div>
          <h4>Hotel</h4>
          <Row l="Ocupación" r={`${r.hotel.occupancy}% (${r.hotel.occupied}/${r.hotel.rooms})`} />
          <Row l="Ingreso hospedaje (noche)" r={fmt(r.hotel.lodgingRevenue)} />
          <Row l="ADR" r={fmt(r.hotel.adr)} />
          <Row l="RevPAR" r={fmt(r.hotel.revpar)} />
          <Row l="Llegadas / salidas" r={`${r.hotel.arrivals} / ${r.hotel.departures}`} />
          <Row l="Cobrado en recepción" r={fmt(r.hotel.collected)} />
          <Row l="INGUAT cobrado" r={fmt(r.hotel.inguat)} />
          <Row l={`Cobros de eventos (${r.events?.count || 0})`} r={fmt(r.events?.collected)} />
          <Row l={`Tienda de recepción (${r.shop?.count || 0})`} r={fmt(r.shop?.total)} />
          <Row l="Ganancia de la tienda" r={fmt(r.shop?.margin)} />
          <h4>Cobros por forma de pago</h4>
          {r.byMethod.map((m) => (
            <Row key={m.key} l={`${m.label} (${m.count})`} r={fmt(m.amount)} />
          ))}
          <h4>Efectivo en caja</h4>
          <Row l="Fondo inicial" r={fmt(r.cash.float)} />
          <Row l="Ventas en efectivo" r={fmt(r.cash.cashSales)} />
          <Row l="Entradas" r={fmt(r.cash.entradas)} />
          <Row l="Salidas" r={'− ' + fmt(r.cash.salidas)} />
          <Row l="Esperado" r={fmt(r.cash.expected)} strong />
          {shift.closedAt && (
            <>
              <Row l="Contado" r={fmt(shift.counted)} />
              <Row l="Diferencia" r={fmt(shift.difference)} strong />
            </>
          )}
        </div>
      </div>
      <div className="doc-sep" />
      <Row l="Producción total (restaurante + hospedaje + eventos + tienda)" r={fmt(r.production)} strong />
      <div className="doc-signatures">
        <span>Cajero</span>
        <span>Gerente</span>
      </div>
    </div>
  );
}

export function EventDoc({ ev }) {
  const { state, fmt } = useStore();
  const t = eventTotals(ev, state);
  return (
    <div className="doc">
      <Header />
      <div className="doc-title">{ev.payments.length ? 'Estado de cuenta' : 'Cotización'} de evento</div>
      <div className="doc-center doc-small">
        {EVENT_STATUS[ev.status]} · {fmtDateTime(Date.now())}
      </div>
      <div className="doc-sep" />
      <Row l="Evento" r={ev.name} />
      <Row l="Cliente" r={ev.client.name} />
      <Row l="NIT" r={ev.client.nit} />
      <Row l="Fecha" r={fmtDate(ev.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} />
      <Row l="Horario" r={`${ev.start} – ${ev.end}`} />
      <Row l="Lugar" r={t.venue?.name || 'Restaurante / terraza'} />
      <Row l="Invitados" r={ev.guests} />
      <div className="doc-sep" />
      {t.venue && (
        <Row l={`Renta ${t.venue.name}${t.venueWaived ? ' (incluida con el menú)' : ''}`} r={fmt(t.venueAmt)} />
      )}
      {t.menu && (
        <Row
          l={`${ev.menuQty} × ${t.menu.name} (${fmt(t.menu.price)} ${EVENT_UNITS[t.menu.unit]})`}
          r={fmt(t.menuAmt)}
        />
      )}
      {t.menu?.description && <div className="doc-small">{t.menu.description}</div>}
      {ev.extras.map((x) => (
        <Row key={x.id} l={x.desc} r={fmt(x.amt)} />
      ))}
      <div className="doc-sep" />
      <Row l="Total (IVA incluido)" r={fmt(t.total)} strong />
      {ev.payments.map((p) => (
        <Row key={p.id} l={`${p.desc} · ${METHOD_LABELS[p.method]}`} r={'− ' + fmt(p.amount)} />
      ))}
      {ev.payments.length > 0 && <Row l="Saldo" r={fmt(t.balance)} strong />}
      <div className="doc-sep" />
      <div className="doc-center doc-small">
        Se requiere 50 % de anticipo para reservar la fecha. {state.config.phone && `Tel. ${state.config.phone}`}
      </div>
    </div>
  );
}
