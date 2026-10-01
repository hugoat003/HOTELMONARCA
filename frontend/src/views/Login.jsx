import { useState } from 'react';
import PinPad from '../components/ui/PinPad.jsx';
import { ROLE_LABELS } from '../data.js';
import { fmtLongDate } from '../lib/dates.js';
import { A } from '../store/actions.js';
import { useStore } from '../store/store.jsx';

export default function Login() {
  const { state, update } = useStore();
  const [sel, setSel] = useState(null);
  const users = state.users.filter((u) => u.active);

  return (
    <div className="login">
      <div className="login-card">
        <img src="/logo-monarca.png" alt="Monarca Hotel Boutique" className="login-logo" />
        <div className="panel-sub" style={{ textAlign: 'center' }}>{fmtLongDate().replace(/^./, (c) => c.toUpperCase())}</div>
        {!sel ? (
          <>
            <div className="eyebrow" style={{ textAlign: 'center' }}>¿Quién eres?</div>
            <div className="login-users">
              {users.map((u) => (
                <button key={u.id} className="login-user" onClick={() => setSel(u)}>
                  <span className="avatar">{u.name[0]}</span>
                  <strong>{u.name}</strong>
                  <span className="panel-sub">{ROLE_LABELS[u.role]}</span>
                </button>
              ))}
            </div>
            <div className="demo-hint">Demo · PIN: Gerente 1111 · Recepción 2222 · Juan 3333 · Ana 4444</div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <div className="panel-title">{sel.name}</div>
              <div className="panel-sub">Ingresa tu PIN</div>
            </div>
            <PinPad onSubmit={(pin) => {
              if (pin !== sel.pin) return false;
              update((d) => A.login(d, sel.id));
              return true;
            }} />
            <button className="btn btn-quiet" onClick={() => setSel(null)}>Cambiar de usuario</button>
          </>
        )}
      </div>
    </div>
  );
}
