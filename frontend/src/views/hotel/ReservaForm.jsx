import { useState } from 'react';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { CHANNELS, RATE_TYPES } from '../../data.js';
import { addDays, addMonths, fmtDate, nightsBetween, today, uid } from '../../lib/dates.js';
import { folio, groupText, guestStays, isAvailable, isFrequent } from '../../lib/hotel.js';
import { useStore } from '../../store/store.jsx';

// mode: 'new' | 'edit' | 'checkin' (confirmar datos al llegar) | 'walkin' (llega sin reserva)
// guest (opcional): ficha con la que se precarga una reserva nueva
export default function ReservaForm({ mode = 'new', res, roomN, checkIn, guest, onClose, onSave }) {
  const { state, fmt } = useStore();
  const d0 = today();
  const typeOf = (n) => state.roomTypes.find((t) => t.id === state.rooms.find((r) => r.n === n)?.typeId);
  const typeRate = (n, rateType = 'noche') => (rateType === 'mensual' ? typeOf(n)?.monthlyRate : typeOf(n)?.rate) || 0;

  const [f, setF] = useState(() =>
    res
      ? { ...res, guest: { ...res.guest } }
      : {
          id: uid('r'),
          roomN: roomN || '',
          checkIn: mode === 'walkin' ? d0 : checkIn || d0,
          checkOut: addDays(mode === 'walkin' ? d0 : checkIn || d0, 1),
          adults: 2,
          children: 0,
          channel: mode === 'walkin' ? 'Directo' : 'Teléfono',
          rateType: 'noche',
          pricing: 'auto',
          rate: roomN ? typeRate(roomN) : 0,
          status: 'reservada',
          notes: '',
          charges: [],
          payments: [],
          createdAt: Date.now(),
          guestId: guest?.id,
          guest: guest
            ? {
                name: guest.name,
                phone: guest.phone || '',
                email: guest.email || '',
                doc: guest.doc || '',
                nationality: guest.nationality || '',
              }
            : { name: '', phone: '', email: '', doc: '', nationality: 'Guatemala' },
        },
  );
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setGuest = (patch) => setF((x) => ({ ...x, guest: { ...x.guest, ...patch } }));

  const nights = nightsBetween(f.checkIn, f.checkOut);
  const available = (n) => isAvailable(state.reservations, n, f.checkIn, f.checkOut, f.id);
  const monthly = f.rateType === 'mensual';
  const quote = nights > 0 ? folio({ ...f, rate: Number(f.rate) || 0, charges: [], payments: [] }, state) : null;
  const changeRateType = (rateType) =>
    set({
      rateType,
      rate: f.roomN ? typeRate(f.roomN, rateType) : f.rate,
      checkOut: rateType === 'mensual' ? addMonths(f.checkIn, 1) : addDays(f.checkIn, 1),
    });
  const lockDates = mode === 'checkin';
  const auto = !monthly && f.pricing === 'auto';

  // Fichas de huéspedes que coinciden con lo escrito (nombre o documento)
  const q = f.guest.name.trim().toLowerCase();
  const matches =
    !f.guestId && q.length >= 2
      ? (state.guests || [])
          .filter((g) => g.name.toLowerCase().includes(q) || (g.doc || '').toLowerCase().includes(q))
          .slice(0, 5)
      : [];
  const docOwner =
    !f.guestId && f.guest.doc.trim()
      ? (state.guests || []).find((g) => g.doc && g.doc.toLowerCase() === f.guest.doc.trim().toLowerCase())
      : null;
  const pickGuest = (g) =>
    setF((x) => ({
      ...x,
      guestId: g.id,
      guest: {
        name: g.name,
        phone: g.phone || '',
        email: g.email || '',
        doc: g.doc || '',
        nationality: g.nationality || '',
      },
    }));
  const staysOf = (g) =>
    guestStays(g, state.reservations).filter((r) => r.status === 'salida' || r.status === 'hospedado').length;

  let problem = '';
  if (f.guest.name.trim().length < 2) problem = 'Falta el nombre del huésped';
  else if (nights < 1) problem = 'La salida debe ser después de la entrada';
  else if (!f.roomN) problem = 'Elige una habitación';
  else if (!available(f.roomN)) problem = `La ${f.roomN} no está disponible en esas fechas`;
  else if ((mode === 'checkin' || mode === 'walkin') && !f.guest.doc.trim())
    problem = 'Falta el documento de identidad';

  const title = {
    new: 'Nueva reserva',
    edit: 'Editar reserva',
    checkin: `Check-in · Hab. ${f.roomN}`,
    walkin: `Check-in sin reserva · Hab. ${f.roomN}`,
  }[mode];
  const cta = {
    new: 'Guardar reserva',
    edit: 'Guardar cambios',
    checkin: 'Confirmar check-in',
    walkin: 'Registrar y hacer check-in',
  }[mode];

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={!!problem}
            onClick={() => onSave({ ...f, rate: Number(f.rate), guest: { ...f.guest, name: f.guest.name.trim() } })}
          >
            {problem || cta}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Huésped" className="span-2">
          <input
            className="input"
            autoFocus={mode !== 'checkin'}
            value={f.guest.name}
            onChange={(e) => setGuest({ name: e.target.value })}
            placeholder="Nombre completo o documento"
          />
          {f.guestId && <span className="field-hint">Ficha de huésped vinculada</span>}
          {matches.length > 0 && (
            <div className="suggest">
              {matches.map((g) => (
                <button key={g.id} type="button" className="suggest-item" onClick={() => pickGuest(g)}>
                  <strong>{g.name}</strong>
                  <span className="panel-sub">
                    {g.doc} · {staysOf(g)} estancia{staysOf(g) === 1 ? '' : 's'}
                    {isFrequent(g, state.reservations) ? ' · Frecuente' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Teléfono">
          <input className="input" value={f.guest.phone} onChange={(e) => setGuest({ phone: e.target.value })} />
        </Field>
        <Field label="Correo">
          <input className="input" value={f.guest.email} onChange={(e) => setGuest({ email: e.target.value })} />
        </Field>
        <Field label="Documento" hint={mode === 'checkin' || mode === 'walkin' ? 'obligatorio' : 'DPI o pasaporte'}>
          <input
            className="input"
            autoFocus={mode === 'checkin'}
            value={f.guest.doc}
            onChange={(e) => setGuest({ doc: e.target.value })}
            placeholder="DPI / Pasaporte"
          />
        </Field>
        <Field label="Nacionalidad">
          <input
            className="input"
            value={f.guest.nationality}
            onChange={(e) => setGuest({ nationality: e.target.value })}
          />
        </Field>
        <Field label="Canal">
          <select className="input" value={f.channel} onChange={(e) => set({ channel: e.target.value })}>
            {CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Entrada">
          <input
            className="input"
            type="date"
            value={f.checkIn}
            disabled={lockDates || mode === 'walkin'}
            onChange={(e) =>
              set({
                checkIn: e.target.value,
                checkOut: e.target.value >= f.checkOut ? addDays(e.target.value, 1) : f.checkOut,
              })
            }
          />
        </Field>
        <Field
          label="Salida"
          hint={
            quote
              ? monthly
                ? `${quote.months} mes${quote.months === 1 ? '' : 'es'}`
                : `${nights} noche${nights > 1 ? 's' : ''}`
              : ''
          }
        >
          <input
            className="input"
            type="date"
            value={f.checkOut}
            min={addDays(f.checkIn, 1)}
            onChange={(e) => set({ checkOut: e.target.value })}
          />
        </Field>
        <Field label="Adultos">
          <input
            className="input"
            type="number"
            min="1"
            value={f.adults}
            onChange={(e) => set({ adults: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </Field>
        <Field label="Niños">
          <input
            className="input"
            type="number"
            min="0"
            value={f.children}
            onChange={(e) => set({ children: Math.max(0, parseInt(e.target.value) || 0) })}
          />
        </Field>
        <Field label="Habitación" className="span-2">
          <select
            className="input"
            value={f.roomN}
            disabled={lockDates || mode === 'walkin'}
            onChange={(e) => set({ roomN: e.target.value, rate: typeRate(e.target.value, f.rateType) })}
          >
            <option value="">Elegir…</option>
            {state.rooms.map((r) => {
              const t = state.roomTypes.find((x) => x.id === r.typeId);
              const ok = available(r.n) && r.hk !== 'fuera';
              return (
                <option key={r.n} value={r.n} disabled={!ok && r.n !== f.roomN}>
                  {r.n} · {t?.name} · {fmt(monthly ? t?.monthlyRate : t?.rate)}
                  {ok ? '' : ' · ocupada'}
                </option>
              );
            })}
          </select>
        </Field>
        {monthly ? (
          <Field label="Tarifa mensual" hint="sin impuestos">
            <input className="input" type="number" value={f.rate} onChange={(e) => set({ rate: e.target.value })} />
          </Field>
        ) : (
          <Field as="div" label="Precio por noche" hint="sin impuestos">
            <div className="segmented row two">
              <button
                type="button"
                className={'seg-btn' + (auto ? ' active' : '')}
                onClick={() => set({ pricing: 'auto' })}
              >
                Automático
              </button>
              <button
                type="button"
                className={'seg-btn' + (!auto ? ' active' : '')}
                onClick={() => set({ pricing: 'fija', rate: f.rate || (f.roomN ? typeRate(f.roomN) : 0) })}
              >
                Pactado
              </button>
            </div>
            {!auto && (
              <input className="input" type="number" value={f.rate} onChange={(e) => set({ rate: e.target.value })} />
            )}
          </Field>
        )}
        <Field as="div" label="Tipo de tarifa">
          <div className="segmented row two">
            {Object.entries(RATE_TYPES).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={'seg-btn' + (f.rateType === k || (!f.rateType && k === 'noche') ? ' active' : '')}
                onClick={() => changeRateType(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notas" className="span-2">
          <input
            className="input"
            value={f.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Ej. llegada tarde, cama extra, aniversario"
          />
        </Field>
      </div>
      {docOwner && (
        <div className="note-box">
          Este documento es de {docOwner.name}.{' '}
          <button className="link" onClick={() => pickGuest(docOwner)}>
            Usar su ficha
          </button>
        </div>
      )}
      {quote?.groups && quote.groups.length > 1 && (
        <div className="stack-tight panel-sub text-sm">
          {quote.groups.map((g) => (
            <span key={g.from}>
              {fmtDate(g.from, { day: 'numeric', month: 'short' })}: {groupText(g, fmt)}
            </span>
          ))}
        </div>
      )}
      {quote && (
        <div className="summary-bar">
          <span>
            {monthly
              ? `${quote.months} mes${quote.months === 1 ? '' : 'es'} × ${fmt(Number(f.rate) || 0)}`
              : quote.groups.length === 1
                ? groupText(quote.groups[0], fmt)
                : `${nights} noches`}{' '}
            = {fmt(quote.lodging.base)}
          </span>
          <span>
            IVA {fmt(quote.lodging.iva)} · INGUAT {fmt(quote.lodging.inguat)}
          </span>
          <strong>Total {fmt(quote.lodging.total)}</strong>
        </div>
      )}
      {monthly && (
        <div className="panel-sub text-sm">
          La estancia se cobra por mes. El huésped puede abonar en partes durante el mes y el último mes se prorratea
          por días.
        </div>
      )}
    </Modal>
  );
}
