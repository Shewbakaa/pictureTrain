// The railway: a raised bed of light gravel, wooden sleepers across it, and two steel rails on top.
//
// The bed is a strip TRACK_BED_HALF_WIDTH either side of the centre line, flat on top with bevelled edges that
// sink just under the ground, in the zone's path colour (environment.js), so it changes with the scenery. The
// rails are thin bars swept along the track. The sleepers are one InstancedMesh, each a shade lighter or darker,
// like real wood. Like the ground, it all runs a little past both ends of the ride.
//
// Rows are ROW_STEP metres apart, which follows even the tightest bend of the track (radius > 150 m) to within
// a few millimetres.
//
// DOM-free at import time, so the Node unit tests can import it.

import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from '../three.js';
import { createRng, rngRange } from '../util/rng.js';
import { mergeParts, part, triangleSoup } from '../util/geo.js';
import { MATERIALS } from '../render/materials.js';
import { envAt } from './environment.js';

/** Half the width of the track bed (m). Props keep clear of it (props.test.js). */
export const TRACK_BED_HALF_WIDTH = 2.2;

/** How far the track runs past each end of the ride (m), as far as the ground does. */
const RUN_PAST = 80;

/**
 * Distance between rows of the bed and the rails along the track (m). The rows lie half a metre off the whole
 * metres, like the ground's, so the train standing at a whole metre is never right on one (terrain.js ROW_PHASE
 * says why that matters).
 */
const ROW_STEP = 2;
const ROW_PHASE = 0.5;

/**
 * The bed's cross-section, left to right: [metres right of the centre line, height]. The top is flat under the
 * sleepers, 10 cm above the ground, and the edges slope down to just below it, so the bed sits in the ground
 * with no gap.
 */
const BED_TOP = 0.1;
const BED_PROFILE = [[-TRACK_BED_HALF_WIDTH, -0.05], [-1.55, BED_TOP], [1.55, BED_TOP], [TRACK_BED_HALF_WIDTH, -0.05]];

/** Wooden beams across the track (m), every SPACING metres; SHADE is how much lighter or darker each may be. */
const SLEEPER = Object.freeze({ LENGTH: 2.3, WIDTH: 0.28, HEIGHT: 0.1, SPACING: 0.9, COLOUR: '#7a5236', SHADE: 0.1 });

/** A steel bar (m) either side, HALF_GAUGE from the centre line, sitting on the sleepers. */
const RAIL = Object.freeze({ HALF_GAUGE: 0.75, WIDTH: 0.09, HEIGHT: 0.12, COLOUR: '#9aa3ad' });

/** The sleepers' wood takes its own seeded nudges, so it looks the same on every phone. */
const SLEEPER_SEED = 31;

// Scratch objects.
const _side = new Vector3();
const _back = new Vector3();
const _up = new Vector3(0, 1, 0);
const _matrix = new Matrix4();
const _shade = new Color();

/**
 * Cross-sections swept along the track, as one triangle soup: rows every ROW_STEP metres over [from, to], and
 * between neighbouring rows a quad joining each pair of neighbouring points of each section. A section is a list
 * of [metres right of the centre line, height] running left to right (looking along the track) over the outside
 * of its shape, so every face points outwards. `colourAt(d)` colours each row, and the colour runs smoothly
 * from row to row.
 */
function sweep(path, from, to, sections, colourAt) {
  const positions = [];
  const colors = [];
  const rows = Math.ceil((to - from) / ROW_STEP);
  const rowAt = (d) => ({
    points: sections.map((section) => section.map(([right, up]) => path.frameAt(d, right, up))),
    colour: colourAt(d).clone(),
  });
  let row = rowAt(from);
  for (let r = 1; r <= rows; r++) {
    const next = rowAt(from + r * ROW_STEP);
    for (let s = 0; s < sections.length; s++) {
      for (let p = 0; p + 1 < sections[s].length; p++) {
        // a, b: this row; f, g: the next row along. Counter-clockwise seen from outside.
        const a = row.points[s][p], b = row.points[s][p + 1], f = next.points[s][p], g = next.points[s][p + 1];
        for (const [v, { colour }] of [[a, row], [b, row], [g, next], [a, row], [g, next], [f, next]]) {
          positions.push(v.x, v.y, v.z);
          colors.push(colour.r, colour.g, colour.b);
        }
      }
    }
    row = next;
  }
  return triangleSoup(positions, colors);
}

/**
 * @param {import('./trackPath.js').TrackPath} path
 * @param {import('./layout.js').Layout} layout
 * @returns {Group}  the bed, the rails and the sleepers
 */
export function createTrackMesh(path, layout) {
  const from = -RUN_PAST - ROW_PHASE;
  const to = layout.total + RUN_PAST;
  const group = new Group();
  group.name = 'track';

  // The bed, in the path colour of wherever it is.
  const env = envAt(layout, 0);
  const bed = new Mesh(sweep(path, from, to, [BED_PROFILE], (d) => envAt(layout, d, env).path), MATERIALS.solid);
  bed.name = 'track-bed';
  bed.receiveShadow = true;

  // The rails: the left side, the top and the right side of a bar, for each rail.
  const railBottom = BED_TOP + SLEEPER.HEIGHT;
  const railTop = railBottom + RAIL.HEIGHT;
  const steel = new Color(RAIL.COLOUR);
  const bars = [-RAIL.HALF_GAUGE, RAIL.HALF_GAUGE].map((x) => [
    [x - RAIL.WIDTH / 2, railBottom],
    [x - RAIL.WIDTH / 2, railTop],
    [x + RAIL.WIDTH / 2, railTop],
    [x + RAIL.WIDTH / 2, railBottom],
  ]);
  const rails = new Mesh(sweep(path, from, to, bars, () => steel), MATERIALS.solid);
  rails.name = 'track-rails';
  rails.receiveShadow = true;

  // The sleepers: one beam, laid across the track at every spot.
  const beam = mergeParts([part(new BoxGeometry(SLEEPER.LENGTH, SLEEPER.HEIGHT, SLEEPER.WIDTH), SLEEPER.COLOUR)]);
  const count = Math.floor((to - from) / SLEEPER.SPACING) + 1;
  const sleepers = new InstancedMesh(beam, MATERIALS.solid, count);
  sleepers.name = 'track-sleepers';
  const rng = createRng(SLEEPER_SEED);
  for (let i = 0; i < count; i++) {
    const d = from + i * SLEEPER.SPACING;
    // The beam's length (x) across the track, its height (y) up and its width (z) along it.
    path.sideAt(d, _side);
    path.tangentAt(d, _back).negate();
    _matrix.makeBasis(_side, _up, _back).setPosition(path.frameAt(d, 0, BED_TOP + SLEEPER.HEIGHT / 2));
    sleepers.setMatrixAt(i, _matrix);
    const shade = 1 + rngRange(rng, -SLEEPER.SHADE, SLEEPER.SHADE);
    sleepers.setColorAt(i, _shade.setRGB(shade, shade, shade));
  }
  sleepers.computeBoundingSphere();
  sleepers.receiveShadow = true;

  group.add(bed, rails, sleepers);
  return group;
}
