import { useState } from 'react';
import PasswordForm from '../components/ui/PasswordForm.jsx';
import PinPad from '../components/ui/PinPad.jsx';
import { DEMO } from '../config.js';
import { ROLE_LABELS } from '@shared/data.js';
import { fmtLongDate } from '@shared/dates.js';
import { useStore } from '../store/store.jsx';

export default function Login() {
  const { state, login, loginEmail } = useStore();
  // sel: el usuario que teclea su PIN, o 'gerencia' para entrar con correo y contraseña
  const [sel, setSel] = useState(null);
  const users = state.users.filter((u) => u.active);

  return (
    <div className="login">
      <div className="login-card">
        <img src="/logo-monarca.png" alt="Monarca Hotel Boutique" className="login-logo" />
        <div className="panel-sub text-center">{fmtLongDate().replace(/^./, (c) => c.toUpperCase())}</div>
        {!sel ? (
          <>
            <div className="eyebrow text-center">¿Quién eres?</div>
            <div className="login-users">
              {users.map((u) => (
                <button key={u.id} className="login-user" onClick={() => setSel(u)}>
                  <span className="avatar">{u.name[0]}</span>
                  <strong>{u.name}</strong>
                  <span className="panel-sub">{ROLE_LABELS[u.role]}</span>
                </button>
              ))}
            </div>
            <button className="btn login-managers" onClick={() => setSel('gerencia')}>
              Gerencia · ingresar con correo
            </button>
            {DEMO && <div className="demo-hint">Demo · PIN: Recepción 2222 · Juan 3333 · Ana 4444</div>}
          </>
        ) : sel === 'gerencia' ? (
          <>
            <div className="text-center">
              <div className="panel-title">Gerencia</div>
              <div className="panel-sub">Ingresa con tu correo y contraseña</div>
            </div>
            <PasswordForm withEmail onSubmit={({ email, password }) => loginEmail(email, password)} />
            {DEMO && (
              <div className="demo-hint">
                Demo · Administración general: direccion@monarca.demo / direccion2026
                <br />
                Gerente: gerencia@monarca.demo / gerencia2026
              </div>
            )}
            <button className="btn btn-quiet" onClick={() => setSel(null)}>
              Volver
            </button>
          </>
        ) : (
          <>
            <div className="text-center">
              <div className="panel-title">{sel.name}</div>
              <div className="panel-sub">Ingresa tu PIN</div>
            </div>
            <PinPad onSubmit={(pin) => login(sel.id, pin)} lockedMs={sel.lockedMs} />
            <button className="btn btn-quiet" onClick={() => setSel(null)}>
              Cambiar de usuario
            </button>
          </>
        )}
      </div>
    </div>
  );
}
