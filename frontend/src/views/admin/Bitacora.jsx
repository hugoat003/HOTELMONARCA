import DataTable, { rowClass } from '../../components/DataTable.jsx';
import KpiCard from '../../components/KpiCard.jsx';
import { AUDIT_TYPES } from '../../data.js';
import { dateOf, fmtDateTime, today } from '../../lib/dates.js';
import { exportXlsx } from '../../lib/excel.js';
import { sum } from '../../lib/money.js';
import { useStore } from '../../store/store.jsx';
import { usePersisted } from '../../store/usePersisted.js';
import { preset, PRESETS } from '../caja/RangeReport.jsx';

// Montos que representan dinero que el negocio deja de recibir (para el total de la vista)
const LOSS_TYPES = ['anulacion', 'cortesia', 'descuento', 'comprobante', 'devolucion', 'cargo'];

// Bitácora de operaciones sensibles: solo gerencia
export default function Bitacora() {
  const { state, fmt } = useStore();
  const [rangeKey, setRangeKey] = usePersisted('bitacora.rango', 'hoy');
  const [type, setType] = usePersisted('bitacora.tipo', 'todos');
  const [userId, setUserId] = usePersisted('bitacora.usuario', 'todos');
  const [search, setSearch] = usePersisted('bitacora.busqueda', '');
  const [from, to] = preset(rangeKey) || [today(), today()];
  const userName = (id) => state.users.find((u) => u.id === id)?.name || '—';

  const inRange = (state.audit || []).filter((a) => {
    const day = dateOf(a.ts);
    return day >= from && day <= to;
  });
  const q = search.trim().toLowerCase();
  const rows = inRange
    .filter(
      (a) =>
        (type === 'todos' || a.type === type) &&
        (userId === 'todos' || a.userId === userId || a.authId === userId) &&
        (!q || `${a.ref} ${a.detail}`.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.ts - a.ts);
  const count = (t) => inRange.filter((a) => a.type === t).length;
  const lost = sum(
    inRange.filter((a) => LOSS_TYPES.includes(a.type)),
    (a) => a.amount,
  );
  const cashDiff = sum(
    inRange.filter((a) => a.type === 'caja' && a.ref === 'Cierre de turno'),
    (a) => a.amount,
  );

  const exportExcel = () =>
    exportXlsx(`Monarca bitácora ${from} a ${to}`, [
      {
        name: 'Bitácora',
        rows: rows.map((a) => ({
          Fecha: fmtDateTime(a.ts),
          Tipo: AUDIT_TYPES[a.type] || a.type,
          Referencia: a.ref,
          Detalle: a.detail,
          Monto: a.amount ?? '',
          Usuario: userName(a.userId),
          Autorizó: a.authId ? userName(a.authId) : '',
        })),
      },
    ]);

  return (
    <div className="page gap-16">
      <div className="row items-center">
        <div className="chips">
          {PRESETS.map(([k, l]) => (
            <button key={k} className={'chip small' + (rangeKey === k ? ' active' : '')} onClick={() => setRangeKey(k)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={exportExcel} disabled={!rows.length}>
          Exportar a Excel
        </button>
      </div>

      <div className="kpis">
        <KpiCard label="Registros" value={inRange.length} note="Operaciones sensibles del periodo" />
        <KpiCard
          label="Anulaciones y cortesías"
          value={count('anulacion') + count('cortesia') + count('comprobante')}
          note={`${count('descuento')} descuento${count('descuento') === 1 ? '' : 's'}`}
        />
        <KpiCard label="Dejado de cobrar" value={fmt(lost)} note="Anulado, cortesías, descuentos y devoluciones" />
        <KpiCard
          label="Diferencias de caja"
          value={fmt(cashDiff)}
          note="Suma de sobrantes y faltantes"
          tone={cashDiff < 0 ? 'alert' : undefined}
        />
      </div>

      <div className="row items-center gap-12">
        <div className="chips">
          <button className={'chip small' + (type === 'todos' ? ' active' : '')} onClick={() => setType('todos')}>
            Todos
          </button>
          {Object.entries(AUDIT_TYPES)
            .filter(([k]) => count(k) > 0 || type === k)
            .map(([k, l]) => (
              <button key={k} className={'chip small' + (type === k ? ' active' : '')} onClick={() => setType(k)}>
                {l} · {count(k)}
              </button>
            ))}
        </div>
        <span className="chips">
          <select className="input" style={{ width: 200 }} value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="todos">Todos los usuarios</option>
            {state.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input
            className="input search"
            style={{ width: 220 }}
            placeholder="Buscar mesa, huésped, producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </span>
      </div>

      <DataTable
        variant="audit"
        columns={['Fecha', 'Tipo', 'Referencia', 'Detalle', 'Monto', 'Usuario · autorizó']}
        empty="Sin registros en este periodo."
      >
        {rows.map((a) => (
          <div key={a.id} className={rowClass('audit')}>
            <span className="panel-sub">{fmtDateTime(a.ts)}</span>
            <span>
              <span className={'tag audit-' + a.type}>{AUDIT_TYPES[a.type] || a.type}</span>
            </span>
            <strong>{a.ref}</strong>
            <span>{a.detail}</span>
            <strong className={a.type === 'caja' && a.amount < 0 ? 'urgent' : ''}>
              {a.amount === null || a.amount === undefined ? '—' : fmt(a.amount)}
            </strong>
            <span className="panel-sub">
              {userName(a.userId)}
              {a.authId && <> · autorizó {userName(a.authId)}</>}
            </span>
          </div>
        ))}
      </DataTable>
    </div>
  );
}
