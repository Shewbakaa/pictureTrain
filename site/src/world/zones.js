// What each seasonal zone looks like, and what stands beside its track.
//
// Data only. environment.js blends neighbouring zones by distance, so the ride never has a hard seam;
// scatter.js reads `props`, and the ambient particles read `particles`.
//
// Colours are '#rrggbb' sRGB hex, converted by whoever uses them (THREE.Color). Distances are metres.
//
// ZONES is deeply frozen (changing anything in it throws): copy what you take from it before sorting or changing it.
//
// Light is in Three's physically based units and is applied as it stands: a white light of intensity PI
// (about 3.14) shows a surface that faces it in its own colour. Each zone's sun and hemisphere are balanced so
// that level ground catches about that much by day, which makes it look like its hex colour (a little warmer
// in autumn, cooler in winter), and about two thirds of it at dusk. `sun.dir` points from the world towards
// the sun, in world axes (the train starts heading -Z with +X on its right), and need not be a unit vector.
// In every zone the sun is about 48 degrees round to the left from straight behind the train and only its
// height changes, so a blend between two zones just raises or lowers it. Each zone's fog is its horizon
// colour, so the far ground melts into the sky.
//
// Pure and DOM-free, so the Node unit tests can import it.

/**
 * @typedef {import('../content/normalize.js').ZoneId} ZoneId
 * @typedef {string} PropType  a name from PROP_TYPES in props.js, such as 'tree_round'
 * @typedef {{ type: PropType, perMeter: number, minOffset: number, maxOffset: number, scale: [number, number] }} PropRule
 *   Props of this type stand beside the track: `perMeter` of them per metre of track on each side, between
 *   `minOffset` and `maxOffset` metres from the centre line, each scaled by a random factor within `scale`.
 * @typedef {{
 *   kind: 'petals'|'leaves'|'snow'|'fireflies'|'none',
 *   color: string, size: number, fall: number, sway: number, density: number, additive: boolean,
 * }} ParticleStyle
 *   Ambient particles drifting past the train. `size` is a particle's width (m), `fall` how fast it drops
 *   (m/s; fireflies hover), `sway` how far it swings sideways (m), `density` (0 to 1) how strongly the effect
 *   shows when it is at its fullest, and `additive` blends them as light, for a glow. Kind 'none' has none.
 * @typedef {{
 *   id: ZoneId,
 *   sky: { top: string, horizon: string },
 *   fog: { color: string, near: number, far: number },
 *   sun: { color: string, intensity: number, dir: [number, number, number] },
 *   hemi: { sky: string, ground: string, intensity: number },
 *   ground: { near: string, far: string, path: string },
 *   water: boolean,
 *   particles: ParticleStyle,
 *   props: PropRule[],
 * }} ZoneDef
 *   `ground.near` is the terrain beside the track, `ground.far` the terrain far from it, `path` the track
 *   bed. `water` puts the sea on the left of the track.
 */

/** A prop's size range unless its type has its own below: a little under and over its modelled size. */
const DEFAULT_SCALE = [0.85, 1.2];

/** Wild things vary a lot in size, built things hardly at all. */
const SCALE = {
  grass_tuft: [0.7, 1.4],
  flower_patch: [0.75, 1.4],
  rock: [0.6, 1.4],
  rock_snowy: [0.6, 1.4],
  pumpkin: [0.75, 1.35],
  house: [0.95, 1.1],
  lamp_post: [0.95, 1.05],
  bench: [0.95, 1.05],
  fence: [0.95, 1.05],
};

const propRule = (type, perMeter, minOffset, maxOffset) => ({ type, perMeter, minOffset, maxOffset, scale: SCALE[type] ?? DEFAULT_SCALE });

/** Freezes `value` and everything inside it, so the table cannot drift from what environment.js parsed from it. */
function deepFreeze(value) {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

/** @type {Record<ZoneId, ZoneDef>} */
export const ZONES = deepFreeze({
  // A fresh green meadow on a bright morning: blue sky, pink petals, flowers and balloons.
  spring: {
    id: 'spring',
    sky: { top: '#8ec9f0', horizon: '#dff1fb' },
    fog: { color: '#dff1fb', near: 60, far: 150 },
    sun: { color: '#fff2dc', intensity: 2.45, dir: [-0.46, 0.79, 0.41] }, // 52 degrees up
    hemi: { sky: '#cfe6ff', ground: '#a8c98a', intensity: 1.9 },
    ground: { near: '#8fd16a', far: '#6fb552', path: '#e8d9b0' },
    water: false,
    particles: { kind: 'petals', color: '#f6b8cc', size: 0.17, fall: 0.6, sway: 0.9, density: 0.9, additive: false },
    props: [
      propRule('tree_round', 0.06, 8, 60),
      propRule('bush', 0.05, 5, 30),
      propRule('flower_patch', 0.12, 4, 20),
      propRule('grass_tuft', 0.2, 3.6, 25),
      propRule('rock', 0.02, 5, 40),
      propRule('balloon_cluster', 0.006, 6, 14),
    ],
  },

  // A sunny beach: strong blue sky, pale sand, the sea on the left.
  summer: {
    id: 'summer',
    sky: { top: '#6ec3f4', horizon: '#f3f6e8' },
    fog: { color: '#f3f6e8', near: 60, far: 160 },
    sun: { color: '#fff4dc', intensity: 2.45, dir: [-0.37, 0.87, 0.34] }, // 60 degrees up
    hemi: { sky: '#cfe8ff', ground: '#e8d6a0', intensity: 1.6 },
    ground: { near: '#f1dfae', far: '#e7cf93', path: '#f3e6c4' },
    water: true,
    particles: { kind: 'none', color: '#ffffff', size: 0, fall: 0, sway: 0, density: 0, additive: false },
    props: [
      propRule('palm', 0.04, 7, 40),
      propRule('grass_tuft', 0.08, 3.6, 18),
      propRule('rock', 0.02, 5, 30),
      propRule('umbrella', 0.01, 8, 14),
      propRule('beach_ball', 0.01, 4.5, 12),
    ],
  },

  // An autumn forest in low golden light: orange trees, pumpkins, falling leaves.
  autumn: {
    id: 'autumn',
    sky: { top: '#8cc6ee', horizon: '#fbeed6' },
    fog: { color: '#fbeed6', near: 55, far: 145 },
    sun: { color: '#ffd49a', intensity: 2.7, dir: [-0.6, 0.59, 0.54] }, // 36 degrees up
    hemi: { sky: '#d6e0f0', ground: '#b88a50', intensity: 2.55 },
    ground: { near: '#c9a046', far: '#a8843a', path: '#d9c7a0' },
    water: false,
    particles: { kind: 'leaves', color: '#e07b39', size: 0.24, fall: 0.9, sway: 1.2, density: 0.9, additive: false },
    props: [
      propRule('tree_autumn', 0.07, 7, 60),
      propRule('bush_autumn', 0.05, 5, 30),
      propRule('pumpkin', 0.03, 4, 14),
      propRule('hay_bale', 0.01, 6, 20),
      propRule('grass_tuft', 0.08, 3.6, 20),
      propRule('rock', 0.02, 5, 30),
    ],
  },

  // Snowy hills under a pale cold sky, with snow coming down.
  winter: {
    id: 'winter',
    sky: { top: '#b9d3ea', horizon: '#f2f6fb' },
    fog: { color: '#f2f6fb', near: 50, far: 130 },
    sun: { color: '#fff6ea', intensity: 2.5, dir: [-0.63, 0.53, 0.57] }, // 32 degrees up
    hemi: { sky: '#d2e3fb', ground: '#a9b6d0', intensity: 2.35 },
    ground: { near: '#f4f7fb', far: '#e3ebf3', path: '#d8dde6' },
    water: false,
    particles: { kind: 'snow', color: '#ffffff', size: 0.1, fall: 1.0, sway: 0.4, density: 1.0, additive: false },
    props: [
      propRule('pine_snowy', 0.08, 7, 60),
      propRule('rock_snowy', 0.03, 5, 30),
      propRule('snowman', 0.006, 6, 14),
      propRule('fence', 0.01, 4.5, 6),
    ],
  },

  // The town at dusk: a purple-blue sky over a peach horizon, low warm sun, fireflies. The ride ends here.
  evening: {
    id: 'evening',
    sky: { top: '#3d3b7a', horizon: '#f4a37c' },
    fog: { color: '#f4a37c', near: 50, far: 140 },
    sun: { color: '#ffc58f', intensity: 3.55, dir: [-0.7, 0.31, 0.64] }, // 18 degrees up
    hemi: { sky: '#b0c4ee', ground: '#8a8f9a', intensity: 2.5 },
    ground: { near: '#5d8a55', far: '#4c7449', path: '#c9b9a0' },
    water: false,
    particles: { kind: 'fireflies', color: '#ffe9a8', size: 0.16, fall: 0, sway: 1.0, density: 0.8, additive: true },
    props: [
      propRule('house', 0.03, 10, 35),
      propRule('lamp_post', 0.03, 4, 6),
      propRule('tree_round', 0.03, 12, 60),
      propRule('bench', 0.01, 4.5, 7),
      propRule('fence', 0.02, 4.5, 6),
      propRule('flower_patch', 0.05, 4, 15),
    ],
  },
});
