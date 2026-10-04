import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/store.jsx';
import Modal from './Modal.jsx';
import PinPad from './PinPad.jsx';

const UIContext = createContext(null);

// Servicios de interfaz compartidos: avisos, confirmaciones, PIN de gerente e impresión
export function UIProvider({ children }) {
  const { user, notice, authorizePin, print } = useStore();
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
    // print: { doc, id } para imprimirlo en la impresora del hotel (el servidor arma el ticket).
    // note: aviso arriba del documento (ej. "El comprobante salió en caja").
    preview(title, node, { wide = false, print = null, note = '' } = {}) {
      setDoc({ title, node, wide, print, note });
    },
  };

  // El servidor valida el PIN del gerente y deja autorizada la siguiente operación de esta sesión
  const checkManagerPin = async (pin) => {
    const r = await authorizePin(pin);
    if (r.ok) {
      const cb = auth.cb;
      setAuth(null);
      cb(r.user);
    }
    return r;
  };

  // Avisos del servidor (operación rechazada, sesión vencida…)
  useEffect(() => {
    if (notice) ui.notify(notice.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id]);

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
              {doc.print ? (
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const r = await print(doc.print.doc, doc.print.id);
                    ui.notify(
                      !r.ok
                        ? r.error
                        : r.mode === 'simulada'
                          ? 'Guardado en la lista de tickets (impresora simulada)'
                          : `Enviado a la impresora de ${r.printer}`,
                    );
                  }}
                >
                  Imprimir
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => window.print()}>
                  Imprimir
                </button>
              )}
            </>
          }
        >
          {doc.note && <div className="note-box">{doc.note}</div>}
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
