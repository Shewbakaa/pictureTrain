// The birds that go with the sounds she hears: a little flock of songbirds crossing the sky now and then in spring
// (more rarely in autumn), gulls gliding in lazy loops over the sea in summer, and robins on the winter fences and
// snowmen, which flutter off as the train comes. When a gull calls (audio/ambience.js), the gull nearest where she is
// looking flaps and banks, so the call has a source; with the sound off, they bank now and then on a clock of their own.
//
// Each bird is a few flat-coloured parts (a body, a head, a beak, a tail and two wings) merged into one geometry, like
// the props (util/geo.js). Its wings carry a `wing` number, 0 at the shoulder growing to 1 at the tip (and negative
// on the left wing), and the vertex shader turns each wing vertex about the body's long axis (Z) by that share of the
// flap, so the flapping costs the CPU nothing: each bird's flap (its phase, its rate and how hard it flaps) is an
// instanced attribute, `aFlap`. BIRD_MATERIAL serves anything with such wings (the finale's doves, the butterflies),
// compiled once. Birds face +Z with their wings along X, the origin in the middle of the body.
//
// There is one InstancedMesh for each kind, drawn larger than life (SIZE) so that a bird far up in the sky still reads
// as a bird on her phone, not a speck. The flock and the gulls are placed from the track where the train is (x to its
// right, y up, z metres along it ahead), so they keep with the train however far it goes and the gulls keep to the
// sea's side, which is on the left (zones.js `water`). The robins sit on the perches the scenery gives them
// (dressing.js `spots.perches`): the tops of fence posts and the snowmen's bobble hats. All of them are well clear of
// her seat, and none come between her and a photo sign (signs stand 3.4 m out at eye height).
//
// Each kind follows its zones' weight (ambienceTiming.js `zoneWeights`), not a place in the ride: as a zone gives way
// the gulls and the flock fly off, up and away, shrinking to nothing, and the robins fade; a ride without summer has
// no gulls anywhere. The quality tier's `particles` share thins every kind.
//
// Nothing is allocated in a frame. DOM-free at import, so the Node unit tests can import it.

import {
  BufferGeometry, ConeGeometry, CylinderGeometry, DynamicDrawUsage, Float32BufferAttribute, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3,
} from '../three.js';
import { addAfter, glslFloat as f } from '../render/shaderPatch.js';
import { zoneWeights } from '../audio/ambienceTiming.js';
import { EYE_HEIGHT } from './layout.js';
import { mergeParts, moveParts, part, triangleSoup } from '../util/geo.js';
import { clamp, smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {import('./environment.js').Env} Env
 * @typedef {import('./dressing.js').Perch} Perch
 * @typedef {'songbird'|'gull'|'robin'|'dove'} BirdKind
 */

/** Every kind of bird `birdGeometry` builds. */
export const BIRD_KINDS = Object.freeze(['songbird', 'gull', 'robin', 'dove']);

/**
 * FLOCK: COUNT songbirds cross the sky ahead, one crossing starting EVERY seconds after the last (in spring; half of
 * them come in autumn), HEIGHT metres up and AHEAD metres along the track, at SPEED (m/s). They show within ACROSS (m)
 * either side of the track, so they come and go out at the sides of her view, and are drawn SIZE times life size.
 *
 * GULLS: COUNT gulls loop over the sea's side (left) HEIGHT metres up, each round a loop of RADIUS metres, gliding at
 * SPEED (m/s) and flapping FLAPPING of the time, drawn SIZE times life size.
 *
 * ROBINS: up to COUNT robins sit on the perches AHEAD metres along the track from her (the nearest first), each
 * flying off when the train comes within LEAVE metres of it, drawn SIZE times life size.
 */
export const BIRDS = Object.freeze({
  FLOCK: Object.freeze({
    COUNT: 6, EVERY: Object.freeze([14, 30]), HEIGHT: Object.freeze([40, 70]), AHEAD: Object.freeze([60, 120]), SPEED: 9,
    ACROSS: 48, SIZE: 10,
  }),
  GULLS: Object.freeze({
    COUNT: 4, HEIGHT: Object.freeze([14, 35]), RADIUS: Object.freeze([12, 25]), SPEED: 6, FLAPPING: 0.2, SIZE: 3.5,
  }),
  ROBINS: Object.freeze({ COUNT: 3, AHEAD: Object.freeze([2, 60]), LEAVE: 9, SIZE: 2.5 }),
});

/** The most (rad) a wing's tip turns at a full flap, either way. */
const FLAP_REACH = 0.9;

/**
 * How the flock flies. SPREAD: its birds keep within this far (m) of its middle along their way, so its middle runs
 * from ACROSS + SPREAD on one side to as far on the other, and every bird gets right across. TURN: how far (m) nearer
 * or further ahead a crossing may end than it began. TOP: the highest (rad) a crossing goes above the horizon as she
 * looks ahead from her seat: the cabin's roof and its bunting hide the sky above about 35 degrees, so a higher
 * crossing goes further ahead. RAMP: a bird grows in and shrinks out over this many metres at ACROSS. BOB: how far
 * (m) each bird rises and falls as it flies. RISE: how far (m) up a flock flies off as its zones give way. AUTUMN:
 * autumn's share of the crossings.
 */
const FLOCK_FLIGHT = Object.freeze({
  SPREAD: 12, TURN: 15, TOP: (30 * Math.PI) / 180, RAMP: 10, BOB: 0.7, RISE: 20, AUTUMN: 0.5,
});

/**
 * How the gulls fly. BOB: how far (m) a gull's height rises and falls round its loop, BOB_RATE how fast (rad/s).
 * MARGIN: each loop's nearest point to the track is between these (m) out from it, over the shore and the sea. TURN_BANK: how far
 * (rad) a gull leans into its loop. FLAP_EVERY: each flaps once every so many seconds, for FLAPPING of the time,
 * easing in and out over FLAP_EASE (s). CALLS: seconds between its own calls with the sound off (like the gull calls
 * the ambience plays), and QUIET: how long after a heard call its own clock waits. AWAY and RISE: how far out over
 * the sea and how far up (m) the gulls fly off as summer gives way.
 */
const GULL_FLIGHT = Object.freeze({
  BOB: 2.5, BOB_RATE: 0.35, MARGIN: Object.freeze([10, 16]), TURN_BANK: 0.2, FLAP_EVERY: Object.freeze([8, 12]),
  FLAP_EASE: 0.3, CALLS: Object.freeze([11, 28]), QUIET: 30, AWAY: 40, RISE: 25,
});

/**
 * Where each gull loops along the track (m ahead of the train, the range it is drawn from): the first, kept on every
 * tier, far enough ahead that she sees it looking down the line; the second beside her, over the sea.
 */
const GULL_AHEAD = [[60, 80], [10, 30], [35, 55], [80, 100]];

/**
 * How a robin flies off. TIME: seconds from its start to gone, once startled. STARTLE: how far through its take-off
 * it is the moment the train comes within LEAVE. OUT, UP and ON: how far (m) it flies out from the track, up, and on
 * ahead, over the take-off. RATE: its wingbeats a second. FEET: how far (m, life size) its feet are under the middle of
 * its body, where a bird's origin is. FADE: perched robins grow in over the last FADE metres of AHEAD. BACK: the train
 * only goes forward, so a step back of more than this (m) is a jump (along the timeline, or Ride again), after which
 * every robin more than LEAVE ahead of it is back on its perch.
 */
const TAKE_OFF = Object.freeze({ TIME: 1.2, STARTLE: 0.1, OUT: 5, UP: 3, ON: 4, RATE: 9, FEET: 0.09, FADE: 8, BACK: 3 });

/** The zone the robins live in, whose perches they sit on (the flock's are spring and autumn, the gulls' summer). */
const ROBIN_ZONE = 'winter';

/** The same birds every ride. */
const SEED = Object.freeze({ FLOCK: 7121, BIRDS: 5303 });

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

// ---------------------------------------------------------------------------------------------------------------
// The birds' shapes
// ---------------------------------------------------------------------------------------------------------------

/**
 * A flat plate on the corners of a convex polygon (each [x, y, z], in order round its edge), `thick` metres thick
 * and closed all round: a panel of a wing, or a tail.
 */
export function plate(corners, thick) {
  const c = corners.map((p) => new Vector3(...p));
  const n = c.length;
  // Newell's normal: square to the plate, whichever way round its corners go.
  const normal = new Vector3();
  for (let i = 0; i < n; i++) {
    const a = c[i], b = c[(i + 1) % n];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  normal.normalize().multiplyScalar(thick / 2);
  const top = c.map((p) => p.clone().add(normal));
  const bottom = c.map((p) => p.clone().sub(normal));
  const positions = [];
  const triangle = (a, b, d) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  for (let i = 1; i + 1 < n; i++) {
    triangle(top[0], top[i], top[i + 1]);
    triangle(bottom[0], bottom[i + 1], bottom[i]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    triangle(top[i], bottom[i], bottom[j]);
    triangle(top[i], bottom[j], top[j]);
  }
  return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3));
}

const ball = (r, around = 8, down = 6) => new SphereGeometry(r, around, down);
/** A beak `long` metres long and `r` wide at its base, pointing along +Z from `at`, its base's middle. */
const beak = (r, long, at, colour) => part(new ConeGeometry(r, long, 5), colour, { position: [at[0], at[1], at[2] + long / 2], rotation: [Math.PI / 2, 0, 0] });

/**
 * Each kind's model, life size: its body's parts, its right wing's parts (the left wing is its mirror) and the
 * wing's shoulder, [x, y], where it meets the body.
 * @type {Record<BirdKind, () => { body: import('../util/geo.js').Part[], wing: import('../util/geo.js').Part[], shoulder: [number, number] }>}
 */
const MODELS = {
  // A small dark songbird with a buff belly, pointed wings and a short square tail, about 0.37 m wingtip to wingtip.
  songbird() {
    const C = { body: '#4b5160', belly: '#c9b79c', wing: '#3a3f4b', tip: '#2c3039', beak: '#e8a23c' };
    return {
      body: [
        part(ball(0.05), C.body, { scale: [0.9, 0.85, 2.1] }),
        part(ball(0.046), C.belly, { position: [0, -0.012, 0.005], scale: [0.85, 0.75, 1.8] }),
        part(ball(0.04), C.body, { position: [0, 0.018, 0.1] }),
        beak(0.012, 0.035, [0, 0.014, 0.13], C.beak),
        part(plate([[-0.018, 0.004, -0.085], [0.018, 0.004, -0.085], [0.042, 0.002, -0.19], [-0.042, 0.002, -0.19]], 0.008), C.wing),
      ],
      wing: [
        part(plate([[0.035, 0.008, 0.045], [0.035, 0.008, -0.03], [0.11, 0.016, -0.045], [0.11, 0.016, 0.03]], 0.008), C.wing),
        part(plate([[0.11, 0.016, 0.03], [0.11, 0.016, -0.045], [0.185, 0.01, -0.05], [0.18, 0.01, -0.02]], 0.008), C.tip),
      ],
      shoulder: [0.035, 0.008],
    };
  },

  // A herring gull: white, with long pale grey wings crooked up from the shoulder and down again (the gull's flattened
  // M, which reads as a gull even edge-on, far off), black at the tips.
  gull() {
    const C = { white: '#f6f6f1', grey: '#bfc7d1', black: '#2a2c33', beak: '#f2c14e' };
    return {
      body: [
        part(ball(0.085), C.white, { scale: [0.95, 0.9, 2.5] }),
        part(ball(0.062), C.white, { position: [0, 0.035, 0.2] }),
        beak(0.016, 0.075, [0, 0.026, 0.252], C.beak),
        ...[-1, 1].map((side) => part(ball(0.011, 4, 3), C.black, { position: [side * 0.05, 0.052, 0.23] })),
        part(plate([[-0.04, 0.01, -0.17], [0.04, 0.01, -0.17], [0.065, 0.008, -0.31], [-0.065, 0.008, -0.31]], 0.012), C.white),
      ],
      wing: [
        part(plate([[0.06, 0.02, 0.1], [0.06, 0.02, -0.08], [0.29, 0.11, -0.075], [0.29, 0.11, 0.1]], 0.016), C.grey),
        part(plate([[0.29, 0.11, 0.1], [0.29, 0.11, -0.075], [0.51, 0.06, -0.1], [0.52, 0.06, 0.01]], 0.014), C.grey),
        part(plate([[0.52, 0.06, 0.01], [0.51, 0.06, -0.1], [0.62, 0.025, -0.13], [0.625, 0.025, -0.08]], 0.012), C.black),
      ],
      shoulder: [0.06, 0.02],
    };
  },

  // A round little robin: a brown back, an orange-red breast and face, a cream belly and a cocked tail. Its short wings
  // hang folded at its sides; flapping swings them out.
  robin() {
    const C = { brown: '#8b6a4b', breast: '#ec6a2e', cream: '#f1e6d2', dark: '#2b2422' };
    return {
      body: [
        part(ball(0.06), C.brown, { scale: [0.95, 0.95, 1.25] }),
        part(ball(0.052), C.breast, { position: [0, -0.004, 0.03] }),
        part(ball(0.042), C.cream, { position: [0, -0.03, -0.012] }),
        part(ball(0.042), C.brown, { position: [0, 0.052, 0.05] }),
        part(ball(0.034), C.breast, { position: [0, 0.042, 0.067] }),
        ...[-1, 1].map((side) => part(ball(0.008, 4, 3), C.dark, { position: [side * 0.026, 0.06, 0.077] })),
        beak(0.009, 0.026, [0, 0.05, 0.092], C.dark),
        part(plate([[-0.02, 0.012, -0.06], [0.02, 0.012, -0.06], [0.026, 0.05, -0.135], [-0.026, 0.05, -0.135]], 0.008), C.brown),
        ...[-1, 1].map((side) => part(new CylinderGeometry(0.005, 0.005, 0.05, 4), C.dark, { position: [side * 0.016, -0.065, 0.005] })),
      ],
      wing: [
        part(plate([[0.05, 0.03, 0.035], [0.05, 0.03, -0.055], [0.066, -0.031, -0.075], [0.066, -0.031, 0.0]], 0.01), C.brown),
      ],
      shoulder: [0.05, 0.03],
    };
  },

  // A white dove, plump, with broad rounded wings and a fan of a tail (the finale's).
  dove() {
    const C = { white: '#fbfbf7', tip: '#dfe3ea', beak: '#e79a8f', dark: '#2b2422' };
    return {
      body: [
        part(ball(0.07), C.white, { scale: [1, 0.95, 2.0] }),
        part(ball(0.048), C.white, { position: [0, 0.045, 0.13] }),
        ...[-1, 1].map((side) => part(ball(0.009, 4, 3), C.dark, { position: [side * 0.036, 0.058, 0.15] })),
        beak(0.011, 0.03, [0, 0.04, 0.17], C.beak),
        part(plate([[-0.03, 0.01, -0.12], [0.03, 0.01, -0.12], [0.075, 0.006, -0.25], [-0.075, 0.006, -0.25]], 0.01), C.white),
      ],
      wing: [
        part(plate([[0.05, 0.02, 0.08], [0.05, 0.02, -0.07], [0.22, 0.045, -0.085], [0.22, 0.045, 0.09]], 0.014), C.white),
        part(plate([[0.22, 0.045, 0.09], [0.22, 0.045, -0.085], [0.33, 0.035, -0.07], [0.36, 0.035, 0.0], [0.34, 0.035, 0.06]], 0.012), C.tip),
      ],
      shoulder: [0.05, 0.02],
    };
  },
};

/**
 * The geometry of a winged creature from its model, life size: non-indexed, with `position`, flat `normal` and linear
 * `color` (as geo.js `mergeParts` gives) and `wing`, a float for each vertex: 0 on the body, and on a wing how far out
 * from the shoulder towards the tip it is (0 to 1), negative on the left wing (−X). A fresh geometry every call. The
 * model is the body's parts, the right wing's parts (the left is its mirror) and the wing's shoulder, [x, y], where
 * it meets the body, as `MODELS` has them; the butterflies (butterflies.js) have a model of their own.
 * @param {{ body: import('../util/geo.js').Part[], wing: import('../util/geo.js').Part[], shoulder: [number, number] }} model
 * @returns {BufferGeometry}
 */
export function wingedGeometry({ body, wing, shoulder: [sx, sy] }) {
  const pieces = [
    { geometry: mergeParts(body), side: 0 },
    { geometry: mergeParts(wing), side: 1 },
    { geometry: mergeParts(moveParts(wing, { scale: [-1, 1, 1] })), side: -1 },
  ];
  // How far each wing vertex is from the shoulder, across the body (in X and Y): the tip is the furthest.
  const out = (p, i) => Math.hypot(Math.abs(p.getX(i)) - sx, p.getY(i) - sy);
  const right = pieces[1].geometry.attributes.position;
  let reach = 0;
  for (let i = 0; i < right.count; i++) reach = Math.max(reach, out(right, i));
  const positions = [], colours = [], wings = [];
  for (const { geometry, side } of pieces) {
    const { position, color } = geometry.attributes;
    positions.push(...position.array);
    colours.push(...color.array);
    for (let i = 0; i < position.count; i++) wings.push(side * clamp(out(position, i) / reach, 0, 1));
  }
  const geometry = triangleSoup(positions, colours);
  geometry.setAttribute('wing', new Float32BufferAttribute(wings, 1));
  return geometry;
}

/**
 * The geometry of one kind of bird, life size (`wingedGeometry` of its model). A fresh geometry every call.
 * @param {BirdKind} kind
 * @returns {BufferGeometry}
 */
export function birdGeometry(kind) {
  if (!BIRD_KINDS.includes(kind)) throw new Error(`birdGeometry: "${kind}" is not a kind of bird`);
  return wingedGeometry(MODELS[kind]());
}

// ---------------------------------------------------------------------------------------------------------------
// The material
// ---------------------------------------------------------------------------------------------------------------

const uniforms = { uBirdTime: { value: 0 } };

/** A wing vertex (or its normal), [x, y] across the body, turned about the long axis by this bird's flap now. */
const VERTEX_HEAD = /* glsl */ `
attribute float wing;
attribute vec3 aFlap;
uniform float uBirdTime;
vec2 birdWing(vec2 p) {
  float angle = aFlap.z * ${f(FLAP_REACH)} * sin(${f(TAU)} * aFlap.y * uBirdTime + aFlap.x) * wing;
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
`;

/**
 * The birds' material: lit like materials.js `solid`, from the vertex colours, with the wings flapping. Its meshes'
 * geometry needs `wing` (birdGeometry) and an instanced vec3 `aFlap`: the flap's phase (rad), its rate (wingbeats a
 * second) and how hard (0, wings held still, to 1). Every wing vertex turns about the body's long axis, before the
 * instance's own turn, by amount · FLAP_REACH · sin(2π · rate · time + phase) · wing: up and down together, the tips
 * the most. Its normal turns with it, so the wings catch the light as they beat.
 */
export const BIRD_MATERIAL = new MeshLambertMaterial({ vertexColors: true });
BIRD_MATERIAL.name = 'birds';
BIRD_MATERIAL.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = addAfter('birds', shader.vertexShader, [
    ['#include <common>', VERTEX_HEAD],
    ['#include <beginnormal_vertex>', 'objectNormal.xy = birdWing(objectNormal.xy);'],
    ['#include <begin_vertex>', 'transformed.xy = birdWing(transformed.xy);'],
  ]);
};
BIRD_MATERIAL.customProgramCacheKey = () => 'birds';

// ---------------------------------------------------------------------------------------------------------------
// How they fly (pure)
// ---------------------------------------------------------------------------------------------------------------

/** A number in [0, 1) that looks random for each whole `seed`, `k` and `n` (and is the same every time). */
function noise(seed, k, n) {
  let t = (Math.imul(seed, 0x9e3779b1) + Math.imul(k + 1, 0x85ebca6b) + Math.imul(n + 1, 0xc2b2ae35)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The middle of the EVERY range: crossing k starts about k of these in, give or take a quarter of the range. */
const EVERY_MID = (BIRDS.FLOCK.EVERY[0] + BIRDS.FLOCK.EVERY[1]) / 2;
const EVERY_JITTER = (BIRDS.FLOCK.EVERY[1] - BIRDS.FLOCK.EVERY[0]) / 2;

/**
 * @typedef {{ start: number, time: number, dir: number, height: number, from: number, to: number }} Crossing
 *   One crossing of a flock: it starts at `start` (s) and takes `time` (s), going towards +X (`dir` 1, to her right)
 *   or −X (−1), `height` metres up, from `from` to `to` metres ahead.
 */

const crossingScratch = { start: 0, time: 0, dir: 1, height: 0, from: 0, to: 0 };

/** Crossing `k` of the flock seeded `seed`, written into `out`. */
function crossingOf(seed, k, out) {
  const { HEIGHT, AHEAD, ACROSS, SPEED } = BIRDS.FLOCK;
  const { SPREAD, TURN, TOP } = FLOCK_FLIGHT;
  out.start = k * EVERY_MID + EVERY_MID / 2 + (noise(seed, k, 0) - 0.5) * EVERY_JITTER;
  out.dir = noise(seed, k, 1) < 0.5 ? 1 : -1;
  out.height = HEIGHT[0] + noise(seed, k, 2) * (HEIGHT[1] - HEIGHT[0]);
  // No nearer than keeps it under TOP in her view (straight across, it is nearest her in the middle of its way).
  const near = clamp((out.height - EYE_HEIGHT) / Math.tan(TOP), AHEAD[0], AHEAD[1]);
  out.from = near + noise(seed, k, 3) * (AHEAD[1] - near);
  out.to = clamp(out.from + (noise(seed, k, 4) - 0.5) * 2 * TURN, near, AHEAD[1]);
  out.time = Math.hypot(2 * (ACROSS + SPREAD), out.to - out.from) / SPEED;
  return out;
}

/**
 * The crossing of `flock` under way at `time` (s): its number (from 0), with `out` filled in, or −1 between crossings.
 * Crossing k starts EVERY_MID / 2 + k EVERY_MID seconds in, give or take EVERY_JITTER / 2, so one starts EVERY[0] to
 * EVERY[1] seconds after the last, and each is over before the next can start.
 * @param {{ seed: number }} flock
 * @param {number} time
 * @param {Crossing} [out]
 */
function flockCrossing(flock, time, out = crossingScratch) {
  const k0 = Math.floor(time / EVERY_MID);
  for (let k = Math.max(0, k0 - 1); k <= k0; k++) {
    crossingOf(flock.seed, k, out);
    if (time >= out.start && time < out.start + out.time) return k;
  }
  return -1;
}

/**
 * Where the middle of `flock` is at `time` (s), from the track at the train: x metres to its right, y up and z ahead
 * along it, written into `out`. False between crossings (`out` is then left as it was). A crossing runs straight
 * across the track ahead from one side to the other at SPEED, its middle from ACROSS + SPREAD out on one side to as far
 * on the other, HEIGHT up and AHEAD along (nearer or further at its end than at its start, by up to TURN), and never
 * more than TOP above the horizon from her seat.
 * @param {{ seed: number }} flock  each seed has crossings of its own
 * @param {number} time
 * @param {Vector3} out
 * @returns {boolean}
 */
export function flockPlace(flock, time, out) {
  const c = crossingScratch;
  if (flockCrossing(flock, time, c) < 0) return false;
  const u = (time - c.start) / c.time;
  const edge = BIRDS.FLOCK.ACROSS + FLOCK_FLIGHT.SPREAD;
  out.set(c.dir * edge * (2 * u - 1), c.height, c.from + (c.to - c.from) * u);
  return true;
}

/**
 * @typedef {{ ahead: number, out: number, radius: number, height: number, dir: number, phase: number }} Gull
 *   A gull's loop: its middle `ahead` metres along the track from the train and `out` metres out to the left (over
 *   the sea), `radius` metres round, `height` metres up; it goes round anticlockwise seen from above in the track's
 *   frame (`dir` 1) or clockwise (−1), from `phase` (rad).
 */

/**
 * Where `gull` is at `time` (s), from the track at the train (x to its right, y up, z ahead), written into `out`: round
 * its loop at SPEED, its height rising and falling BOB metres as it goes.
 * @param {Gull} gull
 * @param {number} time
 * @param {Vector3} out
 * @returns {Vector3}
 */
export function gullPlace(gull, time, out) {
  const { SPEED } = BIRDS.GULLS;
  const { BOB, BOB_RATE } = GULL_FLIGHT;
  const angle = gull.phase + gull.dir * (SPEED / gull.radius) * time;
  return out.set(
    -gull.out + gull.radius * Math.cos(angle),
    gull.height + BOB * Math.sin(BOB_RATE * time + gull.phase),
    gull.ahead + gull.radius * Math.sin(angle),
  );
}

/**
 * How far (rad) a gull banks `sinceCall` seconds after its call: none before it, rising to 0.6 at 0.4 s, and easing
 * back to level by 2 s.
 * @param {number} sinceCall
 */
export function gullBank(sinceCall) {
  if (!(sinceCall > 0)) return 0;
  if (sinceCall < 0.4) return 0.6 * smoothstep(0, 0.4, sinceCall);
  return 0.6 * (1 - smoothstep(0.4, 2, sinceCall));
}

/** How hard (0 to 1) a gull flaps `sinceCall` seconds after its call: a few strong beats as it banks. */
function callFlap(sinceCall) {
  if (!(sinceCall >= 0)) return 0;
  return smoothstep(0, 0.15, sinceCall) * (1 - smoothstep(1.3, 1.7, sinceCall));
}

/** How hard (0 to 1) `gull` flaps of its own accord at `time`: for FLAPPING of every `flapEvery` seconds. */
function ownFlap(gull, time) {
  const { FLAPPING } = BIRDS.GULLS;
  const { FLAP_EASE } = GULL_FLIGHT;
  const every = gull.flapEvery;
  const at = (((time + gull.flapAt) % every) + every) % every;
  const bout = FLAPPING * every;
  return smoothstep(0, FLAP_EASE, at) * (1 - smoothstep(bout - FLAP_EASE, bout, at));
}

/**
 * How far through its take-off (0 to 1) a robin is when the train is `distance` metres from it: still on its perch
 * until the train is within LEAVE, then startled (STARTLE of the way at once), and gone as the train reaches it.
 * @param {number} distance
 */
export function robinLeave(distance) {
  const { LEAVE } = BIRDS.ROBINS;
  if (!(distance <= LEAVE)) return 0;
  return clamp(1 - (1 - TAKE_OFF.STARTLE) * (distance / LEAVE), 0, 1);
}

// ---------------------------------------------------------------------------------------------------------------
// The birds in the world
// ---------------------------------------------------------------------------------------------------------------

/** An InstancedMesh of up to `count` birds of `kind`, each with its flap, none drawn yet. */
function birdMesh(kind, count) {
  const geometry = birdGeometry(kind);
  geometry.setAttribute('aFlap', new InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage));
  const mesh = new InstancedMesh(geometry, BIRD_MATERIAL, count);
  mesh.name = `birds-${kind}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false; // they move with the train
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

/**
 * The birds of the ride.
 * @param {{ path: import('./trackPath.js').TrackPath, perches?: Perch[] }} options  `perches` are where the robins
 *   may sit (dressing.js `spots.perches`); only winter's are used.
 * @returns {{
 *   group: Group,
 *   update: (dt: number, env: Env, cameraPosition: Vector3, d: number, view?: Vector3) => void,
 *   setQuality: (share: number) => void,
 *   setDensity: (share: number) => void,
 *   gullCall: () => void,
 *   targets: object[],
 * }}
 *   Add `group` to the scene. Call `update` every frame with the seconds since the last one, the environment where
 *   the train is, the camera's world position, the train's distance along the track (m) and, if it is known, the way
 *   she is looking (`view`, a unit vector in the world). `setQuality` is the quality tier's `particles` share (0 to 1)
 *   of every kind; `setDensity` is the tier's `density`, so no robin sits on a fence the tier has thinned away.
 *   `gullCall` is a gull's call just heard: the gull nearest where she is looking (one inside her view whenever any
 *   is) flaps and banks, or without a `view` the one nearest the line ahead. `targets` are the birds' hit shapes for
 *   taps (none yet).
 */
export function createBirds({ path, perches = [] }) {
  const { FLOCK, GULLS, ROBINS } = BIRDS;
  const group = new Group();
  group.name = 'birds';
  const songbirds = birdMesh('songbird', FLOCK.COUNT);
  const gulls = birdMesh('gull', GULLS.COUNT);
  const robins = birdMesh('robin', ROBINS.COUNT);
  group.add(songbirds, gulls, robins);
  const rng = createRng(SEED.BIRDS);

  // The flock: each bird's place in it, its bobbing and its wingbeat. Their order spreads any first few along it.
  const flock = { seed: SEED.FLOCK };
  const SLOTS = [0, 3, 1, 4, 2, 5];
  const flockBirds = SLOTS.map((slot) => ({
    along: (slot - (SLOTS.length - 1) / 2) * 3.2 + rngRange(rng, -1, 1),
    depth: rngRange(rng, -5, 5),
    lift: rngRange(rng, -2.5, 2.5),
    bob: rngRange(rng, 0, TAU),
    bobRate: rngRange(rng, 3, 5),
    size: rngRange(rng, 0.9, 1.1),
    flap: [rngRange(rng, 0, TAU), rngRange(rng, 4, 5.2), rngRange(rng, 0.85, 1)],
  }));
  let shownCrossing = -1; // the crossing whose showing was decided as it started
  let crossingShows = false;

  // The gulls: each its own loop, its own rhythm of flapping, and the time of its last call.
  const gullBirds = GULL_AHEAD.map(([near, far]) => {
    const radius = rngRange(rng, ...GULLS.RADIUS);
    return {
      ahead: rngRange(rng, near, far),
      out: radius + rngRange(rng, ...GULL_FLIGHT.MARGIN),
      radius,
      height: rngRange(rng, GULLS.HEIGHT[0] + GULL_FLIGHT.BOB, GULLS.HEIGHT[1] - GULL_FLIGHT.BOB),
      dir: rng() < 0.5 ? 1 : -1,
      phase: rngRange(rng, 0, TAU),
      flapEvery: rngRange(rng, ...GULL_FLIGHT.FLAP_EVERY),
      flapAt: rngRange(rng, 0, GULL_FLIGHT.FLAP_EVERY[1]),
      flap: [rngRange(rng, 0, TAU), rngRange(rng, 2.2, 2.8)],
      called: -Infinity,
    };
  });
  const gullSeen = new Float32Array(GULLS.COUNT); // how far (rad) each gull was from where she looks, at the last update
  let selfCall = rngRange(rng, ...GULL_FLIGHT.CALLS); // seconds until the gulls' own next call
  let gullsShown = false;

  // The robins' perches: winter's only, each with how far through its robin's take-off it is (0 sitting, 1 gone).
  const robinPerches = perches.filter((p) => p.zone === ROBIN_ZONE);
  const leave = new Float32Array(robinPerches.length);
  const robinFlap = robinPerches.map(() => rngRange(rng, 0, TAU));
  const picked = new Int32Array(ROBINS.COUNT);
  const pickedAhead = new Float64Array(ROBINS.COUNT);

  let flockCount = FLOCK.COUNT, gullCount = GULLS.COUNT, robinCount = ROBINS.COUNT;
  let density = 1;
  let time = 0;
  let lastD = NaN; // the train's distance at the last update, to tell a jump back
  let looking = false; // whether `view` holds where she is looking

  // Per-frame scratch.
  const cameraAt = new Vector3(), view = new Vector3();
  const weights = {};
  const local = new Vector3(), next = new Vector3();
  const position = new Vector3(), ahead = new Vector3(), centre = new Vector3();
  const forward = new Vector3(), right = new Vector3(), across = new Vector3(), sight = new Vector3();
  const axisX = new Vector3(), axisY = new Vector3(), axisZ = new Vector3();
  const basis = new Matrix4(), matrix = new Matrix4(), turn = new Quaternion(), roll = new Quaternion(), size = new Vector3();
  const crossing = { start: 0, time: 0, dir: 1, height: 0, from: 0, to: 0 };

  /** Stands bird `i` of `mesh` at `at`, heading along `heading`, banked `bank` (rad, + lifts its +X wing), `scale` big. */
  function place(mesh, i, at, heading, bank, scale) {
    axisZ.copy(heading).normalize();
    axisX.crossVectors(UP, axisZ);
    if (axisX.lengthSq() < 1e-10) axisX.set(1, 0, 0);
    else axisX.normalize();
    axisY.crossVectors(axisZ, axisX);
    turn.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ)).multiply(roll.setFromAxisAngle(Z_AXIS, bank));
    mesh.setMatrixAt(i, matrix.compose(at, turn, size.setScalar(scale)));
  }

  /** A point from the track at the train (x right, y up, z ahead), in the world. */
  const toWorld = (p, d, out) => path.frameAt(d + p.z, p.x, p.y, out);

  /** Draws `count` of `mesh`'s birds (none hides it) and sends their matrices and flaps to the GPU. */
  function show(mesh, count) {
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.getAttribute('aFlap').needsUpdate = true;
  }

  function updateFlock(d) {
    const weight = weights.spring + weights.autumn;
    const k = flockCrossing(flock, time, crossing);
    // Whether a crossing shows is decided as it starts, so none pops in or out half-way across.
    if (k !== shownCrossing) {
      shownCrossing = k;
      crossingShows = k >= 0 && noise(flock.seed, k, 5) < weights.spring + FLOCK_FLIGHT.AUTUMN * weights.autumn;
    }
    if (!crossingShows || !(weight > 0) || !flockPlace(flock, time, centre)) {
      show(songbirds, 0);
      return;
    }
    const { ACROSS, SPEED, SIZE } = FLOCK;
    const { RAMP, BOB, RISE } = FLOCK_FLIGHT;
    // Its way across, a unit vector from the track (x across, z ahead).
    const run = Math.hypot(2 * (ACROSS + FLOCK_FLIGHT.SPREAD), crossing.to - crossing.from);
    across.set((crossing.dir * 2 * (ACROSS + FLOCK_FLIGHT.SPREAD)) / run, 0, (crossing.to - crossing.from) / run);
    const away = smoothstep(0, 0.5, weight); // as its zones give way, it flies up and away, shrinking
    const flap = songbirds.geometry.getAttribute('aFlap');
    for (let i = 0; i < flockCount; i++) {
      const b = flockBirds[i];
      const bob = BOB * Math.sin(b.bobRate * time + b.bob);
      local.copy(centre).addScaledVector(across, b.along);
      local.y += b.lift + bob + RISE * (1 - weight);
      local.z += b.depth;
      next.copy(local).addScaledVector(across, SPEED * 0.1);
      next.y += BOB * Math.sin(b.bobRate * (time + 0.1) + b.bob) - bob;
      toWorld(local, d, position);
      toWorld(next, d, ahead);
      const shown = smoothstep(ACROSS, ACROSS - RAMP, Math.abs(local.x)) * away;
      place(songbirds, i, position, ahead.sub(position), 0, SIZE * b.size * shown);
      flap.setXYZ(i, b.flap[0], b.flap[1], b.flap[2]);
    }
    show(songbirds, flockCount);
  }

  function updateGulls(d, step) {
    const weight = weights.summer;
    gullsShown = weight > 0;
    if (!gullsShown) {
      show(gulls, 0);
      return;
    }
    const { SIZE } = GULLS;
    const { TURN_BANK, AWAY, RISE } = GULL_FLIGHT;
    // The gulls bank now and then on their own while no call is heard (the sound off).
    if ((selfCall -= step) <= 0) {
      callGull();
      selfCall = rngRange(rng, ...GULL_FLIGHT.CALLS);
    }
    path.tangentAt(d, forward);
    const scale = SIZE * smoothstep(0, 0.35, weight);
    const flap = gulls.geometry.getAttribute('aFlap');
    for (let i = 0; i < gullCount; i++) {
      const g = gullBirds[i];
      // As summer gives way they fly off, out over the sea and up, shrinking away.
      const offOut = AWAY * (1 - weight), offUp = RISE * (1 - weight);
      gullPlace(g, time, local);
      gullPlace(g, time + 0.05, next);
      local.x -= offOut; next.x -= offOut;
      local.y += offUp; next.y += offUp;
      toWorld(local, d, position);
      toWorld(next, d, ahead).sub(position);
      // It leans into its loop: down on the side its loop's middle is.
      path.frameAt(d + g.ahead, -g.out - offOut, local.y, centre).sub(position);
      const inside = Math.sign(across.crossVectors(ahead, centre).y) || 1;
      const since = time - g.called;
      place(gulls, i, position, ahead, -inside * (TURN_BANK + gullBank(since)), scale);
      flap.setXYZ(i, g.flap[0], g.flap[1], Math.max(ownFlap(g, time), callFlap(since)));
      // How far it is from where she is looking (or, not knowing, from the line ahead), to answer a call.
      if (looking) sight.copy(position).sub(cameraAt).normalize();
      else sight.copy(position).sub(cameraAt).setY(0).normalize();
      gullSeen[i] = Math.acos(clamp(sight.dot(looking ? view : forward), -1, 1));
    }
    show(gulls, gullCount);
  }

  /**
   * One of the gulls flaps and banks: the one nearest where she is looking, which is inside her view whenever any is
   * (not knowing her view, the one nearest the line ahead, where she mostly looks).
   */
  function callGull() {
    let best = -1;
    for (let i = 0; i < gullCount; i++) {
      if (time - gullBirds[i].called < 2) continue; // still answering the last
      if (best < 0 || gullSeen[i] < gullSeen[best]) best = i;
    }
    if (best >= 0) gullBirds[best].called = time;
  }

  function updateRobins(d, step) {
    const weight = weights[ROBIN_ZONE];
    if (!(weight > 0)) {
      show(robins, 0);
      return;
    }
    const { AHEAD, SIZE } = ROBINS;
    const { TIME, OUT, UP: RISE, ON, RATE, FEET, FADE } = TAKE_OFF;
    path.tangentAt(d, forward);
    path.sideAt(d, right);
    // Each robin startles as the train comes near and flies off; the nearest few still sitting or flying are drawn.
    let n = 0;
    for (let j = 0; j < robinPerches.length; j++) {
      const perch = robinPerches[j];
      if (perch.rank >= density) continue;
      const along = sight.subVectors(perch, cameraAt).dot(forward);
      if (leave[j] >= 1) continue;
      if (leave[j] > 0) leave[j] = Math.min(1, Math.max(leave[j] + step / TIME, robinLeave(Math.abs(along))));
      else leave[j] = robinLeave(Math.abs(along));
      const sitting = leave[j] === 0;
      if (sitting && (along < AHEAD[0] || along > AHEAD[1])) continue;
      // Keep the `robinCount` nearest.
      let k = Math.min(n, robinCount);
      while (k > 0 && pickedAhead[k - 1] > along) {
        if (k < robinCount) {
          picked[k] = picked[k - 1];
          pickedAhead[k] = pickedAhead[k - 1];
        }
        k--;
      }
      if (k < robinCount) {
        picked[k] = j;
        pickedAhead[k] = along;
        n = Math.min(n + 1, robinCount);
      }
    }
    const flap = robins.geometry.getAttribute('aFlap');
    const shown = smoothstep(0, 1, weight);
    for (let i = 0; i < n; i++) {
      const j = picked[i];
      const perch = robinPerches[j];
      const p = leave[j];
      const s = p * p;
      // Out from the track on its own side, up, and on ahead.
      const side = Math.sign(sight.subVectors(perch, cameraAt).dot(right)) || 1;
      across.copy(right).multiplyScalar(side * OUT).addScaledVector(UP, RISE).addScaledVector(forward, ON);
      position.copy(perch).addScaledVector(UP, FEET * SIZE).addScaledVector(across, s);
      // Sitting, it turns to watch the train come; startled, it turns about and flies off.
      if (p > 0) ahead.copy(across);
      else ahead.subVectors(cameraAt, perch).setY(0);
      const far = smoothstep(AHEAD[1], AHEAD[1] - FADE, pickedAhead[i]);
      place(robins, i, position, ahead, 0, SIZE * shown * far * (1 - smoothstep(0.7, 1, p)));
      flap.setXYZ(i, robinFlap[j], RATE, p > 0 ? 1 : 0);
    }
    show(robins, n);
  }

  /** After a jump back along the ride, every robin the train has yet to come near is back on its perch. */
  function resettleRobins(d) {
    path.tangentAt(d, forward);
    for (let j = 0; j < robinPerches.length; j++) {
      if (sight.subVectors(robinPerches[j], cameraAt).dot(forward) > ROBINS.LEAVE) leave[j] = 0;
    }
  }

  return {
    group,
    update(seconds, env, cameraPosition, d, where) {
      const step = seconds > 0 ? seconds : 0;
      time += step;
      uniforms.uBirdTime.value = time;
      cameraAt.copy(cameraPosition);
      looking = Boolean(where);
      if (looking) view.copy(where);
      if (d < lastD - TAKE_OFF.BACK) resettleRobins(d);
      lastD = d;
      zoneWeights(env, weights);
      updateFlock(d);
      updateGulls(d, step);
      updateRobins(d, step);
    },
    setQuality(share) {
      const k = clamp(share, 0, 1);
      flockCount = Math.ceil(FLOCK.COUNT * k);
      gullCount = Math.ceil(GULLS.COUNT * k);
      robinCount = Math.ceil(ROBINS.COUNT * k);
    },
    setDensity(share) {
      density = clamp(share, 0, 1);
    },
    gullCall() {
      if (!gullsShown) return;
      callGull();
      selfCall = Math.max(selfCall, GULL_FLIGHT.QUIET); // a call heard: the sound is on, and the calls come from it
    },
    /** @type {object[]} */
    targets: [],
  };
}
