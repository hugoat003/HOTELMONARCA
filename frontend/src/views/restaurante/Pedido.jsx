import { useState } from 'react';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { fmtTime, uid } from '../../lib/dates.js';
import { canMake } from '../../lib/inventory.js';
import { linesTotal } from '../../lib/money.js';
import { modsText, orderLabel } from '../../lib/orders.js';
import { ComandaDoc, PrecuentaDoc, TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';
import Cobro from './Cobro.jsx';
import { LineModal, ModifierModal, OrderOptionsModal, SplitModal, VoidModal } from './PedidoModals.jsx';

// Campos de la línea que pasan al comprobante
const saleLine = ({ mid, name, cat, basePrice, mods, price, qty, note, courtesy }) => ({
  mid,
  name,
  cat,
  basePrice,
  mods,
  price,
  qty,
  note,
  courtesy,
});

export default function Pedido({ orderId, go }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = usePersisted('pedido.categoria', 'Todos');
  const [search, setSearch] = usePersisted('pedido.busqueda', '');
  const [lineMenu, setLineMenu] = useState(null); // línea con nota / cortesía abierta
  const [voidLine, setVoidLine] = useState(null);
  const [options, setOptions] = useState(false);
  const [picking, setPicking] = useState(null); // platillo con modificadores
  const [splitting, setSplitting] = useState(false);
  const [paying, setPaying] = useState(null); // { lines, paidQty }
  const [sheetOpen, setSheetOpen] = useState(false); // cuenta desplegada en tablet vertical

  const order = state.orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="empty-state">
        <div>Selecciona una mesa u orden para tomar el pedido.</div>
        {state.orders.length > 0 && (
          <div className="chips" style={{ justifyContent: 'center', maxWidth: 640 }}>
            {state.orders.map((o) => (
              <button key={o.id} className="chip" onClick={() => go('pedido', { orderId: o.id })}>
                {orderLabel(o, state.tables)}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-primary" onClick={() => go('mesas')}>
          Ver mesas
        </button>
      </div>
    );
  }

  const label = orderLabel(order, state.tables);
  const table = state.tables.find((t) => t.id === order.tableId);
  const waiter = state.users.find((u) => u.id === order.waiterId);
  const total = linesTotal(order.lines);
  const pending = order.lines.filter((l) => !l.sent);
  const pendingQty = pending.reduce((a, l) => a + l.qty, 0);
  const q = search.trim().toLowerCase();
  const items = state.menu.filter(
    (m) => (cat === 'Todos' || m.cat === cat) && (!q || m.name.toLowerCase().includes(q)),
  );
  const menuItem = (mid) => state.menu.find((m) => m.id === mid);
  const groupsFor = (m) =>
    (m.modGroups || []).map((id) => state.modifierGroups.find((g) => g.id === id)).filter(Boolean);

  const addItem = (m) => (groupsFor(m).length ? setPicking(m) : update((d) => A.addItem(d, order.id, m)));

  const sendKitchen = () => {
    const number = state.counters.comanda + 1;
    update((d) => A.sendKitchen(d, order.id, { userId: user.id, label }));
    ui.preview(
      'Comanda enviada a cocina',
      <ComandaDoc label={label} lines={pending} number={number} waiterId={order.waiterId} guests={order.guests} />,
    );
  };

  const startPay = (lines, paidQty) => {
    if (!state.shift) {
      ui.notify('La caja está cerrada. Pide a recepción o gerencia que abra el turno.');
      return;
    }
    setPaying({ lines, paidQty });
  };

  const confirmPay = (res) => {
    const sale = {
      id: uid('s'),
      number: state.counters.doc + 1,
      kind: 'restaurante',
      ts: Date.now(),
      ref: label,
      lines: paying.lines.map(saleLine),
      subtotal: linesTotal(paying.lines),
      ...res,
      waiterId: order.waiterId,
      cashierId: user.id,
      shiftId: state.shift.id,
      status: 'ok',
    };
    update((d) => A.registerSale(d, sale, { orderId: order.id, paidQty: paying.paidQty }));
    setPaying(null);
    setSplitting(false);
    const closed = paying.lines.reduce((a, l) => a + l.qty, 0) === order.lines.reduce((a, l) => a + l.qty, 0);
    if (closed) go('mesas');
    ui.notify(`${label} · cobrado ${fmt(sale.grand)}`);
    ui.preview('Pago registrado', <TicketDoc sale={sale} />);
  };

  const payAll = () => startPay(order.lines, Object.fromEntries(order.lines.map((l) => [l.id, l.qty])));

  return (
    <div className="split pedido-split" style={{ '--side': '420px' }}>
      <div className="split-main pedido-main">
        <div className="row gap-12">
          <input
            className="input search"
            placeholder="Buscar platillo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chips">
          {['Todos', ...state.categories].map((c) => (
            <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="menu-grid">
          {items.map((m) => {
            const enough = canMake(m, state.inventory);
            const available = m.active && enough;
            return (
              <button
                key={m.id}
                className={'menu-item' + (available ? '' : ' soldout')}
                disabled={!available}
                onClick={() => addItem(m)}
              >
                <span className="menu-item-name">{m.name}</span>
                <span className="menu-item-foot">
                  <span className="menu-item-cat">
                    {!m.active
                      ? 'Agotado'
                      : !enough
                        ? 'Sin insumos'
                        : m.modGroups?.length
                          ? `${m.cat} · opciones`
                          : m.cat}
                  </span>
                  <span className="menu-item-price">{fmt(m.price)}</span>
                </span>
              </button>
            );
          })}
          {!items.length && <div className="panel-sub">No hay platillos que coincidan.</div>}
        </div>
      </div>

      <div className={'side-panel' + (sheetOpen ? ' open' : '')}>
        {/* En tablet vertical la cuenta es una hoja inferior; esta barra la abre y la cierra */}
        <button className="sheet-bar" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
          <span>
            {sheetOpen ? '▼ Ocultar cuenta' : `▲ ${label} · ${order.lines.reduce((a, l) => a + l.qty, 0)} productos`}
            {!sheetOpen && pendingQty > 0 ? ` · ${pendingQty} sin enviar` : ''}
          </span>
          <span className="sheet-total">{fmt(total)}</span>
        </button>
        <div className="ticket-head">
          <div>
            <div className="panel-title">{label}</div>
            <div className="panel-sub">
              {table ? table.zone + ' · ' : ''}
              {order.guests} pers. · {waiter?.name} · desde {fmtTime(order.openedAt)}
            </div>
          </div>
          <button className="btn-small" onClick={() => setOptions(true)}>
            Opciones
          </button>
        </div>

        <div className="ticket-lines">
          {!order.lines.length && <div className="ticket-empty">Sin productos. Toca un platillo para agregarlo.</div>}
          {order.lines.map((l) => (
            <div key={l.id} className="line">
              <div className="stepper">
                <button onClick={() => (l.sent ? setVoidLine(l) : update((d) => A.changeQty(d, order.id, l.id, -1)))}>
                  −
                </button>
                <span>{l.qty}</span>
                <button
                  onClick={() =>
                    update((d) =>
                      l.sent
                        ? A.addItem(
                            d,
                            order.id,
                            menuItem(l.mid) || { id: l.mid, name: l.name, cat: l.cat, price: l.basePrice ?? l.price },
                            l.mods || [],
                          )
                        : A.changeQty(d, order.id, l.id, 1),
                    )
                  }
                >
                  +
                </button>
              </div>
              <button className="line-body" onClick={() => setLineMenu(l)} title="Nota y cortesía">
                <div className="line-name">{l.name}</div>
                {l.mods?.length > 0 && <div className="line-mods">{modsText(l.mods)}</div>}
                {l.note && <div className="line-note">{l.note}</div>}
                <div className={'line-tag' + (l.sent ? '' : ' new')}>
                  {l.courtesy ? 'Cortesía · ' : ''}
                  {l.sent ? 'En cocina' : 'Nuevo · toca para nota'}
                </div>
              </button>
              <div className="line-amt">
                {l.courtesy && <s className="panel-sub">{fmt(l.courtesy.price * l.qty)}</s>} {fmt(l.price * l.qty)}
              </div>
            </div>
          ))}
        </div>

        <div className="ticket-totals">
          <div className="row grand">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
          {order.lines.length ? (
            <>
              <div className="btn-row three">
                <button
                  className="btn btn-quiet"
                  onClick={() =>
                    ui.preview(
                      'Precuenta',
                      <PrecuentaDoc
                        label={label}
                        lines={order.lines}
                        waiterId={order.waiterId}
                        guests={order.guests}
                      />,
                    )
                  }
                >
                  Precuenta
                </button>
                <button className="btn btn-quiet" onClick={() => setSplitting(true)}>
                  Dividir
                </button>
                <button className="btn btn-quiet" onClick={() => go('mesas')}>
                  Mesas
                </button>
              </div>
              <div className="btn-row">
                <button className="btn" disabled={!pendingQty} onClick={sendKitchen}>
                  {pendingQty ? `Enviar a cocina (${pendingQty})` : 'Enviado a cocina'}
                </button>
                <button className="btn btn-primary" onClick={payAll}>
                  Cobrar
                </button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button className="btn" onClick={() => go('mesas')}>
                Volver
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  update((d) => A.closeOrder(d, order.id));
                  go('mesas');
                  ui.notify(`${label} liberada`);
                }}
              >
                {order.type === 'mesa' ? 'Liberar mesa' : 'Cancelar orden'}
              </button>
            </div>
          )}
        </div>
      </div>

      {picking && (
        <ModifierModal
          item={picking}
          groups={groupsFor(picking)}
          fmt={fmt}
          onClose={() => setPicking(null)}
          onAdd={(mods) => {
            update((d) => A.addItem(d, order.id, picking, mods));
            setPicking(null);
          }}
        />
      )}
      {lineMenu && (
        <LineModal
          line={order.lines.find((l) => l.id === lineMenu.id) || lineMenu}
          fmt={fmt}
          onClose={() => setLineMenu(null)}
          onNote={(note) => {
            update((d) => A.setNote(d, order.id, lineMenu.id, note));
            setLineMenu(null);
          }}
          onCourtesy={(reason) =>
            ui.authorize(`Cortesía de ${lineMenu.name}`, (mgr) => {
              update((d) => A.setCourtesy(d, order.id, lineMenu.id, { reason, authId: mgr.id, userId: user.id }));
              setLineMenu(null);
              ui.notify(`Cortesía aplicada · ${lineMenu.name}`);
            })
          }
          onRemoveCourtesy={() => {
            update((d) => A.setCourtesy(d, order.id, lineMenu.id, null));
            setLineMenu(null);
          }}
        />
      )}
      {voidLine && (
        <VoidModal
          line={voidLine}
          fmt={fmt}
          hasRecipe={!!menuItem(voidLine.mid)?.recipe?.length}
          onClose={() => setVoidLine(null)}
          onConfirm={(qty, reason, returnStock) =>
            ui.authorize(`Anular ${qty} × ${voidLine.name} (ya enviado a cocina)`, (mgr) => {
              update((d) =>
                A.voidLine(d, {
                  orderId: order.id,
                  lineId: voidLine.id,
                  qty,
                  reason,
                  userId: user.id,
                  authId: mgr.id,
                  label,
                  returnStock,
                }),
              );
              setVoidLine(null);
              ui.notify(`Anulado: ${qty} × ${voidLine.name}`);
            })
          }
        />
      )}
      {options && (
        <OrderOptionsModal
          order={order}
          state={state}
          fmt={fmt}
          onClose={() => setOptions(false)}
          onMove={(t) => {
            update((d) => A.moveOrder(d, order.id, t.id));
            setOptions(false);
            ui.notify(`Cuenta movida a ${t.name}`);
          }}
          onJoin={(other) => {
            update((d) => A.joinOrders(d, order.id, other.id));
            setOptions(false);
            ui.notify(`${orderLabel(other, state.tables)} unida a esta cuenta`);
          }}
          onTransfer={(qtys, t, targetOrder) => {
            const target = targetOrder
              ? { toOrderId: targetOrder.id }
              : { newOrder: { id: uid('o'), tableId: t.id, guests: 1, waiterId: order.waiterId } };
            update((d) => A.transferLines(d, order.id, qtys, target));
            setOptions(false);
            ui.notify(`Platillos pasados a ${t.name}`);
            const all = Object.values(qtys).reduce((a, b) => a + b, 0) === order.lines.reduce((a, l) => a + l.qty, 0);
            if (all) go('mesas');
          }}
          onWaiter={(w) => {
            update((d) => A.setOrderWaiter(d, order.id, w.id));
            setOptions(false);
            ui.notify(`Ahora atiende ${w.name}`);
          }}
        />
      )}
      {splitting && !paying && (
        <SplitModal
          lines={order.lines}
          fmt={fmt}
          onClose={() => setSplitting(false)}
          onPay={(paidQty) =>
            startPay(
              order.lines.filter((l) => paidQty[l.id]).map((l) => ({ ...l, qty: paidQty[l.id] })),
              paidQty,
            )
          }
        />
      )}
      {paying && (
        <Cobro
          title={`Cobrar ${label}`}
          amount={linesTotal(paying.lines)}
          allowDiscount
          allowTip
          allowRoom
          onCancel={() => setPaying(null)}
          onConfirm={confirmPay}
        />
      )}
    </div>
  );
}
