// Configuración → Habitaciones: temporadas, recargo de fin de semana y persona extra
import { useState } from 'react';
import DataTable, { rowClass } from '../../components/DataTable.jsx';
import Modal, { Field } from '../../components/ui/Modal.jsx';
import { useUI } from '../../components/ui/UIProvider.jsx';
import { fmtDate, uid } from '../../lib/dates.js';
import { A } from '../../store/actions.js';
import { useStore } from '../../store/store.jsx';

export default function Seasons() {
  const { state, fmt, update } = useStore();
  const ui = useUI();
  const [edit, setEdit] = useState(null);
  const [rules, setRules] = useState({
    weekendPct: state.config.weekendPct ?? 0,
    extraPersonFrom: state.config.extraPersonFrom ?? 2,
    extraPersonRate: state.config.extraPersonRate ?? 0,
  });
  const seasons = [...(state.seasons || [])].sort((a, b) => a.from.localeCompare(b.from));
  const typeName = (id) => state.roomTypes.find((t) => t.id === id)?.name || id;

  return (
    <>
      <div className="card gap-12">
        <div className="card-label">Recargos por noche (precio automático)</div>
        <div className="form-grid">
          <Field label="Recargo viernes y sábado" hint="%">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={rules.weekendPct}
              onChange={(e) => setRules({ ...rules, weekendPct: e.target.value })}
            />
          </Field>
          <Field label="Persona extra a partir de" hint="personas incluidas">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={rules.extraPersonFrom}
              onChange={(e) => setRules({ ...rules, extraPersonFrom: e.target.value })}
            />
          </Field>
          <Field label="Cargo por persona extra" hint="por noche">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              value={rules.extraPersonRate}
              onChange={(e) => setRules({ ...rules, extraPersonRate: e.target.value })}
            />
          </Field>
        </div>
        <div className="row items-center">
          <span className="panel-sub text-sm">
            El precio automático usa la tarifa del tipo, o la de la temporada si aplica, más estos recargos. Las tarifas
            pactadas y mensuales solo suman la persona extra.
          </span>
          <button
            className="btn small"
            onClick={() => {
              update((d) =>
                A.setConfig(d, {
                  weekendPct: parseFloat(rules.weekendPct) || 0,
                  extraPersonFrom: parseInt(rules.extraPersonFrom) || 0,
                  extraPersonRate: parseFloat(rules.extraPersonRate) || 0,
                }),
              );
              ui.notify('Recargos guardados');
            }}
          >
            Guardar recargos
          </button>
        </div>
      </div>

      <div className="row items-center">
        <span className="card-label">Temporadas</span>
        <button
          className="btn small"
          onClick={() => setEdit({ id: uid('t'), name: '', from: '', to: '', rates: {}, isNew: true })}
        >
          + Temporada
        </button>
      </div>
      <DataTable variant="seasons" columns={['Temporada', 'Fechas', 'Precio por tipo', '']} empty="Sin temporadas.">
        {seasons.map((s) => (
          <div key={s.id} className={rowClass('seasons')}>
            <strong>{s.name}</strong>
            <span>
              {fmtDate(s.from, { day: 'numeric', month: 'short', year: 'numeric' })} –{' '}
              {fmtDate(s.to, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <span className="panel-sub">
              {Object.entries(s.rates)
                .map(([t, r]) => `${typeName(t)} ${fmt(r)}`)
                .join(' · ')}
            </span>
            <span className="row-actions">
              <button className="link" onClick={() => setEdit(s)}>
                Editar
              </button>
            </span>
          </div>
        ))}
      </DataTable>

      {edit && (
        <SeasonModal
          season={edit}
          others={(state.seasons || []).filter((x) => x.id !== edit.id)}
          types={state.roomTypes}
          onClose={() => setEdit(null)}
          onDelete={() => {
            update((d) => A.remove(d, 'seasons', edit.id));
            setEdit(null);
          }}
          onSave={({ isNew, ...s }) => {
            update((d) => A.upsert(d, 'seasons', s));
            setEdit(null);
            ui.notify(isNew ? 'Temporada creada' : 'Temporada actualizada');
          }}
        />
      )}
    </>
  );
}

function SeasonModal({ season, others, types, onClose, onSave, onDelete }) {
  const [s, setS] = useState({
    ...season,
    rates: Object.fromEntries(types.map((t) => [t.id, String(season.rates?.[t.id] ?? '')])),
  });
  const overlaps = s.from && s.to ? others.filter((o) => o.from <= s.to && s.from <= o.to) : [];
  const problem = !s.name.trim()
    ? 'Falta el nombre'
    : !s.from || !s.to
      ? 'Faltan las fechas'
      : s.to < s.from
        ? 'La fecha final es antes de la inicial'
        : !Object.values(s.rates).some((v) => parseFloat(v) > 0)
          ? 'Pon el precio de al menos un tipo'
          : '';
  return (
    <Modal
      title={season.isNew ? 'Nueva temporada' : 'Editar temporada'}
      onClose={onClose}
      width={560}
      footer={
        <>
          {!season.isNew ? (
            <button className="btn btn-quiet" onClick={onDelete}>
              Eliminar
            </button>
          ) : (
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={!!problem}
            onClick={() =>
              onSave({
                ...s,
                name: s.name.trim(),
                rates: Object.fromEntries(
                  Object.entries(s.rates)
                    .filter(([, v]) => parseFloat(v) > 0)
                    .map(([k, v]) => [k, parseFloat(v)]),
                ),
              })
            }
          >
            {problem || 'Guardar'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nombre" className="span-3">
          <input
            className="input"
            autoFocus
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
            placeholder="Ej. Semana Santa"
          />
        </Field>
        <Field label="Desde">
          <input className="input" type="date" value={s.from} onChange={(e) => setS({ ...s, from: e.target.value })} />
        </Field>
        <Field label="Hasta" hint="incluido">
          <input className="input" type="date" value={s.to} onChange={(e) => setS({ ...s, to: e.target.value })} />
        </Field>
      </div>
      {overlaps.length > 0 && (
        <div className="note-box warn">
          Comparte fechas con {overlaps.map((o) => `${o.name} (${o.from} a ${o.to})`).join(', ')}. En los días que se
          cruzan se usa la temporada más corta.
        </div>
      )}
      <Field as="div" label="Precio por noche" hint="vacío = tarifa normal">
        <div className="form-grid">
          {types.map((t) => (
            <Field key={t.id} label={t.name} hint={`normal ${t.rate}`}>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={s.rates[t.id]}
                onChange={(e) => setS({ ...s, rates: { ...s.rates, [t.id]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </Field>
    </Modal>
  );
}
