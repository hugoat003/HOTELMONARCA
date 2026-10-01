import { useEffect, useState } from 'react';
import { lockedFor, registerFail, registerOk } from '../../lib/pinGuard.js';

const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Teclado de 4 dígitos. onSubmit(pin) devuelve true si el PIN es válido.
// guardKey identifica qué se está protegiendo (login de un usuario, autorización de gerente)
// para limitar los intentos fallidos.
export default function PinPad({ onSubmit, error: externalError, guardKey = 'pin' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(() => lockedFor(guardKey));

  // Cuenta regresiva mientras está bloqueado
  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setWait(lockedFor(guardKey)), 1000);
    return () => clearInterval(t);
  }, [wait, guardKey]);

  const press = (k) => {
    if (wait) return;
    setError('');
    if (k === 'C') return setPin('');
    if (k === '⌫') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (onSubmit(next)) return registerOk(guardKey);
        const left = registerFail(guardKey);
        setPin('');
        if (left === 0) setWait(lockedFor(guardKey));
        else
          setError(
            `${externalError || 'PIN incorrecto'}${left <= 2 ? ` · quedan ${left} intento${left === 1 ? '' : 's'}` : ''}`,
          );
      }, 120);
    }
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
    <div className={'pinpad' + (wait ? ' locked' : '')}>
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
