// The little train seen from outside, for the finale (finale.js): a cute steam locomotive and the open carriage
// she has been riding in, painted in the cabin's colours (cabin.js CABIN_COLOURS).
//
// The carriage is the one her first-person cabin belongs to: wooden sides over a red skirt with a cream stripe,
// turned pillars holding a red roof, bunting under the eaves, two benches inside, the flower pot and the lantern
// on its front ledge, and an open door on the right, where she steps out onto the platform. The locomotive ahead
// of it has a cab with warm lit windows, a red boiler with gold bands, a tall chimney, a gold dome, a headlamp
// and three pairs of wheels joined by gold rods.
//
// It is built in the train's own frame: the origin is on the ground at the middle of the track under her seat,
// +X is right of the track, +Y up and -Z ahead (the locomotive runs from 1.5 to 6 m ahead of her seat, the
// carriage from 1.2 m ahead of it to 2.5 m behind). Three draw calls: the lit body, what glows (lantern, headlamp,
// cab windows) and the soft halos round the lamps.
//
// Pure and DOM-free (only Three's classes are used), so the Node unit tests can import it.

import {
  BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry,
  Mesh, Points, SphereGeometry, TorusGeometry,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, moveParts, part } from '../util/geo.js';
import { CABIN_COLOURS as C } from './cabin.js';

/** Where the carriage and the locomotive are along the train (m, local z; ahead is -Z). */
export const EXTERIOR = Object.freeze({
  CARRIAGE: [-1.2, 2.5], LOCO: [-6, -1.5],
  FLOOR: 0.9,          // the carriage floor's top, where she stands
  HALF_WIDTH: 1.2,     // the carriage's sides
  DOOR: [-0.85, 0.05], // the open doorway in the right side (local z)
});

/** The rails' top (m): the wheels stand on it (world/trackMesh.js: bed 0.1, sleepers 0.1, rails 0.12). */
const RAIL_TOP = 0.32;
const RAIL_HALF_GAUGE = 0.75;

/** The carriage's waist (the top of its wooden sides), its roof's underside and its skirt's bottom (m). */
const WAIST = 1.5;
const ROOF = 2.72;
const SKIRT = 0.78;

const box = (w, h, d) => new BoxGeometry(w, h, d);
const cyl = (top, bottom, height, sides = 12) => new CylinderGeometry(top, bottom, height, sides);

/** A box from (x0, y0, z0) to (x1, y1, z1), coloured. */
function slab(x0, x1, y0, y1, z0, z1, colour) {
  return part(box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), colour, {
    position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
  });
}

/** A wheel standing on the rail at (x, z), its face turned out, with a gold hub; `r` is its radius. */
function wheel(x, z, r) {
  const out = Math.sign(x);
  const y = RAIL_TOP + r;
  return [
    part(cyl(r, r, 0.1, 14), C.ink, { position: [x, y, z], rotation: [0, 0, Math.PI / 2] }),
    part(cyl(r * 0.78, r * 0.78, 0.11, 14), C.trim, { position: [x + out * 0.005, y, z], rotation: [0, 0, Math.PI / 2] }),
    part(cyl(r * 0.28, r * 0.28, 0.14, 8), C.gold, { position: [x + out * 0.02, y, z], rotation: [0, 0, Math.PI / 2] }),
  ];
}

/** A flag of bunting: a downward triangle `w` wide and `h` tall hanging from its top edge at the origin, seen from both sides. */
function flagGeometry(w, h) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([
    -w / 2, 0, 0, 0, -h, 0, w / 2, 0, 0,
    w / 2, 0, 0, 0, -h, 0, -w / 2, 0, 0,
  ], 3));
  return g;
}

/** A string of bunting along z from z0 to z1 at (x, y), sagging a little, its flags turned to face across the train. */
function bunting(x, y, z0, z1) {
  const parts = [];
  const flag = flagGeometry(0.15, 0.18);
  const count = Math.round(Math.abs(z1 - z0) / 0.24);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const sag = 0.1 * 4 * t * (1 - t);
    parts.push(part(flag, C.flags[i % C.flags.length], { position: [x, y - sag, z0 + (z1 - z0) * t], rotation: [0, Math.PI / 2, 0] }));
  }
  for (let i = 0; i < 12; i++) {
    const t0 = i / 12, t1 = (i + 1) / 12;
    const za = z0 + (z1 - z0) * t0, zb = z0 + (z1 - z0) * t1;
    const ya = y - 0.4 * t0 * (1 - t0), yb = y - 0.4 * t1 * (1 - t1);
    parts.push(part(box(0.012, 0.012, Math.hypot(zb - za, yb - ya)), C.ink, {
      position: [x, (ya + yb) / 2, (za + zb) / 2], rotation: [Math.atan2(ya - yb, zb - za), 0, 0],
    }));
  }
  return parts;
}

/** The open carriage round her seat. Returns its lit parts, its glowing parts and where its lamp glows. */
function carriage() {
  const [front, back] = EXTERIOR.CARRIAGE;
  const W = EXTERIOR.HALF_WIDTH;
  const [doorFront, doorBack] = EXTERIOR.DOOR;
  const mid = (front + back) / 2;
  const length = back - front;
  const parts = [];
  const glow = [];

  // Underframe, floor and wheels.
  parts.push(slab(-0.6, 0.6, 0.6, SKIRT, front + 0.15, back - 0.15, C.ink));
  parts.push(slab(-W, W, SKIRT, EXTERIOR.FLOOR, front, back, C.floor));
  for (const z of [front + 0.6, back - 0.6]) for (const x of [-RAIL_HALF_GAUGE - 0.03, RAIL_HALF_GAUGE + 0.03]) parts.push(...wheel(x, z, 0.24));

  // The sides: a red skirt, a cream stripe, wooden panelling up to the waist rail. The right side leaves the doorway open.
  const sideRuns = { left: [[front, back]], right: [[front, doorFront], [doorBack, back]] };
  for (const [name, runs] of Object.entries(sideRuns)) {
    const s = name === 'left' ? -1 : 1;
    for (const [z0, z1] of runs) {
      parts.push(slab(s * (W - 0.07), s * W, SKIRT - 0.04, 1.06, z0, z1, C.panel));
      parts.push(slab(s * (W - 0.065), s * (W + 0.012), 1.06, 1.12, z0, z1, C.cream));
      parts.push(slab(s * (W - 0.07), s * W, 1.12, WAIST, z0, z1, C.wood));
      parts.push(slab(s * (W - 0.09), s * (W + 0.03), WAIST, WAIST + 0.07, z0 - 0.03, z1 + 0.03, C.trim));
      parts.push(slab(s * (W - 0.06), s * (W + 0.01), SKIRT - 0.06, SKIRT, z0, z1, C.gold));
      // Panel lines in the wood.
      for (let z = z0 + 0.42; z < z1 - 0.2; z += 0.42) parts.push(slab(s * W, s * (W + 0.015), 1.16, WAIST - 0.04, z - 0.02, z + 0.02, C.trim));
    }
  }
  for (const z of [front, back]) {
    const inward = z === front ? 1 : -1;
    parts.push(slab(-W, W, SKIRT - 0.04, 1.06, z, z + inward * 0.07, C.panel));
    parts.push(slab(-W - 0.012, W + 0.012, 1.06, 1.12, z - inward * 0.012, z + inward * 0.065, C.cream));
    parts.push(slab(-W, W, 1.12, WAIST, z, z + inward * 0.07, C.wood));
    parts.push(slab(-W - 0.03, W + 0.03, WAIST, WAIST + 0.07, z - inward * 0.03, z + inward * 0.09, C.trim));
  }

  // The door, swung open forwards against the side, and a step under the doorway.
  const leaf = [
    slab(0, 0.05, SKIRT, 1.06, 0, 0.84, C.panel),
    slab(-0.005, 0.055, 1.06, 1.12, 0, 0.84, C.cream),
    slab(0, 0.05, 1.12, WAIST - 0.02, 0, 0.84, C.wood),
    part(new IcosahedronGeometry(0.035, 0), C.gold, { position: [0.06, 1.2, 0.72] }),
  ];
  parts.push(...moveParts(leaf, { position: [W, 0, doorFront], rotation: [0, Math.PI * 0.62, 0] }));
  parts.push(slab(W - 0.05, W + 0.32, 0.58, 0.64, doorFront + 0.05, doorBack - 0.05, C.trim));
  parts.push(slab(W - 0.02, W + 0.3, 0.64, 0.66, doorFront + 0.08, doorBack - 0.08, C.gold));

  // Pillars with gold rings, holding the roof.
  const pillars = [[-W + 0.05, front + 0.05], [W - 0.05, front + 0.05], [-W + 0.05, back - 0.05], [W - 0.05, back - 0.05],
    [W - 0.05, doorFront], [W - 0.05, doorBack], [-W + 0.05, mid]];
  for (const [x, z] of pillars) {
    parts.push(part(cyl(0.05, 0.06, ROOF - WAIST, 8), C.trim, { position: [x, (ROOF + WAIST) / 2, z] }));
    for (const y of [WAIST + 0.12, ROOF - 0.1]) parts.push(part(cyl(0.075, 0.075, 0.04, 8), C.gold, { position: [x, y, z] }));
  }

  // The roof: a wooden ceiling, a shallow red gable with a cream fascia, and bunting under both eaves.
  const eave = W + 0.16;
  parts.push(slab(-eave, eave, ROOF, ROOF + 0.06, front - 0.14, back + 0.14, C.wood));
  const pitch = 0.2;
  const half = eave + 0.02;
  for (const s of [-1, 1]) {
    parts.push(part(box(half / Math.cos(pitch), 0.08, length + 0.36), C.lanternRoof, {
      position: [(s * half) / 2, ROOF + 0.1 + (Math.tan(pitch) * half) / 2, mid],
      rotation: [0, 0, -s * pitch],
    }));
    parts.push(slab(s * (eave - 0.02), s * (eave + 0.02), ROOF - 0.08, ROOF + 0.08, front - 0.16, back + 0.16, C.cream));
    parts.push(...bunting(s * (eave - 0.03), ROOF - 0.08, front - 0.05, back + 0.05));
  }
  parts.push(part(cyl(0.05, 0.05, length + 0.4, 8), C.gold, { position: [0, ROOF + 0.12 + Math.tan(pitch) * half, mid], rotation: [Math.PI / 2, 0, 0] }));

  // Benches facing forward: hers at the seat, and one behind. The right side is an aisle to the door.
  for (const z of [0, 1.45]) {
    parts.push(slab(-W + 0.08, 0.55, 1.3, 1.36, z, z + 0.46, C.wood));
    parts.push(slab(-W + 0.08, 0.55, 1.36, 1.86, z + 0.46, z + 0.52, C.wood));
    parts.push(slab(-W + 0.08, 0.55, 1.86, 1.9, z + 0.44, z + 0.54, C.trim));
    for (const x of [-W + 0.15, 0.48]) parts.push(slab(x - 0.04, x + 0.04, EXTERIOR.FLOOR, 1.3, z + 0.05, z + 0.41, C.trim));
  }

  // On the front ledge: the pot of pink flowers on the left and the lantern on the right, as in her cabin.
  const ledgeZ = front + 0.1;
  parts.push(slab(-W + 0.07, W - 0.07, WAIST - 0.02, WAIST + 0.04, front + 0.07, front + 0.32, C.wood));
  parts.push(part(cyl(0.11, 0.08, 0.16, 9), C.pot, { position: [-0.75, WAIST + 0.12, ledgeZ + 0.1] }));
  parts.push(part(cyl(0.125, 0.12, 0.04, 9), C.potRim, { position: [-0.75, WAIST + 0.2, ledgeZ + 0.1] }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.08;
    parts.push(part(new IcosahedronGeometry(0.06, 0), C.petals[i % C.petals.length], {
      position: [-0.75 + Math.cos(a) * r, WAIST + 0.3 + (i === 0 ? 0.05 : 0), ledgeZ + 0.1 + Math.sin(a) * r],
    }));
  }
  const lantern = [0.82, WAIST + 0.22, ledgeZ + 0.1];
  parts.push(slab(0.72, 0.92, WAIST + 0.04, WAIST + 0.07, ledgeZ, ledgeZ + 0.2, C.lanternFrame));
  for (const dx of [-0.08, 0.08]) for (const dz of [-0.08, 0.08]) {
    parts.push(slab(lantern[0] + dx - 0.012, lantern[0] + dx + 0.012, WAIST + 0.07, WAIST + 0.33, lantern[2] + dz - 0.012, lantern[2] + dz + 0.012, C.lanternFrame));
  }
  parts.push(part(new ConeGeometry(0.16, 0.12, 4), C.lanternRoof, { position: [lantern[0], WAIST + 0.39, lantern[2]], rotation: [0, Math.PI / 4, 0] }));
  glow.push(part(new IcosahedronGeometry(0.07, 1), C.bulb, { position: lantern }));
  return { parts, glow, lamps: [lantern] };
}

/** The locomotive ahead of the carriage. Returns its lit parts, its glowing parts and where its headlamp glows. */
function locomotive() {
  const [nose, rear] = EXTERIOR.LOCO;
  const parts = [];
  const glow = [];
  const CAB_FRONT = rear - 1.45;
  const BOILER_FRONT = nose + 0.55;
  const BOILER_Y = 1.62;
  const BOILER_R = 0.6;
  const DECK = 1.0;

  // Frame, footplate and wheels: three gold-hubbed drivers a side, joined by a gold rod.
  parts.push(slab(-0.55, 0.55, 0.5, DECK - 0.04, nose + 0.15, rear - 0.05, C.ink));
  parts.push(slab(-1.05, 1.05, DECK - 0.04, DECK, nose + 0.1, rear, C.trim));
  parts.push(slab(-1.07, 1.07, DECK - 0.1, DECK - 0.04, nose + 0.1, rear, C.panel));
  const drivers = [CAB_FRONT + 0.1, CAB_FRONT - 0.85, CAB_FRONT - 1.8];
  for (const s of [-1, 1]) {
    for (const z of drivers) parts.push(...wheel(s * (RAIL_HALF_GAUGE + 0.04), z, 0.32));
    parts.push(slab(s * 0.86, s * 0.9, RAIL_TOP + 0.22, RAIL_TOP + 0.3, drivers[2], drivers[0], C.gold));
  }
  // Buffer beam, buffers and a little cowcatcher at the nose.
  parts.push(slab(-1.0, 1.0, 0.6, 1.0, nose + 0.05, nose + 0.2, C.panel));
  for (const s of [-1, 1]) {
    parts.push(part(cyl(0.08, 0.08, 0.16, 8), C.gold, { position: [s * 0.65, 0.8, nose + 0.08], rotation: [Math.PI / 2, 0, 0] }));
  }
  parts.push(part(box(1.6, 0.05, 0.5), C.gold, { position: [0, 0.52, nose + 0.22], rotation: [-0.9, 0, 0] }));

  // The boiler with gold bands, the smokebox, a chimney, a gold dome and the headlamp.
  const boilerLength = CAB_FRONT - BOILER_FRONT;
  parts.push(part(cyl(BOILER_R, BOILER_R, boilerLength, 16), C.panel, {
    position: [0, BOILER_Y, (CAB_FRONT + BOILER_FRONT) / 2], rotation: [Math.PI / 2, 0, 0],
  }));
  for (let i = 1; i <= 3; i++) {
    const z = CAB_FRONT - (boilerLength * i) / 4;
    parts.push(part(cyl(BOILER_R + 0.025, BOILER_R + 0.025, 0.07, 16), C.gold, { position: [0, BOILER_Y, z], rotation: [Math.PI / 2, 0, 0] }));
  }
  parts.push(part(cyl(BOILER_R + 0.03, BOILER_R + 0.03, 0.45, 16), C.ink, {
    position: [0, BOILER_Y, BOILER_FRONT - 0.2], rotation: [Math.PI / 2, 0, 0],
  }));
  parts.push(part(new TorusGeometry(BOILER_R - 0.02, 0.045, 6, 18), C.gold, { position: [0, BOILER_Y, BOILER_FRONT - 0.43] }));
  parts.push(part(cyl(0.18, 0.18, 0.06, 10), C.gold, { position: [0, BOILER_Y, BOILER_FRONT - 0.44], rotation: [Math.PI / 2, 0, 0] }));
  const chimneyZ = BOILER_FRONT + 0.05;
  parts.push(part(cyl(0.13, 0.15, 0.5, 10), C.ink, { position: [0, BOILER_Y + BOILER_R + 0.15, chimneyZ] }));
  parts.push(part(cyl(0.24, 0.14, 0.24, 10), C.ink, { position: [0, BOILER_Y + BOILER_R + 0.5, chimneyZ] }));
  parts.push(part(cyl(0.25, 0.25, 0.04, 10), C.gold, { position: [0, BOILER_Y + BOILER_R + 0.62, chimneyZ] }));
  const domeZ = (CAB_FRONT + BOILER_FRONT) / 2 + 0.1;
  parts.push(part(cyl(0.2, 0.24, 0.22, 10), C.gold, { position: [0, BOILER_Y + BOILER_R + 0.05, domeZ] }));
  parts.push(part(new SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), C.gold, { position: [0, BOILER_Y + BOILER_R + 0.16, domeZ] }));
  const headlamp = [0, BOILER_Y + BOILER_R + 0.12, BOILER_FRONT - 0.5];
  parts.push(slab(-0.13, 0.13, headlamp[1] - 0.14, headlamp[1] + 0.12, headlamp[2] + 0.02, headlamp[2] + 0.24, C.ink));
  parts.push(part(cyl(0.1, 0.1, 0.05, 8), C.gold, { position: [headlamp[0], headlamp[1], headlamp[2] + 0.02], rotation: [Math.PI / 2, 0, 0] }));
  glow.push(part(new IcosahedronGeometry(0.075, 1), C.bulb, { position: headlamp }));

  // The cab: red below, wood above, cream-framed windows that glow warm, and a red roof.
  const CAB_TOP = 2.45;
  const W = 0.95;
  parts.push(slab(-W, W, DECK, 1.32, CAB_FRONT, rear, C.panel));
  parts.push(slab(-W - 0.01, W + 0.01, 1.32, 1.38, CAB_FRONT - 0.01, rear + 0.01, C.cream));
  // Wood walls, leaving room for the windows (side windows from 1.62 to 2.12 high).
  const WIN = [1.62, 2.12];
  for (const s of [-1, 1]) {
    parts.push(slab(s * (W - 0.07), s * W, 1.38, WIN[0], CAB_FRONT, rear, C.wood));
    parts.push(slab(s * (W - 0.07), s * W, WIN[1], CAB_TOP, CAB_FRONT, rear, C.wood));
    parts.push(slab(s * (W - 0.07), s * W, WIN[0], WIN[1], CAB_FRONT, CAB_FRONT + 0.25, C.wood));
    parts.push(slab(s * (W - 0.07), s * W, WIN[0], WIN[1], rear - 0.25, rear, C.wood));
    parts.push(slab(s * (W - 0.02), s * (W + 0.02), WIN[0] - 0.04, WIN[1] + 0.04, CAB_FRONT + 0.21, rear - 0.21, C.cream));
    glow.push(slab(s * (W - 0.03), s * (W + 0.03), WIN[0], WIN[1], CAB_FRONT + 0.25, rear - 0.25, '#ffd98a'));
  }
  // The back wall faces the carriage, with a window she could see through from her seat.
  parts.push(slab(-W, W, 1.38, CAB_TOP, rear - 0.07, rear, C.wood));
  parts.push(slab(-0.42, 0.42, 1.68, 2.18, rear + 0.002, rear + 0.03, C.cream));
  glow.push(slab(-0.35, 0.35, 1.74, 2.12, rear + 0.01, rear + 0.04, '#ffd98a'));
  parts.push(slab(-W, W, 1.38, CAB_TOP, CAB_FRONT, CAB_FRONT + 0.07, C.wood));
  parts.push(slab(-W - 0.14, W + 0.14, CAB_TOP, CAB_TOP + 0.08, CAB_FRONT - 0.14, rear + 0.14, C.lanternRoof));
  parts.push(slab(-W - 0.15, W + 0.15, CAB_TOP - 0.04, CAB_TOP + 0.02, CAB_FRONT - 0.15, rear + 0.15, C.cream));
  parts.push(slab(-W + 0.1, W - 0.1, CAB_TOP + 0.08, CAB_TOP + 0.16, CAB_FRONT, rear, C.lanternRoof));

  // The coupling to the carriage.
  parts.push(slab(-0.12, 0.12, 0.66, 0.78, rear - 0.05, EXTERIOR.CARRIAGE[0] + 0.05, C.ink));
  return { parts, glow, lamps: [headlamp] };
}

/**
 * The train, seen from outside.
 * @returns {Group}  in the train's frame (see the header); place it at `path.frameAt(d, 0, 0)` facing along the
 *   track. Its meshes are named 'train-body', 'train-glow' and 'train-halos'.
 */
export function createTrainExterior() {
  const group = new Group();
  group.name = 'train-exterior';
  const car = carriage();
  const loco = locomotive();

  const body = new Mesh(mergeParts([...car.parts, ...loco.parts]), MATERIALS.solid);
  body.name = 'train-body';
  body.castShadow = true;
  body.receiveShadow = true;
  const glow = new Mesh(mergeParts([...car.glow, ...loco.glow]), MATERIALS.glow);
  glow.name = 'train-glow';
  const halos = new Points(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute([...car.lamps, ...loco.lamps].flat(), 3)),
    MATERIALS.halo,
  );
  halos.name = 'train-halos';
  halos.geometry.computeBoundingSphere();
  group.add(body, glow, halos);
  return group;
}
