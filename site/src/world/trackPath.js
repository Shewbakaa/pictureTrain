// The track: a gently winding line, so the ride curves through the scenery instead of running down a ruler.
//
// A small random walk of the heading puts one control point every SEG metres, and a smooth
// Catmull-Rom curve is run through them. The curve is arc-length parameterized, so `d` metres along
// the track really is `d` metres and the distances from layout.js (stops, zone boundaries, the finale)
// can be used as they are. The turns are small and the heading is capped, so the track never doubles
// back on itself and always runs roughly forward.
//
// The path is flat (y = 0). Distance 0 is the start station: the origin, heading -Z with +X on the
// right. The curve starts SEG metres behind it, so the origin has a neighbour on each side and its
// heading is exactly -Z.
//
// Pure and DOM-free (only Three's maths is used), so the Node unit tests can import it.

import { CatmullRomCurve3, Vector3 } from '../three.js';
import { createRng, rngRange } from '../util/rng.js';
import { clamp } from '../util/math.js';

export const TRACK = Object.freeze({
  SEG: 60,             // metres between control points
  MAX_TURN: 0.14,      // largest heading change at one control point (radians)
  HEADING_LIMIT: 1.0,  // the heading never strays further than this from straight ahead (radians)
  SEED: 7,
});

/** Control points run this far (m) past the end of the track, so its last stretch is not shaped by the end of the curve. */
const RUN_PAST_END = 120;

/** Half-width of the finite difference behind a tangent, in curve parameter (0..1): about 0.13 m of track each side. */
const TANGENT_STEP = 1e-4;

// Scratch vectors, so the per-frame lookups below allocate nothing.
const _before = new Vector3();
const _after = new Vector3();
const _tangent = new Vector3();
const _side = new Vector3();

/**
 * The curve's control points: one behind the origin, then one every SEG metres from the origin on.
 * Each point turns the heading by a random amount, except inside a straight range, where it holds
 * it. A range [a, b] keeps the track straight from a to b: the points from a - SEG to b + SEG hold the
 * heading, which covers every control point that shapes the curve over [a, b].
 */
function controlPoints(length, seed, straightRanges) {
  const { SEG, MAX_TURN, HEADING_LIMIT } = TRACK;
  const rng = createRng(seed);
  const points = [new Vector3(0, 0, SEG), new Vector3(0, 0, 0)];
  let heading = 0; // 0 = -Z; positive turns left
  let x = 0;
  let z = 0;
  for (let i = 0; i * SEG < length + RUN_PAST_END; i++) {
    const distance = i * SEG;
    // A number is drawn for every point, even a held one, so the straight ranges
    // never change which numbers the other points get.
    let turn = rngRange(rng, -MAX_TURN, MAX_TURN);
    if (straightRanges.some(([a, b]) => distance >= a - SEG && distance <= b + SEG)) turn = 0;
    if (Math.abs(heading + turn) > HEADING_LIMIT) turn = -turn;
    heading += turn;
    x += -Math.sin(heading) * SEG;
    z += -Math.cos(heading) * SEG;
    points.push(new Vector3(x, 0, z));
  }
  return points;
}

/**
 * @typedef {{
 *   length: number,
 *   curve: CatmullRomCurve3,
 *   pointAt: (d: number, out?: Vector3) => Vector3,
 *   tangentAt: (d: number, out?: Vector3) => Vector3,
 *   sideAt: (d: number, out?: Vector3) => Vector3,
 *   frameAt: (d: number, right: number, up: number, out?: Vector3) => Vector3,
 * }} TrackPath
 *   `d` is metres along the track. The tangent and the side are unit and horizontal, and the side
 *   points to the right when facing along the tangent. `frameAt` is the point `right` metres to the
 *   right and `up` metres above the track. Pass `out` to have the result written into a vector you
 *   own, which allocates nothing (do that in per-frame code). Before 0 and past `length` positions
 *   carry straight on along the end tangent, and the tangent and the side stay those of the end.
 *   `curve` is the curve underneath: it starts SEG metres before distance 0 and runs on past `length`,
 *   so look places up with `pointAt`, not with `curve.getPointAt`.
 */

/**
 * @param {number} length  how much track is needed, in metres (the layout's `total`)
 * @param {number} [seed]
 * @param {{ straightRanges?: [number, number][] }} [options]  stretches [from, to] (distances in m) to
 *   keep straight. The default keeps the start station straight, which gives the first part of the
 *   track the heading -Z at the origin; the real ride also keeps the finale straight.
 * @returns {TrackPath}
 */
export function createTrackPath(length, seed = TRACK.SEED, { straightRanges = [[0, 120]] } = {}) {
  const { SEG } = TRACK;
  const curve = new CatmullRomCurve3(controlPoints(length, seed, straightRanges), false, 'centripetal');
  // Three tabulates arc lengths on 200 divisions unless told otherwise; one per ~2 m keeps `d` true to a few millimetres.
  curve.arcLengthDivisions = Math.ceil(curve.getLength() / 2);
  curve.updateArcLengths();
  const curveLength = curve.getLength();

  /** The curve parameter (0..1) `d` metres along the track, `d` kept within the track. */
  const parameterAt = (d) => curve.getUtoTmapping((SEG + clamp(d, 0, length)) / curveLength);

  function tangentAt(d, out = new Vector3()) {
    const t = parameterAt(d);
    curve.getPoint(t - TANGENT_STEP, _before);
    curve.getPoint(t + TANGENT_STEP, _after);
    return out.subVectors(_after, _before).normalize();
  }

  function pointAt(d, out = new Vector3()) {
    const along = clamp(d, 0, length);
    curve.getPoint(parameterAt(along), out);
    if (along !== d) out.addScaledVector(tangentAt(along, _tangent), d - along);
    return out;
  }

  function sideAt(d, out = new Vector3()) {
    tangentAt(d, out);
    const x = out.x;
    out.x = -out.z; // a quarter turn to the right, seen from above
    out.z = x;
    return out;
  }

  function frameAt(d, right, up, out = new Vector3()) {
    pointAt(d, out);
    out.addScaledVector(sideAt(d, _side), right);
    out.y += up;
    return out;
  }

  return { length, curve, pointAt, tangentAt, sideAt, frameAt };
}

/**
 * The tightest bend of the track, as a radius in metres (Infinity when it is straight). Measured
 * on the circle through the track points `step` metres apart, all along the track.
 * @param {TrackPath} path
 * @param {number} [step]  metres between the sampled points
 * @returns {number}
 */
export function minCurvatureRadius(path, step = 2) {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let min = Infinity;
  for (let d = step; d <= path.length - step; d += step) {
    path.pointAt(d - step, a);
    path.pointAt(d, b);
    path.pointAt(d + step, c);
    // Circumradius of a triangle: |AB| |BC| |CA| / (2 |AB x BC|). A straight run divides by zero: Infinity.
    const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
    const radius = (a.distanceTo(b) * b.distanceTo(c) * c.distanceTo(a)) / (2 * Math.abs(cross));
    if (radius < min) min = radius;
  }
  return min;
}
