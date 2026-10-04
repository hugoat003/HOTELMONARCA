import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { makeFmt } from '@shared/money.js';
import { VERSION } from '@shared/version.js';
import { SyncClient } from './client.js';

// Un solo cliente por pestaña: guarda la sesión y mantiene los datos al día con el servidor
export const client = new SyncClient();
if (typeof window !== 'undefined') window.__monarca = { flush: () => client.whenIdle() };

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const snap = useSyncExternalStore(client.subscribe, client.getSnapshot);

  useEffect(() => {
    client.start();
  }, []);

  const value = useMemo(() => {
    const { state } = snap;
    // Un usuario desactivado o eliminado pierde la sesión de inmediato
    const user = state?.session ? state.users.find((u) => u.id === state.session.userId && u.active) || null : null;
    return {
      state,
      user,
      fmt: makeFmt(state?.config?.currency || 'Q'),
      status: snap.status,
      pending: snap.pending,
      notice: snap.notice,
      printers: snap.printers,
      updateAvailable: snap.updateAvailable,
      reloadApp: () => client.reloadApp(),
      print: (doc, id) => client.print(doc, id),
      loadPrinters: () => client.loadPrinters(),
      printerAction: (action, body) => client.printerAction(action, body),
      update: client.update,
      login: (userId, pin) => client.login(userId, pin),
      logout: client.logout,
      authorizePin: (pin) => client.authorize(pin),
      restore: (data) => client.restore(data),
      resetDemo: () => client.resetDemo(),
    };
  }, [snap]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);

export { VERSION };
