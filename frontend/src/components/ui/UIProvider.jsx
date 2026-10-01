import { createContext, useContext, useRef, useState } from 'react';
import { useStore } from '../../store/store.jsx';
import Modal from './Modal.jsx';
import PinPad from './PinPad.jsx';

const UIContext = createContext(null);

// Servicios de interfaz compartidos: avisos, confirmaciones, PIN de gerente e impresión
export function UIProvider({ children }) {
  const { state, user } = useStore();
  const [toast, setToast] = useState('');
  const [auth, setAuth] = useState(null);
  const [ask, setAsk] = useState(null);
  const [doc, setDoc] = useState(null);
  const timer = useRef();

  const ui = {
    notify(msg) {
      setToast(msg);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(''), 2800);
    },
    // Ejecuta cb(aprobador) si el usuario es gerente o si un gerente ingresa su PIN
    authorize(label, cb) {
      if (user?.role === 'gerente') cb(user);
      else setAuth({ label, cb });
    },
    confirm({ title, message, confirmLabel = 'Confirmar', danger = false }, cb) {
      setAsk({ title, message, confirmLabel, danger, cb });
    },
    preview(title, node, { wide = false } = {}) {
      setDoc({ title, node, wide });
    },
  };

  const checkManagerPin = (pin) => {
    const mgr = state.users.find((u) => u.active && u.role === 'gerente' && u.pin === pin);
    if (!mgr) return false;
    const cb = auth.cb;
    setAuth(null);
    cb(mgr);
    return true;
  };

  return (
    <UIContext.Provider value={ui}>
      {children}

      {auth && (
        <Modal title="Autorización" onClose={() => setAuth(null)} width={380}>
          <div className="panel-sub text-md">{auth.label}. Ingresa el PIN de un gerente para continuar.</div>
          <PinPad onSubmit={checkManagerPin} error="PIN de gerente inválido" />
          <button className="btn btn-quiet" onClick={() => setAuth(null)}>
            Cancelar
          </button>
        </Modal>
      )}

      {ask && (
        <Modal
          title={ask.title}
          onClose={() => setAsk(null)}
          width={420}
          footer={
            <>
              <button className="btn" onClick={() => setAsk(null)}>
                Cancelar
              </button>
              <button
                className={'btn btn-primary' + (ask.danger ? ' btn-danger' : '')}
                onClick={() => {
                  setAsk(null);
                  ask.cb();
                }}
              >
                {ask.confirmLabel}
              </button>
            </>
          }
        >
          <div style={{ fontSize: 15, color: 'var(--muted)' }}>{ask.message}</div>
        </Modal>
      )}

      {doc && (
        <Modal
          title={doc.title}
          onClose={() => setDoc(null)}
          width={doc.wide ? 860 : 420}
          footer={
            <>
              <button className="btn" onClick={() => setDoc(null)}>
                Cerrar
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                Imprimir
              </button>
            </>
          }
        >
          <div className="doc-scroll">
            <div className={'print-doc' + (doc.wide ? ' wide' : '')}>{doc.node}</div>
          </div>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
