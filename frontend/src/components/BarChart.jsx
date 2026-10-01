import { useEffect, useRef, useState } from 'react';

// Gráfica de columnas de una sola serie (sin leyenda: el título dice qué se grafica).
// data: [{ label, value (null = sin dato), tooltipLabel }]. format: valores; axisFormat: marcas del eje.
// highlight: índice de la columna con etiqueta directa (por ejemplo, hoy).
const PAD = { top: 22, right: 8, bottom: 26, left: 56 };
const COLOR = '#C4552B'; // terracota de la marca, validado contra la superficie clara

function niceMax(max) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  // Escalas "redondas" que dejan poco espacio vacío arriba (las marcas son cuartos del máximo)
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((x) => n <= x);
  return step * pow;
}

// Columna con la punta redondeada (4px) y base recta
function columnPath(x, y, w, h, base) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
}

export default function BarChart({ title, data, format, axisFormat = format, highlight, height = 190 }) {
  const ref = useRef();
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = data.map((d) => d.value ?? 0);
  const top = niceMax(Math.max(...values, 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const base = PAD.top + plotH;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, slot - 2)); // 2px de aire entre columnas vecinas
  const y = (v) => base - (v / top) * plotH;
  const step = Math.ceil(data.length / 8);
  const hovered = hover !== null ? data[hover] : null;
  // Con columnas angostas la etiqueta directa no cabe sobre la barra: va junto al título
  const roomy = slot >= 40;
  const hl = highlight !== undefined ? data[highlight] : null;

  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <span className="card-label">
          {title}
          {!roomy && hl?.value != null && (
            <span className="chart-hl">
              {' '}
              · {hl.label} {format(hl.value)}
            </span>
          )}
        </span>
        <button className="link text-xs" onClick={() => setTable(!table)}>
          {table ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </figcaption>
      {table ? (
        <div className="chart-table">
          {data.map((d) => (
            <div key={d.label + d.tooltipLabel} className="row text-sm">
              <span>{d.tooltipLabel || d.label}</span>
              <strong>{d.value === null ? '—' : format(d.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="chart-body" ref={ref}>
          <svg width={width} height={height} role="img" aria-label={title}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
                  {axisFormat(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + slot * i + slot / 2;
              const x = cx - barW / 2;
              const has = d.value !== null && d.value > 0;
              return (
                <g key={i}>
                  {has && (
                    <path
                      d={columnPath(x, y(d.value), barW, base - y(d.value), base)}
                      fill={COLOR}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {i === highlight && has && roomy && (
                    <text
                      x={cx > width - PAD.right - 40 ? x + barW : cx}
                      y={y(d.value) - 6}
                      textAnchor={cx > width - PAD.right - 40 ? 'end' : 'middle'}
                      className="chart-value"
                    >
                      {format(d.value)}
                    </text>
                  )}
                  {/* Marcas del eje espaciadas; la última siempre, sin encimarse con la anterior */}
                  {((i % step === 0 && data.length - 1 - i >= step / 2) || i === data.length - 1) && (
                    <text
                      x={cx}
                      y={base + 16}
                      textAnchor="middle"
                      className={'chart-axis' + (i === highlight ? ' strong' : '')}
                    >
                      {d.label}
                    </text>
                  )}
                  {/* Zona de toque: toda la franja de la columna, más grande que la barra */}
                  <rect
                    x={PAD.left + slot * i}
                    y={PAD.top}
                    width={slot}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${d.tooltipLabel || d.label}: ${d.value === null ? 'sin dato' : format(d.value)}`}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                  />
                </g>
              );
            })}
            <line x1={PAD.left} x2={width - PAD.right} y1={base} y2={base} className="chart-base" />
          </svg>
          {hovered && (
            <div
              className="chart-tip"
              style={{
                left: Math.min(width - 150, Math.max(0, PAD.left + slot * hover + slot / 2 - 70)),
                top: hovered.value ? Math.max(0, y(hovered.value) - 52) : base - 52,
              }}
            >
              <span className="panel-sub">{hovered.tooltipLabel || hovered.label}</span>
              <strong>{hovered.value === null ? 'Sin dato' : format(hovered.value)}</strong>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
