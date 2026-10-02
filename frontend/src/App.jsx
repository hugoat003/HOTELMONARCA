import { useEffect, useRef, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { UIProvider, useUI } from './components/ui/UIProvider.jsx';
import { NAV, ROLE_LABELS, ROLES, TITLES } from './data.js';
import { fmtLongDate, today } from './lib/dates.js';
import { roomState } from './lib/hotel.js';
import { A } from './store/actions.js';
import { StoreProvider, useStore } from './store/store.jsx';
import Admin from './views/admin/Admin.jsx';
import Bitacora from './views/admin/Bitacora.jsx';
import Dashboard from './views/Dashboard.jsx';
import Eventos from './views/eventos/Eventos.jsx';
import Inventario from './views/restaurante/Inventario.jsx';
import Caja from './views/caja/Caja.jsx';
import Reporte from './views/caja/Reporte.jsx';
import Habitaciones from './views/hotel/Habitaciones.jsx';
import Huespedes from './views/hotel/Huespedes.jsx';
import Limpieza from './views/hotel/Limpieza.jsx';
import Tienda from './views/hotel/Tienda.jsx';
import Reservas from './views/hotel/Reservas.jsx';
import Login from './views/Login.jsx';
import Mesas from './views/restaurante/Mesas.jsx';
import Pedido from './views/restaurante/Pedido.jsx';
import Ventas from './views/restaurante/Ventas.jsx';
import { usePersisted } from './store/usePersisted.js';

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
          <button className="chip small" onClick={() => refresh((n) => n + 1)}>
            Actualizar
          </button>
          <button className="chip small" onClick={() => update((d) => A.logout(d))}>
            Salir
          </button>
        </div>
      </header>
      {user.role === 'gerente' ? (
        <Dashboard mobile />
      ) : (
        <div className="empty-state" style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div>El resumen en el teléfono es para gerencia. Usa la tablet o la computadora para operar el sistema.</div>
        </div>
      )}
    </div>
  );
}

// Cierra la sesión tras `minutes` sin tocar la pantalla (0 = nunca).
// Las cuentas y pedidos no se pierden: viven en el store.
function useIdleLock(minutes, onLock) {
  const lockRef = useRef(onLock);
  lockRef.current = onLock;
  useEffect(() => {
    if (!minutes) return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => lockRef.current(), minutes * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
}

function Shell() {
  const { state, user, update } = useStore();
  const ui = useUI();
  const allowed = ROLES[user.role];
  const [savedView, setView] = usePersisted('vista', allowed[0]);
  const [orderId, setOrderId] = usePersisted('pedido.orden', null);
  let view = allowed.includes(savedView) ? savedView : allowed[0];
  // Sin una cuenta abierta el pedido no tiene sentido: se regresa a Mesas
  if (view === 'pedido' && !state.orders.some((o) => o.id === orderId)) view = 'mesas';
  const navActive = NAV.find((n) => n.key === view)?.parent || view;
  const [navOpen, setNavOpen] = useState(false); // menú en cajón (tablet)

  useIdleLock(state.config.lockMinutes ?? 5, () => {
    update((d) => A.logout(d));
    ui.notify('Sesión cerrada por inactividad');
  });

  const go = (v, params = {}) => {
    if (!allowed.includes(v)) return;
    if (params.orderId !== undefined) setOrderId(params.orderId);
    setView(v);
    setNavOpen(false);
  };

  const d0 = today();
  const occTables = state.orders.filter((o) => o.type === 'mesa').length;
  const occRooms = state.rooms.filter((r) => roomState(r, state.reservations, d0).status === 'ocupada').length;

  return (
    <div className={'app' + (user.role === 'mesero' ? ' compact' : '') + (navOpen ? ' nav-open' : '')}>
      <button className="nav-backdrop" aria-label="Cerrar menú" onClick={() => setNavOpen(false)} />
      <aside className="sidebar">
        <img src="/logo-monarca.png" alt="Monarca Hotel Boutique" className="sidebar-logo" />
        <nav className="nav">
          {NAV.filter((n) => !n.hidden && allowed.includes(n.key)).map((n) => (
            <div key={n.key} className="nav-item">
              {n.group && <div className="nav-group">{n.group}</div>}
              <button className={'nav-btn' + (navActive === n.key ? ' active' : '')} onClick={() => go(n.key)}>
                {n.label}
              </button>
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
          <button
            className="btn btn-quiet"
            onClick={() =>
              ui.confirm(
                {
                  title: 'Cerrar sesión',
                  message: `¿Salir de la sesión de ${user.name}?`,
                  confirmLabel: 'Cerrar sesión',
                },
                () => update((d) => A.logout(d)),
              )
            }
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="header">
          <div className="header-title">
            <button className="menu-toggle" aria-label="Abrir menú" onClick={() => setNavOpen(true)}>
              ☰
            </button>
            <h1>{TITLES[view]}</h1>
            <span className="header-date">{fmtLongDate()}</span>
          </div>
          <div className="header-stats">
            <span className="pill">
              Mesas {occTables}/{state.tables.length}
            </span>
            <span className="pill">
              Habitaciones {occRooms}/{state.rooms.length}
            </span>
            <button className={'pill' + (state.shift ? '' : ' warn')} onClick={() => go('caja')}>
              <span className={'dot' + (state.shift ? ' on' : '')} />
              {state.shift ? 'Caja abierta' : 'Caja cerrada'}
            </button>
          </div>
        </header>

        <div className="content">
          <ErrorBoundary key={view} onReset={() => setView(allowed[0])}>
            {view === 'dashboard' && <Dashboard go={go} />}
            {view === 'mesas' && <Mesas go={go} />}
            {view === 'pedido' && <Pedido orderId={orderId} go={go} />}
            {view === 'ventas' && <Ventas />}
            {view === 'inventario' && <Inventario />}
            {view === 'eventos' && <Eventos />}
            {view === 'habitaciones' && <Habitaciones />}
            {view === 'reservas' && <Reservas />}
            {view === 'huespedes' && <Huespedes />}
            {view === 'limpieza' && <Limpieza />}
            {view === 'tienda' && <Tienda />}
            {view === 'caja' && <Caja />}
            {view === 'reporte' && <Reporte go={go} />}
            {view === 'bitacora' && <Bitacora />}
            {view === 'admin' && <Admin />}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
