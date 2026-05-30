import { useEffect, useRef } from 'react';
import {
  type RoomGeometry, type OpeningType,
  edgePts, lerp, nearestEdge, clampOpeningT, centroid, projectT, dist,
  DEFAULT_DOOR_W, DEFAULT_WINDOW_W,
} from './canvasHelpers';

const MIN_OPEN = 24;  // smallest opening span along a wall

const FLOOR        = '#eef2f6';
const FLOOR_SEL    = '#e2edfb';
const WALL_COLOR   = '#3f4654';
const HANDLE       = '#2563eb';
const SYMBOL       = '#334155';
const GLASS        = '#3b82f6';

function newId() { return crypto.randomUUID(); }

// Re-clamp every opening so it stays inside its (possibly reshaped) edge.
function clampAll(g: RoomGeometry): RoomGeometry {
  return { ...g, openings: g.openings.map(o => ({ ...o, t: clampOpeningT(g, o.edge, o.t, o.width) })) };
}

interface Props {
  geo: RoomGeometry;
  zoom: number;
  selected: boolean;
  tool: 'none' | OpeningType;          // active placement tool
  width: number;                        // canvas width  (svg viewport)
  height: number;                       // canvas height
  onGeometryChange: (g: RoomGeometry) => void;
  onTranslate: (dx: number, dy: number) => void;  // whole-room move (parent moves children too)
  onSelect: () => void;
  onToolConsumed: () => void;
  onInteractStart: () => void;                     // snapshot for undo before an edit begins
}

type Drag =
  | { kind: 'vertex'; index: number }
  | { kind: 'edge'; index: number; ax: number; ay: number; bx: number; by: number; nx: number; ny: number; sx: number; sy: number }
  | { kind: 'room'; lastX: number; lastY: number }
  | { kind: 'opening'; id: string }
  | { kind: 'opening-resize'; id: string; edge: number; len: number; fixedS: number; sign: number };

export default function RoomLayer({
  geo, zoom, selected, tool, width, height,
  onGeometryChange, onTranslate, onSelect, onToolConsumed, onInteractStart,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // Latest values for the once-bound document listeners.
  const geoRef   = useRef(geo);          geoRef.current = geo;
  const zoomRef  = useRef(zoom);         zoomRef.current = zoom;
  const cbRef    = useRef({ onGeometryChange, onTranslate });
  cbRef.current  = { onGeometryChange, onTranslate };

  const toCanvas = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / zoomRef.current, y: (clientY - r.top) / zoomRef.current };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const g = geoRef.current;
      const p = toCanvas(e.clientX, e.clientY);

      if (d.kind === 'vertex') {
        const vertices = g.vertices.map((v, i) => i === d.index ? p : v);
        cbRef.current.onGeometryChange(clampAll({ ...g, vertices }));
      } else if (d.kind === 'edge') {
        // Move the whole edge along its normal — adjacent walls stay put, shape is preserved.
        const off = (p.x - d.sx) * d.nx + (p.y - d.sy) * d.ny;
        const n = g.vertices.length;
        const i = d.index, j = (d.index + 1) % n;
        const vertices = g.vertices.map((v, k) => {
          if (k === i) return { x: d.ax + d.nx * off, y: d.ay + d.ny * off };
          if (k === j) return { x: d.bx + d.nx * off, y: d.by + d.ny * off };
          return v;
        });
        cbRef.current.onGeometryChange(clampAll({ ...g, vertices }));
      } else if (d.kind === 'opening') {
        const ne = nearestEdge(g, p);
        const openings = g.openings.map(o =>
          o.id === d.id ? { ...o, edge: ne.edge, t: clampOpeningT(g, ne.edge, ne.t, o.width) } : o
        );
        cbRef.current.onGeometryChange({ ...g, openings });
      } else if (d.kind === 'opening-resize') {
        // Drag one end of the opening; the opposite end stays fixed.
        const { a, b } = edgePts(g, d.edge);
        const s = projectT(a, b, p) * d.len;
        const width = Math.max(MIN_OPEN, Math.min(d.len, Math.abs(s - d.fixedS)));
        const centerS = d.fixedS + d.sign * width / 2;
        const t = Math.min(1, Math.max(0, centerS / d.len));
        const openings = g.openings.map(o =>
          o.id === d.id ? { ...o, width, t: clampOpeningT(g, d.edge, t, width) } : o
        );
        cbRef.current.onGeometryChange({ ...g, openings });
      } else if (d.kind === 'room') {
        cbRef.current.onTranslate(p.x - d.lastX, p.y - d.lastY);
        d.lastX = p.x; d.lastY = p.y;
      }
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── placement: clicking a wall while a tool is active drops an opening ───────
  const placeOpening = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInteractStart();
    const p = toCanvas(e.clientX, e.clientY);
    const ne = nearestEdge(geo, p);
    const w = tool === 'door' ? DEFAULT_DOOR_W : DEFAULT_WINDOW_W;
    const opening = {
      id: newId(), edge: ne.edge,
      t: clampOpeningT(geo, ne.edge, ne.t, w),
      width: w, type: tool as OpeningType,
    };
    onGeometryChange({ ...geo, openings: [...geo.openings, opening] });
    onToolConsumed();
  };

  const deleteOpening = (id: string) => {
    onInteractStart();
    onGeometryChange({ ...geo, openings: geo.openings.filter(o => o.id !== id) });
  };

  // ── geometry for rendering ──────────────────────────────────────────────────
  const pts  = geo.vertices.map(v => `${v.x},${v.y}`).join(' ');
  const wall = geo.wall;
  const cen  = centroid(geo.vertices);
  const maskId = useRef(`wallmask-${Math.random().toString(36).slice(2)}`).current;

  // bbox padded by wall for the mask base rect
  const xs = geo.vertices.map(v => v.x), ys = geo.vertices.map(v => v.y);
  const pad = wall + 8;
  const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
  const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;

  // per-opening frame (center + edge angle + inward sign toward room interior)
  const frames = geo.openings.map(o => {
    const { a, b } = edgePts(geo, o.edge);
    const c = lerp(a, b, o.t);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    // local +y axis after rotate(ang) maps to global (-sin, cos); inward = toward centroid
    const inward = ((cen.x - c.x) * -Math.sin(ang) + (cen.y - c.y) * Math.cos(ang)) >= 0 ? 1 : -1;
    return { o, c, deg: ang * 180 / Math.PI, inward };
  });

  const handleR = 7 / zoom;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', zIndex: 1, pointerEvents: 'none' }}
    >
      <defs>
        <mask id={maskId}>
          <rect x={bx} y={by} width={bw} height={bh} fill="white" />
          {frames.map(({ o, c, deg }) => (
            <g key={o.id} transform={`translate(${c.x},${c.y}) rotate(${deg})`}>
              <rect x={-o.width / 2} y={-(wall + 6) / 2} width={o.width} height={wall + 6} fill="black" />
            </g>
          ))}
        </mask>
      </defs>

      {/* Floor — clickable to select / drag the whole room */}
      <polygon
        points={pts}
        fill={selected ? FLOOR_SEL : FLOOR}
        style={{ pointerEvents: 'auto', cursor: tool === 'none' ? 'move' : 'crosshair' }}
        onMouseDown={e => {
          e.stopPropagation();
          if (tool !== 'none') { placeOpening(e); return; }
          onSelect();
          onInteractStart();
          const p = toCanvas(e.clientX, e.clientY);
          dragRef.current = { kind: 'room', lastX: p.x, lastY: p.y };
        }}
      />

      {/* Walls — thick mitred stroke, cut at every opening via the mask */}
      <polygon
        points={pts}
        fill="none"
        stroke={WALL_COLOR}
        strokeWidth={wall}
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
        style={{ pointerEvents: 'none' }}
      />

      {/* When a tool is active, the whole floor area also catches clicks (handled above);
          additionally let clicks just outside on walls register by widening hit via stroke */}
      {tool !== 'none' && (
        <polygon
          points={pts}
          fill="none"
          stroke="transparent"
          strokeWidth={wall + 24}
          style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
          onMouseDown={placeOpening}
        />
      )}

      {/* Door / window symbols */}
      {frames.map(({ o, c, deg, inward }) => (
        <g
          key={o.id}
          transform={`translate(${c.x},${c.y}) rotate(${deg})`}
          style={{ pointerEvents: 'auto', cursor: 'grab' }}
          onMouseDown={e => { e.stopPropagation(); onInteractStart(); dragRef.current = { kind: 'opening', id: o.id }; }}
          onDoubleClick={e => { e.stopPropagation(); deleteOpening(o.id); }}
        >
          {/* invisible fat hit area along the opening */}
          <rect x={-o.width / 2} y={-(wall + 14) / 2} width={o.width} height={wall + 14} fill="transparent" />
          {o.type === 'door' ? (
            <>
              {/* jambs */}
              <line x1={-o.width / 2} y1={-wall / 2} x2={-o.width / 2} y2={wall / 2} stroke={SYMBOL} strokeWidth={2} />
              <line x1={ o.width / 2} y1={-wall / 2} x2={ o.width / 2} y2={wall / 2} stroke={SYMBOL} strokeWidth={2} />
              {/* leaf (hinge at left jamb, swings inward) */}
              <line x1={-o.width / 2} y1={0} x2={-o.width / 2} y2={inward * o.width} stroke={SYMBOL} strokeWidth={2} />
              {/* swing arc */}
              <path
                d={`M ${o.width / 2} 0 A ${o.width} ${o.width} 0 0 ${inward > 0 ? 1 : 0} ${-o.width / 2} ${inward * o.width}`}
                fill="none" stroke={SYMBOL} strokeWidth={1.25} strokeDasharray="5 4"
              />
            </>
          ) : (
            <>
              {/* window: outer frame lines + glass */}
              <line x1={-o.width / 2} y1={-wall / 2} x2={ o.width / 2} y2={-wall / 2} stroke={SYMBOL} strokeWidth={2} />
              <line x1={-o.width / 2} y1={ wall / 2} x2={ o.width / 2} y2={ wall / 2} stroke={SYMBOL} strokeWidth={2} />
              <line x1={-o.width / 2} y1={0} x2={ o.width / 2} y2={0} stroke={GLASS} strokeWidth={1.5} />
            </>
          )}

          {/* End handles to resize the opening width along the wall */}
          {selected && tool === 'none' && (() => {
            const { a, b } = edgePts(geo, o.edge);
            const len = dist(a, b) || 1;
            const centerS = o.t * len;
            const hs = 9 / zoom;
            return [1, -1].map(sgn => (
              <rect
                key={sgn}
                x={sgn * o.width / 2 - hs / 2} y={-hs / 2} width={hs} height={hs} rx={1.5 / zoom}
                fill="#fff" stroke={HANDLE} strokeWidth={1.5 / zoom}
                style={{ pointerEvents: 'auto', cursor: 'ew-resize' }}
                onMouseDown={e => {
                  e.stopPropagation(); onInteractStart();
                  dragRef.current = { kind: 'opening-resize', id: o.id, edge: o.edge, len, fixedS: centerS - sgn * o.width / 2, sign: sgn };
                }}
              />
            ));
          })()}
        </g>
      ))}

      {/* Edge (side) resize handles — drag a whole wall, keeping the shape */}
      {selected && tool === 'none' && geo.vertices.map((_, i) => {
        const { a, b } = edgePts(geo, i);
        const m = lerp(a, b, 0.5);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;            // unit normal
        const s = 11 / zoom;
        const cursor = Math.abs(nx) > Math.abs(ny) ? 'ew-resize' : 'ns-resize';
        return (
          <rect
            key={`e${i}`}
            x={m.x - s / 2} y={m.y - s / 2} width={s} height={s} rx={2 / zoom}
            fill={HANDLE} stroke="#fff" strokeWidth={2 / zoom}
            style={{ pointerEvents: 'auto', cursor }}
            onMouseDown={e => {
              e.stopPropagation(); onSelect(); onInteractStart();
              const p = toCanvas(e.clientX, e.clientY);
              dragRef.current = { kind: 'edge', index: i, ax: a.x, ay: a.y, bx: b.x, by: b.y, nx, ny, sx: p.x, sy: p.y };
            }}
          />
        );
      })}

      {/* Vertex (corner) handles — free-form reshape */}
      {selected && tool === 'none' && geo.vertices.map((v, i) => (
        <circle
          key={i}
          cx={v.x} cy={v.y} r={handleR}
          fill="#fff" stroke={HANDLE} strokeWidth={2 / zoom}
          style={{ pointerEvents: 'auto', cursor: 'nwse-resize' }}
          onMouseDown={e => { e.stopPropagation(); onSelect(); onInteractStart(); dragRef.current = { kind: 'vertex', index: i }; }}
        />
      ))}

      {/* Edge midpoint hints when a tool is active */}
      {tool !== 'none' && geo.vertices.map((_, i) => {
        const { a, b } = edgePts(geo, i);
        const m = lerp(a, b, 0.5);
        return <circle key={`m${i}`} cx={m.x} cy={m.y} r={4 / zoom} fill={HANDLE} opacity={0.5} style={{ pointerEvents: 'none' }} />;
      })}
    </svg>
  );
}
