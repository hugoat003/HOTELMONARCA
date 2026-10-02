import { useEffect, useState } from 'react';
import TableMap from '../../components/TableMap.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
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
  const ui = useUI();
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
  const open = [...state.orders].sort((a, b) => a.openedAt - b.openedAt);
  const occupied = state.orders.filter((o) => o.type === 'mesa').length;

  // Tocar una mesa libre abre la cuenta a nombre de quien tiene la sesión y pasa directo al menú
  const openOrder = (data) => {
    const id = uid('o');
    update((d) =>
      data.tableId ? A.openTable(d, { id, ...data, waiterId: user.id }) : A.openTakeout(d, { id, waiterId: user.id }),
    );
    go('pedido', { orderId: id });
  };
  const clickTable = (t) => {
    const o = orderFor(t.id);
    if (o) return go('pedido', { orderId: o.id });
    if (!t.reservedAt) return openOrder({ tableId: t.id });
    ui.confirm(
      {
        title: `${t.name} está reservada`,
        message: `Tiene una reserva para las ${t.reservedAt}. Si la abres ahora, la reserva se libera.`,
        confirmLabel: 'Abrir mesa',
      },
      () => openOrder({ tableId: t.id }),
    );
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
          <button className="btn-small" onClick={() => openOrder({})}>
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
                  {firstName(state.users, o.waiterId)} · {items} producto{items === 1 ? '' : 's'}
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
    </div>
  );
}
