import { useEffect, useState } from 'react';
import TableMap from '../../components/TableMap.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { TABLE_COLORS } from '../../data.js';
import { uid } from '../../lib/dates.js';
import { linesTotal } from '../../lib/money.js';
import { placed } from '../../lib/tablemap.js';
import { orderLabel, tableOrder } from '../../lib/orders.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import MapEditor from './MapEditor.jsx';
import { usePersisted } from '../../store/usePersisted.js';

const firstName = (users, id) => (users.find((u) => u.id === id)?.name || '').split(' ')[0];
const minutesNum = (ts) => Math.max(0, Math.round((Date.now() - ts) / 60000));
const minutes = (ts) => {
  const m = minutesNum(ts);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
// Formato corto para que quepa dentro de las mesas pequeñas del mapa
const shortMinutes = (ts) => {
  const m = minutesNum(ts);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
};

export default function Mesas({ go }) {
  const { state, user, fmt, update } = useStore();
  const [opening, setOpening] = useState(null); // mesa a abrir
  const [takeout, setTakeout] = useState(false);
  const [savedZone, setZone] = usePersisted('mesas.zona', null);
  const [editing, setEditing] = useState(false);
  const [, tick] = useState(0);

  // Refresca los minutos de las cuentas abiertas
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const tables = state.tables.map(placed);
  const zones = [...new Set([...tables.map((t) => t.zone), ...state.mapDecor.map((d) => d.zone)])];
  const orderFor = (tableId) => tableOrder(state.orders, tableId);
  const waiters = state.users.filter((u) => u.active && (u.role === 'mesero' || u.id === user.id));
  const open = [...state.orders].sort((a, b) => a.openedAt - b.openedAt);
  const occupied = state.orders.filter((o) => o.type === 'mesa').length;

  const openOrder = (data) => {
    const id = uid('o');
    update((d) => (data.tableId ? A.openTable(d, { id, ...data }) : A.openTakeout(d, { id, ...data })));
    setOpening(null);
    setTakeout(false);
    go('pedido', { orderId: id });
  };
  const clickTable = (t) => {
    const o = orderFor(t.id);
    if (o) go('pedido', { orderId: o.id });
    else setOpening(t);
  };

  // Apariencia de cada mesa en el mapa según su estado
  const look = (t) => {
    const o = orderFor(t.id);
    const status = o ? 'ocupada' : t.reservedAt ? 'reservada' : 'libre';
    const [bg, fg, border, sub] = TABLE_COLORS[status];
    // Mesa unida a la cuenta de otra: muestra a cuál pertenece
    const joinedTo = o && o.tableId !== t.id ? state.tables.find((x) => x.id === o.tableId) : null;
    const lines = joinedTo
      ? [`Unida a ${joinedTo.name.replace('Mesa ', '')}`]
      : o
        ? [fmt(linesTotal(o.lines)), `${firstName(state.users, o.waiterId)} · ${shortMinutes(o.openedAt)}`]
        : t.reservedAt
          ? [`Reservada ${t.reservedAt}`]
          : [`${t.seats} pers.`];
    return {
      bg,
      fg,
      border,
      sub,
      lines,
      strong: status === 'reservada' || !!o?.joined?.length,
      joined: !!o?.joined?.length,
      chair: o ? '#6F675E' : '#D6CFC4',
      pulse: o && o.lines.some((l) => !l.sent),
    };
  };

  if (editing && user.role === 'gerente') {
    return (
      <div className="page gap-16">
        <MapEditor onDone={() => setEditing(false)} />
      </div>
    );
  }

  const zone = zones.includes(savedZone) ? savedZone : zones[0];
  const zt = tables.filter((t) => t.zone === zone);

  return (
    <div className="split mesas-split" style={{ '--side': '360px' }}>
      <div className="split-main gap-16">
        {/* Una zona a la vez: en la tablet el mapa ocupa todo el ancho y las mesas son fáciles de tocar */}
        <div className="row items-center gap-12">
          <div className="zone-tabs" role="tablist">
            {zones.map((z) => {
              const zts = tables.filter((t) => t.zone === z);
              const busy = zts.filter((t) => orderFor(t.id)).length;
              const unsent = zts.some((t) => orderFor(t.id)?.lines.some((l) => !l.sent));
              return (
                <button
                  key={z}
                  role="tab"
                  aria-selected={z === zone}
                  className={'zone-tab' + (z === zone ? ' active' : '')}
                  onClick={() => setZone(z)}
                >
                  <span>{z}</span>
                  <span className="zone-tab-count">
                    {busy}/{zts.length}
                    {unsent && <span className="pulse-dot" aria-label="pedido sin enviar" />}
                  </span>
                </button>
              );
            })}
          </div>
          {user.role === 'gerente' && (
            <button className="btn small" onClick={() => setEditing(true)}>
              Editar mapa
            </button>
          )}
        </div>

        <TableMap
          tables={zt}
          decor={state.mapDecor.filter((d) => d.zone === zone)}
          getLook={look}
          onTableClick={clickTable}
        />

        <div className="legend">
          <span>
            <span className="swatch" style={{ border: '1px solid #D6CFC4' }} />
            Libre
          </span>
          <span>
            <span className="swatch" style={{ background: '#1B1917' }} />
            Ocupada
          </span>
          <span>
            <span className="swatch" style={{ border: '2px solid #1B1917' }} />
            Reservada
          </span>
          <span>
            <span className="swatch pulse-dot" />
            Pedido sin enviar
          </span>
        </div>
      </div>

      <div className="side-panel">
        <div className="ticket-head">
          <div>
            <div className="panel-title">Cuentas abiertas</div>
            <div className="panel-sub">
              {occupied} de {state.tables.length} mesas · {open.length} cuenta{open.length === 1 ? '' : 's'}
            </div>
          </div>
          <button className="btn-small" onClick={() => setTakeout(true)}>
            + Para llevar
          </button>
        </div>
        <div className="ticket-lines">
          {open.map((o) => {
            const t = state.tables.find((x) => x.id === o.tableId);
            const pending = o.lines.filter((l) => !l.sent).reduce((a, l) => a + l.qty, 0);
            const items = o.lines.reduce((a, l) => a + l.qty, 0);
            return (
              <button key={o.id} className="account" onClick={() => go('pedido', { orderId: o.id })}>
                <span className="account-top">
                  <strong>{orderLabel(o, state.tables)}</strong>
                  <strong>{fmt(linesTotal(o.lines))}</strong>
                </span>
                <span className="account-meta">
                  {t ? t.zone + ' · ' : ''}
                  {o.guests} pers. · {firstName(state.users, o.waiterId)} · {items} producto{items === 1 ? '' : 's'}
                </span>
                <span className="account-meta">
                  <span className={minutesNum(o.openedAt) >= 90 ? 'urgent' : ''}>
                    Abierta hace {minutes(o.openedAt)}
                  </span>
                  {pending > 0 && <span className="tag status-cotizado">{pending} sin enviar</span>}
                </span>
              </button>
            );
          })}
          {!open.length && <div className="ticket-empty">No hay cuentas abiertas.</div>}
        </div>
        <div className="ticket-totals">
          <div className="row grand">
            <span>Total abierto</span>
            <span>{fmt(state.orders.reduce((a, o) => a + linesTotal(o.lines), 0))}</span>
          </div>
        </div>
      </div>

      {opening && (
        <OpenTableModal
          table={opening}
          waiters={waiters}
          defaultWaiter={user.role === 'mesero' ? user.id : waiters.find((w) => w.role === 'mesero')?.id}
          onClose={() => setOpening(null)}
          onOpen={(guests, waiterId) => openOrder({ tableId: opening.id, guests, waiterId })}
        />
      )}
      {takeout && (
        <TakeoutModal
          onClose={() => setTakeout(false)}
          onOpen={(customer) => openOrder({ customer, waiterId: user.id })}
        />
      )}
    </div>
  );
}

function OpenTableModal({ table, waiters, defaultWaiter, onClose, onOpen }) {
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [waiterId, setWaiterId] = useState(defaultWaiter || waiters[0]?.id);
  return (
    <Modal
      title={`Abrir ${table.name}`}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => onOpen(guests, waiterId)}>
            Abrir mesa
          </button>
        </>
      }
    >
      {table.reservedAt && (
        <div className="note-box">
          Esta mesa está reservada para las {table.reservedAt}. Al abrirla se libera la reserva.
        </div>
      )}
      <Field as="div" label="Comensales">
        <div className="stepper big">
          <button onClick={() => setGuests(Math.max(1, guests - 1))}>−</button>
          <span>{guests}</span>
          <button onClick={() => setGuests(guests + 1)}>+</button>
        </div>
      </Field>
      <Field as="div" label="Mesero">
        <div className="chips">
          {waiters.map((w) => (
            <button
              key={w.id}
              className={'chip' + (waiterId === w.id ? ' active' : '')}
              onClick={() => setWaiterId(w.id)}
            >
              {w.name}
            </button>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

function TakeoutModal({ onClose, onOpen }) {
  const [customer, setCustomer] = useState('');
  return (
    <Modal
      title="Orden para llevar"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={() => onOpen(customer.trim())}>
            Crear orden
          </button>
        </>
      }
    >
      <Field label="Nombre del cliente" hint="opcional">
        <input
          className="input"
          autoFocus
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onOpen(customer.trim())}
          placeholder="Ej. Sr. López"
        />
      </Field>
    </Modal>
  );
}
