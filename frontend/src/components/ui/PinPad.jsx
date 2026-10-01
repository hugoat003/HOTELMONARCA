import { useEffect, useState } from 'react';

// Teclado de 4 dígitos. onSubmit(pin) devuelve true si el PIN es válido.
export default function PinPad({ onSubmit, error: externalError }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const press = (k) => {
    setError(false);
    if (k === 'C') return setPin('');
    if (k === '⌫') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (!onSubmit(next)) {
          setError(true);
          setPin('');
        }
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
    <div className="pinpad">
      <div className={'pin-dots' + (error ? ' error' : '')}>
        {[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div className="pin-msg">{error ? externalError || 'PIN incorrecto' : ' '}</div>
      <div className="pin-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
          <button key={k} type="button" onClick={() => press(k)}>{k}</button>
        ))}
      </div>
    </div>
  );
}
