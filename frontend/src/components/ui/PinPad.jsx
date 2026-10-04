import { useEffect, useState } from 'react';

const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Teclado de 4 dígitos. onSubmit(pin) devuelve (o promete) { ok } o { ok: false, error, left, lockedMs }.
// El servidor lleva la cuenta de intentos fallidos: tras 5, bloquea unos minutos.
export default function PinPad({ onSubmit, error: externalError, lockedMs = 0 }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(() => (lockedMs ? Date.now() + lockedMs : 0)); // bloqueado hasta
  const [, tick] = useState(0);
  const wait = until > Date.now() ? until - Date.now() : 0;

  // Cuenta regresiva mientras está bloqueado
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => (Date.now() >= until ? setUntil(0) : tick((n) => n + 1)), 1000);
    return () => clearInterval(t);
  }, [until]);

  const submit = async (value) => {
    setBusy(true);
    let r;
    try {
      r = await onSubmit(value);
    } finally {
      setBusy(false);
    }
    if (r === true || r?.ok) return;
    setPin('');
    if (r?.lockedMs) return setUntil(Date.now() + r.lockedMs);
    const left = r?.left;
    const base = r?.error && r.error !== 'PIN incorrecto' && !r.left ? r.error : externalError || 'PIN incorrecto';
    setError(`${base}${left && left <= 2 ? ` · quedan ${left} intento${left === 1 ? '' : 's'}` : ''}`);
  };

  const press = (k) => {
    if (wait || busy) return;
    setError('');
    if (k === 'C') return setPin('');
    if (k === '⌫') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => submit(next), 120);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={'pinpad' + (wait ? ' locked' : '') + (busy ? ' busy' : '')} aria-busy={busy}>
      <div className={'pin-dots' + (error ? ' error' : '')}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pin-msg" role="status">
        {wait ? `Demasiados intentos. Espera ${fmtWait(wait)}` : error || ' '}
      </div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button key={k} type="button" disabled={!!wait} onClick={() => press(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
