/**
 * albersUsa.ts — Albers USA composite projection.
 *
 * WHY THIS EXISTS
 * ---------------
 * Unis renders two kinds of geometry that must line up perfectly:
 *
 *   1. The 50 states, baked to SVG paths at build time (geometry/usStates.js).
 *   2. Jurisdiction polygons served live from Postgres as GeoJSON lat/lng.
 *
 * If those two used different projections, Harlem would not sit inside New
 * York — it would float somewhere near it. By running BOTH through this exact
 * module, every coordinate in the app shares one world space, so the camera
 * can fly continuously from the whole country down to a single Harlem block
 * without a seam or a reprojection.
 *
 * This is a from-scratch port of d3-geo's albersUsa composite. It is the
 * standard projection for US maps: an equal-area conic for the lower 48, with
 * Alaska and Hawaii projected separately and tucked into the bottom-left so
 * Alaska doesn't dwarf the mainland.
 *
 * No dependencies. Replaces @maplibre/maplibre-react-native and, with it, the
 * CartoDB raster tiles FindScreen was pulling on every pan — which were a real
 * bandwidth cost on cellular and a third-party dependency inside the app.
 */

export type Coord = [number, number];
type Projector = (lambda: number, phi: number) => Coord;
type Lobe = (c: Coord) => Coord;

const RAD = Math.PI / 180;
const EPS = 1e-6;

/* -------------------------------------------------------------------------
 * Albers conic equal-area, raw. Input radians, output unitless plane coords.
 * ---------------------------------------------------------------------- */
function conicEqualAreaRaw(phi0: number, phi1: number): Projector {
  const sy0 = Math.sin(phi0);
  const n = (sy0 + Math.sin(phi1)) / 2;

  // Degenerate to cylindrical when the parallels are symmetric about 0.
  if (Math.abs(n) < EPS) {
    const cy0 = Math.cos(phi0);
    return (lambda: number, phi: number) => [lambda * cy0, Math.sin(phi) / cy0];
  }

  const c = 1 + sy0 * (2 * n - sy0);
  const r0 = Math.sqrt(c) / n;

  return (lambda: number, phi: number) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(phi)) / n;
    const t = lambda * n;
    return [r * Math.sin(t), r0 - r * Math.cos(t)];
  };
}

/**
 * Build one conic projection lobe.
 *
 */
interface ConicConfig {
  parallels: [number, number];
  rotate: number;
  center: [number, number];
  scale: number;
  translate: [number, number];
}

function conic({ parallels, rotate, center, scale, translate }: ConicConfig): Lobe {
  const raw = conicEqualAreaRaw(parallels[0] * RAD, parallels[1] * RAD);
  const k = scale;

  // Resolve where `center` lands, so we can offset it onto `translate`.
  const [ccx, ccy] = raw(center[0] * RAD, center[1] * RAD);
  const dx = translate[0] - k * ccx;
  const dy = translate[1] + k * ccy;

  return ([lon, lat]: Coord): Coord => {
    // Rotate longitude into the projection's frame, wrapping to [-180, 180].
    let l = lon + rotate;
    if (l > 180) l -= 360;
    else if (l < -180) l += 360;

    const [x, y] = raw(l * RAD, lat * RAD);
    return [k * x + dx, dy - k * y];
  };
}

/* -------------------------------------------------------------------------
 * Composite geometry.
 *
 * BASE_SCALE / BASE_TRANSLATE define the world space every Unis coordinate
 * lives in. Chosen so the continental US occupies roughly x:[80,900],
 * y:[70,510] — a comfortable ~975 x 610 canvas. Do not change these without
 * re-running scripts/bake-us-map.mjs, or the baked paths will no longer agree
 * with runtime-projected jurisdiction polygons.
 * ---------------------------------------------------------------------- */
const BASE_SCALE = 1070;
const BASE_TRANSLATE = [487, 305];

export const WORLD = { width: 975, height: 610 };

const K = BASE_SCALE;
const [TX, TY] = BASE_TRANSLATE;

const lower48 = conic({
  parallels: [29.5, 45.5],
  rotate: 96,
  center: [-0.6, 38.7],
  scale: K,
  translate: [TX, TY],
});

const alaska = conic({
  parallels: [55, 65],
  rotate: 154,
  center: [-2, 58.5],
  scale: K * 0.35,
  translate: [TX - 0.307 * K, TY + 0.201 * K],
});

const hawaii = conic({
  parallels: [8, 18],
  rotate: 157,
  center: [-3, 19.9],
  scale: K,
  translate: [TX - 0.205 * K, TY + 0.212 * K],
});

/**
 * Route a coordinate to the correct lobe.
 *
 * d3 routes by testing clip extents. We route by longitude/latitude bands,
 * which is simpler, faster, and unambiguous for US territory — the three
 * regions are nowhere near each other geographically.
 */
function lobeFor(lon: number, lat: number): Lobe {
  if (lat > 50 && lon < -128) return alaska;   // Alaska
  if (lat < 25 && lon < -150) return hawaii;   // Hawaii
  return lower48;
}

/**
 * Project [longitude, latitude] to Unis world coordinates.
 */
export function project(coord: Coord): Coord {
  return lobeFor(coord[0], coord[1])(coord);
}

/**
 * Project using an explicitly named lobe. Used by the bake script, which
 * knows each feature's state name and should not rely on per-point routing
 * for features that straddle a band edge.
 */
export function projectWith(name: 'lower48' | 'alaska' | 'hawaii', coord: Coord): Coord {
  const lobe = name === 'alaska' ? alaska : name === 'hawaii' ? hawaii : lower48;
  return lobe(coord);
}

export default project;