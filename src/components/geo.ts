/**
 * geo.ts — geometry helpers and camera math for the Unis map.
 *
 * Everything here is pure and dependency-free. Two groups of concern:
 *
 *   GEOMETRY — turn GeoJSON (from Postgres) into SVG path strings in Unis
 *              world space, plus bounds and label anchors.
 *
 *   CAMERA   — decide where the camera should sit, and interpolate between
 *              two camera positions in a way that feels like flight rather
 *              than a jump cut.
 */

import { project, Coord } from './albersUsa';

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Anchor { x: number; y: number; area: number }
/** [centerX, centerY, viewportWidthInWorldUnits] */
export type Camera = [number, number, number];
export interface CameraInterpolator { (t: number): Camera; duration: number }

/* =========================================================================
 * GEOMETRY
 * ====================================================================== */

/**
 * Accept the many shapes a polygon can arrive in and return a bare GeoJSON
 * geometry object, or null.
 *
 * Postgres jsonb columns come back as objects through axios, but a raw text
 * column or a double-encoded insert comes back as a string. A Feature or
 * FeatureCollection can also show up if a seed script wrapped it. Handle all
 * of it here so callers never have to think about it.
 */
export function parseGeometry(input: unknown): any {
  if (!input) return null;

  let g: any = input;
  if (typeof g === 'string') {
    try {
      g = JSON.parse(g);
    } catch {
      return null;
    }
  }
  if (typeof g !== 'object') return null;

  if (g.type === 'Feature') g = g.geometry;
  if (g?.type === 'FeatureCollection') g = g.features?.[0]?.geometry;
  if (g?.type === 'GeometryCollection') g = g.geometries?.[0];

  if (!g?.type || !g.coordinates) return null;
  return g;
}

/**
 * Normalize any polygon geometry to an array of linear rings.
 * Polygon -> its rings. MultiPolygon -> every ring of every polygon.
 *
 * The old findpage read `coordinates[0]` directly, which silently produced
 * wrong bounds for any MultiPolygon (islands, split territories). This does
 * not.
 */
export function toRings(geometry: unknown): Coord[][] {
  const g = parseGeometry(geometry);
  if (!g) return [];

  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

/**
 * Project a GeoJSON geometry into an SVG path string in world space.
 * Returns '' when there is nothing renderable.
 */
export function geometryToPath(geometry: unknown): string {
  const rings = toRings(geometry);
  if (!rings.length) return '';

  let d = '';
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const [x, y] = project(ring[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      d += (i === 0 ? 'M' : 'L') + round(x) + ',' + round(y);
    }
    d += 'Z';
  }
  return d;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Empty bounds sentinel — min > max, so union() always takes the first point. */
export const EMPTY_BOUNDS: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

export const isEmptyBounds = (b?: Bounds | null): boolean => !b || b.minX > b.maxX || b.minY > b.maxY;

/** Bounds of an SVG path string produced by geometryToPath. */
export function pathBounds(d: string): Bounds {
  if (!d) return { ...EMPTY_BOUNDS };
  const b: Bounds = { ...EMPTY_BOUNDS };
  const re = /([ML])(-?[\d.]+),(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(d))) {
    const x = +m[2];
    const y = +m[3];
    if (x < b.minX) b.minX = x;
    if (y < b.minY) b.minY = y;
    if (x > b.maxX) b.maxX = x;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

export function unionBounds(list: Bounds[]): Bounds {
  const out: Bounds = { ...EMPTY_BOUNDS };
  for (const b of list) {
    if (isEmptyBounds(b)) continue;
    if (b.minX < out.minX) out.minX = b.minX;
    if (b.minY < out.minY) out.minY = b.minY;
    if (b.maxX > out.maxX) out.maxX = b.maxX;
    if (b.maxY > out.maxY) out.maxY = b.maxY;
  }
  return out;
}

export function padBounds(b: Bounds, factor = 0.1): Bounds {
  if (isEmptyBounds(b)) return b;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const px = Math.max(w * factor, 0.4);
  const py = Math.max(h * factor, 0.4);
  return { minX: b.minX - px, minY: b.minY - py, maxX: b.maxX + px, maxY: b.maxY + py };
}

/**
 * Label anchor for a path: the centroid of its largest ring, weighted by
 * area. Using the largest ring keeps the label on the mainland instead of
 * drifting into the sea between a state and its islands.
 */
export function pathAnchor(d: string): Anchor | null {
  if (!d) return null;

  let best: Anchor | null = null;
  let bestArea = -1;

  for (const sub of d.split('Z')) {
    if (!sub) continue;
    const pts: Coord[] = [];
    const re = /([ML])(-?[\d.]+),(-?[\d.]+)/g;
    let m;
    while ((m = re.exec(sub))) pts.push([+m[2], +m[3]]);
    if (pts.length < 3) continue;

    // Shoelace: signed area and area-weighted centroid.
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      const f = x0 * y1 - x1 * y0;
      a += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    a *= 0.5;
    const abs = Math.abs(a);
    if (abs < 1e-9 || abs <= bestArea) continue;

    bestArea = abs;
    best = { x: cx / (6 * a), y: cy / (6 * a), area: abs };
  }
  return best;
}

/* =========================================================================
 * CAMERA
 *
 * A camera is [cx, cy, w]:
 *   cx, cy — the world point at the center of the viewport
 *   w      — how many world units wide the viewport is
 *
 * Expressing zoom as a *width* rather than a scale factor is what lets the
 * interpolator below work. It is also resolution-independent: resize the
 * container and the same camera still frames the same ground.
 * ====================================================================== */

/**
 * Camera that frames `bounds` inside a viewport of vw x vh pixels.
 * `pad` is the fraction of the viewport left as margin on each side.
 */
export function cameraForBounds(bounds: Bounds, vw: number, vh: number, pad = 0.08): Camera {
  if (isEmptyBounds(bounds) || !vw || !vh) return [0, 0, 1];

  const bw = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const inset = Math.max(1 - 2 * pad, 0.2);

  // Width needed to fit horizontally, vs. width needed to fit vertically.
  const wForX = bw / inset;
  const wForY = (bh / inset) * (vw / vh);

  return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, Math.max(wForX, wForY)];
}

/** Convert a camera into the SVG transform values for the world group. */
export function cameraToTransform([cx, cy, w]: Camera, vw: number, vh: number) {
  const k = vw / w;
  return { k, tx: vw / 2 - cx * k, ty: vh / 2 - cy * k };
}

/** Apply a camera to a world point, giving screen pixels. */
export function worldToScreen(pt: Anchor, camera: Camera, vw: number, vh: number): Coord {
  const { k, tx, ty } = cameraToTransform(camera, vw, vh);
  return [pt.x * k + tx, pt.y * k + ty];
}

const cosh = (x: number) => (Math.exp(x) + Math.exp(-x)) / 2;
const sinh = (x: number) => (Math.exp(x) - Math.exp(-x)) / 2;
const tanh = (x: number) => {
  const e = Math.exp(2 * x);
  return (e - 1) / (e + 1);
};

const RHO = Math.SQRT2;
const RHO2 = 2;
const RHO4 = 4;

/**
 * Van Wijk & Nuij smooth-and-efficient zoom interpolation.
 *
 * THIS IS THE WHOLE TRICK. Naively lerping position and scale between two
 * cameras produces the effect everyone recognizes as cheap: the map appears
 * to rush past at the start, stall in the middle, and overshoot at the end.
 *
 * Van Wijk's insight is that a viewer perceives zoom logarithmically and
 * panning relative to the current zoom level, so the path that *feels*
 * shortest is a hyperbolic arc through (x, y, log w) space — the camera
 * pulls back as it travels and settles in as it arrives. It is why flying
 * from the whole United States down to one Harlem block reads as a single
 * continuous move instead of a teleport.
 *
 * Reference: "Smooth and efficient zooming and panning", InfoVis 2003.
 *
 */
export function interpolateCamera(a: Camera, b: Camera): CameraInterpolator {
  const [ux0, uy0, w0] = a;
  const [ux1, uy1, w1] = b;

  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;

  let interp: CameraInterpolator;
  let S: number;

  if (d2 < 1e-12) {
    // Pure zoom, no pan: exponential in w.
    S = Math.log(w1 / w0) / RHO;
    interp = ((t: number) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(RHO * t * S)]) as CameraInterpolator;
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / RHO;

    interp = ((t: number) => {
      const s = t * S;
      const ch0 = cosh(r0);
      const u = (w0 / (RHO2 * d1)) * (ch0 * tanh(RHO * s + r0) - sinh(r0));
      return [ux0 + u * dx, uy0 + u * dy, (w0 * ch0) / cosh(RHO * s + r0)];
    }) as CameraInterpolator;
  }

  // Van Wijk's own duration heuristic, clamped so short hops still register
  // and cross-country flights never drag.
  const raw = Math.abs(S) * 900;
  interp.duration = Math.min(Math.max(raw, 420), 1150);
  return interp;
}

/** Gentle ease applied on top of the interpolator to soften both ends. */
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;