// The scenery's props: 22 chunky little low-poly things to stand beside the track, from round trees and
// palms to a beach umbrella, a snowman in a bobble hat and cottages with lit windows, one kind of them under a
// cap of snow.
//
// Each prop is a few coloured primitives (geo.js) merged into one vertex-coloured geometry; dressing.js
// (Task 9) turns each type and variant into instanced meshes and scatter.js decides where they stand.
//
// Conventions: metres; +Y is up; the origin is on the ground where the prop stands (the foot of a trunk, pole
// or string, otherwise the middle) and the prop's lowest point is exactly at y = 0. Built things face +Z (a
// house's door, a bench's seat, a snowman's face, the heart balloon) and a fence runs along X: scatter.js
// turns those fronts towards the track.
//
// `glow` holds what should look lit whatever the light (lamp glass, house windows), for an unlit material.
//
// Colours are sRGB hex, soft and a little sweet, picked against each zone's ground and light in zones.js.
// Foliage and other natural bits are jittered (geo.js `jitterColor`) by an rng seeded from the type and
// variant, so a prop looks the same on every phone and every run.
//
// Pure and DOM-free (only Three's geometry classes are used), so the Node unit tests can import it.

import {
  BoxGeometry, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, IcosahedronGeometry, SphereGeometry, Vector3,
} from '../three.js';
import { part, moveParts, mergeParts, jitterColor } from '../util/geo.js';
import { createRng, rngRange, rngPick } from '../util/rng.js';
import { clamp } from '../util/math.js';

/** Every prop type. zones.js names these in its rules. */
export const PROP_TYPES = Object.freeze([
  'tree_round', 'tree_autumn', 'pine', 'pine_snowy', 'palm', 'bush', 'bush_autumn', 'rock', 'rock_snowy',
  'flower_patch', 'grass_tuft', 'balloon_cluster', 'beach_ball', 'umbrella', 'pumpkin', 'hay_bale',
  'snowman', 'house', 'cottage_snowy', 'lamp_post', 'bench', 'fence',
]);

/** How many looks a type has: variants 0 up to this number. Every type not listed has one. */
export const PROP_VARIANTS = Object.freeze({ tree_autumn: 3, house: 3, cottage_snowy: 3, flower_patch: 2, balloon_cluster: 2 });

const TAU = Math.PI * 2;

const COLOURS = {
  bark: '#8a5a3b',
  barkDark: '#6e4631',
  birch: '#f2ede3',
  birchMark: '#4b4542',
  leaves: ['#5fb84a', '#4fa843', '#72c654', '#8bd05a'],
  autumnLeaves: [
    ['#f28c35', '#f7a443', '#e57a2e'], // orange
    ['#dd5238', '#e8694a', '#c9432f'], // red
    ['#f5c445', '#f9d465', '#eab23a'], // gold
  ],
  bushLeaves: ['#58ad48', '#4b9e42', '#6bbb52'],
  blossom: ['#ffffff', '#ffc2d4', '#ff9dbb'],
  bushAutumn: ['#e57a2e', '#dd5238', '#f2a13c', '#c9432f'],
  needles: ['#2f7d55', '#3a8c5f', '#2a704c'],
  needlesSnowy: ['#2d6a52', '#357a5c', '#2a604b'],
  snow: '#f7fbff',
  roofSnow: '#f4f7fb', // the snow on a cottage's roof: the colour of the winter ground it stands on
  palmTrunk: ['#c9a06a', '#b0874f'],
  fronds: ['#4cb153', '#5cc15b', '#3fa04a'],
  coconut: '#7a4e2d',
  rock: ['#a4aab0', '#949ca3', '#b5bbc0'],
  grass: ['#78c158', '#8fd16a', '#66ad4b', '#a2d25f'],
  stem: '#5a9e3c',
  string: '#fdfbf7',
  pumpkin: '#f28a2e',
  pumpkinStem: '#6f7a33',
  pumpkinLeaf: '#5f9e3a',
  hay: '#e8c25c',
  hayInner: ['#d6ab47', '#c89c3d'],
  twine: '#a9783a',
  coal: '#2d2a32',
  carrot: '#ff8a2a',
  cheek: '#ffb3c6',
  scarf: '#e5484d',
  hat: '#3f72d9',
  wood: '#c88a4e',
  woodDark: '#b07642',
  iron: '#33404c',
  windowGlow: '#ffd27a',
  lampGlow: '#ffe9a6',
};

// ------------------------------------------------------------------------------------------------
// Building blocks
// ------------------------------------------------------------------------------------------------

const _point = new Vector3();

const box = (w, h, d) => new BoxGeometry(w, h, d);
/** Three's cylinders and cones are centred on their middle: place one at y + h / 2 to stand it on y. */
const cylinder = (rTop, rBottom, h, sides = 6) => new CylinderGeometry(rTop, rBottom, h, sides);
const cone = (r, h, sides = 6) => new ConeGeometry(r, h, sides);
/** The rounded-but-faceted clump that foliage, snowballs and bushes are made of. */
const blob = (r, detail = 1) => new IcosahedronGeometry(r, detail);
const sphere = (r, around = 8, down = 6) => new SphereGeometry(r, around, down);
const stone = (r) => new DodecahedronGeometry(r, 0);

/**
 * The transform that runs a part's local +Y axis from point `a` to point `b`, centred between them, with its
 * local Z axis level; and the distance from a to b, which is how long to build the part along Y.
 */
function along(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  return {
    length,
    position: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    // Tip +Y over towards +X, then turn it about Y to point at b. Z stays level all the way.
    rotation: [0, Math.atan2(-dz, dx), -Math.acos(clamp(dy / length, -1, 1))],
  };
}

/** A rod from point `a` to point `b`, `ra` thick at a and `rb` at b (0 for a point). */
function rod(a, b, ra, rb, color, sides = 5) {
  const { length, position, rotation } = along(a, b);
  return part(cylinder(rb, ra, length, sides), color, { position, rotation });
}

/** A flat leaf from `a` to `b`, `wa` wide at a and `wb` at b, lying level across its length (a palm frond). */
function leaf(a, b, wa, wb, color) {
  const { length, position, rotation } = along(a, b);
  return part(cylinder(wb, wa, length, 4), color, { position, rotation, scale: [0.22, 1, 1] });
}

/** A four-sided pyramid on a w × d rectangle, h tall, its base centre at `base`. */
function pyramid(w, h, d, color, base) {
  const square = part(cone(Math.SQRT1_2, 1, 4), color, { position: [0, 0.5, 0], rotation: [0, Math.PI / 4, 0] });
  return moveParts([square], { position: base, scale: [w, h, d] })[0];
}

/** The parts moved up or down together so that their lowest point rests on the ground. */
function settle(parts) {
  let lowest = Infinity;
  for (const { geometry, matrix } of parts) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) lowest = Math.min(lowest, _point.fromBufferAttribute(p, i).applyMatrix4(matrix).y);
  }
  return moveParts(parts, { position: [0, -lowest, 0] });
}

/** A point on the upper part of a clump's surface, for a blossom: `rng` picks where. */
function onClump([x, y, z, r], rng, squash = 1) {
  const around = rng() * TAU;
  const up = rngRange(rng, 0.15, 0.85) * (Math.PI / 2);
  return [x + Math.cos(around) * Math.cos(up) * r, y + Math.sin(up) * r * squash, z + Math.sin(around) * Math.cos(up) * r];
}

// ------------------------------------------------------------------------------------------------
// Trees
// ------------------------------------------------------------------------------------------------

/** Clumps of foliage as [x, y, z, radius], each its own shade of `leaves`. */
function canopy(clumps, leaves, rng, scale = [1, 1, 1]) {
  return clumps.map(([x, y, z, r]) => part(blob(r), jitterColor(rngPick(rng, leaves), rng), { position: [x, y, z], scale }));
}

/** A short trunk under a big cloud of round clumps. */
function roundTree(rng, leaves) {
  return [
    part(cylinder(0.2, 0.3, 2.6), COLOURS.bark, { position: [0, 1.3, 0] }),
    ...canopy([[0, 3.3, 0, 1.45], [1.05, 2.75, 0.3, 1.0], [-0.95, 2.85, -0.35, 1.05], [-0.2, 2.65, 1.0, 0.85], [0.25, 4.25, -0.15, 0.95]], leaves, rng),
  ];
}

/** A slim trunk under a tall, teardrop crown. */
function tallTree(rng, leaves) {
  return [
    part(cylinder(0.17, 0.26, 2.4), COLOURS.bark, { position: [0, 1.2, 0] }),
    ...canopy([[0, 2.75, 0, 1.3], [0.05, 3.75, 0.05, 1.0], [0, 4.55, -0.05, 0.62], [0.72, 3.05, 0.32, 0.85], [-0.66, 3.15, -0.34, 0.85], [0.08, 3.1, -0.78, 0.8], [-0.1, 3.3, 0.72, 0.78]], leaves, rng, [1, 1.1, 1]),
  ];
}

/** A white birch, marked with dark flecks, under a few high golden clumps. */
function birch(rng, leaves) {
  const parts = [part(cylinder(0.13, 0.19, 3.6), COLOURS.birch, { position: [0, 1.8, 0] })];
  // Flecks on the bark: thin dark slivers on alternating faces of the six-sided trunk.
  [[0.7, 0.5], [1.25, 2.6], [1.8, 4.7], [2.35, 1.6], [2.9, 3.65], [0.45, 3.65]].forEach(([y, angle]) => {
    const r = 0.19 - (0.06 * y) / 3.6; // the trunk's radius at that height
    parts.push(part(box(0.11, 0.035, 0.03), COLOURS.birchMark, {
      position: [Math.sin(angle) * r * 0.9, y, Math.cos(angle) * r * 0.9],
      rotation: [0, angle, 0],
    }));
  });
  parts.push(...canopy([[0, 3.95, 0, 1.15], [0.8, 3.45, 0.25, 0.82], [-0.7, 3.55, -0.2, 0.86], [0.15, 4.75, -0.1, 0.72]], leaves, rng));
  return parts;
}

/** Three stacked cones of needles on a stub of trunk, optionally iced with snow on each tier. */
function pine(rng, needles, snowy) {
  const parts = [part(cylinder(0.17, 0.25, 1.4), COLOURS.barkDark, { position: [0, 0.7, 0] })];
  [[0.9, 1.75, 2.5], [2.25, 1.4, 2.3], [3.5, 1.05, 2.4]].forEach(([y, r, h], i) => {
    const turn = i * 0.45; // so the facets of the tiers do not line up
    parts.push(part(cone(r, h, 7), jitterColor(rngPick(rng, needles), rng), { position: [0, y + h / 2, 0], rotation: [0, turn, 0] }));
    if (snowy) {
      // A cone a little wider than the tier where it starts, so it sits on the top 55 % like icing.
      const from = 0.45, sh = h * (1 - from) + 0.08;
      parts.push(part(cone(r * (1 - from) * 1.1, sh, 7), COLOURS.snow, { position: [0, y + h * from + sh / 2, 0], rotation: [0, turn, 0] }));
    }
  });
  return parts;
}

/** A curved, ringed trunk leaning towards +X, a crown of arching fronds and three coconuts. */
function palm(rng) {
  const parts = [];
  const HEIGHT = 4.5, LEAN = 0.85, RINGS = 6;
  const trunkAt = (t) => [LEAN * t * t, HEIGHT * t, 0];
  for (let i = 0; i < RINGS; i++) {
    const r = 0.31 - (0.1 * i) / RINGS;
    // Each ring is a little wider at the top and overlaps the next, like a pineapple's scales.
    parts.push(rod(trunkAt(i / RINGS), trunkAt((i + 1.1) / RINGS), r * 0.85, r, COLOURS.palmTrunk[i % 2], 6));
  }
  const [cx, cy, cz] = trunkAt(1);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.5;
    parts.push(part(blob(0.13, 0), COLOURS.coconut, { position: [cx + Math.cos(a) * 0.17, cy - 0.12, cz + Math.sin(a) * 0.17] }));
  }
  const FRONDS = 8;
  for (let i = 0; i < FRONDS; i++) {
    const a = (i / FRONDS) * TAU + rngRange(rng, -0.15, 0.15);
    const reach = rngRange(rng, 2.1, 2.5), droop = rngRange(rng, 0.8, 1.15);
    // Out along the frond's direction, `d` metres from the crown and `h` above it.
    const out = (d, h) => [cx + Math.cos(a) * d, cy + h, cz + Math.sin(a) * d];
    const elbow = out(reach * 0.36, 0.4), bend = out(reach * 0.72, 0.12), tip = out(reach, -droop);
    const colour = jitterColor(rngPick(rng, COLOURS.fronds), rng);
    parts.push(leaf(out(0, 0.05), elbow, 0.12, 0.42, colour), leaf(elbow, bend, 0.42, 0.3, colour), leaf(bend, tip, 0.3, 0, colour));
  }
  // A short tuft standing up in the middle.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    parts.push(leaf([cx, cy, cz], [cx + Math.cos(a) * 0.35, cy + 0.75, cz + Math.sin(a) * 0.35], 0.05, 0, jitterColor(COLOURS.fronds[0], rng)));
  }
  return parts;
}

// ------------------------------------------------------------------------------------------------
// Bushes, rocks, flowers and grass
// ------------------------------------------------------------------------------------------------

/** Four round clumps squashed a little, optionally dotted with blossoms. */
function bush(rng, leaves, blossoms) {
  const SQUASH = 0.85;
  const clumps = [[0, 0.5, 0, 0.6], [0.55, 0.38, 0.2, 0.45], [-0.52, 0.4, -0.12, 0.48], [0.05, 0.36, -0.5, 0.42]];
  const parts = canopy(clumps, leaves, rng, [1, SQUASH, 1]);
  if (blossoms) {
    for (let i = 0; i < 7; i++) {
      parts.push(part(blob(0.075, 0), rngPick(rng, blossoms), { position: onClump(clumps[i % clumps.length], rng, SQUASH) }));
    }
  }
  return parts;
}

/** A rock with two pebbles beside it, optionally under a blanket of snow. */
function rocks(rng, snowy) {
  const parts = [];
  // [x, z, radius, scale, rotation]
  const pieces = [
    [0, 0, 0.55, [1.3, 0.78, 1.05], [0.3, 0.5, 0.15]],
    [0.8, 0.32, 0.25, [1.2, 0.8, 1], [0.6, 1.1, 0.2]],
    [-0.58, 0.52, 0.16, [1, 0.85, 1.1], [0.2, 0.4, 0.9]],
  ];
  for (const [x, z, r, scale, rotation] of pieces) {
    const piece = [part(stone(r), jitterColor(rngPick(rng, COLOURS.rock), rng, 0.04), { scale, rotation })];
    // The snow is the same stone squashed flat and lifted, so it drapes over the top half.
    if (snowy) piece.push(...moveParts([part(stone(r), COLOURS.snow, { scale, rotation })], { position: [0, r * 0.42, 0], scale: [0.98, 0.5, 0.98] }));
    parts.push(...moveParts(settle(piece), { position: [x, 0, z] }));
  }
  return parts;
}

const FLOWER_PATCHES = [
  { petals: ['#f78fb3', '#ffffff', '#ff6f96', '#fbb8cf'], tulips: true }, // pink and white tulips
  { petals: ['#ffd34d', '#c6a2f0', '#ffffff', '#ffb26b'], centre: '#ff9f43' }, // daisies: yellow, lilac, white, peach
];

/** A low tuft of leaves with seven flowers on stems: tulips or daisies. */
function flowerPatch(variant, rng) {
  const look = FLOWER_PATCHES[variant];
  const parts = [[0.12, 0.05], [-0.16, -0.08], [0.02, -0.2]].map(([x, z]) =>
    part(blob(0.22, 0), jitterColor(COLOURS.leaves[1], rng), { position: [x, 0.04, z], scale: [1.2, 0.5, 1.2] }));
  for (let i = 0; i < 7; i++) {
    // A sunflower spiral spreads them evenly.
    const a = i * 2.4, d = 0.1 + 0.27 * Math.sqrt(i / 7);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, h = rngRange(rng, 0.26, 0.4);
    const colour = look.petals[i % look.petals.length];
    parts.push(rod([x, 0, z], [x, h, z], 0.022, 0.016, COLOURS.stem, 3));
    if (look.tulips) {
      parts.push(part(cylinder(0.075, 0.045, 0.13, 5), colour, { position: [x, h + 0.05, z] }));
    } else {
      parts.push(part(blob(0.095, 0), colour, { position: [x, h + 0.01, z], scale: [1, 0.42, 1] }));
      parts.push(part(sphere(0.042, 4, 3), look.centre, { position: [x, h + 0.04, z] }));
    }
  }
  return parts;
}

/** Seven pointed blades leaning out from the middle. */
function grassTuft(rng) {
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rngRange(rng, -0.3, 0.3);
    const lean = rngRange(rng, 0.18, 0.5), h = rngRange(rng, 0.32, 0.55), from = rngRange(rng, 0.03, 0.09);
    const base = [Math.cos(a) * from, 0, Math.sin(a) * from];
    const tip = [base[0] + Math.cos(a) * Math.sin(lean) * h, Math.cos(lean) * h, base[2] + Math.sin(a) * Math.sin(lean) * h];
    parts.push(rod(base, tip, 0.065, 0, jitterColor(rngPick(rng, COLOURS.grass), rng), 3));
  }
  return parts;
}

// ------------------------------------------------------------------------------------------------
// Things people brought: balloons, beach things, pumpkins, hay, a snowman
// ------------------------------------------------------------------------------------------------

const BALLOON_CLUSTERS = [
  // Love: pinks and white round a red heart, tied to a little gift box.
  { balloons: ['#ff6f91', '#ffffff', '#ffa8c2'], heart: '#f23c5a', gift: { box: '#f7a8c8', ribbon: '#ffffff' } },
  // Party: four pastels on a wooden peg.
  { balloons: ['#ffd166', '#7cc8f2', '#9de3a8', '#c7a9ff'] },
];

/** A round balloon, its knot at the origin. */
function roundBalloon(colour) {
  return [part(sphere(0.37, 8, 6), colour, { position: [0, 0.41, 0], scale: [1, 1.15, 1] })];
}

/** A heart-shaped balloon, its knot at the origin, its face to +Z: two lobes over a point, flattened front to back. */
function heartBalloon(colour) {
  return [
    part(sphere(0.24, 7, 5), colour, { position: [-0.165, 0.53, 0], scale: [1, 1, 0.7] }),
    part(sphere(0.24, 7, 5), colour, { position: [0.165, 0.53, 0], scale: [1, 1, 0.7] }),
    part(cone(0.38, 0.48, 8), colour, { position: [0, 0.25, 0], rotation: [Math.PI, 0, 0], scale: [1, 1, 0.55] }),
  ];
}

/** Four balloons on strings, tied to a gift box or a peg. The heart (if any) faces +Z. */
function balloonCluster(variant) {
  const look = BALLOON_CLUSTERS[variant];
  const parts = [];
  let tie;
  if (look.gift) {
    const { box: wrap, ribbon } = look.gift;
    parts.push(
      part(box(0.34, 0.28, 0.34), wrap, { position: [0, 0.14, 0] }),
      part(box(0.36, 0.29, 0.07), ribbon, { position: [0, 0.145, 0] }),
      part(box(0.07, 0.29, 0.36), ribbon, { position: [0, 0.145, 0] }),
      part(blob(0.06, 0), ribbon, { position: [-0.055, 0.31, 0], scale: [1.3, 0.7, 0.7] }),
      part(blob(0.06, 0), ribbon, { position: [0.055, 0.31, 0], scale: [1.3, 0.7, 0.7] }),
    );
    tie = [0, 0.3, 0];
  } else {
    parts.push(part(cylinder(0.045, 0.03, 0.36, 5), COLOURS.wood, { position: [0, 0.18, 0] }));
    tie = [0, 0.35, 0];
  }
  const knots = [[-0.55, 2.7, 0.05], [0.45, 3.0, -0.26], [0.02, 3.4, 0.3], [0.62, 2.5, 0.45]];
  knots.forEach((knot, i) => {
    const isHeart = look.heart && i === 2;
    const colour = isHeart ? look.heart : look.balloons[i % look.balloons.length];
    parts.push(rod(tie, knot, 0.009, 0.009, COLOURS.string, 3));
    parts.push(part(cone(0.055, 0.08, 5), colour, { position: [knot[0], knot[1] + 0.03, knot[2]], rotation: [Math.PI, 0, 0] }));
    parts.push(...moveParts(isHeart ? heartBalloon(colour) : roundBalloon(colour), { position: [knot[0], knot[1] + 0.06, knot[2]] }));
  });
  return parts;
}

/** A six-panel beach ball with white caps, lying tipped over. */
function beachBall() {
  const R = 0.32;
  const panels = ['#ff5a5f', '#ffffff', '#ffcf3f', '#ffffff', '#3ba7ff', '#ffffff'];
  const ball = panels.map((colour, i) => part(new SphereGeometry(R, 3, 6, (i * TAU) / 6, TAU / 6), colour));
  ball.push(part(cylinder(0.08, 0.08, 0.02), '#ffffff', { position: [0, R - 0.014, 0] }));
  ball.push(part(cylinder(0.08, 0.08, 0.02), '#ffffff', { position: [0, -R + 0.014, 0] }));
  return moveParts(ball, { position: [0, R, 0], rotation: [0.5, 0.3, 0.35] });
}

/** A striped beach umbrella planted with a slight lean, over a striped towel. */
function umbrella() {
  const STRIPES = ['#ff7a6b', '#fff6e8'], POLE = '#f4efe6';
  const shade = [part(cylinder(0.035, 0.035, 2.3, 5), POLE, { position: [0, 1.15, 0] })];
  for (let i = 0; i < 8; i++) {
    shade.push(part(new ConeGeometry(1.3, 0.5, 2, 1, false, (i * TAU) / 8, TAU / 8), STRIPES[i % 2], { position: [0, 2.15, 0] }));
  }
  shade.push(part(sphere(0.06, 5, 4), POLE, { position: [0, 2.43, 0] }));
  const towel = ['#4fbfbf', '#ffffff', '#4fbfbf'].map((colour, i) => part(box(0.3, 0.02, 1.5), colour, { position: [(i - 1) * 0.3, 0.01, 0] }));
  return [...moveParts(shade, { rotation: [0.12, 0, -0.1] }), ...moveParts(towel, { position: [0.62, 0, 0.3], rotation: [0, 0.35, 0] })];
}

/** Six ribbed lobes round a short stem, with a curl of leaf. */
function pumpkin(rng) {
  const parts = [];
  const LOBES = 6;
  for (let i = 0; i < LOBES; i++) {
    const a = (i / LOBES) * TAU;
    // Local X runs across the lobe, Z outwards from the middle.
    parts.push(part(sphere(1, 6, 5), jitterColor(COLOURS.pumpkin, rng, 0.04), {
      position: [Math.sin(a) * 0.13, 0.25, Math.cos(a) * 0.13],
      rotation: [0, a, 0],
      scale: [0.16, 0.25, 0.23],
    }));
  }
  parts.push(rod([0, 0.42, 0], [0.04, 0.6, 0.02], 0.045, 0.03, COLOURS.pumpkinStem, 5));
  parts.push(part(blob(0.09, 0), COLOURS.pumpkinLeaf, { position: [0.11, 0.48, 0.06], rotation: [0, 0.6, 0.25], scale: [1.4, 0.3, 0.8] }));
  return parts;
}

/** A round bale lying on its side: the rolled-up layers show at each end, and two bands of twine hold it. */
function hayBale() {
  // Eight sides started an eighth of a side round, so that once it is laid along X it rests on a flat face.
  const roll = (r, length) => new CylinderGeometry(r, r, length, 8, 1, false, Math.PI / 8);
  const lying = (x = 0) => ({ position: [x, 0.55, 0], rotation: [0, 0, Math.PI / 2] });
  return [
    part(roll(0.56, 1.05), COLOURS.hay, lying()),
    part(roll(0.41, 1.07), COLOURS.hayInner[0], lying()),
    part(roll(0.2, 1.09), COLOURS.hayInner[1], lying()),
    part(roll(0.575, 0.05), COLOURS.twine, lying(-0.26)),
    part(roll(0.575, 0.05), COLOURS.twine, lying(0.26)),
  ];
}

/**
 * Where the snowman's head sits on its body and how it is tipped (a little forward and to one side), and the bobble
 * on its hat in the head's own frame: its middle and its radius (m). A robin perches on the bobble (`perchTops`).
 */
const SNOWMAN_HEAD = Object.freeze({ position: Object.freeze([0, 1.48, 0]), rotation: Object.freeze([0.06, 0, 0.1]) });
const BOBBLE = Object.freeze({ AT: Object.freeze([0, 0.35, 0]), RADIUS: 0.075 });

/** Three snowballs with a carrot nose, rosy cheeks, a red scarf, stick arms and a bobble hat, facing +Z. */
function snowman() {
  const { snow, coal } = COLOURS;
  const head = [
    part(sphere(0.26, 7, 6), snow),
    part(sphere(0.034, 4, 3), coal, { position: [-0.09, 0.06, 0.23] }),
    part(sphere(0.034, 4, 3), coal, { position: [0.09, 0.06, 0.23] }),
    part(cone(0.05, 0.24, 6), COLOURS.carrot, { position: [0, -0.01, 0.36], rotation: [Math.PI / 2, 0, 0] }),
    ...[[-0.075, -0.075, 0.236], [0, -0.098, 0.24], [0.075, -0.075, 0.236]].map((p) => part(sphere(0.022, 4, 3), coal, { position: p })),
    ...[-1, 1].map((side) => part(sphere(0.05, 4, 3), COLOURS.cheek, { position: [side * 0.155, -0.035, 0.2], scale: [1, 0.6, 0.45] })),
    // The bobble hat: a dome, a turned-up brim and a pompom.
    part(new SphereGeometry(0.25, 8, 4, 0, TAU, 0, Math.PI / 2), COLOURS.hat, { position: [0, 0.09, 0] }),
    part(cylinder(0.255, 0.268, 0.08, 8), '#ffffff', { position: [0, 0.1, 0] }),
    part(blob(BOBBLE.RADIUS, 0), '#ffffff', { position: [...BOBBLE.AT] }),
  ];
  return [
    part(sphere(0.48, 7, 6), snow, { position: [0, 0.44, 0], scale: [1, 0.92, 1] }),
    part(sphere(0.35, 7, 6), snow, { position: [0, 1.02, 0] }),
    ...moveParts(head, { position: [...SNOWMAN_HEAD.position], rotation: [...SNOWMAN_HEAD.rotation] }),
    part(sphere(0.04, 4, 3), coal, { position: [0, 1.12, 0.335] }),
    part(sphere(0.04, 4, 3), coal, { position: [0, 0.94, 0.345] }),
    part(cylinder(0.265, 0.295, 0.11, 8), COLOURS.scarf, { position: [0, 1.3, 0] }),
    part(box(0.11, 0.34, 0.05), COLOURS.scarf, { position: [0.14, 1.17, 0.25], rotation: [0.3, 0, 0.15] }),
    rod([0.3, 1.1, 0], [0.8, 1.42, 0.06], 0.028, 0.016, COLOURS.barkDark, 4),
    rod([-0.3, 1.1, 0], [-0.78, 1.34, 0.1], 0.028, 0.016, COLOURS.barkDark, 4),
  ];
}

// ------------------------------------------------------------------------------------------------
// The town: houses, lamps, benches, fences
// ------------------------------------------------------------------------------------------------

const HOUSES = [
  // A blush-pink cottage with a terracotta roof and window boxes.
  { walls: '#f6d6cf', roof: '#c8594a', door: '#7b4b33', chimney: '#b0645a', width: 3.0, depth: 2.8, wallHeight: 2.4, rise: 1.5, floors: 1, chimneyX: 0.75, windowBoxes: true },
  // A two-storey mint house under a slate-blue roof.
  { walls: '#d3ead7', roof: '#5b6ea6', door: '#e0a245', chimney: '#8c7a74', width: 3.2, depth: 3.0, wallHeight: 3.7, rise: 1.6, floors: 2, chimneyX: -0.85 },
  // A narrow butter-yellow house with a steep chocolate roof.
  { walls: '#fbe6b0', roof: '#7d5a45', door: '#4f86b8', chimney: '#a8705a', width: 2.5, depth: 2.6, wallHeight: 2.6, rise: 1.9, floors: 1, chimneyX: 0.55 },
];
const TRIM = '#fffaf2';

/** A window facing +Z, centred on the origin: lit glass in a frame with a cross of glazing bars and a sill. */
function houseWindow(w, h) {
  return {
    body: [
      part(box(w + 0.14, h + 0.14, 0.05), TRIM, { position: [0, 0, 0.005] }),
      part(box(w + 0.2, 0.06, 0.14), TRIM, { position: [0, -h / 2 - 0.09, 0.05] }),
      part(box(0.05, h, 0.03), TRIM, { position: [0, 0, 0.05] }),
      part(box(w, 0.05, 0.03), TRIM, { position: [0, 0, 0.05] }),
    ],
    glow: [part(box(w, h, 0.06), COLOURS.windowGlow, { position: [0, 0, 0.02] })],
  };
}

/** The roof's slabs are this thick (m). */
const ROOF_SLAB = 0.16;

/** A chimney's cap: how high above the roof's top its centre is, and how thick it is (m). */
const CHIMNEY_CAP = Object.freeze({ UP: 0.68, THICK: 0.09 });

/** The snow on a cottage's roof is this thick (m). */
const ROOF_SNOW = 0.13;

/** Where a house's chimney stands: its x and z, and the height (m) of the roof under it, from the look of the house. */
function chimneyOf(look) {
  const { width: W, depth: D, wallHeight: H, rise: R, chimneyX } = look;
  return { x: chimneyX, z: -D / 4, roofTop: H + R * (1 - Math.abs(chimneyX) / (W / 2)) + ROOF_SLAB };
}

/**
 * Where the smoke leaves a prop's chimney, in the prop's own frame: [x, y, z] the middle of the top of its chimney
 * cap, or null for a prop with no chimney (every type but the houses and the snowy cottages). It agrees with the
 * geometry from `createPropGeometry`, so a prop placed at a spot with a turn and a scale (dressing.js) has its
 * chimney top at that same transform of this point.
 * @param {string} type
 * @param {number} [variant]
 * @returns {[number, number, number]|null}
 */
export function chimneyTop(type, variant = 0) {
  if (type !== 'house' && type !== 'cottage_snowy') return null;
  const look = HOUSES[variant];
  if (!look) throw new RangeError(`chimneyTop: ${type} has no variant ${String(variant)} (it has ${HOUSES.length})`);
  const { x, z, roofTop } = chimneyOf(look);
  return [x, roofTop + CHIMNEY_CAP.UP + CHIMNEY_CAP.THICK / 2, z];
}

/**
 * A house facing +Z: walls, a gable roof, a chimney, a door with a step and an awning, and lit windows. With `snowy`,
 * a white cap of snow lies on both sides of the roof and along its ridge, and the window boxes are bare.
 */
function house(variant, rng, snowy = false) {
  const look = HOUSES[variant];
  const { width: W, depth: D, wallHeight: H, rise: R } = look;
  const body = [], glow = [];
  const add = (unit, transform) => {
    body.push(...moveParts(unit.body, transform));
    glow.push(...moveParts(unit.glow, transform));
  };

  body.push(part(box(W, H, D), look.walls, { position: [0, H / 2, 0] }));
  // The gable: a three-sided cylinder lying along Z with one edge up is a triangular prism.
  body.push(part(cylinder(1, 1, D, 3), look.walls, { position: [0, H + R / 3, 0], rotation: [-Math.PI / 2, 0, 0], scale: [W / Math.sqrt(3), 1, R / 1.5] }));

  // The roof: two slabs from the eaves to the ridge, overhanging all round, and a ridge cap.
  const SLAB = ROOF_SLAB, EAVE = 0.28, OVERHANG = 0.3;
  const slope = Math.hypot(W / 2, R);
  const angle = Math.atan2(R, W / 2);
  for (const side of [-1, 1]) {
    // Down the slope from the ridge (s = 0) to the eave (s = slope); the slab runs from s = -SLAB / 2 to slope + EAVE.
    const s = (slope + EAVE - SLAB / 2) / 2;
    const x = side * (s * Math.cos(angle) + (SLAB / 2) * Math.sin(angle));
    const y = H + R - s * Math.sin(angle) + (SLAB / 2) * Math.cos(angle);
    body.push(part(box(slope + EAVE + SLAB / 2, SLAB, D + 2 * OVERHANG), jitterColor(look.roof, rng, 0.03), { position: [x, y, 0], rotation: [0, 0, -side * angle] }));
    if (snowy) {
      // The same slab again, lying on the roof (up its normal) a little narrower, so a rim of roof shows at the gables.
      const lift = SLAB / 2 + ROOF_SNOW / 2;
      body.push(part(box(slope + EAVE + SLAB / 2, ROOF_SNOW, D + 2 * OVERHANG - 0.1), COLOURS.roofSnow, {
        position: [x + side * Math.sin(angle) * lift, y + Math.cos(angle) * lift, 0],
        rotation: [0, 0, -side * angle],
      }));
    }
  }
  body.push(part(box(0.2, 0.12, D + 2 * OVERHANG + 0.02), look.roof, { position: [0, H + R + SLAB * 0.9, 0] }));
  if (snowy) body.push(part(box(0.34, 0.17, D + 2 * OVERHANG - 0.06), COLOURS.roofSnow, { position: [0, H + R + SLAB * 0.9 + 0.08, 0] }));

  // The chimney stands on the roof towards the back.
  const chimney = chimneyOf(look);
  body.push(part(box(0.42, 1.0, 0.42), look.chimney, { position: [chimney.x, chimney.roofTop + 0.15, chimney.z] }));
  body.push(part(box(0.52, CHIMNEY_CAP.THICK, 0.52), '#8a5a4e', { position: [chimney.x, chimney.roofTop + CHIMNEY_CAP.UP, chimney.z] }));

  // The door, its knob, a step and a little awning.
  const front = D / 2;
  body.push(
    part(box(0.66, 1.2, 0.08), look.door, { position: [0, 0.6, front + 0.02] }),
    part(sphere(0.035, 4, 3), '#f2c14e', { position: [0.2, 0.62, front + 0.07] }),
    part(box(0.95, 0.1, 0.32), '#d8d2c8', { position: [0, 0.05, front + 0.16] }),
    part(box(0.95, 0.07, 0.38), look.roof, { position: [0, 1.38, front + 0.17], rotation: [0.25, 0, 0] }),
  );

  // Windows: either side of the door, a second row upstairs, one on each side wall and a round one in the gable.
  const low = 1.35, high = 2.85;
  const windowW = 0.55, windowH = 0.62;
  const frontX = Math.min(0.95, W / 2 - 0.5);
  for (const x of [-frontX, frontX]) add(houseWindow(windowW, windowH), { position: [x, low, front] });
  if (look.floors === 2) for (const x of [-frontX, 0, frontX]) add(houseWindow(windowW, windowH), { position: [x, high, front] });
  for (const side of [-1, 1]) {
    const turned = { rotation: [0, (side * Math.PI) / 2, 0] };
    add(houseWindow(windowW, windowH), { ...turned, position: [side * (W / 2), low, 0] });
    if (look.floors === 2) add(houseWindow(windowW, windowH), { ...turned, position: [side * (W / 2), high, 0] });
  }
  const facing = [Math.PI / 2, 0, 0]; // a cylinder turned to face +Z
  const gableY = H + R * 0.36;
  body.push(part(cylinder(0.27, 0.27, 0.05, 8), TRIM, { position: [0, gableY, front + 0.005], rotation: facing }));
  glow.push(part(cylinder(0.2, 0.2, 0.06, 8), COLOURS.windowGlow, { position: [0, gableY, front + 0.02], rotation: facing }));

  if (look.windowBoxes) {
    for (const x of [-frontX, frontX]) {
      const y = low - windowH / 2 - 0.2;
      body.push(part(box(windowW + 0.1, 0.14, 0.16), COLOURS.wood, { position: [x, y, front + 0.1] }));
      // Nothing blooms under the snow.
      if (snowy) continue;
      for (let i = 0; i < 3; i++) {
        body.push(part(blob(0.065, 0), ['#ff7aa2', '#ffffff', '#ff5c7a'][i], { position: [x + (i - 1) * 0.2, y + 0.1, front + 0.12] }));
      }
    }
  }
  return { body, glow };
}

/** An old-fashioned street lamp: a tapered post with a ladder bar, under a four-paned lantern and its little roof. */
function lampPost() {
  const { iron } = COLOURS;
  const quarter = [0, Math.PI / 4, 0]; // turns a four-sided cylinder so that its faces look along the axes
  const glassBottom = 2.95, glassTop = 3.33;
  const body = [
    part(cylinder(0.17, 0.23, 0.34), iron, { position: [0, 0.17, 0] }),
    part(cylinder(0.06, 0.08, 2.6), iron, { position: [0, 1.64, 0] }),
    part(box(0.5, 0.05, 0.05), iron, { position: [0, 2.6, 0] }),
    part(cylinder(0.13, 0.09, 0.1, 4), iron, { position: [0, glassBottom - 0.05, 0], rotation: quarter }),
    pyramid(0.5, 0.26, 0.5, iron, [0, glassTop, 0]),
    part(sphere(0.055, 5, 4), iron, { position: [0, glassTop + 0.29, 0] }),
  ];
  // Thin bars up the lantern's four corners.
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    body.push(rod([sx * 0.11, glassBottom, sz * 0.11], [sx * 0.16, glassTop, sz * 0.16], 0.016, 0.016, iron, 3));
  }
  const glow = [part(cylinder(0.22, 0.15, glassTop - glassBottom, 4), COLOURS.lampGlow, { position: [0, (glassBottom + glassTop) / 2, 0], rotation: quarter })];
  return { body, glow };
}

/** A park bench facing +Z: wooden slats on cast-iron ends. */
function bench() {
  const { wood, woodDark, iron } = COLOURS;
  const parts = [
    part(box(1.6, 0.05, 0.13), wood, { position: [0, 0.46, 0.14] }),
    part(box(1.6, 0.05, 0.13), woodDark, { position: [0, 0.46, -0.01] }),
    part(box(1.6, 0.05, 0.13), wood, { position: [0, 0.46, -0.16] }),
    part(box(1.6, 0.12, 0.04), wood, { position: [0, 0.66, -0.26], rotation: [-0.18, 0, 0] }),
    part(box(1.6, 0.12, 0.04), woodDark, { position: [0, 0.84, -0.295], rotation: [-0.18, 0, 0] }),
  ];
  for (const x of [-0.7, 0.7]) {
    parts.push(
      part(box(0.06, 0.46, 0.06), iron, { position: [x, 0.23, 0.17] }),
      rod([x, 0, -0.2], [x, 0.95, -0.34], 0.03, 0.03, iron, 4),
      part(box(0.06, 0.05, 0.5), iron, { position: [x, 0.64, -0.03] }),
    );
  }
  return parts;
}

/** A fence's two posts: how far either side of its middle they stand, how tall they are and their caps' height (m). */
const FENCE_POST = Object.freeze({ X: 1.25, HEIGHT: 1.0, CAP: 0.12 });

/** A section of picket fence along X: two posts, two rails behind, six pointed pickets in front. */
function fence() {
  const post = '#a5734a', picket = '#c79560';
  const { X, HEIGHT, CAP } = FENCE_POST;
  const parts = [];
  for (const x of [-X, X]) {
    parts.push(part(box(0.13, HEIGHT, 0.13), post, { position: [x, HEIGHT / 2, 0] }), pyramid(0.15, CAP, 0.15, post, [x, HEIGHT, 0]));
  }
  for (const y of [0.33, 0.72]) parts.push(part(box(2.5, 0.08, 0.05), post, { position: [0, y, -0.06] }));
  for (let i = 0; i < 6; i++) {
    const x = -1.0 + i * 0.4;
    parts.push(part(box(0.14, 0.76, 0.04), picket, { position: [x, 0.42, 0] }), pyramid(0.14, 0.13, 0.04, picket, [x, 0.8, 0]));
  }
  return parts;
}

/** The top of an icosahedron (geo's `blob` at detail 0) of radius 1 is this far above its middle: two of its corners. */
const BLOB_TOP = 0.8507;

/**
 * Where a little bird may perch on a prop, in the prop's own frame: a list of [x, y, z] points for its feet, on the
 * caps of a fence's two posts and on the bobble of the snowman's hat, or [] for a prop with none. Like chimneyTop, it
 * agrees with the geometry from `createPropGeometry`, so a prop placed with a turn and a scale (dressing.js) has its
 * perches at that same transform of these points.
 * @param {string} type
 * @returns {Array<[number, number, number]>}
 */
export function perchTops(type) {
  if (type === 'fence') {
    const { X, HEIGHT, CAP } = FENCE_POST;
    return [-X, X].map((x) => [x, HEIGHT + CAP / 2, 0]);
  }
  if (type === 'snowman') {
    const top = new Vector3(BOBBLE.AT[0], BOBBLE.AT[1] + BLOB_TOP * BOBBLE.RADIUS, BOBBLE.AT[2])
      .applyEuler(new Euler(...SNOWMAN_HEAD.rotation))
      .add(new Vector3(...SNOWMAN_HEAD.position));
    return [top.toArray()];
  }
  return [];
}

// ------------------------------------------------------------------------------------------------

/** Each type's builder: (variant, rng) => parts, or { body, glow } for the types that glow. */
const BUILDERS = {
  tree_round: (v, rng) => roundTree(rng, COLOURS.leaves),
  tree_autumn: (v, rng) => [roundTree, tallTree, birch][v](rng, COLOURS.autumnLeaves[v]),
  pine: (v, rng) => pine(rng, COLOURS.needles, false),
  pine_snowy: (v, rng) => pine(rng, COLOURS.needlesSnowy, true),
  palm: (v, rng) => palm(rng),
  bush: (v, rng) => bush(rng, COLOURS.bushLeaves, COLOURS.blossom),
  bush_autumn: (v, rng) => bush(rng, COLOURS.bushAutumn, null),
  rock: (v, rng) => rocks(rng, false),
  rock_snowy: (v, rng) => rocks(rng, true),
  flower_patch: (v, rng) => flowerPatch(v, rng),
  grass_tuft: (v, rng) => grassTuft(rng),
  balloon_cluster: (v) => balloonCluster(v),
  beach_ball: () => beachBall(),
  umbrella: () => umbrella(),
  pumpkin: (v, rng) => pumpkin(rng),
  hay_bale: () => hayBale(),
  snowman: () => snowman(),
  house: (v, rng) => house(v, rng),
  cottage_snowy: (v, rng) => house(v, rng, true),
  lamp_post: () => lampPost(),
  bench: () => bench(),
  fence: () => fence(),
};

/** A fixed seed for each type and variant (FNV-1a of 'type#variant'). */
function seedOf(type, variant) {
  let hash = 2166136261;
  for (const ch of `${type}#${variant}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/**
 * The geometry of one prop.
 * @param {string} type  one of PROP_TYPES
 * @param {number} [variant]  0 up to PROP_VARIANTS[type] (1 for types not listed there), exclusive
 * @returns {{ body: import('../three.js').BufferGeometry, glow: import('../three.js').BufferGeometry|null }}
 *   Fresh geometries every call, never shared, so the caller owns them. Both come from geo.js `mergeParts`;
 *   `glow` is non-null for lamp_post, house and cottage_snowy only.
 */
export function createPropGeometry(type, variant = 0) {
  if (!PROP_TYPES.includes(type)) throw new Error(`createPropGeometry: "${type}" is not a prop type`);
  const variants = PROP_VARIANTS[type] ?? 1;
  if (!Number.isInteger(variant) || variant < 0 || variant >= variants) {
    throw new RangeError(`createPropGeometry: ${type} has no variant ${String(variant)} (it has ${variants})`);
  }
  const built = BUILDERS[type](variant, createRng(seedOf(type, variant)));
  const { body, glow = [] } = Array.isArray(built) ? { body: built } : built;
  const bodyGeometry = mergeParts(body);
  const glowGeometry = glow.length > 0 ? mergeParts(glow) : null;
  // Stand the prop on the ground: its lowest point exactly at y = 0, the glow moved with it.
  const lift = -bodyGeometry.boundingBox.min.y;
  bodyGeometry.translate(0, lift, 0);
  if (glowGeometry) glowGeometry.translate(0, lift, 0);
  return { body: bodyGeometry, glow: glowGeometry };
}
