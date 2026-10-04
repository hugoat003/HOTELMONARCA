import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import Tabs from '../../components/Tabs.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { METHOD_LABELS } from '@shared/data.js';
import { fmtDateTime, fmtTime, today } from '@shared/dates.js';
import { exportXlsx } from '../../lib/excel.js';
import { sum } from '@shared/money.js';
import { TicketDoc } from '../../print/Docs.jsx';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';

export default function Ventas() {
  const { state, user } = useStore();
  const [tab, setTab] = usePersisted('ventas.pestana', 'cobros');
  const pending = state.sales.filter((s) => s.status === 'ok' && s.invoice && !s.invoice.number).length;
  // Las facturas pendientes son solo para la gerencia, que factura a mano
  if (user.role !== 'gerente') return <Cobros />;
  return (
    <div className="page gap-20">
      <Tabs
        tabs={[
          ['cobros', 'Cobros'],
          ['facturas', `Facturas pendientes${pending ? ` · ${pending}` : ''}`],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'facturas' ? <Facturas /> : <Cobros embedded />}
    </div>
  );
}

function Cobros({ embedded = false }) {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [scope, setScope] = usePersisted('ventas.alcance', 'turno');
  // El mesero solo ve las cuentas que atendió; recepción y gerencia ven todo
  const mine = user.role === 'mesero';
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');

  const sales = state.sales
    .filter((s) => (scope === 'todas' || s.shiftId === state.shift?.id) && (!mine || s.waiterId === user.id))
    .sort((a, b) => b.ts - a.ts);
  const ok = sales.filter((s) => s.status === 'ok');
  const voids = state.voids
    .filter((v) => (scope === 'todas' || v.shiftId === state.shift?.id) && (!mine || v.userId === user.id))
    .sort((a, b) => b.ts - a.ts);
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  // Solo se anula lo cobrado en el turno abierto (el efectivo de turnos cerrados ya se entregó),
  // y no un cargo a habitación que el huésped ya pagó al salir
  const voidBlock = (s) => {
    if (s.shiftId !== state.shift?.id) return 'Solo se anulan cobros del turno abierto';
    const room = s.payments.find((p) => p.method === 'habitacion');
    const r = room && state.reservations.find((x) => x.id === room.resId);
    if (r && r.status !== 'hospedado') return `${r.guest.name} ya pagó este cargo en su check-out`;
    return '';
  };

  const doVoid = () => {
    const s = voiding;
    ui.authorize(`Anular el comprobante #${s.number}`, (mgr) => {
      update((d) => A.voidSale(d, s.id, { reason: reason.trim(), authId: mgr.id }));
      setVoiding(null);
      setReason('');
      ui.notify(`Comprobante #${s.number} anulado`);
    });
  };

  return (
    <div className={embedded ? 'stack gap-20' : 'page gap-20'}>
      <div className="row items-center">
        <div className="segmented row two" style={{ width: 280 }}>
          <button className={'seg-btn' + (scope === 'turno' ? ' active' : '')} onClick={() => setScope('turno')}>
            Turno actual
          </button>
          <button className={'seg-btn' + (scope === 'todas' ? ' active' : '')} onClick={() => setScope('todas')}>
            Todas
          </button>
        </div>
        <div className="header-stats">
          <span className="pill">{ok.length} cobros</span>
          <span className="pill">Total {fmt(sum(ok, (s) => s.grand))}</span>
          {mine && <span className="pill">Tus propinas {fmt(sum(ok, (s) => s.tip))}</span>}
          {!mine && (
            <button
              className="btn small"
              onClick={() =>
                exportXlsx(`Monarca cobros ${scope === 'turno' ? 'turno' : 'todos'} ${today()}`, [
                  {
                    name: 'Cobros',
                    rows: sales.map((s) => ({
                      No: s.number,
                      Fecha: fmtDateTime(s.ts),
                      Cuenta: s.ref,
                      'Forma de pago': s.payments.map((p) => METHOD_LABELS[p.method]).join(' + '),
                      Cajero: userName(s.cashierId),
                      Total: s.total,
                      Propina: s.tip || 0,
                      Cobrado: s.grand,
                      Estado: s.status === 'ok' ? 'Cobrado' : 'Anulado',
                      Factura: s.invoice ? s.invoice.number || 'Pendiente' : '',
                    })),
                  },
                ])
              }
            >
              Exportar a Excel
            </button>
          )}
        </div>
      </div>

      {scope === 'turno' && !state.shift && <div className="note-box">No hay un turno de caja abierto.</div>}

      <DataTable variant="sales" columns={['No.', 'Hora', 'Cuenta', 'Forma de pago', 'Cajero', 'Total', '']}>
        {sales.map((s) => (
          <div key={s.id} className={'tx-row sales' + (s.status === 'anulada' ? ' voided' : '')}>
            <span className="panel-sub">#{s.number}</span>
            <span className="panel-sub">{scope === 'todas' ? fmtDateTime(s.ts) : fmtTime(s.ts)}</span>
            <span>
              {s.ref}
              {s.kind === 'hotel' && <span className="tag">Hotel</span>}
              {s.kind === 'evento' && <span className="tag">Evento</span>}
              {s.kind === 'tienda' && <span className="tag">Tienda</span>}
              {s.status === 'ok' && s.invoice && (
                <span className={'tag' + (s.invoice.number ? '' : ' status-cotizado')}>
                  {s.invoice.number ? 'Facturada' : 'Por facturar'}
                </span>
              )}
            </span>
            <span>{s.payments.map((p) => METHOD_LABELS[p.method]).join(' + ') || '—'}</span>
            <span className="panel-sub">{userName(s.cashierId)}</span>
            <strong>{fmt(s.grand)}</strong>
            <span className="row-actions">
              <button
                className="link"
                onClick={() =>
                  ui.preview(`Comprobante #${s.number}`, <TicketDoc sale={s} />, { print: { doc: 'ticket', id: s.id } })
                }
              >
                Ver
              </button>
              {s.status === 'ok' && (s.kind === 'restaurante' || s.kind === 'tienda') && (
                <button
                  className="link danger"
                  onClick={() => (voidBlock(s) ? ui.notify(voidBlock(s)) : setVoiding(s))}
                >
                  Anular
                </button>
              )}
              {s.status === 'anulada' && <span className="tag">Anulada</span>}
            </span>
          </div>
        ))}
        {!sales.length && <div className="panel-sub pad-12">Sin cobros todavía.</div>}
      </DataTable>

      {voids.length > 0 && (
        <DataTable title="Platillos anulados">
          {voids.map((v) => (
            <div key={v.id} className="tx-row voids">
              <span className="panel-sub">{fmtTime(v.ts)}</span>
              <span>
                {v.qty} × {v.name} · {v.ref}
              </span>
              <span className="panel-sub">
                {v.reason} · autorizó {userName(v.authId)}
              </span>
              <strong>{fmt(v.amount)}</strong>
            </div>
          ))}
        </DataTable>
      )}

      {voiding && (
        <Modal
          title={`Anular comprobante #${voiding.number}`}
          aside={fmt(voiding.grand)}
          onClose={() => setVoiding(null)}
          width={460}
          footer={
            <>
              <button className="btn" onClick={() => setVoiding(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-danger" disabled={!reason.trim()} onClick={doVoid}>
                Anular comprobante
              </button>
            </>
          }
        >
          <div className="note-box">
            El comprobante queda marcado como anulado y sale de los totales del turno.
            {voiding.payments.some((p) => p.method === 'habitacion') &&
              ' El cargo a la habitación también se elimina del folio.'}
            {voiding.kind === 'tienda' && ' Los productos regresan a la existencia de la tienda.'}
          </div>
          <Field label="Motivo">
            <input
              className="input"
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. cobro duplicado"
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}

// Ventas en las que el cliente pidió factura: la gerencia la emite fuera del sistema y anota el número
function Facturas() {
  const { state, user, fmt, update } = useStore();
  const ui = useUI();
  const [show, setShow] = usePersisted('ventas.facturas.vista', 'pendientes');
  const [marking, setMarking] = useState(null);
  const [number, setNumber] = useState('');
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  const all = state.sales.filter((s) => s.status === 'ok' && s.invoice).sort((a, b) => b.ts - a.ts);
  const list = all.filter((s) => (show === 'pendientes' ? !s.invoice.number : !!s.invoice.number));
  const pendingTotal = sum(
    all.filter((s) => !s.invoice.number),
    (s) => s.grand,
  );

  const save = () => {
    update((d) => A.markInvoiced(d, marking.id, { number: number.trim(), userId: user.id }));
    ui.notify(`Comprobante #${marking.number} marcado como facturado`);
    setMarking(null);
    setNumber('');
  };

  return (
    <>
      <div className="row items-center">
        <div className="segmented row two" style={{ width: 280 }}>
          <button
            className={'seg-btn' + (show === 'pendientes' ? ' active' : '')}
            onClick={() => setShow('pendientes')}
          >
            Pendientes
          </button>
          <button
            className={'seg-btn' + (show === 'facturadas' ? ' active' : '')}
            onClick={() => setShow('facturadas')}
          >
            Facturadas
          </button>
        </div>
        <div className="header-stats">
          <span className="pill">Por facturar {fmt(pendingTotal)}</span>
          <button
            className="btn small"
            onClick={() =>
              exportXlsx(`Monarca facturas ${show} ${today()}`, [
                {
                  name: show === 'pendientes' ? 'Por facturar' : 'Facturadas',
                  rows: list.map((s) => ({
                    Comprobante: s.number,
                    Fecha: fmtDateTime(s.ts),
                    Cuenta: s.ref,
                    NIT: s.invoice.nit,
                    Nombre: s.invoice.name,
                    Correo: s.invoice.email || '',
                    Total: s.grand,
                    Factura: s.invoice.number || '',
                  })),
                },
              ])
            }
          >
            Exportar a Excel
          </button>
        </div>
      </div>

      <DataTable
        variant="invoices"
        columns={['No.', 'Fecha', 'Cuenta', 'NIT', 'Nombre', 'Total', show === 'pendientes' ? '' : 'Factura']}
        empty={show === 'pendientes' ? 'No hay ventas pendientes de facturar.' : 'Aún no hay ventas facturadas.'}
      >
        {list.map((s) => (
          <div key={s.id} className={rowClass('invoices')}>
            <span className="panel-sub">#{s.number}</span>
            <span className="panel-sub">{fmtDateTime(s.ts)}</span>
            <span>{s.ref}</span>
            <strong>{s.invoice.nit}</strong>
            <span>
              {s.invoice.name}
              {s.invoice.email && <span className="panel-sub"> · {s.invoice.email}</span>}
            </span>
            <strong>{fmt(s.grand)}</strong>
            <span className="row-actions">
              <button
                className="link"
                onClick={() =>
                  ui.preview(`Comprobante #${s.number}`, <TicketDoc sale={s} />, { print: { doc: 'ticket', id: s.id } })
                }
              >
                Ver
              </button>
              {s.invoice.number ? (
                <span title={`Por ${userName(s.invoice.invoicedBy)}`}>No. {s.invoice.number}</span>
              ) : (
                <button className="link" onClick={() => setMarking(s)}>
                  Marcar facturada
                </button>
              )}
            </span>
          </div>
        ))}
      </DataTable>

      {marking && (
        <Modal
          title={`Factura del comprobante #${marking.number}`}
          aside={fmt(marking.grand)}
          onClose={() => setMarking(null)}
          width={460}
          footer={
            <>
              <button className="btn" onClick={() => setMarking(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={!number.trim()} onClick={save}>
                Guardar
              </button>
            </>
          }
        >
          <div className="kv">
            <span>NIT</span>
            <strong>{marking.invoice.nit}</strong>
            <span>Nombre</span>
            <strong>{marking.invoice.name}</strong>
            {marking.invoice.email && (
              <>
                <span>Correo</span>
                <strong>{marking.invoice.email}</strong>
              </>
            )}
          </div>
          <Field label="Número de la factura emitida">
            <input
              className="input"
              autoFocus
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && number.trim() && save()}
              placeholder="Ej. A-10459"
            />
          </Field>
        </Modal>
      )}
    </>
  );
}
