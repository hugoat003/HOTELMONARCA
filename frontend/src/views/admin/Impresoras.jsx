// Configuración → Impresoras: las dos 3nstar RPT004 (cocina y caja), opciones de impresión
// y la cola de tickets (en espera, impresos, simulados).
import { useEffect, useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { fmtDateTime } from '@shared/dates.js';
import { PRINTER_MODES, PRINTER_NAMES, printerConfig } from '@shared/tickets.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

const IP_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const JOB_STATUS = { pendiente: 'En espera', impreso: 'Impreso', simulado: 'Simulado', descartado: 'Descartado' };

export function printerProblem(p) {
  if (p.mode === 'red' && !IP_RE.test(p.host || '')) return 'Falta una IP válida (ej. 192.168.1.50)';
  if (p.mode === 'red' && !(Number(p.port) > 0)) return 'Falta el puerto (normalmente 9100)';
  if (p.mode === 'usb' && !p.device) return 'Falta el dispositivo USB';
  return '';
}

export default function Impresoras() {
  const { state, update, printers, print, loadPrinters, printerAction } = useStore();
  const ui = useUI();
  const [cfg, setCfg] = useState(() => printerConfig(state.config));
  const [view, setView] = useState(null);

  // La lista de tickets se recarga cuando hay uno nuevo o cambia su estado
  const version = printers?.version;
  const pendingSig = Object.values(printers?.printers || {})
    .map((p) => p.pending)
    .join('-');
  useEffect(() => {
    loadPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, pendingSig]);

  const setP = (name, k, v) => setCfg({ ...cfg, [name]: { ...cfg[name], [k]: v } });
  const save = () => {
    for (const name of Object.keys(PRINTER_NAMES)) {
      const problem = printerProblem(cfg[name]);
      if (problem) return ui.notify(`${PRINTER_NAMES[name]}: ${problem}`);
    }
    const clean = (p) => ({
      ...p,
      host: (p.host || '').trim(),
      port: Number(p.port) || 9100,
      columns: Number(p.columns),
    });
    const next = { ...cfg, cocina: clean(cfg.cocina), caja: clean(cfg.caja) };
    update((d) => A.setConfig(d, { printers: next }));
    setCfg(next);
    ui.notify('Impresoras guardadas');
  };
  const saved = printerConfig(state.config);
  const dirty = JSON.stringify(saved) !== JSON.stringify(cfg);

  const test = async (name) => {
    if (dirty) return ui.notify('Guarda los cambios antes de imprimir la prueba');
    const r = await print('prueba', name);
    ui.notify(r.ok ? (r.mode === 'simulada' ? 'Prueba guardada (impresora simulada)' : 'Prueba enviada') : r.error);
  };
  const act = async (action, body, ok) => {
    const r = await printerAction(action, body);
    ui.notify(r.ok ? ok : r.error);
  };

  return (
    <div className="stack gap-16" style={{ maxWidth: 1000 }}>
      <div className="printer-grid">
        {Object.entries(PRINTER_NAMES).map(([name, label]) => {
          const p = cfg[name];
          const st = printers?.printers?.[name];
          const live = saved[name].mode === 'red' || saved[name].mode === 'usb';
          return (
            <div key={name} className="card gap-12 pad-16" data-printer={name}>
              <div className="row items-center gap-10">
                <div className="report-title" style={{ fontSize: 20 }}>
                  {label}
                </div>
                <span className="pill">
                  <span className={'dot' + (!live ? ' off' : st?.error ? '' : ' on')} />
                  {!live
                    ? PRINTER_MODES[saved[name].mode]
                    : st?.error
                      ? 'Sin respuesta'
                      : st?.lastOk
                        ? 'Funcionando'
                        : 'Lista'}
                </span>
              </div>
              <div className="panel-sub text-sm">
                {name === 'cocina'
                  ? 'Comandas, platillos para marchar y avisos de anulación.'
                  : 'Comprobantes, precuentas, estados de cuenta y cierre de caja. La gaveta se conecta a esta impresora.'}
              </div>
              <div className="segmented row four" role="radiogroup" aria-label={`Conexión de ${label}`}>
                {Object.entries(PRINTER_MODES).map(([k, l]) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={p.mode === k}
                    className={'seg-btn' + (p.mode === k ? ' active' : '')}
                    onClick={() => setP(name, 'mode', k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              {p.mode === 'red' && (
                <div className="form-grid two">
                  <Field label="IP de la impresora" hint="Fija, reservada en el router">
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="192.168.1.50"
                      value={p.host}
                      onChange={(e) => setP(name, 'host', e.target.value)}
                    />
                  </Field>
                  <Field label="Puerto">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={p.port}
                      onChange={(e) => setP(name, 'port', e.target.value)}
                    />
                  </Field>
                </div>
              )}
              {p.mode === 'usb' && (
                <Field label="Dispositivo USB" hint="En el NUC con Ubuntu suele ser /dev/usb/lp0">
                  <input className="input" value={p.device} onChange={(e) => setP(name, 'device', e.target.value)} />
                </Field>
              )}
              {p.mode === 'simulada' && (
                <div className="note-box">
                  No se imprime: cada ticket queda en la lista de abajo para verlo en pantalla. Útil para la
                  demostración o mientras se instala la impresora.
                </div>
              )}
              {(p.mode === 'red' || p.mode === 'usb') && (
                <Field label="Letra" hint="48 columnas es la letra normal de la RPT004">
                  <div className="segmented row two">
                    {[48, 42].map((n) => (
                      <button
                        key={n}
                        className={'seg-btn' + (Number(p.columns) === n ? ' active' : '')}
                        onClick={() => setP(name, 'columns', n)}
                      >
                        {n === 48 ? 'Normal (48)' : 'Grande (42)'}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {st?.pending > 0 && (
                <div className="note-box warn" role="status">
                  <strong>{st.pending} en espera.</strong> {st.error || 'Enviando…'}
                </div>
              )}
              <div className="chips">
                {saved[name].mode !== 'apagada' && (
                  <button className="btn small" onClick={() => test(name)}>
                    Imprimir prueba
                  </button>
                )}
                {st?.pending > 0 && (
                  <button className="btn small" onClick={() => act('retry', { printer: name }, 'Reintentando…')}>
                    Reintentar ahora
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card gap-12 pad-16">
        <div className="card-label">Opciones</div>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.autoReceipt}
            onChange={(e) => setCfg({ ...cfg, autoReceipt: e.target.checked })}
          />
          Imprimir el comprobante al cobrar
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={cfg.openDrawer}
            onChange={(e) => setCfg({ ...cfg, openDrawer: e.target.checked })}
          />
          Abrir la gaveta al cobrar en efectivo
        </label>
        <label className="check">
          <input type="checkbox" checked={cfg.logo} onChange={(e) => setCfg({ ...cfg, logo: e.target.checked })} />
          Usar el logo guardado en la impresora (se carga una vez con la utilidad de 3nstar)
        </label>
        <div className="row items-center gap-10">
          <span className="text-md">Copias de cada comanda</span>
          <div className="segmented row two" style={{ width: 160 }}>
            {[1, 2].map((n) => (
              <button
                key={n}
                className={'seg-btn' + (Number(cfg.kitchenCopies) === n ? ' active' : '')}
                onClick={() => setCfg({ ...cfg, kitchenCopies: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="chips">
          <button className="btn btn-primary" disabled={!dirty} onClick={save}>
            Guardar impresoras
          </button>
          {dirty && (
            <button className="btn btn-quiet" onClick={() => setCfg(saved)}>
              Descartar cambios
            </button>
          )}
        </div>
      </div>

      <DataTable
        title="Últimos tickets"
        variant="print-jobs"
        columns={['Hora', 'Impresora', 'Ticket', 'Estado', '']}
        empty="Todavía no se ha impreso nada."
      >
        {(printers?.jobs || []).map((j) => (
          <div key={j.id} className={rowClass('print-jobs')}>
            <span>{fmtDateTime(j.created_at)}</span>
            <span>{PRINTER_NAMES[j.printer]}</span>
            <span>{j.title}</span>
            <span className={j.status === 'pendiente' ? 'text-warn' : ''} title={j.error || ''}>
              {JOB_STATUS[j.status]}
              {j.status === 'pendiente' && j.error ? ' · ' + j.error : ''}
            </span>
            <span className="row-actions">
              <button className="link" onClick={() => setView(j)}>
                Ver
              </button>
              {j.status !== 'pendiente' && (
                <button className="link" onClick={() => act('reprint', { id: j.id }, 'Enviado de nuevo')}>
                  Reimprimir
                </button>
              )}
              {j.status === 'pendiente' && (
                <button className="link danger" onClick={() => act('discard', { id: j.id }, 'Ticket descartado')}>
                  Descartar
                </button>
              )}
            </span>
          </div>
        ))}
      </DataTable>

      {view && (
        <Modal
          title={view.title}
          onClose={() => setView(null)}
          width={460}
          footer={
            <button className="btn" onClick={() => setView(null)}>
              Cerrar
            </button>
          }
        >
          <pre className="ticket-text">{view.text}</pre>
        </Modal>
      )}
    </div>
  );
}
