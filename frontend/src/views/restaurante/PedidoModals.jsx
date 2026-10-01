// Modales de la pantalla de Pedido
import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { QUICK_NOTES } from '../../data.js';
import { modsText, orderLabel, tableOrder, unitPrice } from '../../lib/orders.js';

const VOID_REASONS = ['Error de captura', 'Cliente cambió de opinión', 'Platillo devuelto', 'No se preparó'];
const COURTESY_REASONS = ['Cliente frecuente', 'Compensación por demora', 'Cumpleaños', 'Invitación de la casa'];

// Elegir modificadores al agregar un platillo
export function ModifierModal({ item, groups, fmt, onClose, onAdd }) {
  const [sel, setSel] = useState({}); // groupId -> [optionId]
  const toggle = (g, o) =>
    setSel((s) => {
      const cur = s[g.id] || [];
      if (!g.multiple) return { ...s, [g.id]: cur[0] === o.id && !g.required ? [] : [o.id] };
      return { ...s, [g.id]: cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id] };
    });
  const mods = groups.flatMap((g) =>
    (sel[g.id] || []).map((id) => {
      const o = g.options.find((x) => x.id === id);
      return { group: g.name, name: o.name, price: o.price };
    }),
  );
  const missing = groups.find((g) => g.required && !(sel[g.id] || []).length);
  return (
    <Modal
      title={item.name}
      aside={fmt(unitPrice(item.price, mods))}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!!missing} onClick={() => onAdd(mods)}>
            {missing ? `Elige ${missing.name.toLowerCase()}` : 'Agregar'}
          </button>
        </>
      }
    >
      {groups.map((g) => (
        <Field
          as="div"
          key={g.id}
          label={g.name}
          hint={g.required ? 'obligatorio' : g.multiple ? 'puedes elegir varios' : 'opcional'}
        >
          <div className="chips">
            {g.options.map((o) => (
              <button
                key={o.id}
                className={'chip' + ((sel[g.id] || []).includes(o.id) ? ' active' : '')}
                onClick={() => toggle(g, o)}
              >
                {o.name}
                {o.price ? ` +${fmt(o.price)}` : ''}
              </button>
            ))}
          </div>
        </Field>
      ))}
    </Modal>
  );
}

// Nota para cocina y cortesía de una línea
export function LineModal({ line, fmt, onClose, onNote, onCourtesy, onRemoveCourtesy }) {
  const [note, setNote] = useState(line.note || '');
  const [reason, setReason] = useState('');
  const toggle = (n) =>
    setNote((cur) =>
      cur.includes(n)
        ? cur
            .replace(n, '')
            .replace(/^[,\s]+|[,\s]+$/g, '')
            .replace(/,\s*,/g, ',')
        : cur
          ? cur + ', ' + n
          : n,
    );
  return (
    <Modal title={line.name} aside={fmt(line.price * line.qty)} onClose={onClose} width={500}>
      {line.mods?.length > 0 && <div className="panel-sub text-sm">{modsText(line.mods)}</div>}
      {!line.sent ? (
        <>
          <Field label="Nota para cocina">
            <input
              className="input"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNote(note.trim())}
              placeholder="Ej. sin cebolla"
            />
          </Field>
          <div className="chips">
            {QUICK_NOTES.map((n) => (
              <button key={n} className={'chip small' + (note.includes(n) ? ' active' : '')} onClick={() => toggle(n)}>
                {n}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => onNote(note.trim())}>
            Guardar nota
          </button>
        </>
      ) : (
        line.note && <div className="note-box">Nota enviada a cocina: {line.note}</div>
      )}

      <div className="eyebrow mt-8">Cortesía</div>
      {line.courtesy ? (
        <>
          <div className="note-box">
            Cortesía de {fmt(line.courtesy.price * line.qty)} · {line.courtesy.reason}
          </div>
          <button className="btn btn-quiet" onClick={onRemoveCourtesy}>
            Quitar cortesía
          </button>
        </>
      ) : (
        <>
          <div className="chips">
            {COURTESY_REASONS.map((r) => (
              <button key={r} className={'chip small' + (reason === r ? ' active' : '')} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>
          <div className="inline-form">
            <input
              className="input grow"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo de la cortesía"
            />
            <button className="btn small" disabled={!reason.trim()} onClick={() => onCourtesy(reason.trim())}>
              Dar cortesía
            </button>
          </div>
          <div className="panel-sub text-xs">
            El platillo se cobra en Q0 y queda en el reporte. Requiere PIN de gerente.
          </div>
        </>
      )}
    </Modal>
  );
}

// Anular un platillo ya enviado a cocina
export function VoidModal({ line, fmt, hasRecipe, onClose, onConfirm }) {
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [returnStock, setReturnStock] = useState(false);
  const pick = (r) => {
    setReason(r);
    setReturnStock(r === 'No se preparó');
  };
  return (
    <Modal
      title="Anular platillo"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-danger"
            disabled={!reason.trim()}
            onClick={() => onConfirm(qty, reason.trim(), returnStock)}
          >
            Anular {fmt(line.price * qty)}
          </button>
        </>
      }
    >
      <div className="note-box">
        {line.name} ya fue enviado a cocina. La anulación queda registrada en el reporte y requiere autorización de un
        gerente.
      </div>
      {line.qty > 1 && (
        <Field as="div" label="Cantidad a anular">
          <div className="stepper big">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span>{qty}</span>
            <button onClick={() => setQty(Math.min(line.qty, qty + 1))}>+</button>
          </div>
        </Field>
      )}
      <Field as="div" label="Motivo">
        <div className="chips">
          {VOID_REASONS.map((r) => (
            <button key={r} className={'chip small' + (reason === r ? ' active' : '')} onClick={() => pick(r)}>
              {r}
            </button>
          ))}
        </div>
        <input
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Otro motivo…"
        />
      </Field>
      {hasRecipe && (
        <label className="check">
          <input type="checkbox" checked={returnStock} onChange={(e) => setReturnStock(e.target.checked)} />
          <span>Regresar los insumos al inventario (no se preparó)</span>
        </label>
      )}
    </Modal>
  );
}

// Selección de cantidades por línea (dividir cuenta, pasar platillos)
export function QtyPicker({ lines, sel, setSel, fmt }) {
  const set = (id, v) => setSel((s) => ({ ...s, [id]: v }));
  return (
    <>
      <div className="stack-tight">
        {lines.map((l) => (
          <div key={l.id} className="line">
            <div className="stepper">
              <button onClick={() => set(l.id, Math.max(0, (sel[l.id] || 0) - 1))}>−</button>
              <span>{sel[l.id] || 0}</span>
              <button onClick={() => set(l.id, Math.min(l.qty, (sel[l.id] || 0) + 1))}>+</button>
            </div>
            <div>
              <div className="line-name">{l.name}</div>
              <div className="line-tag">de {l.qty}</div>
            </div>
            <div className="line-amt">{fmt(l.price * (sel[l.id] || 0))}</div>
          </div>
        ))}
      </div>
      <button className="link" onClick={() => setSel(Object.fromEntries(lines.map((l) => [l.id, l.qty])))}>
        Seleccionar todo
      </button>
    </>
  );
}

const chosen = (sel) => Object.fromEntries(Object.entries(sel).filter(([, v]) => v > 0));

export function SplitModal({ lines, fmt, onClose, onPay }) {
  const [sel, setSel] = useState({});
  const amount = lines.reduce((a, l) => a + l.price * (sel[l.id] || 0), 0);
  return (
    <Modal
      title="Dividir cuenta"
      aside={fmt(amount)}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!Object.keys(chosen(sel)).length}
            onClick={() => onPay(chosen(sel))}
          >
            Cobrar selección
          </button>
        </>
      }
    >
      <div className="panel-sub text-sm">
        Elige qué platillos paga esta persona. Lo que no se cobre queda en la mesa. Para partes iguales usa “Dividir en”
        dentro del cobro.
      </div>
      <QtyPicker lines={lines} sel={sel} setSel={setSel} fmt={fmt} />
    </Modal>
  );
}

// Opciones de la cuenta: cambiar mesa, unir, pasar platillos, cambiar mesero
export function OrderOptionsModal({ order, state, fmt, onClose, onMove, onJoin, onTransfer, onWaiter }) {
  const [step, setStep] = useState('menu');
  const [sel, setSel] = useState({});
  const free = state.tables.filter((t) => !tableOrder(state.orders, t.id));
  const others = state.orders.filter((o) => o.type === 'mesa' && o.id !== order.id);
  const targets = state.tables.filter((t) => tableOrder(state.orders, t.id)?.id !== order.id);
  const waiters = state.users.filter((u) => u.active && (u.role === 'mesero' || u.role === 'gerente'));
  const isTable = order.type === 'mesa';
  const titles = {
    menu: 'Opciones de la cuenta',
    mover: 'Cambiar a otra mesa',
    unir: 'Unir otra mesa a esta cuenta',
    pasar: 'Pasar platillos a otra mesa',
    destino: 'Pasar a la mesa…',
    mesero: 'Cambiar mesero',
  };
  const back = (
    <button className="btn btn-quiet" onClick={() => setStep('menu')}>
      ← Volver
    </button>
  );

  return (
    <Modal title={titles[step]} onClose={onClose} width={560}>
      {step === 'menu' && (
        <div className="stack gap-10">
          {isTable && (
            <button className="btn" onClick={() => setStep('mover')}>
              Cambiar a otra mesa
            </button>
          )}
          {isTable && (
            <button className="btn" disabled={!others.length} onClick={() => setStep('unir')}>
              Unir otra mesa
            </button>
          )}
          <button className="btn" disabled={!order.lines.length} onClick={() => setStep('pasar')}>
            Pasar platillos a otra mesa
          </button>
          <button className="btn" onClick={() => setStep('mesero')}>
            Cambiar mesero
          </button>
        </div>
      )}

      {step === 'mover' && (
        <>
          {free.length ? (
            <div className="tile-grid small">
              {free.map((t) => (
                <button key={t.id} className="chip" onClick={() => onMove(t)}>
                  {t.name} · {t.zone} · {t.seats} pers.
                </button>
              ))}
            </div>
          ) : (
            <div className="panel-sub">No hay mesas libres.</div>
          )}
          {back}
        </>
      )}

      {step === 'unir' && (
        <>
          <div className="panel-sub text-sm">
            Sus platillos y personas pasan a esta cuenta y la mesa queda unida hasta que se cobre.
          </div>
          <div className="stack-tight gap-8">
            {others.map((o) => (
              <button key={o.id} className="room-opt" onClick={() => onJoin(o)}>
                <strong>{orderLabel(o, state.tables)}</strong> · {o.guests} pers. ·{' '}
                {fmt(o.lines.reduce((a, l) => a + l.price * l.qty, 0))}
              </button>
            ))}
          </div>
          {back}
        </>
      )}

      {step === 'pasar' && (
        <>
          <QtyPicker lines={order.lines} sel={sel} setSel={setSel} fmt={fmt} />
          <div className="btn-row">
            {back}
            <button
              className="btn btn-primary"
              disabled={!Object.keys(chosen(sel)).length}
              onClick={() => setStep('destino')}
            >
              Elegir mesa
            </button>
          </div>
        </>
      )}

      {step === 'destino' && (
        <>
          <div className="tile-grid small">
            {targets.map((t) => {
              const o = tableOrder(state.orders, t.id);
              return (
                <button
                  key={t.id}
                  className={'chip' + (o ? ' active' : '')}
                  onClick={() => onTransfer(chosen(sel), t, o)}
                >
                  {t.name} · {o ? 'ocupada' : 'libre'}
                </button>
              );
            })}
          </div>
          <button className="btn btn-quiet" onClick={() => setStep('pasar')}>
            ← Volver
          </button>
        </>
      )}

      {step === 'mesero' && (
        <>
          <div className="chips">
            {waiters.map((w) => (
              <button
                key={w.id}
                className={'chip' + (order.waiterId === w.id ? ' active' : '')}
                onClick={() => onWaiter(w)}
              >
                {w.name}
              </button>
            ))}
          </div>
          {back}
        </>
      )}
    </Modal>
  );
}
