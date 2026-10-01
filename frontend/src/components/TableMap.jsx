import { useRef, useState } from 'react';
import { chairs, clampPos, GRID, MAP_H, MAP_W } from '../lib/tablemap.js';

// Plano de una zona. En modo edición las mesas y elementos se arrastran;
// en modo vista cada mesa muestra su estado (colores de TABLE_COLORS vía getLook).
export default function TableMap({ tables, decor, edit = false, selected, getLook, onTableClick, onSelect, onMove }) {
  const svgRef = useRef();
  const [drag, setDrag] = useState(null); // { kind, id, dx, dy, x, y, w, h, moved }

  const toSvg = (e) => {
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svgRef.current.getScreenCTM().inverse());
  };

  const startDrag = (e, kind, item) => {
    if (!edit) return;
    e.stopPropagation();
    const p = toSvg(e);
    svgRef.current.setPointerCapture(e.pointerId);
    setDrag({
      kind,
      id: item.id,
      dx: p.x - item.x,
      dy: p.y - item.y,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      moved: false,
    });
    onSelect?.(kind, item.id);
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const p = toSvg(e);
    const pos = clampPos(p.x - drag.dx, p.y - drag.dy, drag.w, drag.h);
    if (pos.x !== drag.x || pos.y !== drag.y) setDrag({ ...drag, ...pos, moved: true });
  };
  const endDrag = () => {
    if (drag?.moved) onMove?.(drag.kind, drag.id, drag.x, drag.y);
    setDrag(null);
  };
  const pos = (kind, item) => (drag && drag.kind === kind && drag.id === item.id ? { x: drag.x, y: drag.y } : item);

  return (
    <svg
      ref={svgRef}
      className={'table-map' + (edit ? ' editing' : '')}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerDown={() => edit && onSelect?.(null, null)}
    >
      {edit && (
        <defs>
          <pattern id="map-grid" width={GRID * 4} height={GRID * 4} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`} fill="none" stroke="#E4DED5" strokeWidth="1" />
          </pattern>
        </defs>
      )}
      <rect width={MAP_W} height={MAP_H} rx="8" fill={edit ? 'url(#map-grid)' : '#FAFAF8'} className="map-floor" />

      {decor.map((d) => {
        const p = pos('decor', d);
        const sel = selected?.kind === 'decor' && selected.id === d.id;
        return (
          <g
            key={d.id}
            transform={`translate(${p.x},${p.y})`}
            className={'map-decor' + (sel ? ' selected' : '')}
            onPointerDown={(e) => startDrag(e, 'decor', d)}
          >
            <rect width={d.w} height={d.h} rx="6" />
            <text x={d.w / 2} y={d.h / 2} dominantBaseline="central" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}

      {tables.map((t) => {
        const p = pos('table', t);
        const look = getLook ? getLook(t) : { bg: '#fff', fg: '#1B1917', border: '#B8B0A6', sub: '#6F675E', lines: [] };
        const sel = selected?.kind === 'table' && selected.id === t.id;
        const round = t.shape === 'redonda';
        return (
          <g
            key={t.id}
            transform={`translate(${p.x},${p.y})`}
            className={'map-table' + (sel ? ' selected' : '') + (look.pulse ? ' pulse' : '')}
            role="button"
            aria-label={`${t.name}${look.lines.length ? ' · ' + look.lines.join(' · ') : ''}`}
            tabIndex={0}
            onPointerDown={(e) => startDrag(e, 'table', t)}
            onClick={() => (edit ? onSelect?.('table', t.id) : onTableClick?.(t))}
            onKeyDown={(e) => e.key === 'Enter' && (edit ? onSelect?.('table', t.id) : onTableClick?.(t))}
          >
            {chairs(t).map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r="8" className="map-chair" fill={look.chair || '#D6CFC4'} />
            ))}
            {round ? (
              <ellipse
                cx={t.w / 2}
                cy={t.h / 2}
                rx={t.w / 2}
                ry={t.h / 2}
                fill={look.bg}
                stroke={look.joined ? 'var(--accent)' : look.border}
                strokeWidth={look.strong ? 3 : 1.5}
              />
            ) : (
              <rect
                width={t.w}
                height={t.h}
                rx="10"
                fill={look.bg}
                stroke={look.joined ? 'var(--accent)' : look.border}
                strokeWidth={look.strong ? 3 : 1.5}
              />
            )}
            <text
              x={t.w / 2}
              y={t.h / 2 - (look.lines.length ? 9 * look.lines.length : 0)}
              dominantBaseline="central"
              textAnchor="middle"
              className="map-name"
              fill={look.fg}
            >
              {t.name.replace('Mesa ', '')}
            </text>
            {look.lines.map((l, i) => (
              <text
                key={i}
                x={t.w / 2}
                y={t.h / 2 + 10 + i * 17}
                dominantBaseline="central"
                textAnchor="middle"
                className="map-line"
                fill={i === 0 ? look.fg : look.sub}
              >
                {l}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
