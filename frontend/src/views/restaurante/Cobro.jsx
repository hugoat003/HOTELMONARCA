import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { METHOD_LABELS } from '@shared/data.js';
import { round2, sum } from '@shared/money.js';
import { useStore } from '../../store/store.jsx';

const num = (v) => parseFloat(v) || 0;
let rowSeq = 0;
const newRow = (method, amount = '') => ({
  id: ++rowSeq,
  method,
  amount: amount === '' ? '' : String(amount),
  resId: '',
  ref: '',
});

// Pantalla de cobro compartida por restaurante y recepción.
// onConfirm recibe { discount, total, tip, grand, payments, change, invoice }.
// invoice es null salvo que el cliente pida factura; la factura la emite la gerencia a mano.
// La prop invoice solo sugiere el nombre del cliente.
export default function Cobro({ title, amount, allowDiscount, allowTip, allowRoom, invoice, onCancel, onConfirm }) {
  const { state, fmt } = useStore();
  const ui = useUI();
  const cfg = state.config;

  const [discount, setDiscount] = useState(null);
  const [discForm, setDiscForm] = useState(null);
  const [tipMode, setTipMode] = useState(allowTip ? 'sugerida' : 'none');
  const [tipCustom, setTipCustom] = useState('');
  const [rawRows, setRows] = useState([newRow('efectivo')]);
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [nit, setNit] = useState('');
  const [name, setName] = useState(invoice?.name || '');
  const [email, setEmail] = useState('');

  const discountAmount = discount
    ? round2(Math.min(amount, discount.type === 'pct' ? (amount * discount.value) / 100 : discount.value))
    : 0;
  const total = round2(amount - discountAmount);
  const tip =
    tipMode === 'sugerida' ? round2((total * cfg.tipPct) / 100) : tipMode === 'otra' ? round2(num(tipCustom)) : 0;
  const grand = round2(total + tip);
  // Con una sola forma de pago que no es efectivo, el monto es siempre el total (sigue a la propina y al descuento)
  const single = rawRows.length === 1 && rawRows[0].method !== 'efectivo';
  const rows = single ? [{ ...rawRows[0], amount: String(grand) }] : rawRows;
  const paid = sum(rows, (r) => num(r.amount));
  const remaining = round2(grand - paid);
  const change = remaining < 0 ? -remaining : 0;
  const cashTotal = sum(
    rows.filter((r) => r.method === 'efectivo'),
    (r) => num(r.amount),
  );

  const inHouse = state.reservations
    .filter((r) => r.status === 'hospedado')
    .sort((a, b) => a.roomN.localeCompare(b.roomN));
  const methods = Object.keys(METHOD_LABELS).filter((k) => allowRoom || k !== 'habitacion');

  let problem = '';
  if (grand > 0) {
    if (rows.some((r) => num(r.amount) <= 0)) problem = 'Ingresa el monto de cada pago';
    else if (rows.some((r) => r.method === 'habitacion' && !r.resId)) problem = 'Elige la habitación';
    else if (remaining > 0.004) problem = `Faltan ${fmt(remaining)}`;
    else if (change > cashTotal + 0.004) problem = 'El excedente solo se permite en efectivo';
  }
  if (!problem && wantsInvoice && !nit.trim()) problem = 'Falta el NIT para la factura';
  if (!problem && wantsInvoice && !name.trim()) problem = 'Falta el nombre para la factura';

  const setRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // Al elegir tarjeta, transferencia o habitación el monto se llena solo con lo que falta.
  // En efectivo se deja vacío para tocar Exacto o el billete con que paga.
  const changeMethod = (row, method) => {
    if (method === row.method) return;
    const others = sum(
      rows.filter((r) => r.id !== row.id),
      (r) => num(r.amount),
    );
    const due = String(Math.max(0, round2(grand - others)));
    setRow(row.id, { method, amount: method === 'efectivo' ? '' : due });
  };

  const splitEqual = (n) => {
    const part = Math.floor((grand / n) * 100) / 100;
    setRows(
      Array.from({ length: n }, (_, i) => newRow('tarjeta', i === n - 1 ? round2(grand - part * (n - 1)) : part)),
    );
  };

  const quickCash = (row) => {
    const others = sum(
      rows.filter((r) => r.id !== row.id),
      (r) => num(r.amount),
    );
    const due = Math.max(0, round2(grand - others));
    const opts = [100, 200, 500]
      .map((s) => Math.ceil(due / s) * s)
      .filter((v, i, a) => v > due && a.indexOf(v) === i)
      .slice(0, 2);
    return [['Exacto', due], ...opts.map((v) => [`${cfg.currency} ${v}`, v])];
  };

  const confirm = () => {
    if (problem) return;
    const payments = rows.map((r) => {
      const p = { method: r.method, amount: round2(num(r.amount)) };
      if (r.method === 'habitacion') {
        p.resId = r.resId;
        p.roomN = inHouse.find((x) => x.id === r.resId)?.roomN;
      }
      if (r.ref.trim()) p.ref = r.ref.trim();
      return p;
    });
    // El vuelto sale del efectivo, empezando por el último pago en efectivo
    let rest = change;
    for (let i = payments.length - 1; i >= 0 && rest > 0.004; i--) {
      if (payments[i].method !== 'efectivo') continue;
      const take = Math.min(rest, payments[i].amount);
      payments[i].amount = round2(payments[i].amount - take);
      rest = round2(rest - take);
    }
    const d = discount
      ? {
          label: discount.type === 'pct' ? `${discount.value}%` : '',
          amount: discountAmount,
          reason: discount.reason,
          authBy: discount.authBy,
        }
      : null;
    onConfirm({
      discount: d,
      total,
      tip,
      grand,
      payments: grand > 0 ? payments.filter((p) => p.amount > 0) : [],
      change,
      invoice: wantsInvoice
        ? { nit: nit.trim().toUpperCase(), name: name.trim(), email: email.trim(), number: null }
        : null,
    });
  };

  return (
    <Modal title={title} aside={fmt(grand)} onClose={onCancel} width={600} className="cobro">
      <div className="cobro-summary">
        <div className="row muted">
          <span>Consumo</span>
          <span>{fmt(amount)}</span>
        </div>
        {discount && (
          <div className="row muted">
            <span>
              Descuento {discount.type === 'pct' ? discount.value + '%' : ''} · {discount.reason}{' '}
              <button className="link" onClick={() => setDiscount(null)}>
                Quitar
              </button>
            </span>
            <span>− {fmt(discountAmount)}</span>
          </div>
        )}
        {allowTip && (
          <div className="row muted">
            <span>Propina</span>
            <span>{fmt(tip)}</span>
          </div>
        )}
        <div className="row grand" style={{ fontSize: 18 }}>
          <span>Total a pagar</span>
          <span>{fmt(grand)}</span>
        </div>
      </div>

      {(allowDiscount || allowTip) && (
        <div className="cobro-options">
          {allowTip && (
            <div className="chips">
              {[
                ['none', 'Sin propina'],
                ['sugerida', `Propina ${cfg.tipPct}%`],
                ['otra', 'Otra propina'],
              ].map(([k, l]) => (
                <button
                  key={k}
                  className={'chip small' + (tipMode === k ? ' active' : '')}
                  onClick={() => setTipMode(k)}
                >
                  {l}
                </button>
              ))}
              {tipMode === 'otra' && (
                <input
                  className="input small"
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={tipCustom}
                  onChange={(e) => setTipCustom(e.target.value)}
                />
              )}
            </div>
          )}
          {allowDiscount && !discount && !discForm && (
            <button
              className="chip small"
              onClick={() =>
                ui.authorize('Aplicar un descuento', (mgr) =>
                  setDiscForm({ type: 'pct', value: '10', reason: '', authBy: mgr.id }),
                )
              }
            >
              Aplicar descuento
            </button>
          )}
        </div>
      )}

      {discForm && (
        <div className="inline-form">
          <div className="segmented row two">
            {[
              ['pct', '%'],
              ['monto', cfg.currency],
            ].map(([k, l]) => (
              <button
                key={k}
                className={'seg-btn' + (discForm.type === k ? ' active' : '')}
                onClick={() => setDiscForm({ ...discForm, type: k })}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            value={discForm.value}
            onChange={(e) => setDiscForm({ ...discForm, value: e.target.value })}
            style={{ width: 90 }}
          />
          <input
            className="input grow"
            placeholder="Motivo (ej. cortesía, cliente frecuente)"
            value={discForm.reason}
            onChange={(e) => setDiscForm({ ...discForm, reason: e.target.value })}
          />
          <button
            className="btn btn-primary small"
            disabled={num(discForm.value) <= 0 || !discForm.reason.trim()}
            onClick={() => {
              setDiscount({ ...discForm, value: num(discForm.value), reason: discForm.reason.trim() });
              setDiscForm(null);
            }}
          >
            Aplicar
          </button>
          <button className="btn small" onClick={() => setDiscForm(null)}>
            ×
          </button>
        </div>
      )}

      <div className="stack-tight gap-8">
        <div className="row">
          <span className="eyebrow">Formas de pago</span>
          <span className="chips gap-6">
            <span className="panel-sub text-xs">Dividir en</span>
            {[2, 3, 4].map((n) => (
              <button key={n} className="chip small" onClick={() => splitEqual(n)}>
                {n}
              </button>
            ))}
          </span>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="pay-row">
            <div className="pay-methods" role="radiogroup" aria-label="Forma de pago">
              {methods.map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={row.method === k}
                  className={'chip' + (row.method === k ? ' active' : '')}
                  onClick={() => changeMethod(row, k)}
                >
                  {METHOD_LABELS[k]}
                </button>
              ))}
            </div>
            {/* Sin teclado automático: en tablet se toca Exacto o el billete; el monto se escribe solo si hace falta */}
            <input
              className="input amount"
              type="number"
              inputMode="decimal"
              aria-label="Monto"
              placeholder={row.method === 'efectivo' ? 'Recibido' : '0.00'}
              value={row.amount}
              readOnly={single}
              onChange={(e) => setRow(row.id, { amount: e.target.value })}
            />
            {row.method === 'habitacion' ? (
              <div className="pay-rooms">
                {inHouse.map((r) => (
                  <button
                    key={r.id}
                    className={'chip small' + (row.resId === r.id ? ' active' : '')}
                    onClick={() => setRow(row.id, { resId: r.id })}
                  >
                    {r.roomN} · {r.guest.name}
                  </button>
                ))}
                {!inHouse.length && <span className="panel-sub">No hay huéspedes hospedados.</span>}
              </div>
            ) : row.method === 'efectivo' ? (
              <div className="quick">
                {quickCash(row).map(([l, v]) => (
                  <button key={l} onClick={() => setRow(row.id, { amount: String(v) })}>
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <input
                className="input"
                placeholder={row.method === 'tarjeta' ? 'No. autorización' : 'No. referencia'}
                value={row.ref}
                onChange={(e) => setRow(row.id, { ref: e.target.value })}
              />
            )}
            <button
              className="icon-btn"
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
              title="Quitar"
            >
              ×
            </button>
          </div>
        ))}
        <div className="row">
          <button
            className="link"
            onClick={() =>
              setRows((rs) => [
                // Si había una sola forma de pago con el total, se fija ese monto para poder repartirlo
                ...rs.map((r, i) => (single && i === 0 ? { ...r, amount: String(grand) } : r)),
                newRow('tarjeta', remaining > 0 ? remaining : ''),
              ])
            }
          >
            + Agregar otra forma de pago
          </button>
          <span style={{ fontSize: 16 }}>
            {change > 0 ? (
              <>
                Cambio <strong>{fmt(change)}</strong>
              </>
            ) : remaining > 0.004 ? (
              <span className="panel-sub">
                Pendiente <strong>{fmt(remaining)}</strong>
              </span>
            ) : null}
          </span>
        </div>
      </div>

      <label className="check">
        <input type="checkbox" checked={wantsInvoice} onChange={(e) => setWantsInvoice(e.target.checked)} />
        <span>
          Requiere factura <span className="panel-sub">· la gerencia la emite después</span>
        </span>
      </label>
      {wantsInvoice && (
        <div className="form-grid">
          <Field label="NIT">
            <input className="input" autoFocus value={nit} onChange={(e) => setNit(e.target.value)} />
          </Field>
          <Field label="Nombre">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Correo" hint="opcional">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!!problem} onClick={confirm}>
          {problem || 'Confirmar pago'}
        </button>
      </div>
    </Modal>
  );
}

// Paso previo al cobro cuando el monto es libre (anticipos y abonos)
// max: saldo total (no se puede cobrar más). suggest: montos sugeridos [[etiqueta, monto]]
export function AmountModal({ title, max, suggest = [], fmt, onClose, onNext }) {
  const [v, setV] = useState('');
  const n = round2(parseFloat(v) || 0);
  const tooMuch = max > 0 && n > max + 0.004;
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={400}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={n <= 0 || tooMuch} onClick={() => onNext(n)}>
            {tooMuch ? 'Mayor que el saldo' : 'Continuar'}
          </button>
        </>
      }
    >
      <Field label="Monto" hint={max > 0 ? `saldo ${fmt(max)}` : ''}>
        <input
          className="input big"
          type="number"
          inputMode="decimal"
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && n > 0 && !tooMuch && onNext(n)}
        />
      </Field>
      <div className="chips">
        {suggest.map(([label, amount]) => (
          <button key={label} className="chip small" onClick={() => setV(String(amount))}>
            {label} · {fmt(amount)}
          </button>
        ))}
        {max > 0 && (
          <button className="chip small" onClick={() => setV(String(max))}>
            Saldo completo · {fmt(max)}
          </button>
        )}
      </div>
    </Modal>
  );
}
