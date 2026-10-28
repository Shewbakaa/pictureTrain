// The little dogs and cats: one sitting at the couple's feet at every stop (world/stopCouple.js), and one that trots
// out of the station house with him in the finale (finale/finale.js). content.js `pets` says which: 'random' (the
// default) gives every stop a dog or a cat of its own, 'dog' or 'cat' always that kind, and 'none' none at all. The
// picks are seeded (`petFor`), so every ride shows the same ones, and the coats vary from a small palette (PET_COATS).
//
// A pet is built like the figures (world/figures.js): simple coloured parts merged into one mesh, rigidly skinned so
// that its head can turn and its legs can sit, trot and hop without a mesh per part. Its tail is a second mesh, on a
// pivot of its own at its rump, for the wag. It faces +Z with its paws round its origin, about 0.35 m tall, as chunky
// as the figures: a big round head on a small body and stubby legs. A cat has pointed ears, a small pink nose and a
// long tail held up in a curl, which swishes slowly; a dog has floppy ears, a muzzle, a collar and a short tail, which
// wags fast. Every few seconds it looks round. A tap on it (Task 14) makes it hop for joy, and a dog spins round as it
// hops.
//
// How it holds itself at any moment is a pure function of the time (`petPose`), so the finale can show any instant.
//
// DOM-free at import, so the Node unit tests can import it.

import {
  Bone, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, Object3D, Skeleton, SkinnedMesh,
  SphereGeometry, TorusGeometry,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, mergeSkinnedParts, part } from '../util/geo.js';
import { clamp, easeInOutCubic, lerp, smoothstep } from '../util/math.js';
import { createRng } from '../util/rng.js';

const TAU = Math.PI * 2;

/** Each kind's coats (sRGB hex): the coat, and its markings (the muzzle, the chest, the paws and the tail's tip). */
export const PET_COATS = Object.freeze({
  dog: Object.freeze([['#c8924f', '#f3e3c8'], ['#3a302b', '#f1ece4'], ['#f2e6d0', '#d9b88f'], ['#8a5a3b', '#e8cfa8']].map(Object.freeze)),
  cat: Object.freeze([['#f0a35e', '#fff3e2'], ['#2f2c33', '#ffffff'], ['#9a9aa3', '#e9e9ee'], ['#efe7da', '#c9a27e']].map(Object.freeze)),
});

/**
 * @typedef {{ kind: 'dog'|'cat', coat: [string, string] }} PetLook  which kind, and its coat and markings
 */

/**
 * The pet at stop `index` (index −1 is the finale's), as content.js `pets` asks: 'none' is none, 'dog' or 'cat'
 * always that kind, and 'random' (or anything else) either. Every look (a kind in one of its coats) the setting allows
 * is shuffled, seeded by `seed`, and dealt round the stops in turn: so the same index always gets the same pet, the
 * kinds mix, every coat comes up, and no two stops in a row look alike.
 * @param {number} index
 * @param {'random'|'dog'|'cat'|'none'} setting
 * @param {number} [seed]
 * @returns {PetLook|null}
 */
export function petFor(index, setting, seed = 365) {
  if (setting === 'none') return null;
  const kinds = setting === 'dog' || setting === 'cat' ? [setting] : ['dog', 'cat'];
  const looks = kinds.flatMap((kind) => PET_COATS[kind].map((coat) => ({ kind, coat })));
  const rng = createRng(seed);
  for (let i = looks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [looks[i], looks[j]] = [looks[j], looks[i]];
  }
  const { kind, coat } = looks[((index % looks.length) + looks.length) % looks.length];
  return { kind, coat: [...coat] };
}

// ---------------------------------------------------------------------------------------------------------------
// How it holds itself
// ---------------------------------------------------------------------------------------------------------------

/**
 * Sitting (`sit` 1): the body tips PITCH (rad) nose up about its hips, which go DROP metres lower, so that its rump
 * rests on the ground (its hind legs fold forward under it), and the head tips back HEAD of the way, to look ahead.
 */
const SIT = Object.freeze({ PITCH: 0.75, DROP: 0.08, HEAD: 0.85 });

/**
 * A trot: the legs swing LEG (rad) either way in diagonal pairs, the body bounces BOB metres twice a stride and rocks
 * ROCK (rad). One full stride carries it STRIDE metres: long for its little legs, so that keeping up with his brisk
 * walk in the finale (3.5 m/s at its quickest) its legs go about six times a second, not in a blur.
 */
export const TROT = Object.freeze({ LEG: 0.55, BOB: 0.022, ROCK: 0.05, STRIDE: 0.6 });

/**
 * Looking round: a turn of the head EVERY seconds, each up to JITTER later, so they come 3 to 6 s apart. Each turns
 * TURN (rad, between these) to one side or the other, taking RISE seconds to turn, holding it HOLD seconds and
 * taking RISE back; a dog tilts its head TILT.dog (rad) as it looks, curious, and a cat TILT.cat.
 */
const LOOK = Object.freeze({
  EVERY: 4.5, JITTER: 1.5, TURN: Object.freeze([0.35, 0.75]), RISE: 0.35, HOLD: 1.1, TILT: Object.freeze({ dog: 0.3, cat: 0.12 }),
});

/**
 * The tail: SWING (rad) either way, RATE times a second (a dog wags fast, a cat swishes slowly). Sitting, it holds its
 * tail SIT_LIFT (rad) further up, so that it still stands up behind it, where it shows as it wags.
 */
const TAIL = Object.freeze({
  dog: Object.freeze({ SWING: 0.55, RATE: 3, SIT_LIFT: 0.7 }),
  cat: Object.freeze({ SWING: 0.4, RATE: 0.45, SIT_LIFT: 1.35 }),
});

/**
 * A tap: a hop HIGH metres up that lasts TIME seconds, its legs tucked TUCK (rad) in the air (and a dog turns a full
 * circle as it hops); its tail goes EXCITED times as far, calming over WAG seconds.
 */
const HOP = Object.freeze({ HIGH: 0.14, TIME: 0.65, TUCK: 0.6, EXCITED: 1.6, WAG: 2 });

/** Sitting still, as at a stop. */
const SITTING = Object.freeze({ sit: 1, stride: 0, trot: 0 });

/**
 * @typedef {{ sit: number, stride: number, trot: number }} PetMove  how far it sits (0 standing to 1 sitting), where
 *   it is in its stride (rad; a full stride is 2π) and how fully it trots (0 to 1)
 * @typedef {{ sit: number, legs: number[], bob: number, pitch: number, headTurn: number, headTilt: number, wag: number,
 *             tailLift: number, hop: number, spin: number }} PetPose
 *   How far it sits; each leg's swing (rad, + forward: front left, front right, back left, back right); how far its
 *   body rises (m) and tips nose up (rad) beyond the sit; its head's turn (rad, + to its left) and tilt (+ toward its
 *   right); its tail's wag (rad, + to its left) and lift (rad); how high it hops (m) and how far round it has spun (rad).
 */

/** A number from 0 to 1 that looks random but is always the same for the same `n`. */
function noise(n) {
  const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
}

/** Its head's turn and tilt (rad) at `time` (s) as it looks round. */
function lookRound(kind, time) {
  const cycle = Math.floor(time / LOOK.EVERY);
  const since = time - (cycle * LOOK.EVERY + LOOK.JITTER * noise(cycle));
  const span = 2 * LOOK.RISE + LOOK.HOLD;
  if (!(since > 0 && since < span)) return { turn: 0, tilt: 0 };
  const turned = smoothstep(0, LOOK.RISE, since) * (1 - smoothstep(LOOK.RISE + LOOK.HOLD, span, since));
  const side = noise(cycle + 0.5) < 0.5 ? -1 : 1;
  return {
    turn: side * lerp(LOOK.TURN[0], LOOK.TURN[1], noise(cycle + 0.25)) * turned,
    tilt: side * LOOK.TILT[kind] * turned,
  };
}

/**
 * How a pet holds itself at `time` (s): sitting, standing or trotting as `move` says, wagging its tail, looking round
 * now and then (but not while it trots), and hopping (a dog spinning) for a moment `sinceTap` seconds after a tap.
 * @param {'dog'|'cat'} kind
 * @param {number} time
 * @param {PetMove} [move]
 * @param {number} [sinceTap]  NaN without a tap
 * @returns {PetPose}
 */
export function petPose(kind, time, move = SITTING, sinceTap = NaN) {
  const t = Number.isFinite(time) ? time : 0;
  const tail = TAIL[kind] || TAIL.dog;
  const trot = clamp(move.trot || 0, 0, 1);
  const stride = move.stride || 0;
  const swing = TROT.LEG * trot * Math.sin(stride);
  const legs = [swing, -swing, -swing, swing];
  const look = lookRound(kind, t);

  // A hop for joy: up and down again in HOP.TIME, standing up out of a sit for it, its legs tucked in the air.
  const u = sinceTap / HOP.TIME;
  const hopping = u >= 0 && u < 1;
  const jump = hopping ? Math.sin(Math.PI * u) : 0;
  legs[0] += HOP.TUCK * jump;
  legs[1] += HOP.TUCK * jump;
  legs[2] -= HOP.TUCK * jump;
  legs[3] -= HOP.TUCK * jump;
  const excited = sinceTap >= 0 ? 1 - smoothstep(HOP.WAG / 2, HOP.WAG, sinceTap) : 0;
  const sit = clamp(move.sit ?? 1, 0, 1) * (1 - jump);

  return {
    sit,
    legs,
    bob: TROT.BOB * trot * Math.cos(stride) ** 2,
    pitch: TROT.ROCK * trot * Math.sin(2 * stride),
    headTurn: look.turn * (1 - trot),
    headTilt: look.tilt * (1 - trot),
    wag: tail.SWING * (1 + (HOP.EXCITED - 1) * excited) * Math.sin(TAU * tail.RATE * t),
    tailLift: tail.SIT_LIFT * sit,
    hop: HOP.HIGH * jump,
    spin: hopping && kind === 'dog' ? TAU * easeInOutCubic(u) : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Its shape
// ---------------------------------------------------------------------------------------------------------------

/**
 * Where its joints are at rest, standing (m, [x, y, z] from between its paws): the hips, which its body tips about as
 * it sits; the neck; the tops of the legs (LEG_TOP up, which is also how long they are, LEG_X either side, FRONT and
 * BACK along); and the root of the tail. Its round paws reach PAW metres up and down from their middles, which are PAW
 * above the ground at rest.
 */
const JOINTS = Object.freeze({
  HIPS: Object.freeze([0, 0.11, -0.07]), NECK: Object.freeze([0, 0.2, 0.08]),
  LEG_TOP: 0.1, LEG_X: 0.042, FRONT: 0.065, BACK: -0.07, TAIL: Object.freeze([0, 0.17, -0.11]), PAW: 0.02,
});

/**
 * How far from the middle between its paws any part of a pet reaches across the ground (m), whatever it does: sitting,
 * trotting, looking round, wagging, or hopping and spinning round. For keeping it clear of others.
 */
export const PET_RADIUS = 0.28;

/** The bones of its body, by name, in skinning order. */
const BONES = ['body', 'head', 'frontLeft', 'frontRight', 'backLeft', 'backRight'];
const LEGS = BONES.slice(2);

/**
 * Its body and head (m): the body's middle and radii; the head's middle and radii; the legs' radius at the top and at
 * the paw. A cat is a little slighter, with a wider face.
 */
const BUILD = Object.freeze({
  dog: Object.freeze({ BODY: [0, 0.145, -0.005], BODY_R: [0.074, 0.07, 0.118], HEAD: [0, 0.262, 0.112], HEAD_R: [0.088, 0.084, 0.084], LEG_R: [0.025, 0.022] }),
  cat: Object.freeze({ BODY: [0, 0.145, -0.005], BODY_R: [0.064, 0.066, 0.118], HEAD: [0, 0.262, 0.11], HEAD_R: [0.094, 0.078, 0.08], LEG_R: [0.021, 0.018] }),
});

/** Fixed colours (sRGB hex): the eyes and their shine, a dog's nose, tongue and collar with its tag, a cat's pink nose and inner ears. */
const COLOURS = Object.freeze({
  eye: '#2d2a32', shine: '#ffffff', dogNose: '#2d2a32', tongue: '#f08a9a', collar: '#e0607e', tag: '#f2c14e',
  catNose: '#f2a0ae', innerEar: '#f6b8c2',
});

const ellipsoid = (segments = 8, rings = 6) => new SphereGeometry(1, segments, rings);

/** How far forward the surface of the head is at (x, y) (m), for putting the face on it. */
function onHead(build, x, y) {
  const [cx, cy, cz] = build.HEAD;
  const [rx, ry, rz] = build.HEAD_R;
  return cz + rz * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2 - ((y - cy) / ry) ** 2));
}

/**
 * The parts of a pet's body, head and legs, each tagged with its bone, at rest (standing, facing +Z).
 * @returns {Array<{ bone: string, part: import('../util/geo.js').Part }>}
 */
function bodyParts(kind, [coat, markings]) {
  const dog = kind === 'dog';
  const build = BUILD[kind];
  const { LEG_TOP, LEG_X, FRONT, BACK } = JOINTS;
  const tagged = [];
  const add = (bone, geometry, colour, transform) => tagged.push({ bone, part: part(geometry, colour, transform) });

  // The body, with a pale chest, on four stubby legs with pale paws.
  add('body', ellipsoid(10, 7), coat, { position: build.BODY, scale: build.BODY_R });
  add('body', ellipsoid(), markings, { position: [0, 0.13, 0.07], scale: dog ? [0.05, 0.056, 0.06] : [0.044, 0.052, 0.058] });
  for (const [bone, x, z] of [['frontLeft', LEG_X, FRONT], ['frontRight', -LEG_X, FRONT], ['backLeft', LEG_X, BACK], ['backRight', -LEG_X, BACK]]) {
    add(bone, new CylinderGeometry(build.LEG_R[0], build.LEG_R[1], LEG_TOP + 0.01, 6), coat, { position: [x, (LEG_TOP + 0.01) / 2 + 0.005, z] });
    add(bone, ellipsoid(7, 5), markings, { position: [x, JOINTS.PAW, z], scale: [build.LEG_R[0] + 0.004, JOINTS.PAW, build.LEG_R[0] + 0.006] });
  }

  // The head: big and round, with dark eyes that catch the light.
  const [, hy] = build.HEAD;
  add('head', ellipsoid(12, 8), coat, { position: build.HEAD, scale: build.HEAD_R });
  for (const s of [-1, 1]) {
    const ex = (dog ? 0.038 : 0.042) * s, ey = hy + 0.014;
    const ez = onHead(build, ex, ey);
    add('head', ellipsoid(6, 4), COLOURS.eye, { position: [ex, ey, ez - 0.004], scale: dog ? [0.015, 0.019, 0.01] : [0.017, 0.021, 0.01] });
    add('head', ellipsoid(4, 3), COLOURS.shine, { position: [ex + 0.005 * s, ey + 0.008, ez + 0.004], scale: 0.0055 });
  }

  if (dog) {
    // A pale muzzle with a dark nose and a pink tongue, floppy ears a shade darker than its coat, and a collar.
    const muzzle = [0, hy - 0.032, onHead(build, 0, hy - 0.032) + 0.018];
    add('head', ellipsoid(8, 5), markings, { position: muzzle, scale: [0.046, 0.036, 0.046] });
    add('head', ellipsoid(6, 4), COLOURS.dogNose, { position: [0, muzzle[1] + 0.016, muzzle[2] + 0.042], scale: [0.02, 0.015, 0.014] });
    add('head', ellipsoid(6, 3), COLOURS.tongue, { position: [0, muzzle[1] - 0.034, muzzle[2] + 0.02], rotation: [0.4, 0, 0], scale: [0.016, 0.006, 0.02] });
    const ear = new Color(coat).lerp(new Color('#000000'), 0.25);
    for (const s of [-1, 1]) {
      add('head', ellipsoid(7, 5), ear, { position: [0.086 * s, hy - 0.004, 0.098], rotation: [0.15, 0, 0.32 * s], scale: [0.024, 0.062, 0.044] });
    }
    add('body', new TorusGeometry(0.058, 0.012, 5, 14), COLOURS.collar, { position: [0, 0.19, 0.072], rotation: [Math.PI / 2 - 0.55, 0, 0] });
    add('body', new IcosahedronGeometry(0.016, 0), COLOURS.tag, { position: [0, 0.148, 0.118] });
  } else {
    // A small pale muzzle with a pink nose, and pointed ears, pink inside, each turned so that a face looks forward.
    const muzzle = [0, hy - 0.03, onHead(build, 0, hy - 0.03) - 0.004];
    add('head', ellipsoid(8, 5), markings, { position: muzzle, scale: [0.038, 0.026, 0.026] });
    add('head', ellipsoid(5, 3), COLOURS.catNose, { position: [0, muzzle[1] + 0.017, muzzle[2] + 0.02], scale: [0.012, 0.008, 0.008] });
    for (const s of [-1, 1]) {
      const tilt = -0.32 * s;
      add('head', new ConeGeometry(0.04, 0.085, 4), coat, { position: [0.052 * s, hy + 0.078, 0.096], rotation: [-0.1, Math.PI / 4, tilt, 'ZYX'] });
      add('head', new ConeGeometry(0.024, 0.055, 4), COLOURS.innerEar, { position: [0.05 * s, hy + 0.072, 0.112], rotation: [-0.1, Math.PI / 4, tilt, 'ZYX'] });
    }
  }
  return tagged;
}

/**
 * Its tail, from its root (the pivot's origin): a dog's short and curving up, a cat's long, rising from its rump and
 * curling over at the tip; the tip in the markings.
 */
function tailGeometry(kind, [coat, markings]) {
  const dog = kind === 'dog';
  // Each segment's length (m) and how far it leans back from upright (rad).
  const segments = dog ? [[0.06, 1.0], [0.05, 0.45]] : [[0.06, 1.25], [0.06, 0.6], [0.06, 0.05], [0.05, -0.55]];
  const radius = dog ? [0.019, 0.013] : [0.017, 0.013];
  const parts = [];
  let y = 0, z = 0;
  segments.forEach(([long, back], i) => {
    const r0 = lerp(radius[0], radius[1], i / segments.length);
    const r1 = lerp(radius[0], radius[1], (i + 1) / segments.length);
    const last = i === segments.length - 1;
    const dy = Math.cos(back) * long, dz = -Math.sin(back) * long;
    parts.push(part(new CylinderGeometry(r1, r0, long, 6), last ? markings : coat, { position: [0, y + dy / 2, z + dz / 2], rotation: [-back, 0, 0] }));
    parts.push(part(ellipsoid(6, 4), coat, { position: [0, y, z], scale: r0 }));
    y += dy;
    z += dz;
  });
  parts.push(part(ellipsoid(6, 4), markings, { position: [0, y, z], scale: radius[1] * 1.15 }));
  return mergeParts(parts);
}

/** The geometries of each kind and coat, built once and shared by every pet that wears them. */
const built = new Map();
function geometriesOf(kind, coat) {
  const key = `${kind} ${coat[0]} ${coat[1]}`;
  if (!built.has(key)) built.set(key, { body: mergeSkinnedParts(bodyParts(kind, coat), BONES), tail: tailGeometry(kind, coat) });
  return built.get(key);
}

// ---------------------------------------------------------------------------------------------------------------
// The pet
// ---------------------------------------------------------------------------------------------------------------

/**
 * A little dog or cat.
 * @param {PetLook} look
 * @returns {{ group: Group, update: (time: number, move?: PetMove) => void, react: (now: number) => void }}
 *   `group` (named 'pet-dog' or 'pet-cat') faces +Z with its paws round its origin. Call `update` every frame it is
 *   drawn, with the seconds since the start: it sits (or stands, or trots, as `move` says), wags its tail and looks
 *   round now and then. `react` is a tap on it at `now` (the same clock): it hops for joy.
 */
export function createPet({ kind, coat }) {
  const group = new Group();
  group.name = `pet-${kind}`;
  const bones = Object.fromEntries(BONES.map((name) => [name, Object.assign(new Bone(), { name })]));
  const { HIPS, NECK, LEG_TOP, LEG_X, FRONT, BACK, TAIL: ROOT, PAW } = JOINTS;
  const fromHips = (x, y, z) => [x - HIPS[0], y - HIPS[1], z - HIPS[2]];
  bones.body.position.fromArray(HIPS);
  bones.body.add(bones.head, ...LEGS.map((name) => bones[name]));
  bones.head.position.fromArray(fromHips(...NECK));
  bones.frontLeft.position.fromArray(fromHips(LEG_X, LEG_TOP, FRONT));
  bones.frontRight.position.fromArray(fromHips(-LEG_X, LEG_TOP, FRONT));
  bones.backLeft.position.fromArray(fromHips(LEG_X, LEG_TOP, BACK));
  bones.backRight.position.fromArray(fromHips(-LEG_X, LEG_TOP, BACK));

  const geometries = geometriesOf(kind, coat);
  const body = new SkinnedMesh(geometries.body, MATERIALS.solid);
  body.name = `${kind}-body`;
  body.add(bones.body);
  group.add(body);
  group.updateMatrixWorld(true);
  body.bind(new Skeleton(BONES.map((name) => bones[name])));

  // The tail on its own pivot at the rump, which follows the body as it sits: it wags round the body's up, and then
  // the wagging tail is lifted (the pivot's rotation, in its default XYZ order).
  const pivot = new Object3D();
  pivot.name = `${kind}-tail-root`;
  pivot.position.fromArray(fromHips(...ROOT));
  bones.body.add(pivot);
  const tail = new Mesh(geometries.tail, MATERIALS.solid);
  tail.name = `${kind}-tail`;
  pivot.add(tail);
  for (const mesh of [body, tail]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  // Where the tops of the legs are from the hips, for keeping its paws on the ground as it sits.
  const [, frontY, frontZ] = fromHips(0, LEG_TOP, FRONT);
  const [, backY, backZ] = fromHips(0, LEG_TOP, BACK);
  /** How high above the ground the top of a leg at (y, z) from the hips is, with the body tipped up `lean` (rad). */
  const heightOf = (y, z, lean) => bones.body.position.y + y * Math.cos(lean) + z * Math.sin(lean);
  let tappedAt = -Infinity;

  function update(time, move = SITTING) {
    const p = petPose(kind, time, move, time - tappedAt);
    const lean = SIT.PITCH * p.sit + p.pitch;
    bones.body.position.y = HIPS[1] - SIT.DROP * p.sit + p.bob;
    bones.body.rotation.x = -lean;
    bones.head.rotation.set(lean * SIT.HEAD, p.headTurn, p.headTilt);
    // The front legs stay upright under its chest, reaching down to the ground however far up it sits; the back
    // legs fold forward under it as its hips go down, so that their paws stay on the ground.
    const reach = heightOf(frontY, frontZ, lean) / LEG_TOP;
    const fold = Math.acos(clamp((heightOf(backY, backZ, lean) - PAW) / (LEG_TOP - PAW), 0, 1));
    for (const [name, i] of [['frontLeft', 0], ['frontRight', 1]]) {
      bones[name].rotation.x = lean - p.legs[i];
      bones[name].scale.y = reach;
    }
    for (const [name, i] of [['backLeft', 2], ['backRight', 3]]) bones[name].rotation.x = lean - fold - p.legs[i];
    pivot.rotation.set(p.tailLift, p.wag, 0);
    body.position.y = p.hop;
    body.rotation.y = p.spin;
  }

  function react(now) {
    tappedAt = now;
  }

  update(0);
  group.updateMatrixWorld(true);
  return { group, update, react };
}
