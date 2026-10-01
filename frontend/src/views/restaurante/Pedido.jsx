import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { QUICK_NOTES } from '../../data.js';
import { fmtTime, uid } from '../../lib/dates.js';
import { ivaIncluded, linesTotal } from '../../lib/money.js';
import { ComandaDoc, PrecuentaDoc, TicketDoc } from '../../print/Docs.jsx';
import { A, orderLabel } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import Cobro from './Cobro.jsx';

const VOID_REASONS = ['Error de captura', 'Cliente cambió de opinión', 'Platillo devuelto', 'Demora en cocina'];

export default function Pedido({ orderId, go }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = useState('Todos');
  const [search, setSearch] = useState('');
  const [noteLine, setNoteLine] = useState(null);
  const [voidLine, setVoidLine] = useState(null);
  const [moving, setMoving] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [paying, setPaying] = useState(null); // { lines, paidQty }

  const order = state.orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="empty-state">
        <div>Selecciona una mesa u orden para tomar el pedido.</div>
        {state.orders.length > 0 && (
          <div className="chips" style={{ justifyContent: 'center', maxWidth: 640 }}>
            {state.orders.map((o) => (
              <button key={o.id} className="chip" onClick={() => go('pedido', { orderId: o.id })}>{orderLabel(o, state.tables)}</button>
            ))}
          </div>
        )}
        <button className="btn btn-primary" onClick={() => go('mesas')}>Ver mesas</button>
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
  const items = state.menu.filter((m) => (cat === 'Todos' || m.cat === cat) && (!q || m.name.toLowerCase().includes(q)));

  const sendKitchen = () => {
    const number = state.counters.comanda + 1;
    update((d) => A.sendKitchen(d, order.id));
    ui.preview('Comanda enviada a cocina', <ComandaDoc label={label} lines={pending} number={number} waiterId={order.waiterId} guests={order.guests} />);
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
      id: uid('s'), number: state.counters.doc + 1, kind: 'restaurante', ts: Date.now(), ref: label,
      lines: paying.lines.map(({ mid, name, cat, price, qty, note }) => ({ mid, name, cat, price, qty, note })),
      subtotal: linesTotal(paying.lines), ...res, waiterId: order.waiterId, cashierId: user.id, shiftId: state.shift.id, status: 'ok',
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
    <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) 420px' }}>
      <div className="split-main" style={{ padding: '20px 24px', gap: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <input className="input search" placeholder="Buscar platillo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chips">
          {['Todos', ...state.categories].map((c) => (
            <button key={c} className={'chip' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="menu-grid">
          {items.map((m) => (
            <button key={m.id} className={'menu-item' + (m.active ? '' : ' soldout')} disabled={!m.active}
              onClick={() => update((d) => A.addItem(d, order.id, m))}>
              <span className="menu-item-name">{m.name}</span>
              <span className="menu-item-foot">
                <span className="menu-item-cat">{m.active ? m.cat : 'Agotado'}</span>
                <span className="menu-item-price">{fmt(m.price)}</span>
              </span>
            </button>
          ))}
          {!items.length && <div className="panel-sub">No hay platillos que coincidan.</div>}
        </div>
      </div>

      <div className="side-panel">
        <div className="ticket-head">
          <div>
            <div className="panel-title">{label}</div>
            <div className="panel-sub">
              {table ? table.zone + ' · ' : ''}{order.guests} pers. · {waiter?.name} · desde {fmtTime(order.openedAt)}
            </div>
          </div>
          {order.type === 'mesa' && <button className="btn-small" onClick={() => setMoving(true)}>Cambiar mesa</button>}
        </div>

        <div className="ticket-lines">
          {!order.lines.length && <div className="ticket-empty">Sin productos. Toca un platillo para agregarlo.</div>}
          {order.lines.map((l) => (
            <div key={l.id} className="line">
              <div className="stepper">
                <button onClick={() => (l.sent ? setVoidLine(l) : update((d) => A.changeQty(d, order.id, l.id, -1)))}>−</button>
                <span>{l.qty}</span>
                <button onClick={() => update((d) => (l.sent ? A.addItem(d, order.id, { id: l.mid, name: l.name, cat: l.cat, price: l.price }) : A.changeQty(d, order.id, l.id, 1)))}>+</button>
              </div>
              <button className="line-body" onClick={() => !l.sent && setNoteLine(l)} title={l.sent ? '' : 'Agregar nota'}>
                <div className="line-name">{l.name}</div>
                {l.note && <div className="line-note">{l.note}</div>}
                <div className={'line-tag' + (l.sent ? '' : ' new')}>{l.sent ? 'En cocina' : 'Nuevo · toca para nota'}</div>
              </button>
              <div className="line-amt">{fmt(l.price * l.qty)}</div>
            </div>
          ))}
        </div>

        <div className="ticket-totals">
          <div className="row muted"><span>IVA incluido ({state.config.iva}%)</span><span>{fmt(ivaIncluded(total, state.config.iva))}</span></div>
          <div className="row grand"><span>Total</span><span>{fmt(total)}</span></div>
          {order.lines.length ? (
            <>
              <div className="btn-row three">
                <button className="btn btn-quiet" onClick={() => ui.preview('Precuenta', <PrecuentaDoc label={label} lines={order.lines} waiterId={order.waiterId} guests={order.guests} />)}>Precuenta</button>
                <button className="btn btn-quiet" onClick={() => setSplitting(true)}>Dividir</button>
                <button className="btn btn-quiet" onClick={() => go('mesas')}>Mesas</button>
              </div>
              <div className="btn-row">
                <button className="btn" disabled={!pendingQty} onClick={sendKitchen}>
                  {pendingQty ? `Enviar a cocina (${pendingQty})` : 'Enviado a cocina'}
                </button>
                <button className="btn btn-primary" onClick={payAll}>Cobrar</button>
              </div>
            </>
          ) : (
            <div className="btn-row">
              <button className="btn" onClick={() => go('mesas')}>Volver</button>
              <button className="btn btn-primary" onClick={() => { update((d) => A.closeOrder(d, order.id)); go('mesas'); ui.notify(`${label} liberada`); }}>
                {order.type === 'mesa' ? 'Liberar mesa' : 'Cancelar orden'}
              </button>
            </div>
          )}
        </div>
      </div>

      {noteLine && (
        <NoteModal line={noteLine} onClose={() => setNoteLine(null)}
          onSave={(note) => { update((d) => A.setNote(d, order.id, noteLine.id, note)); setNoteLine(null); }} />
      )}
      {voidLine && (
        <VoidModal line={voidLine} fmt={fmt} onClose={() => setVoidLine(null)}
          onConfirm={(qty, reason) =>
            ui.authorize(`Anular ${qty} × ${voidLine.name} (ya enviado a cocina)`, (mgr) => {
              update((d) => A.voidLine(d, { orderId: order.id, lineId: voidLine.id, qty, reason, userId: user.id, authId: mgr.id, label }));
              setVoidLine(null);
              ui.notify(`Anulado: ${qty} × ${voidLine.name}`);
            })
          } />
      )}
      {moving && (
        <MoveModal tables={state.tables.filter((t) => !state.orders.some((o) => o.type === 'mesa' && o.tableId === t.id))}
          onClose={() => setMoving(false)}
          onMove={(t) => { update((d) => A.moveOrder(d, order.id, t.id)); setMoving(false); ui.notify(`Orden movida a ${t.name}`); }} />
      )}
      {splitting && !paying && (
        <SplitModal lines={order.lines} fmt={fmt} onClose={() => setSplitting(false)}
          onPay={(paidQty) => startPay(order.lines.filter((l) => paidQty[l.id]).map((l) => ({ ...l, qty: paidQty[l.id] })), paidQty)} />
      )}
      {paying && (
        <Cobro title={`Cobrar ${label}`} amount={linesTotal(paying.lines)} allowDiscount allowTip allowRoom
          onCancel={() => setPaying(null)} onConfirm={confirmPay} />
      )}
    </div>
  );
}

function NoteModal({ line, onClose, onSave }) {
  const [note, setNote] = useState(line.note);
  const toggle = (n) => setNote((cur) => (cur.includes(n) ? cur.replace(n, '').replace(/^[,\s]+|[,\s]+$/g, '').replace(/,\s*,/g, ',') : cur ? cur + ', ' + n : n));
  return (
    <Modal title={line.name} onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onSave(note.trim())}>Guardar nota</button></>}>
      <Field label="Nota para cocina">
        <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSave(note.trim())} placeholder="Ej. sin cebolla" />
      </Field>
      <div className="chips">
        {QUICK_NOTES.map((n) => <button key={n} className={'chip small' + (note.includes(n) ? ' active' : '')} onClick={() => toggle(n)}>{n}</button>)}
      </div>
    </Modal>
  );
}

function VoidModal({ line, fmt, onClose, onConfirm }) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  return (
    <Modal title="Anular platillo" onClose={onClose} width={460}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary btn-danger" disabled={!reason.trim()} onClick={() => onConfirm(qty, reason.trim())}>Anular {fmt(line.price * qty)}</button></>}>
      <div className="note-box">{line.name} ya fue enviado a cocina. La anulación queda registrada en el reporte y requiere autorización de un gerente.</div>
      {line.qty > 1 && (
        <Field as="div" label="Cantidad a anular">
          <div className="stepper big">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span>{qty}</span><button onClick={() => setQty(Math.min(line.qty, qty + 1))}>+</button>
          </div>
        </Field>
      )}
      <Field as="div" label="Motivo">
        <div className="chips">
          {VOID_REASONS.map((r) => <button key={r} className={'chip small' + (reason === r ? ' active' : '')} onClick={() => setReason(r)}>{r}</button>)}
        </div>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Otro motivo…" />
      </Field>
    </Modal>
  );
}

function MoveModal({ tables, onClose, onMove }) {
  return (
    <Modal title="Cambiar a otra mesa" onClose={onClose} width={520}>
      {tables.length ? (
        <div className="tile-grid small">
          {tables.map((t) => (
            <button key={t.id} className="chip" onClick={() => onMove(t)}>{t.name} · {t.zone} · {t.seats} pers.</button>
          ))}
        </div>
      ) : <div className="panel-sub">No hay mesas libres.</div>}
      <button className="btn btn-quiet" onClick={onClose}>Cancelar</button>
    </Modal>
  );
}

function SplitModal({ lines, fmt, onClose, onPay }) {
  const [sel, setSel] = useState({});
  const set = (id, v) => setSel((s) => ({ ...s, [id]: v }));
  const amount = lines.reduce((a, l) => a + l.price * (sel[l.id] || 0), 0);
  const any = Object.values(sel).some((v) => v > 0);
  return (
    <Modal title="Dividir cuenta" aside={fmt(amount)} onClose={onClose} width={520}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!any} onClick={() => onPay(Object.fromEntries(Object.entries(sel).filter(([, v]) => v > 0)))}>Cobrar selección</button></>}>
      <div className="panel-sub" style={{ fontSize: 14 }}>
        Elige qué platillos paga esta persona. Lo que no se cobre queda en la mesa. Para partes iguales usa “Dividir en” dentro del cobro.
      </div>
      <div className="stack-tight">
        {lines.map((l) => (
          <div key={l.id} className="line" style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}>
            <div className="stepper">
              <button onClick={() => set(l.id, Math.max(0, (sel[l.id] || 0) - 1))}>−</button>
              <span>{sel[l.id] || 0}</span>
              <button onClick={() => set(l.id, Math.min(l.qty, (sel[l.id] || 0) + 1))}>+</button>
            </div>
            <div><div className="line-name">{l.name}</div><div className="line-tag">de {l.qty}</div></div>
            <div className="line-amt">{fmt(l.price * (sel[l.id] || 0))}</div>
          </div>
        ))}
      </div>
      <button className="link" onClick={() => setSel(Object.fromEntries(lines.map((l) => [l.id, l.qty])))}>Seleccionar todo</button>
    </Modal>
  );
}
