import { useEffect, useState } from 'react';
import { UIProvider, useUI } from './components/ui/UIProvider.jsx';
import { NAV, ROLE_LABELS, ROLES, TITLES } from './data.js';
import { fmtLongDate, today } from './lib/dates.js';
import { roomState } from './lib/hotel.js';
import { A } from './store/actions.js';
import { StoreProvider, useStore } from './store/store.jsx';
import Admin from './views/admin/Admin.jsx';
import Dashboard from './views/Dashboard.jsx';
import Eventos from './views/eventos/Eventos.jsx';
import Inventario from './views/restaurante/Inventario.jsx';
import Caja from './views/caja/Caja.jsx';
import Reporte from './views/caja/Reporte.jsx';
import Habitaciones from './views/hotel/Habitaciones.jsx';
import Limpieza from './views/hotel/Limpieza.jsx';
import Tienda from './views/hotel/Tienda.jsx';
import Reservas from './views/hotel/Reservas.jsx';
import Login from './views/Login.jsx';
import Mesas from './views/restaurante/Mesas.jsx';
import Pedido from './views/restaurante/Pedido.jsx';
import Ventas from './views/restaurante/Ventas.jsx';

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Root />
      </UIProvider>
    </StoreProvider>
  );
}

// Pantallas angostas (teléfono) muestran solo el resumen
function useIsPhone() {
  const query = '(max-width: 760px)';
  const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

function Root() {
  const { user } = useStore();
  const phone = useIsPhone();
  if (!user) return <Login />;
  if (phone) return <PhoneShell />;
  // key: al cambiar de usuario se reinicia la navegación
  return <Shell key={user.id} />;
}

function PhoneShell() {
  const { user, update } = useStore();
  const [, refresh] = useState(0);
  return (
    <div className="phone">
      <header className="phone-head">
        <img src="/logo-monarca.png" alt="Monarca Hotel Boutique" />
        <div className="chips">
          <button className="chip small" onClick={() => refresh((n) => n + 1)}>Actualizar</button>
          <button className="chip small" onClick={() => update((d) => A.logout(d))}>Salir</button>
        </div>
      </header>
      {user.role === 'gerente' ? <Dashboard mobile /> : (
        <div className="empty-state" style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div>El resumen en el teléfono es para gerencia. Usa la tablet o la computadora para operar el sistema.</div>
        </div>
      )}
    </div>
  );
}

function Shell() {
  const { state, user, update } = useStore();
  const ui = useUI();
  const allowed = ROLES[user.role];
  const [view, setView] = useState(allowed[0]);
  const [orderId, setOrderId] = useState(null);

  const go = (v, params = {}) => {
    if (!allowed.includes(v)) return;
    if (params.orderId !== undefined) setOrderId(params.orderId);
    setView(v);
  };

  const d0 = today();
  const occTables = state.orders.filter((o) => o.type === 'mesa').length;
  const occRooms = state.rooms.filter((r) => roomState(r, state.reservations, d0).status === 'ocupada').length;

  return (
    <div className="app">
      <aside className="sidebar">
        <img src="/logo-monarca.png" alt="Monarca Hotel Boutique" className="sidebar-logo" />
        <nav className="nav">
          {NAV.filter((n) => allowed.includes(n.key)).map((n) => (
            <div key={n.key} className="nav-item">
              {n.group && <div className="nav-group">{n.group}</div>}
              <button className={'nav-btn' + (view === n.key ? ' active' : '')} onClick={() => go(n.key)}>{n.label}</button>
            </div>
          ))}
        </nav>
        <div className="session">
          <div className="eyebrow">Sesión</div>
          <div className="session-user">
            <span className="avatar">{user.name[0]}</span>
            <div>
              <strong>{user.name}</strong>
              <div className="panel-sub text-xs">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <button className="btn btn-quiet" onClick={() => ui.confirm({ title: 'Cerrar sesión', message: `¿Salir de la sesión de ${user.name}?`, confirmLabel: 'Cerrar sesión' }, () => update((d) => A.logout(d)))}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div className="header-title">
            <h1>{TITLES[view]}</h1>
            <span className="header-date">{fmtLongDate()}</span>
          </div>
          <div className="header-stats">
            <span className="pill">Mesas {occTables}/{state.tables.length}</span>
            <span className="pill">Habitaciones {occRooms}/{state.rooms.length}</span>
            <button className={'pill' + (state.shift ? '' : ' warn')} onClick={() => go('caja')}>
              <span className={'dot' + (state.shift ? ' on' : '')} />{state.shift ? 'Caja abierta' : 'Caja cerrada'}
            </button>
          </div>
        </header>

        <div className="content">
          {view === 'dashboard' && <Dashboard go={go} />}
          {view === 'mesas' && <Mesas go={go} />}
          {view === 'pedido' && <Pedido orderId={orderId} go={go} />}
          {view === 'ventas' && <Ventas />}
          {view === 'inventario' && <Inventario />}
          {view === 'eventos' && <Eventos />}
          {view === 'habitaciones' && <Habitaciones />}
          {view === 'reservas' && <Reservas />}
          {view === 'limpieza' && <Limpieza />}
          {view === 'tienda' && <Tienda />}
          {view === 'caja' && <Caja />}
          {view === 'reporte' && <Reporte go={go} />}
          {view === 'admin' && <Admin />}
        </div>
      </main>
    </div>
  );
}
