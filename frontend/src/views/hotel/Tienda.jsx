import { useState } from 'react';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { SHOP_CATS, SHOP_MOVE_LABELS, SHOP_MOVES } from '../../data.js';
import { fmtDateTime, uid } from '../../lib/dates.js';
import { stockStatus } from '../../lib/inventory.js';
import { ivaIncluded, linesTotal, sum } from '../../lib/money.js';
import { TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import Cobro from '../restaurante/Cobro.jsx';
import { ItemModal, MoveModal, qtyFmt } from '../restaurante/Inventario.jsx';

const STATUS_LABEL = { ok: 'OK', bajo: 'Bajo mínimo', agotado: 'Agotado' };

export default function Tienda() {
  const [tab, setTab] = useState('vender');
  return (
    <div className="page" style={{ gap: 18, height: '100%' }}>
      <div className="tabs">
        <button className={'tab' + (tab === 'vender' ? ' active' : '')} onClick={() => setTab('vender')}>Vender</button>
        <button className={'tab' + (tab === 'existencias' ? ' active' : '')} onClick={() => setTab('existencias')}>Existencias</button>
      </div>
      {tab === 'vender' ? <Vender /> : <Existencias />}
    </div>
  );
}

function Vender() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = useState('Todos');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({}); // itemId -> cantidad
  const [paying, setPaying] = useState(false);

  const q = search.trim().toLowerCase();
  const items = state.shopItems
    .filter((it) => it.active !== false && (cat === 'Todos' || it.cat === cat) && (!q || it.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const lines = Object.entries(cart)
    .map(([id, qty]) => {
      const it = state.shopItems.find((x) => x.id === id);
      return it && { itemId: id, name: it.name, cat: it.cat, price: it.price, cost: it.cost, qty: Math.min(qty, it.stock) };
    })
    .filter((l) => l && l.qty > 0);
  const total = linesTotal(lines);

  const add = (it, delta = 1) => setCart((c) => {
    const qty = Math.max(0, Math.min(it.stock, (c[it.id] || 0) + delta));
    const next = { ...c, [it.id]: qty };
    if (!qty) delete next[it.id];
    return next;
  });

  const confirm = (r) => {
    const roomPay = r.payments.find((p) => p.method === 'habitacion');
    const sale = {
      id: uid('s'), number: state.counters.doc + 1, kind: 'tienda', ts: Date.now(),
      ref: roomPay ? `Tienda · Hab. ${roomPay.roomN}` : 'Tienda de recepción', lines, subtotal: total,
      ...r, cashierId: user.id, shiftId: state.shift.id, status: 'ok',
    };
    update((d) => A.registerSale(d, sale));
    setPaying(false);
    setCart({});
    ui.notify(`Venta registrada · ${fmt(sale.grand)}`);
    ui.preview('Venta de tienda', <TicketDoc sale={sale} />);
  };

  return (
    <div className="split shop-split">
      <div className="stack-tight" style={{ gap: 14, minWidth: 0 }}>
        <input className="input search" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="chips">
          {['Todos', ...SHOP_CATS].map((c) => <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="menu-grid">
          {items.map((it) => {
            const left = it.stock - (cart[it.id] || 0);
            return (
              <button key={it.id} className={'menu-item' + (it.stock <= 0 ? ' soldout' : '')} disabled={it.stock <= 0} onClick={() => left > 0 ? add(it) : ui.notify(`No hay más ${it.name} en existencia`)}>
                <span className="menu-item-name">{it.name}</span>
                <span className="menu-item-foot">
                  <span className={'menu-item-cat' + (stockStatus(it) !== 'ok' && it.stock > 0 ? ' urgent' : '')}>{it.stock <= 0 ? 'Agotado' : `Quedan ${left}`}</span>
                  <span className="menu-item-price">{fmt(it.price)}</span>
                </span>
              </button>
            );
          })}
          {!items.length && <div className="panel-sub">No hay productos que coincidan.</div>}
        </div>
      </div>

      <div className="card shop-cart">
        <div className="row items-center">
          <div className="panel-title" style={{ fontSize: 22 }}>Venta</div>
          {lines.length > 0 && <button className="link" onClick={() => setCart({})}>Vaciar</button>}
        </div>
        <div className="shop-lines">
          {!lines.length && <div className="ticket-empty">Toca un producto para agregarlo.</div>}
          {lines.map((l) => {
            const it = state.shopItems.find((x) => x.id === l.itemId);
            return (
              <div key={l.itemId} className="line">
                <div className="stepper">
                  <button onClick={() => add(it, -1)}>−</button>
                  <span>{l.qty}</span>
                  <button onClick={() => add(it, 1)} disabled={l.qty >= it.stock}>+</button>
                </div>
                <div><div className="line-name">{l.name}</div><div className="line-tag">{fmt(l.price)} c/u</div></div>
                <div className="line-amt">{fmt(l.price * l.qty)}</div>
              </div>
            );
          })}
        </div>
        <div className="row muted"><span>IVA incluido ({state.config.iva}%)</span><span>{fmt(ivaIncluded(total, state.config.iva))}</span></div>
        <div className="row grand"><span>Total</span><span>{fmt(total)}</span></div>
        <button className="btn btn-primary" disabled={!lines.length}
          onClick={() => (state.shift ? setPaying(true) : ui.notify('Abre el turno de caja para cobrar.'))}>Cobrar</button>
        <div className="panel-sub text-xs">Se puede cobrar en efectivo, tarjeta, transferencia o cargar a la habitación del huésped.</div>
      </div>

      {paying && <Cobro title="Cobrar venta de tienda" amount={total} allowDiscount allowRoom onCancel={() => setPaying(false)} onConfirm={confirm} />}
    </div>
  );
}

function Existencias() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [cat, setCat] = useState('Todas');
  const [onlyLow, setOnlyLow] = useState(false);
  const [move, setMove] = useState(null);
  const [edit, setEdit] = useState(null);

  const items = state.shopItems
    .filter((it) => (cat === 'Todas' || it.cat === cat) && (!onlyLow || stockStatus(it) !== 'ok'))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  const low = state.shopItems.filter((it) => stockStatus(it) !== 'ok');
  const turnSales = state.sales.filter((s) => s.kind === 'tienda' && s.status === 'ok' && s.shiftId === state.shift?.id);
  const turnTotal = sum(turnSales, (s) => s.total);
  const turnCost = sum(turnSales.flatMap((s) => s.lines), (l) => (l.cost || 0) * l.qty);
  const name = (id) => state.shopItems.find((i) => i.id === id)?.name || '—';
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';
  const moves = [...state.shopMoves].sort((a, b) => b.ts - a.ts).slice(0, 15);

  const doMove = (type, qty, note) => {
    const run = () => {
      update((d) => A.invMove(d, { itemId: move.item.id, type, qty, note, userId: user.id }, 'shopItems', 'shopMoves'));
      setMove(null);
      ui.notify(`${SHOP_MOVE_LABELS[type]} registrada · ${move.item.name}`);
    };
    if ((type === 'merma' || type === 'ajuste') && user.role !== 'gerente') ui.authorize(`${SHOP_MOVE_LABELS[type]} de ${move.item.name}`, run);
    else run();
  };

  return (
    <>
      <div className="kpis">
        <div className="card kpi"><div className="card-label">Ventas del turno</div><div className="kpi-value">{fmt(turnTotal)}</div><div className="kpi-note">{turnSales.length} venta{turnSales.length === 1 ? '' : 's'}</div></div>
        <div className="card kpi"><div className="card-label">Ganancia del turno</div><div className="kpi-value">{fmt(turnTotal - turnCost)}</div><div className="kpi-note">Precio de venta menos costo</div></div>
        <div className={'card kpi' + (low.length ? ' alert' : '')}><div className="card-label">Bajo mínimo</div><div className="kpi-value">{low.length}</div><div className="kpi-note">{low.filter((i) => i.stock <= 0).length} agotado(s)</div></div>
        <div className="card kpi"><div className="card-label">Valor en existencia</div><div className="kpi-value">{fmt(sum(state.shopItems, (i) => i.stock * i.cost))}</div><div className="kpi-note">A costo de compra</div></div>
      </div>

      <div className="row items-center">
        <div className="chips">
          {['Todas', ...SHOP_CATS].map((c) => <button key={c} className={'chip small' + (cat === c ? ' active' : '')} onClick={() => setCat(c)}>{c}</button>)}
          <button className={'chip small' + (onlyLow ? ' active' : '')} onClick={() => setOnlyLow(!onlyLow)}>Solo bajo mínimo</button>
        </div>
        <button className="btn btn-primary small" onClick={() => setEdit({ id: uid('t'), name: '', cat: cat === 'Todas' ? SHOP_CATS[0] : cat, unit: 'unidad', stock: '0', min: '', cost: '', price: '', active: true, isNew: true })}>+ Producto</button>
      </div>

      <div className="card tx-card">
        <div className="tx-row head shop"><span>Producto</span><span>Categoría</span><span>Precio</span><span>Costo</span><span>Margen</span><span>Existencia</span><span>Estado</span><span /></div>
        {items.map((it) => {
          const st = stockStatus(it);
          return (
            <div key={it.id} className="tx-row shop">
              <strong>{it.name}</strong>
              <span className="panel-sub">{it.cat}</span>
              <strong>{fmt(it.price)}</strong>
              <span className="panel-sub">{fmt(it.cost)}</span>
              <span>{it.price ? Math.round(((it.price - it.cost) / it.price) * 100) : 0}%</span>
              <span><strong>{qtyFmt(it.stock)}</strong> <span className="panel-sub">mín. {qtyFmt(it.min)}</span></span>
              <span><span className={'tag stock-' + st}>{STATUS_LABEL[st]}</span></span>
              <span className="row-actions">
                <button className="link" onClick={() => setMove({ item: it, type: 'entrada' })}>Entrada</button>
                <button className="link" onClick={() => setMove({ item: it, type: 'merma' })}>Merma</button>
                <button className="link" onClick={() => setEdit({ ...it, stock: String(it.stock), min: String(it.min), cost: String(it.cost), price: String(it.price) })}>Editar</button>
              </span>
            </div>
          );
        })}
      </div>

      <div className="card tx-card">
        <div className="card-label">Últimos movimientos</div>
        {moves.map((m) => (
          <div key={m.id} className="tx-row inv-moves">
            <span className="panel-sub">{fmtDateTime(m.ts)}</span>
            <span><strong>{SHOP_MOVE_LABELS[m.type]}</strong> · {name(m.itemId)}</span>
            <span className="panel-sub">{m.note || '—'} · {userName(m.userId)}</span>
            <span>{m.type === 'entrada' || m.type === 'devolucion' ? '+' : m.type === 'ajuste' ? '=' : '−'}{qtyFmt(m.qty)}</span>
            <span className="panel-sub">queda {qtyFmt(m.after)}</span>
          </div>
        ))}
      </div>

      {move && <MoveModal {...move} moves={SHOP_MOVES} onClose={() => setMove(null)} onSave={doMove} />}
      {edit && (
        <ItemModal item={edit} cats={SHOP_CATS} withPrice onClose={() => setEdit(null)}
          onDelete={() => ui.confirm({ title: 'Eliminar producto', message: `¿Eliminar ${edit.name} de la tienda?`, confirmLabel: 'Eliminar', danger: true },
            () => { update((d) => A.remove(d, 'shopItems', edit.id)); setEdit(null); })}
          onSave={({ isNew, ...v }) => {
            update((d) => A.upsert(d, 'shopItems', { ...v, name: v.name.trim(), stock: parseFloat(v.stock) || 0, min: parseFloat(v.min) || 0, cost: parseFloat(v.cost) || 0, price: parseFloat(v.price) || 0 }));
            setEdit(null);
            ui.notify(isNew ? 'Producto agregado' : 'Producto actualizado');
          }} />
      )}
    </>
  );
}
