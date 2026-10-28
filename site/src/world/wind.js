// The wind in the foliage: trees, bushes, flowers and grass sway a little in the breeze as she rides past, each to
// its own rhythm, wider in a gust, and hardly at all in the winter's stillness.
//
// The props are instanced meshes (dressing.js), each one standing on the ground with its origin at its base, so a
// vertex's height above its own base (`position.y`) says how far up the plant it is, and the instance's
// translation (`instanceMatrix[3]`) says where it stands in the world. The sway is done in the vertex shader: the
// trunk and the canopy are one merged mesh, so each vertex moves with the square of its height, the base not at
// all and the tip most, like a trunk bending. The offset is in the prop's own frame, so each plant leans its own
// way (instances are turned about their base) and the scenery does not all nod in one direction. The sway gets its
// phase from where the plant stands, so neighbours are out of step, and its reach from the wind's strength, which
// follows the zone she is in (`windStrength`). Every so often a gust rolls along the track (`gustAt`): the plants
// it passes sway wider for a while.
//
// Trees and palms, five metres tall, sway by centimetres at their tips; a tuft of grass or a flower, half a metre
// tall, would hardly move at all by the same rule (its height is a tenth of theirs, so its weight a hundredth). So
// the low plants (bushes, flowers, grass) have a reach and a reference height of their own, LOW_PLANTS, and a
// second material to carry them: the same shader, made for each by `swayMaterial`.
//
// They need materials of their own, patched from three.js's Lambert one like the sea's (seaWaves.js), because
// materials.js `solid`, which everything else shares, must not move. The shadows stay as they were: the depth
// pass is not patched, and a shadow that moved by a few centimetres would not be seen anyway.
//
// The sway is written once here as numbers and twice as code: in GLSL for the shader and in JS (`swayAt`,
// `gustAt`) for the Node unit tests. Keep the two in step.
//
// Pure and DOM-free at import, like materials.js, so the Node unit tests can import it.

import { MeshLambertMaterial } from '../three.js';
import { lerp } from '../util/math.js';

/** @typedef {import('./environment.js').Env} Env */

/** The tall props that sway, by type (props.js `PROP_TYPES`): the trees and palms, which WIND's BEND and REF_HEIGHT are for. */
const TALL_TYPES = ['tree_round', 'tree_autumn', 'pine', 'pine_snowy', 'palm'];

/** The low props that sway: the bushes, flowers and grass, which LOW_PLANTS is for. */
const LOW_TYPES = ['bush', 'bush_autumn', 'flower_patch', 'grass_tuft'];

/** Every prop type that sways. The rest stand still: they are not growing things. */
export const SWAYING_TYPES = new Set([...TALL_TYPES, ...LOW_TYPES]);

/**
 * STRENGTH: how hard the wind blows in each zone, as a share of summer's. BEND: how far (m) a plant sways at
 * REF_HEIGHT (m) above its base, at strength 1. RATE: how fast (rad/s) it sways to and fro.
 *
 * GUST: gusts roll along the track towards -Z at SPEED (m/s), each LENGTH (m) long, one every EVERY (m) on average.
 */
export const WIND = Object.freeze({
  STRENGTH: Object.freeze({ spring: 0.6, summer: 1, autumn: 1.2, winter: 0.2, evening: 0.3 }),
  BEND: 0.06,
  REF_HEIGHT: 4,
  RATE: 1.3,
  GUST: Object.freeze({ EVERY: 23, LENGTH: 40, SPEED: 9 }),
});

/**
 * The low plants' own BEND (m) and REF_HEIGHT (m), in the sense WIND's are: how far one sways at that height above
 * its base, at strength 1. A tuft or a flower head, about half a metre up, moves by a few centimetres, and a bush,
 * a metre up, by a little more.
 */
export const LOW_PLANTS = Object.freeze({ BEND: 0.035, REF_HEIGHT: 0.8 });

/**
 * How the sway is shaped. CAP: the most the height's weight may be, so a tall tree's top sways no more than 1.6
 * times what a plant of REF_HEIGHT does. PHASE_X and PHASE_Z: how far (rad) the sway's phase moves for each metre
 * across and along the track. SIDE: how far the sway reaches in the second direction (across the first), which
 * swings at SIDE_RATE of RATE and SIDE_PHASE ahead, so a plant sways in a loose loop and not along one line.
 * CALM and GUSTED: the sway is CALM of BEND in a lull, and GUSTED more of it at the height of a gust (the gusts
 * come so close that the wind is seldom still, and averages out at about BEND).
 */
export const SWAY = Object.freeze({ CAP: 1.6, PHASE_X: 0.6, PHASE_Z: 0.45, SIDE: 0.6, SIDE_RATE: 0.77, SIDE_PHASE: 1.9, CALM: 0.5, GUSTED: 1.2 });

/**
 * How hard the wind blows `env.t` of the way across the blend from zone `env.zoneA` to zone `env.zoneB` (inside a
 * zone both are that zone), as a share of summer's. Like `particleStyleAt`, it reads the environment's zones.
 * @param {Pick<Env, 'zoneA'|'zoneB'|'t'>} env
 */
export function windStrength(env) {
  return lerp(WIND.STRENGTH[env.zoneA], WIND.STRENGTH[env.zoneB], env.t);
}

/** A number from 0 to 1 that looks random for each whole `i` (and is the same every time). */
function hash(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * How strong a gust is (0 to 1) `z` metres along the world's Z at `time` (s): 0 in the lulls. The track is cut
 * into cells EVERY metres long; each cell has one gust at a place and strength of its own (the gusts are not
 * evenly spaced, and not all alike), a bump LENGTH metres across. The whole pattern moves along -Z at SPEED.
 * A bump reaches no further than the cell either side of its own while LENGTH is less than twice EVERY, so those
 * three are all that is looked at. The vertex shader's `windGust`.
 */
export function gustAt(z, time) {
  const { EVERY, LENGTH, SPEED } = WIND.GUST;
  const u = z + SPEED * time;
  const cell = Math.floor(u / EVERY);
  let gust = 0;
  for (let i = cell - 1; i <= cell + 1; i++) {
    const x = (u - (i + hash(i)) * EVERY) / (LENGTH / 2);
    const bump = Math.max(1 - x * x, 0);
    gust = Math.max(gust, (0.5 + 0.5 * hash(i + 0.5)) * bump * bump);
  }
  return gust;
}

/**
 * How far (m) a vertex `height` metres above its plant's base is pushed, in the plant's own frame, at `time` (s),
 * for a plant standing at world `x`, `z` in wind of `strength`. `plant` is the BEND and REF_HEIGHT it sways by: the
 * trees' (WIND's, the default) or the low plants' (LOW_PLANTS). The vertex shader's `windSway`.
 * @param {{ BEND: number, REF_HEIGHT: number }} [plant]
 * @returns {{ x: number, z: number }}
 */
export function swayAt(height, time, x, z, strength, plant = WIND) {
  const { BEND, REF_HEIGHT } = plant;
  const { RATE } = WIND;
  const { CAP, PHASE_X, PHASE_Z, SIDE, SIDE_RATE, SIDE_PHASE, CALM, GUSTED } = SWAY;
  const up = Math.max(height, 0) / REF_HEIGHT;
  const weight = Math.min(up * up, CAP);
  const phase = PHASE_X * x + PHASE_Z * z;
  const reach = BEND * strength * weight * (CALM + GUSTED * gustAt(z, time));
  return {
    x: reach * Math.sin(RATE * time + phase),
    z: reach * SIDE * Math.sin(RATE * SIDE_RATE * time + phase + SIDE_PHASE),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The shader
// ---------------------------------------------------------------------------------------------------------------

/** `x` as a GLSL float literal. */
const f = (x) => {
  const text = String(x);
  return /[.e]/.test(text) ? text : `${text}.0`;
};

const { RATE, GUST } = WIND;
const { CAP, PHASE_X, PHASE_Z, SIDE, SIDE_RATE, SIDE_PHASE, CALM, GUSTED } = SWAY;

/** What every plant's shader shares: the uniforms and the gusts (the GLSL of gustAt). */
const GUSTS = /* glsl */ `
uniform float uWindTime;
uniform float uWindStrength;
float windHash(float i) {
  return fract(sin(i * 12.9898) * 43758.5453);
}
float windGust(float z) {
  float u = z + ${f(GUST.SPEED)} * uWindTime;
  float cell = floor(u / ${f(GUST.EVERY)});
  float gust = 0.0;
  for (int k = -1; k <= 1; k++) {
    float i = cell + float(k);
    float x = (u - (i + windHash(i)) * ${f(GUST.EVERY)}) / ${f(GUST.LENGTH / 2)};
    float bump = max(1.0 - x * x, 0.0);
    gust = max(gust, (0.5 + 0.5 * windHash(i + 0.5)) * bump * bump);
  }
  return gust;
}
`;

/** The sway of a plant that bends `plant.BEND` metres at `plant.REF_HEIGHT` (the GLSL of swayAt). */
const swayGlsl = ({ BEND, REF_HEIGHT }) => /* glsl */ `
vec2 windSway(float height, vec3 anchor) {
  float up = max(height, 0.0) / ${f(REF_HEIGHT)};
  float weight = min(up * up, ${f(CAP)});
  float phase = ${f(PHASE_X)} * anchor.x + ${f(PHASE_Z)} * anchor.z;
  float reach = ${f(BEND)} * uWindStrength * weight * (${f(CALM)} + ${f(GUSTED)} * windGust(anchor.z));
  return reach * vec2(
    sin(${f(RATE)} * uWindTime + phase),
    ${f(SIDE)} * sin(${f(RATE * SIDE_RATE)} * uWindTime + phase + ${f(SIDE_PHASE)})
  );
}
`;

// `transformed` is the vertex in the prop's own frame; the instance matrix then stands it in the world.
const VERTEX_MOVE = /* glsl */ `
transformed.xz += windSway(position.y, instanceMatrix[3].xyz);
`;

const uniforms = {
  uWindTime: { value: 0 },
  uWindStrength: { value: 0 },
};

/** `source` with `text` added after `chunk`, which must be in it: a renamed three.js chunk fails loudly here. */
function after(source, chunk, text) {
  if (!source.includes(chunk)) throw new Error(`wind: the shader has no ${chunk}`);
  return source.replace(chunk, `${chunk}\n${text}`);
}

/**
 * A material for plants that bend `plant.BEND` metres at `plant.REF_HEIGHT`: lit like materials.js `solid`, from the
 * vertex colours, with the sway. Each has a program of its own (`name` is its cache key), as its shader's numbers differ.
 */
function swayMaterial(name, plant) {
  const head = GUSTS + swayGlsl(plant);
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.name = name;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = after(after(shader.vertexShader, '#include <common>', head), '#include <begin_vertex>', VERTEX_MOVE);
  };
  material.customProgramCacheKey = () => name;
  return material;
}

/** The trees' and palms' material. */
export const SWAY_MATERIAL = swayMaterial('sway', WIND);

/** The bushes', flowers' and grass's material. */
export const SWAY_LOW_MATERIAL = swayMaterial('sway-low', LOW_PLANTS);

/** The material a prop of `type` is drawn with so that it sways, or null for a prop that stands still. */
export function swayMaterialFor(type) {
  if (TALL_TYPES.includes(type)) return SWAY_MATERIAL;
  return LOW_TYPES.includes(type) ? SWAY_LOW_MATERIAL : null;
}

/**
 * Moves the wind to `time` (s, as the scenery's other swaying and bobbing keeps it) and `strength` (`windStrength`).
 * Call it every frame.
 */
export function updateWind(time, strength) {
  uniforms.uWindTime.value = time;
  uniforms.uWindStrength.value = strength;
}
