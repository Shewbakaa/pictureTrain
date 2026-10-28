// The ground: a wide ribbon of soft low-poly hills that follows the track, and the sea on the left of a water zone.
//
// Across the track the ground is level for FLAT metres either side (the track bed and its verges), then eases up
// into rolling hills that grow towards the ribbon's outer edges, HALF_WIDTH metres out. The edges are the hill
// tops, higher than her eye, so from the seat the ground never visibly ends. Along the track the hills roll on
// a few long, slow waves. In a water zone the left side runs down from the verge into the sea instead: a sand
// beach, the waterline about 16 m out (past the furthest beach prop, scatter.js WATER_EDGE, with room to spare),
// then the seabed. `water` (environment.js, 0 to 1) eases between the two, so the coast comes and goes with the
// zone blend.
//
// Where the track runs through the tunnel (tunnel.js `tunnelSpan`), a hill rises over it: past the level verge the
// ground climbs MOUND metres higher (tunnel.js TUNNEL) within a few metres, all along the tunnel's stretch, and eases
// back down over MOUND_EASE metres beyond each portal, so the hill meets the portals at its full height. The hills
// roll on over it as they do everywhere. The verge stays level, and the tunnel itself runs along it, so between the
// portals the hill closes over the tunnel as a roof of ground of its own, part of the same mesh (`roofHeight`).
//
// The meshes are triangle soup: each triangle has its own vertices and its own face normal (the faceted look, no
// `flatShading` needed; the sea's waves move it, so its material shades it from the moved faces, seaWaves.js). The
// ground is the zone's near colour by the track, easing to its far colour out on the hills; each corner takes the
// colour where it stands, so a zone blend is a smooth gradient, and each triangle is nudged a little as a whole, so
// the facets show and the ground is never one flat colour.
//
// `terrainHeight` is pure and DOM-free, so the Node unit tests (and the prop placement) can call it.

import { BufferAttribute, Color, Mesh, Vector3 } from '../three.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { createRng } from '../util/rng.js';
import { jitterColor, triangleSoup } from '../util/geo.js';
import { MATERIALS } from '../render/materials.js';
import { SEA_MATERIAL } from './seaWaves.js';
import { envAt } from './environment.js';
import { LAYOUT } from './layout.js';
import { PORTAL, portalTop, TUNNEL, tunnelSpan } from './tunnel.js';
import { ZONES } from './zones.js';

/** Distances in metres. */
export const TERRAIN = Object.freeze({
  FLAT: 6,             // the ground is level this far either side of the centre line
  HALF_WIDTH: 90,      // the ground reaches this far either side
  WATER_LEVEL: -0.35,  // height of the sea's surface
  ROW_STEP: 4,         // distance between rows of the ground mesh along the track
});

/** How far past FLAT the hills take to ease in from the level verge (m). */
const SHOULDER = 10;

/** The beach is level out to BEACH_FLAT (m from the centre line), then slopes down to the seabed, SEA_DEPTH below it, at SEABED. */
const BEACH_FLAT = 10;
const SEA_DEPTH = 2.2;
const SEABED = 34;

/**
 * The rolling part of the hills, between -1 and 1: three slow waves, each running a little across the track
 * as well as along it, so no two hills are alike and the two sides of the track differ.
 */
function rolling(d, offset) {
  return (
    Math.sin(d * 0.021 + offset * 0.045 + 1.3)
    + 0.6 * Math.sin(d * 0.049 - offset * 0.032 + 4.1)
    + 0.35 * Math.sin(d * 0.093 + offset * 0.081 + 2.2)
  ) / 1.95;
}

/** The tunnel's hill rises to its full height this far past the level verge (m), so it stands steep beside the portals. */
const MOUND_RISE = 5;
/** And eases down to nothing over this far beyond each portal (m): over three rows of the ground mesh. */
const MOUND_EASE = 12;

/** The hills, `out` metres beyond the level verge (out > 0): a steady rise to the edge plus rolling hills that grow with it. */
function hillHeight(d, offset, out) {
  const rise = 0.07 * out;
  const swell = (2.6 + 0.06 * out) * (0.5 + 0.5 * rolling(d, offset));
  return smoothstep(0, SHOULDER, out) * (rise + swell);
}

/** The beach on the left of a water zone, `a` metres from the centre line: 0 at the verge, down to the seabed. */
function beachHeight(a) {
  return -SEA_DEPTH * smoothstep(BEACH_FLAT, SEABED, a);
}

/** The tunnel's hill, `a` metres either side of the centre line (a > FLAT), over the span and easing off beyond it. */
function moundHeight(d, a, { from, to }) {
  const along = smoothstep(from - MOUND_EASE, from, d) * (1 - smoothstep(to, to + MOUND_EASE, d));
  return along > 0 ? TUNNEL.MOUND * along * smoothstep(TERRAIN.FLAT, TERRAIN.FLAT + MOUND_RISE, a) : 0;
}

/**
 * The hill over the tunnel's own stretch, where the ground itself stays level along the track: a roof of ground
 * across the tunnel at ROOF_COLUMNS (m from the centre line), a low dome ROOF_RISE over the hill's height whose edges,
 * as far out as the portals' wings reach, are ROOF_TUCK under the ground of the hill's flanks. It runs from ROOF_IN
 * metres inside one portal to as far inside the other, within the thickness of their headwalls, and at those ends it
 * comes down ROOF_TUCK behind the headwall's top (tunnel.js `portalTop`). So from the open track the hill rises
 * behind each portal with nothing to be seen between them, and from the seat nothing is ever seen of its inside.
 */
const ROOF_COLUMNS = [0, 2.5, 4.5, 6.5, 8.5, PORTAL.WING];
const ROOF_RISE = 0.8;
const ROOF_TUCK = 0.3;
const ROOF_IN = PORTAL.IN / 2;
/** The roof's rows between its ends are the ground's own, none of them closer than this to an end (m). */
const ROOF_END_GAP = 2;
/** Added to the ground's seed for the roof's colour nudges. */
const ROOF_SEED = 977;

/**
 * Height of the ground (m) `offset` metres right of the track (negative: left), `d` metres along it.
 * @param {number} d
 * @param {number} offset
 * @param {{ water?: number, tunnel?: import('./tunnel.js').TunnelSpan|null }} [options]  `water`: how much sea there
 *   is on the left, 0 to 1 (environment.js `water`); `tunnel`: where the tunnel runs (tunnel.js `tunnelSpan`), for
 *   its hill, or null for none
 * @returns {number}  exactly 0 within FLAT of the centre line
 */
export function terrainHeight(d, offset, { water = 0, tunnel = null } = {}) {
  const a = Math.abs(offset);
  if (a <= TERRAIN.FLAT) return 0;
  const hills = hillHeight(d, offset, a - TERRAIN.FLAT);
  const ground = offset > 0 || !(water > 0) ? hills : lerp(hills, beachHeight(a), clamp(water, 0, 1));
  return tunnel ? ground + moundHeight(d, a, tunnel) : ground;
}

// ---------------------------------------------------------------------------------------------------------------
// The meshes
// ---------------------------------------------------------------------------------------------------------------

/** How far the ground runs past each end of the track (m). */
const RUN_PAST = 80;

/**
 * Where the ground is cut across the track (m from the centre line, one side): close together by the track,
 * wider apart out on the hills. Mirrored for the left side. Under the track bed the ground is one flat strip from
 * -2.8 to 2.8 m, 10 cm below the bed's raised top (trackMesh.js), so the bed is always clearly on top of it.
 */
const COLUMNS = [2.8, 6, 8.5, 11.5, 15, 19.5, 25, 31.5, 39, 47.5, 57, 67.5, 78.5, 90];

/**
 * Every row of the ground and the sea lies on one lattice, ROW_STEP apart and half a metre off the whole metres
 * (…, -0.5, 3.5, 7.5, …). The train mostly stands at whole metres (each stop of the default ride, every debug
 * `?at=`), and a row lying exactly in the camera's own plane, as it does when the train stands right on it, is
 * garbled by the software renderer (SwiftShader) that the tests and screenshots run on: its triangles smear over
 * the bottom of the screen. Real GPUs draw it correctly.
 */
const ROW_PHASE = 0.5;

/** The ground's colour eases from the zone's near colour to its far colour over this range of |offset| (m). */
const NEAR_COLOUR_UNTIL = TERRAIN.FLAT;
const FAR_COLOUR_FROM = 55;

/** How much each triangle's colour is nudged (geo.js jitterColor). */
const GROUND_JITTER = 0.03;

/**
 * Where the sea is cut across the track (m left of the centre line). It starts under the beach and reaches out
 * to where the fog has long hidden it. Every cut of the ground (COLUMNS) is one, so the sea knows the ground's
 * height under it exactly there, and there are more where the waves come in and break, so they move smoothly.
 */
const SEA_COLUMNS = [6, 8.5, 11.5, 13.25, 15, 16.5, 18, 19.5, 21, 23, 25, 27.5, 29.5, 31.5, 35, 39, 43, 47.5, 57,
  67.5, 78.5, 90, 110, 140];
/** The sea is SEA_SHALLOW (sRGB) up to the waterline, SEA_SHALLOW_UNTIL m out, deepening to SEA_DEEP by SEA_DEEP_FROM. */
const SEA_SHALLOW = '#8fdbd6';
const SEA_DEEP = '#4aa9cf';
const SEA_SHALLOW_UNTIL = 16;
const SEA_DEEP_FROM = 50;
const SEA_JITTER = 0.025;
/**
 * The sea runs this far (m) past each end of a water zone's blend window. Within the ground's reach that extra is
 * under the neighbouring zone's hills, and beyond it behind their ridges, so the sea never shows a straight end.
 */
const SEA_RUN_PAST = 80;

// Scratch objects for building.
const _point = new Vector3();
const _place = new Vector3();
const _colour = new Color();
const _mean = new Color();

/** The rows on the row lattice (ROW_PHASE) from the last at or before `from` to the first at or after `to` (m). */
function latticeRows(from, to) {
  const { ROW_STEP } = TERRAIN;
  const first = Math.floor((from - ROW_PHASE) / ROW_STEP) * ROW_STEP + ROW_PHASE;
  const count = Math.max(1, Math.ceil((to - first) / ROW_STEP));
  return Array.from({ length: count + 1 }, (_, r) => first + r * ROW_STEP);
}

/**
 * Points along the track: a row at each of the distances `rows` (in order), one point per offset in each row.
 * `surfaceAt(d, offset, colour)` returns the height of the point and sets `colour` to its colour;
 * `placeAt(d, offset, place)`, if given, sets three more numbers each point carries (`places`).
 */
function grid(path, rows, offsets, surfaceAt, placeAt) {
  const points = new Float32Array(rows.length * offsets.length * 3);
  const colours = new Float32Array(points.length);
  const places = placeAt ? new Float32Array(points.length) : null;
  for (let r = 0; r < rows.length; r++) {
    const d = rows[r];
    for (let c = 0; c < offsets.length; c++) {
      const at = (r * offsets.length + c) * 3;
      path.frameAt(d, offsets[c], surfaceAt(d, offsets[c], _colour), _point).toArray(points, at);
      _colour.toArray(colours, at);
      if (places) placeAt(d, offsets[c], _place).toArray(places, at);
    }
  }
  return { rows: rows.length, columns: offsets.length, points, colours, places };
}

/**
 * Two triangles for every cell of a grid, the diagonal alternating like a chequerboard so the facets don't all
 * lean one way, appended to `out` (its `positions` and `colors`, and its `places` if the grid has them). Each
 * corner keeps its point's colour, so colours change smoothly (a zone blend never shows a step), and each triangle
 * is nudged as one (`jitter`, geo.js jitterColor), so the facets show.
 */
function addTriangles({ rows, columns, points, colours, places }, jitter, rng, out) {
  const corner = (r, c) => (r * columns + c) * 3;
  const addTriangle = (a, b, c) => {
    _mean.setRGB((colours[a] + colours[b] + colours[c]) / 3, (colours[a + 1] + colours[b + 1] + colours[c + 1]) / 3,
      (colours[a + 2] + colours[b + 2] + colours[c + 2]) / 3);
    const nudged = jitterColor(_mean, rng, jitter);
    const scale = [nudged.r / _mean.r, nudged.g / _mean.g, nudged.b / _mean.b].map((k) => (Number.isFinite(k) ? k : 1));
    for (const at of [a, b, c]) {
      out.positions.push(points[at], points[at + 1], points[at + 2]);
      out.colors.push(colours[at] * scale[0], colours[at + 1] * scale[1], colours[at + 2] * scale[2]);
      if (places) out.places.push(places[at], places[at + 1], places[at + 2]);
    }
  };
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < columns; c++) {
      // a: this row, left; b: this row, right; f: next row (further along), left; g: next row, right.
      // Counter-clockwise seen from above, so the faces point up.
      const a = corner(r, c), b = corner(r, c + 1), f = corner(r + 1, c), g = corner(r + 1, c + 1);
      if ((r + c) % 2 === 0) {
        addTriangle(a, b, g);
        addTriangle(a, g, f);
      } else {
        addTriangle(a, b, f);
        addTriangle(b, g, f);
      }
    }
  }
}

/**
 * The ground mesh's height on a row at `d`, `offset` metres right of the centre line (|offset| >= COLUMNS[1]):
 * terrainHeight at its cuts, straight between them, as its triangles are; at its outer edge's height beyond it.
 */
function groundMeshHeight(d, offset, options) {
  const side = Math.sign(offset);
  const out = Math.abs(offset);
  const last = COLUMNS.length - 1;
  if (out >= COLUMNS[last]) return terrainHeight(d, side * COLUMNS[last], options);
  const i = COLUMNS.findIndex((c) => c >= out);
  const near = COLUMNS[i - 1];
  const far = COLUMNS[i];
  return lerp(terrainHeight(d, side * near, options), terrainHeight(d, side * far, options), (out - near) / (far - near));
}

/**
 * The height of the hill's roof over the tunnel (m), `offset` metres right of the centre line, on a row at `d`;
 * `end` says it is the row at one of its ends, behind a portal.
 */
function roofHeight(d, offset, { water, tunnel, end }) {
  const a = Math.abs(offset);
  const edge = ROOF_COLUMNS.at(-1);
  const height = a >= edge
    ? groundMeshHeight(d, offset, { water, tunnel }) - ROOF_TUCK
    : TUNNEL.MOUND + ROOF_RISE * (1 - (a / edge) ** 2);
  return end ? Math.min(height, portalTop(offset) - ROOF_TUCK) : height;
}

/**
 * @param {import('./trackPath.js').TrackPath} path
 * @param {import('./layout.js').Layout} layout
 * @param {{ seed?: number }} [options]  seeds the colour nudges, so the ground looks the same on every phone
 * @returns {{ mesh: Mesh, water: Mesh|null }}  `water` is null when the ride has no water zone
 */
export function createTerrain(path, layout, { seed = 1 } = {}) {
  const rng = createRng(seed);
  const from = -RUN_PAST;
  const to = layout.total + RUN_PAST;
  const tunnel = tunnelSpan(layout);

  // The ground. A row's points share one distance, so the environment is looked up once per row.
  const env = envAt(layout, from);
  let envDistance = from;
  const envFor = (d) => {
    if (d !== envDistance) {
      envAt(layout, d, env);
      envDistance = d;
    }
    return env;
  };
  const offsets = [...COLUMNS.slice().reverse().map((o) => -o), ...COLUMNS];
  const groundColour = (d, offset, colour) => {
    const { groundNear, groundFar } = envFor(d);
    return colour.lerpColors(groundNear, groundFar, smoothstep(NEAR_COLOUR_UNTIL, FAR_COLOUR_FROM, Math.abs(offset)));
  };
  const ground = grid(path, latticeRows(from, to), offsets, (d, offset, colour) => {
    groundColour(d, offset, colour);
    return terrainHeight(d, offset, { water: envFor(d).water, tunnel });
  });
  const soil = { positions: [], colors: [] };
  addTriangles(ground, GROUND_JITTER, rng, soil);
  if (tunnel) {
    // The hill over the tunnel itself, in the ground's colours (its nudges seeded apart, so the sea's stay the same).
    const ends = [tunnel.from + ROOF_IN, tunnel.to - ROOF_IN];
    const rows = [ends[0], ...latticeRows(ends[0], ends[1]).filter((d) => d > ends[0] + ROOF_END_GAP && d < ends[1] - ROOF_END_GAP), ends[1]];
    const roofOffsets = [...ROOF_COLUMNS.slice().reverse().map((o) => -o), ...ROOF_COLUMNS.slice(1)];
    const roof = grid(path, rows, roofOffsets, (d, offset, colour) => {
      groundColour(d, offset, colour);
      return roofHeight(d, offset, { water: envFor(d).water, tunnel, end: d === ends[0] || d === ends[1] });
    });
    addTriangles(roof, GROUND_JITTER, createRng(seed + ROOF_SEED), soil);
  }
  const mesh = new Mesh(triangleSoup(soil.positions, soil.colors), MATERIALS.solid);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;

  // The sea: one flat stretch for each water zone, from under its beach out into the fog.
  const half = LAYOUT.BLEND / 2;
  const seaRanges = layout.zones.filter((zone) => ZONES[zone.id].water).map((zone) => [zone.start - half, zone.end + half]);
  if (seaRanges.length === 0) return { mesh, water: null };
  const seaOffsets = SEA_COLUMNS.slice().reverse().map((o) => -o);
  const shallow = new Color(SEA_SHALLOW);
  const deep = new Color(SEA_DEEP);
  const sea = { positions: [], colors: [], places: [] };
  for (const [start, end] of seaRanges) {
    const stretch = grid(path, latticeRows(Math.max(from, start - SEA_RUN_PAST), Math.min(to, end + SEA_RUN_PAST)), seaOffsets, (d, offset, colour) => {
      colour.lerpColors(shallow, deep, smoothstep(SEA_SHALLOW_UNTIL, SEA_DEEP_FROM, -offset));
      return TERRAIN.WATER_LEVEL;
    }, (d, offset, place) => place.set(d, -offset, TERRAIN.WATER_LEVEL - groundMeshHeight(d, offset, { water: envFor(d).water, tunnel })));
    addTriangles(stretch, SEA_JITTER, rng, sea);
  }
  const seaGeometry = triangleSoup(sea.positions, sea.colors);
  // Where each corner is, for the waves (seaWaves.js): along the track, out from it, and how deep the still water is.
  seaGeometry.setAttribute('seaPlace', new BufferAttribute(new Float32Array(sea.places), 3));
  const water = new Mesh(seaGeometry, SEA_MATERIAL);
  water.name = 'water';
  water.receiveShadow = true;
  return { mesh, water };
}
