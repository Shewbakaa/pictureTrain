// Where the props stand: a deterministic scatter of each zone's prop rules along both sides of the track.
//
// For each rule (zones.js) and each side of the track, `round(perMeter * zone length)` spots are drawn. Each
// gets a distance along the track, drawn evenly over the zone plus half the blend window (layout.js BLEND)
// either side of it, and an offset from the centre line within the rule's band. Outside the zone a spot
// survives only with a chance that eases from 1 at the zone's edge to 0 at the window's edge, so a zone's
// props thin out into its neighbour's instead of stopping at a line. A spot is dropped if it is within
// CORRIDOR of the track (anywhere within 40 m along it, which covers its bends), on one of the `avoid` spots
// (photo signs, stations), or, in a water zone, out on the sea side (left of the track, beyond WATER_EDGE).
//
// Built things turn their fronts (+Z, see props.js) to face the track: a fence lines up with the rails, a bench
// and a house face her as she rides by, a snowman and the heart balloon show their faces. Everything wild
// is turned any which way.
//
// Every spot takes the same seven numbers from the zone's seeded rng whether it is kept or not, so the world
// is identical on every phone and run, and moving an avoid spot only changes the props that stood on it.
//
// Pure and DOM-free (only Three's maths is used), so the Node unit tests can import it.

import { Vector3 } from '../three.js';
import { createRng, rngRange } from '../util/rng.js';
import { clamp, smoothstep } from '../util/math.js';
import { LAYOUT } from './layout.js';
import { PROP_VARIANTS } from './props.js';

/** Distances in metres. */
export const SCATTER = Object.freeze({
  CORRIDOR: 3.2,    // no prop's origin is closer than this to the track's centre line
  WATER_EDGE: 14,   // in a water zone, nothing stands further left of the centre line than this
});

/** How far along the track (m), either way, the corridor check looks for track to keep clear of. */
const CORRIDOR_REACH = 40;
/** The corridor check measures to a polyline through track points this far apart (m). */
const CORRIDOR_STEP = 1;

/** Built things that face the track, and how far (radians) each may turn either way from facing it squarely. */
const FACES_TRACK = new Map([['house', 0.1], ['cottage_snowy', 0.1], ['bench', 0.08], ['fence', 0.03], ['lamp_post', 0.1], ['snowman', 0.4], ['balloon_cluster', 0.6]]);

/** How much a prop's offset sways its priority: the rest is chance. */
const NEAR_FIRST = 0.35;

const TAU = Math.PI * 2;

/**
 * @typedef {import('./layout.js').ZoneSeg} ZoneSeg
 * @typedef {import('./zones.js').PropRule} PropRule
 * @typedef {import('./trackPath.js').TrackPath} TrackPath
 * @typedef {{ distance: number, right: number, radius: number }} AvoidSpot
 *   Keep clear the circle of `radius` (m) round the point `right` metres right of the track (negative: left),
 *   `distance` metres along it.
 * @typedef {{
 *   type: string, variant: number,
 *   x: number, y: number, z: number, rotY: number, scale: number,
 *   priority: number, d: number, offset: number,
 * }} Placement
 *   One prop of `type` (props.js PROP_TYPES) in look `variant`, standing at world (x, y, z), turned `rotY` radians
 *   about +Y (in [0, 2π); a turn of rotY points the prop's +Z along (sin rotY, 0, cos rotY)) and scaled by `scale`.
 *   `y` is always 0: the ground under it is the terrain's business, found from `d` (distance along the track)
 *   and `offset` (metres right of the centre line, negative on the left). `priority` is in [0, 1): when the
 *   scenery is thinned for a slow phone, the props with the lowest priority stay. It is mostly chance, so
 *   thinning is even, with a lean towards keeping the props nearest the track.
 */

/** The square of the distance from (px, pz) to the segment from (ax, az) to (bx, bz). */
function distanceSqToSegment(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az;
  const t = clamp(((px - ax) * ex + (pz - az) * ez) / (ex * ex + ez * ez), 0, 1);
  const dx = ax + ex * t - px, dz = az + ez * t - pz;
  return dx * dx + dz * dz;
}

/** The turn (radians) that points a prop's +Z from the spot `offset` metres right of the track at `d` towards it. */
function facingTrack(path, d, offset, side = new Vector3()) {
  path.sideAt(d, side);
  const towards = offset > 0 ? -1 : 1; // from the right side the track lies to the left, and the other way round
  return Math.atan2(towards * side.x, towards * side.z);
}

/**
 * Places the props of one zone.
 * @param {{
 *   path: TrackPath, zone: ZoneSeg, rules: PropRule[], seed: number,
 *   avoid?: AvoidSpot[], water?: boolean,
 * }} options  `seed` is the zone's position in the ride + 1; `water` puts the sea on the left.
 *   `rules` is only read, so ZONES' frozen rules can be passed as they are.
 * @returns {Placement[]}
 */
export function scatterZone({ path, zone, rules, seed, avoid = [], water = false }) {
  const rng = createRng(seed);
  const half = LAYOUT.BLEND / 2;
  const from = zone.start - half, to = zone.end + half;
  // The chance a spot is kept: 1 inside the zone, easing to 0 across the half-blend window either side.
  const keepChance = (d) => smoothstep(from, zone.start, d) * smoothstep(to, zone.end, d);

  // Track points every CORRIDOR_STEP metres, far enough either way for every spot's corridor check.
  const first = Math.floor(from - CORRIDOR_REACH);
  const corridorSq = SCATTER.CORRIDOR ** 2;
  const track = [];
  for (let d = first; d <= Math.ceil(to + CORRIDOR_REACH); d += CORRIDOR_STEP) track.push(path.pointAt(d));
  const nearTrack = (x, z, d) => {
    const lo = Math.max(0, Math.floor((d - CORRIDOR_REACH - first) / CORRIDOR_STEP));
    const hi = Math.min(track.length - 1, Math.ceil((d + CORRIDOR_REACH - first) / CORRIDOR_STEP));
    for (let i = lo; i < hi; i++) {
      const a = track[i], b = track[i + 1];
      if (distanceSqToSegment(x, z, a.x, a.z, b.x, b.z) < corridorSq) return true;
    }
    return false;
  };
  const spots = avoid.map((a) => ({ centre: path.frameAt(a.distance, a.right, 0), radiusSq: a.radius ** 2 }));
  const onAvoidSpot = (x, z) => spots.some(({ centre, radiusSq }) => (centre.x - x) ** 2 + (centre.z - z) ** 2 < radiusSq);

  const placements = [];
  const position = new Vector3();
  const side = new Vector3();
  for (const rule of rules) {
    const count = Math.round(rule.perMeter * (zone.end - zone.start));
    const variants = PROP_VARIANTS[rule.type] ?? 1;
    const wobble = FACES_TRACK.get(rule.type);
    for (const sign of [1, -1]) {
      for (let i = 0; i < count; i++) {
        // Every spot takes the same seven numbers, kept or not.
        const d = rngRange(rng, from, to);
        const keep = rng();
        const reach = rng();
        const variant = Math.floor(rng() * variants);
        const turn = rng();
        const scale = rngRange(rng, rule.scale[0], rule.scale[1]);
        const chance = rng();

        if (keep >= keepChance(d)) continue;
        const offset = sign * (rule.minOffset + reach * (rule.maxOffset - rule.minOffset));
        if (water && offset < -SCATTER.WATER_EDGE) continue;
        path.frameAt(d, offset, 0, position);
        if (nearTrack(position.x, position.z, d) || onAvoidSpot(position.x, position.z)) continue;

        const rotY = wobble === undefined ? turn * TAU : facingTrack(path, d, offset, side) + (turn * 2 - 1) * wobble;
        placements.push({
          type: rule.type,
          variant,
          x: position.x,
          y: 0,
          z: position.z,
          rotY: ((rotY % TAU) + TAU) % TAU,
          scale,
          priority: (1 - NEAR_FIRST) * chance + NEAR_FIRST * reach,
          d,
          offset,
        });
      }
    }
  }
  return placements;
}
