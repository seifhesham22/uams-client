// Convert Google Drive sharing links to directly embeddable URLs
export function toDirectUrl(url: string): string {
  if (!url) return url;
  const ghBlob = url.match(/https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)/);
  if (ghBlob) return `https://raw.githubusercontent.com/${ghBlob[1]}/${ghBlob[2]}`;
  return url;
}

// ── Structural room (polygon) ─────────────────────────────────────────────────
// The room is a single placed asset with this well-known definition id. The
// backend skips catalog validation for it. Its polygon lives in `metadata` as
// JSON; its x/y/w/h is kept in sync with the polygon bounding box so existing
// containment / z-index logic keeps working.
export const ROOM_DEF_ID = '00000000-0000-4000-8000-000000000001';

export const WALL_T = 16;              // wall thickness in canvas units
export const DEFAULT_DOOR_W     = 70;  // door opening span along the wall
export const DEFAULT_WINDOW_W   = 100; // window opening span along the wall
export const DEFAULT_SOCKET_W   = 26;  // electrical socket — small wall fixture
export const DEFAULT_RADIATOR_W = 130; // wall heater / radiator span along the wall

export interface Vec { x: number; y: number; }
// door & window cut a gap in the wall; socket & radiator are mounted on it (no gap).
export type OpeningType = 'door' | 'window' | 'socket' | 'radiator';

// Default span along the wall for a freshly placed fixture.
export function defaultWidthFor(type: OpeningType): number {
  switch (type) {
    case 'door':     return DEFAULT_DOOR_W;
    case 'window':   return DEFAULT_WINDOW_W;
    case 'socket':   return DEFAULT_SOCKET_W;
    case 'radiator': return DEFAULT_RADIATOR_W;
  }
}

// Only doors and windows are true openings that cut through the wall.
export function cutsWall(type: OpeningType): boolean {
  return type === 'door' || type === 'window';
}

export interface Opening {
  id: string;
  edge: number;   // index of the wall edge (vertex i → i+1)
  t: number;      // 0..1 position of the opening CENTER along that edge
  width: number;  // opening span along the wall
  type: OpeningType;
}

export interface RoomGeometry {
  vertices: Vec[];      // polygon corners, in order
  openings: Opening[];  // doors / windows living on the walls
  wall: number;         // wall thickness
}

// A default rectangular room centered on (cx, cy).
export function defaultRoomGeometry(cx: number, cy: number): RoomGeometry {
  const w = 480, h = 340;
  return {
    vertices: [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 },
    ],
    openings: [],
    wall: WALL_T,
  };
}

export function geoBBox(g: RoomGeometry): { x: number; y: number; w: number; h: number } {
  const xs = g.vertices.map(v => v.x);
  const ys = g.vertices.map(v => v.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function centroid(verts: Vec[]): Vec {
  const n = verts.length || 1;
  return {
    x: verts.reduce((s, v) => s + v.x, 0) / n,
    y: verts.reduce((s, v) => s + v.y, 0) / n,
  };
}

export function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function edgePts(g: RoomGeometry, i: number): { a: Vec; b: Vec } {
  return { a: g.vertices[i], b: g.vertices[(i + 1) % g.vertices.length] };
}

// Clamped projection of p onto segment a→b, returns t in [0,1].
export function projectT(a: Vec, b: Vec, p: Vec): number {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby || 1;
  return Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
}

// Nearest wall edge to a point, with the projected position along it.
export function nearestEdge(g: RoomGeometry, p: Vec): { edge: number; t: number; dist: number } {
  let best = { edge: 0, t: 0, dist: Infinity };
  for (let i = 0; i < g.vertices.length; i++) {
    const { a, b } = edgePts(g, i);
    const t = projectT(a, b, p);
    const c = lerp(a, b, t);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < best.dist) best = { edge: i, t, dist: d };
  }
  return best;
}

// Keep an opening fully inside its edge given its width.
export function clampOpeningT(g: RoomGeometry, edge: number, t: number, width: number): number {
  const { a, b } = edgePts(g, edge);
  const len = dist(a, b) || 1;
  const half = Math.min(0.49, (width / 2) / len);
  return Math.max(half, Math.min(1 - half, t));
}

export function pointInPolygon(p: Vec, verts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    const hit = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

export function serializeGeometry(g: RoomGeometry): string {
  return JSON.stringify(g);
}

export function parseGeometry(metadata: string | null | undefined): RoomGeometry | null {
  if (!metadata) return null;
  try {
    const g = JSON.parse(metadata);
    if (g && Array.isArray(g.vertices) && g.vertices.length >= 3) {
      return { wall: WALL_T, openings: [], ...g } as RoomGeometry;
    }
  } catch { /* ignore */ }
  return null;
}
