// The deer at the forest's edge in autumn: two of them, out among the trees a little way from the track, one on her right
// and then one on her left, standing broadside to the train with their heads down, who lift their heads as it comes by.
//
// Each deer is two meshes, low-poly and flat-coloured like the props (util/geo.js), on the shared solid material: its
// body (a warm brown, with a pale belly and rump, four legs and a short tail) and its head with its neck, whose origin
// is the withers, where the neck joins the body, so that turning the mesh about X lifts the head. Standing, the neck
// carries the head low and relaxed; at the top of the lift (DEER.HEAD_UP) it is up and alert, looking at the train.
// The lift follows how far the train is from the deer (`deerHeadLift`), so a jump along the ride puts every head
// right again, and while it is down a deer nods a little as it grazes.
//
// They stand where the autumn's scenery is, DEER.SPOTS of the way through the autumn zone and OFFSET metres from the
// track, on the ground there (terrain.js `terrainHeight`, with the sea and the tunnel's hill where there are any). The
// hooves reach HOOF metres below the ground they stand on, which the coarse ground mesh and a slope under the four of
// them need, so no deer floats. A ride with no autumn has none. They are drawn only while the train is within RANGE
// metres of them, which is more than the fog lets her see.
//
// DOM-free at import, so the Node unit tests can import it.

import { ConeGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { envAt } from './environment.js';
import { terrainHeight } from './terrain.js';
import { tunnelSpan } from './tunnel.js';
import { mergeParts, part } from '../util/geo.js';
import { smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * SPOTS: where each deer stands, as a share of the autumn zone's length from its start. The sides alternate, the first
 * on the right (the track's right when the train faces ahead). OFFSET: how far out from the track (m), each deer
 * somewhere between these. HEAD_UP: how far (rad) the head and neck lift, turning about the withers.
 */
export const DEER = Object.freeze({
  SPOTS: Object.freeze([0.3, 0.7]),
  OFFSET: Object.freeze([14, 18]),
  HEAD_UP: 0.55,
});

/** The head starts to come up when the train is this far from the deer (m, along the track), and is fully up at NEAR. */
const LIFT = Object.freeze({ FAR: 35, NEAR: 12 });

/**
 * How the deer stand. TURN: how far (rad) round from facing back along the track, at the train coming, to facing the
 * track itself: broadside to her as she passes, with its head a little round to her. SIZE: how many times life size they
 * are drawn, so that one 15 m off reads as a deer on her phone. RANGE: drawn while the train is within this
 * far (m) of it. NOD and RATE: how far (rad) a deer's head nods as it grazes, and how fast (rad/s).
 */
const STAND = Object.freeze({ TURN: (12 * Math.PI) / 180, SIZE: 1.25, RANGE: 160, NOD: 0.06, RATE: 0.9 });

/** The hooves go this far (m) below the ground the deer is placed on: the ground under four hooves is not level (a slope of about 0.1 m). */
const HOOF = 0.12;

/** The same deer every ride. */
const SEED = 4417;

const TAU = Math.PI * 2;

/**
 * How far the train is from a deer (m, `along` positive when the deer is ahead): how far its head is up, from 0, down,
 * when the train is further than 35 m off, to 1, up, within 12 m. It stays up as the train passes, and after it.
 * @param {number} along
 * @returns {number}  0 to 1
 */
export function deerHeadLift(along) {
  if (!(along < LIFT.FAR)) return 0;
  return smoothstep(LIFT.FAR, LIFT.NEAR, along);
}

// ---------------------------------------------------------------------------------------------------------------
// The deer's shape
// ---------------------------------------------------------------------------------------------------------------

/** Colours (sRGB hex). */
const COLOURS = Object.freeze({
  coat: '#a0693a', legs: '#6e4526', belly: '#ead9b8', rump: '#f1e4c8', tail: '#f7f1e3', nose: '#2c2420', eye: '#1f1a18',
});

/**
 * Where the head turns, the withers (m, from the ground between the feet, the body's middle): the head mesh sits here.
 * The neck rises from there NECK.UP (rad) above the horizontal for NECK.LONG metres; the head carries on from its end
 * HEAD.DOWN (rad) lower than the neck, so a deer holding its head low is looking down and the lift brings its nose up.
 */
const WITHERS = Object.freeze([0, 0.96, 0.44]);
const NECK = Object.freeze({ UP: (28 * Math.PI) / 180, LONG: 0.42 });
const HEAD = Object.freeze({ DOWN: (40 * Math.PI) / 180 });

/** An ellipsoid of the given radii (m) at `at`, tipped `tip` rad about X (+ tips its +Z end down). */
const ellipsoid = (colour, radii, at, tip = 0, around = 8, down = 6) => part(new SphereGeometry(1, around, down), colour, { position: at, rotation: [tip, 0, 0], scale: radii });

/** The body: a deep chest and haunch, a pale belly and rump, four legs and a small tail, standing on y = 0 (the hooves HOOF under). */
function bodyGeometry() {
  const C = COLOURS;
  const leg = (x, z) => [
    part(new CylinderGeometry(0.065, 0.045, 0.36, 6), C.coat, { position: [x, 0.55, z] }),
    part(new CylinderGeometry(0.042, 0.028, 0.37 + HOOF, 6), C.legs, { position: [x, (0.37 - HOOF) / 2, z] }),
  ];
  return mergeParts([
    ellipsoid(C.coat, [0.22, 0.27, 0.62], [0, 0.8, 0], 0, 10, 7),
    ellipsoid(C.coat, [0.2, 0.28, 0.26], [0, 0.83, 0.38]),
    ellipsoid(C.coat, [0.21, 0.28, 0.28], [0, 0.83, -0.36]),
    ellipsoid(C.belly, [0.18, 0.15, 0.5], [0, 0.6, 0]),
    ellipsoid(C.rump, [0.17, 0.21, 0.1], [0, 0.83, -0.62]),
    ellipsoid(C.tail, [0.05, 0.11, 0.05], [0, 0.88, -0.72], -0.35),
    ...leg(0.11, 0.4), ...leg(-0.11, 0.4), ...leg(0.11, -0.36), ...leg(-0.11, -0.36),
  ]);
}

/** The neck and head, from the withers: a tapering neck, a long head with a dark nose, small eyes and two pricked ears. */
function headGeometry() {
  const C = COLOURS;
  // A point `long` metres from the withers along the neck, and along the head (which carries on from the neck's end).
  const neckDir = [0, Math.sin(NECK.UP), Math.cos(NECK.UP)];
  const headUp = NECK.UP - HEAD.DOWN;
  const headDir = [0, Math.sin(headUp), Math.cos(headUp)];
  const end = neckDir.map((v) => v * NECK.LONG);
  const along = (long) => end.map((v, i) => v + headDir[i] * long);
  const tip = -headUp; // the rotation about X that turns +Z to the head's direction
  const ear = (side) => {
    const [, y, z] = along(0.06);
    return part(new ConeGeometry(0.05, 0.2, 5), C.coat, { position: [side * 0.07, y + 0.1, z - 0.04], rotation: [-0.25, 0, side * -0.6] });
  };
  const eye = (side) => {
    const [, y, z] = along(0.1);
    return part(new SphereGeometry(0.014, 4, 3), C.eye, { position: [side * 0.066, y + 0.02, z] });
  };
  return mergeParts([
    part(new CylinderGeometry(0.065, 0.11, NECK.LONG, 6), C.coat, { position: neckDir.map((v) => v * NECK.LONG / 2), rotation: [Math.PI / 2 - NECK.UP, 0, 0] }),
    ellipsoid(C.coat, [0.075, 0.08, 0.13], along(0.08), tip),
    ellipsoid(C.coat, [0.046, 0.046, 0.08], along(0.2), tip, 6, 4),
    ellipsoid(C.nose, [0.032, 0.032, 0.032], along(0.27), tip, 5, 4),
    ear(1), ear(-1), eye(1), eye(-1),
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// The deer in the world
// ---------------------------------------------------------------------------------------------------------------

/**
 * The deer of the ride.
 * @param {{ layout: import('./layout.js').Layout, path: import('./trackPath.js').TrackPath }} options
 * @returns {{
 *   group: Group,
 *   update: (dt: number, d: number, time: number) => void,
 *   targets: object[],
 * }}
 *   Add `group` to the scene: a child for each deer (none without an autumn), named 'deer', with `userData` of its
 *   `distance` along the track and its `offset` from it (m, + to the right), and its two meshes, 'deer-body' and
 *   'deer-head'. Call `update` every frame with the seconds since the last, the train's distance along the track (m) and
 *   the seconds since the start. `targets` are the deer's hit shapes for taps (none yet).
 */
export function createDeer({ layout, path }) {
  const group = new Group();
  group.name = 'deer-group';
  const autumn = layout.zones.find((zone) => zone.id === 'autumn');
  const rng = createRng(SEED);
  const tunnel = tunnelSpan(layout);
  const env = envAt(layout, 0);
  const forward = new Vector3(), right = new Vector3(), facing = new Vector3();
  const body = bodyGeometry();
  const head = headGeometry();

  /** @type {Array<{ root: Group, head: Mesh, phase: number }>} */
  const standing = [];
  if (autumn) {
    DEER.SPOTS.forEach((share, k) => {
      const distance = autumn.start + share * (autumn.end - autumn.start);
      const side = k % 2 === 0 ? 1 : -1;
      const offset = side * rngRange(rng, ...DEER.OFFSET);
      const ground = terrainHeight(distance, offset, { water: envAt(layout, distance, env).water, tunnel });
      const root = new Group();
      root.name = 'deer';
      root.userData = { distance, offset };
      path.frameAt(distance, offset, ground, root.position);
      // Broadside to the track, facing back down it, as the train comes, and a little round to the track.
      path.tangentAt(distance, forward);
      path.sideAt(distance, right);
      facing.copy(forward).multiplyScalar(-Math.cos(STAND.TURN)).addScaledVector(right, -side * Math.sin(STAND.TURN));
      root.rotation.y = Math.atan2(facing.x, facing.z);
      root.scale.setScalar(STAND.SIZE);
      const bodyMesh = new Mesh(body, MATERIALS.solid);
      bodyMesh.name = 'deer-body';
      const headMesh = new Mesh(head, MATERIALS.solid);
      headMesh.name = 'deer-head';
      headMesh.position.set(...WITHERS);
      for (const mesh of [bodyMesh, headMesh]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      root.add(bodyMesh, headMesh);
      group.add(root);
      standing.push({ root, head: headMesh, phase: rngRange(rng, 0, TAU) });
    });
  }

  return {
    group,
    update(_dt, d, time) {
      for (const deer of standing) {
        const along = deer.root.userData.distance - d;
        deer.root.visible = Math.abs(along) < STAND.RANGE;
        if (!deer.root.visible) continue;
        const lift = deerHeadLift(along);
        deer.head.rotation.x = -DEER.HEAD_UP * lift + STAND.NOD * Math.sin(STAND.RATE * time + deer.phase) * (1 - lift);
      }
    },
    /** @type {object[]} */
    targets: [],
  };
}
