import { useEffect, useState } from 'react';
import { Field } from './Modal.jsx';

const fmtWait = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Contraseña de gerencia (con correo para ingresar; sin correo para autorizar).
// onSubmit({ email, password }) devuelve (o promete) { ok } o { ok: false, error, left, lockedMs }.
// El servidor lleva la cuenta de intentos fallidos: tras 5, bloquea unos minutos.
export default function PasswordForm({ onSubmit, withEmail = false, submitLabel = 'Ingresar' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState(0); // bloqueado hasta
  const [, tick] = useState(0);
  const wait = until > Date.now() ? until - Date.now() : 0;

  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => (Date.now() >= until ? setUntil(0) : tick((n) => n + 1)), 1000);
    return () => clearInterval(t);
  }, [until]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || wait || !password || (withEmail && !email.trim())) return;
    setBusy(true);
    setError('');
    let r;
    try {
      r = await onSubmit({ email: email.trim(), password });
    } finally {
      setBusy(false);
    }
    if (r === true || r?.ok) return;
    setPassword('');
    if (r?.lockedMs) return setUntil(Date.now() + r.lockedMs);
    const left = r?.left;
    setError(
      `${r?.error || 'Contraseña incorrecta'}${left && left <= 2 ? ` · quedan ${left} intento${left === 1 ? '' : 's'}` : ''}`,
    );
  };

  return (
    <form className={'password-form' + (busy ? ' busy' : '')} onSubmit={submit} aria-busy={busy}>
      {withEmail && (
        <Field label="Correo">
          <input
            className="input"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!wait}
            autoFocus
          />
        </Field>
      )}
      <Field label="Contraseña">
        <input
          className="input"
          type="password"
          autoComplete={withEmail ? 'current-password' : 'off'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!!wait}
          autoFocus={!withEmail}
        />
      </Field>
      <div className="pin-msg" role="status">
        {wait ? `Demasiados intentos. Espera ${fmtWait(wait)}` : error || ' '}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy || !!wait}>
        {submitLabel}
      </button>
    </form>
  );
}
