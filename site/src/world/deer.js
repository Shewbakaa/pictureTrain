// The deer at the forest's edge in autumn: two of them, out among the trees a little way from the track, one on her right
// and then one on her left, standing broadside to the train with their heads down, who lift their heads as it comes by.
//
// Each deer is three meshes, low-poly and flat-coloured like the props (util/geo.js), on the shared solid material: its
// body (a warm brown, with a pale belly and rump, four legs and a short tail), its head with its neck, whose origin
// is the withers, where the neck joins the body, so that turning the mesh about X lifts the head, and its two ears on
// the head, which can flick on their own. Standing, the neck carries the head low and relaxed; at the top of the lift
// (DEER.HEAD_UP) it is up and alert, looking at the train. The lift follows how far the train is from the deer
// (`deerHeadLift`), so a jump along the ride puts every head right again, and while it is down a deer nods a little as
// it grazes.
//
// A deer answers her tap (`targets`, ride/taps.js): it looks up at her, flicks its ears, and bounds off out into the
// trees, gone until the train is well past (BOUND).
//
// They stand where the autumn's scenery is, between its stops and clear of them and of the tunnel (`deerSpots`), so
// that no deer is hidden behind a photo sign when the train stops and her view turns to it, OFFSET metres from the
// track, on the ground there (terrain.js `terrainHeight`, with the sea where there is any). The hooves reach HOOF
// metres below the ground they stand on, which the coarse ground mesh and a slope under the four of them need, so no
// deer floats. A ride with no autumn has none, and an autumn with no room clear of its stops has fewer. They are drawn
// only while the train is within RANGE metres of them, which is more than the fog lets her see.
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
 * SPOTS: where the deer may stand too, as a share of the autumn zone's length from its start, when the autumn has
 * fewer than two places between its stops (`deerSpots`); there are as many deer as SPOTS at most. The sides alternate,
 * the first on the right (the track's right when the train faces ahead). OFFSET: how far out from the track (m), each
 * deer somewhere between these. HEAD_UP: how far (rad) the head and neck lift, turning about the withers. STOP_CLEAR
 * and TUNNEL_CLEAR: how far (m, along the track) a deer stands at least from every stop, where it would be behind the
 * photo sign, and from the tunnel.
 */
export const DEER = Object.freeze({
  SPOTS: Object.freeze([0.3, 0.7]),
  OFFSET: Object.freeze([14, 18]),
  HEAD_UP: 0.55,
  STOP_CLEAR: 25,
  TUNNEL_CLEAR: 20,
});

/**
 * The head starts to come up when the train is this far from the deer (m, along the track), and is fully up at NEAR:
 * far enough ahead that a deer OFFSET out is still in a portrait phone's view (about ±21°) as she looks ahead.
 */
const LIFT = Object.freeze({ FAR: 70, NEAR: 40 });

/**
 * How the deer stand. TURN: how far (rad) round from facing back along the track, at the train coming, to facing the
 * track itself: broadside to her as she passes, with its head a little round to her. SIZE: how many times life size they
 * are drawn, so that one 15 m off reads as a deer on her phone. RANGE: drawn while the train is within this
 * far (m) of it. NOD and RATE: how far (rad) a deer's head nods as it grazes, and how fast (rad/s).
 */
const STAND = Object.freeze({ TURN: (12 * Math.PI) / 180, SIZE: 1.25, RANGE: 160, NOD: 0.06, RATE: 0.9 });

/** The hooves go this far (m) below the ground the deer is placed on: the ground under four hooves is not level (a slope of about 0.1 m). */
const HOOF = 0.12;

/**
 * How a tapped deer answers. It looks up over LOOK seconds and flicks its ears FLICKS times by FLICK (rad) over
 * FLICK_TIME; from STARTLE seconds it bounds AWAY metres out from the track in LEAPS leaps of LEAP metres high over
 * TIME seconds, turning to run straight out over TURN of that and lost among the trees over the last LOST of it, and
 * then it is gone, until the train is HIDE metres past it (or as far before it, after a jump back). Its hit sphere is
 * REACH metres round, AT metres up (life size).
 */
const BOUND = Object.freeze({
  LOOK: 0.2, FLICKS: 2, FLICK: 0.5, FLICK_TIME: 0.4, STARTLE: 0.5, AWAY: 20, LEAPS: 3, LEAP: 0.7, TIME: 1.5, TURN: 0.2,
  LOST: 0.15, HIDE: 200, REACH: 1.2, AT: 0.85,
});

/** How far (rad) a leaping deer tips, nose up as it takes off and down as it lands. */
const PITCH = 0.25;

/** The same deer every ride. */
const SEED = 4417;

const TAU = Math.PI * 2;

/**
 * How far the train is from a deer (m, `along` positive when the deer is ahead): how far its head is up, from 0, down,
 * when the train is further than 70 m off, to 1, up, within 40 m. It stays up as the train passes, and after it.
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

// A point `long` metres from the withers along the neck, and along the head (which carries on from the neck's end).
const NECK_DIR = [0, Math.sin(NECK.UP), Math.cos(NECK.UP)];
const HEAD_DIR = [0, Math.sin(NECK.UP - HEAD.DOWN), Math.cos(NECK.UP - HEAD.DOWN)];
const NECK_END = NECK_DIR.map((v) => v * NECK.LONG);
const alongHead = (long) => NECK_END.map((v, i) => v + HEAD_DIR[i] * long);

/** Where the ears sit on the head, from the withers (m): between their roots, which they flick about. */
const EARS = (() => {
  const [, y, z] = alongHead(0.06);
  return Object.freeze([0, y + 0.03, z - 0.04]);
})();

/** The neck and head, from the withers: a tapering neck, a long head with a dark nose and small eyes. */
function headGeometry() {
  const C = COLOURS;
  const tip = -(NECK.UP - HEAD.DOWN); // the rotation about X that turns +Z to the head's direction
  const eye = (side) => {
    const [, y, z] = alongHead(0.1);
    return part(new SphereGeometry(0.014, 4, 3), C.eye, { position: [side * 0.066, y + 0.02, z] });
  };
  return mergeParts([
    part(new CylinderGeometry(0.065, 0.11, NECK.LONG, 6), C.coat, { position: NECK_DIR.map((v) => v * NECK.LONG / 2), rotation: [Math.PI / 2 - NECK.UP, 0, 0] }),
    ellipsoid(C.coat, [0.075, 0.08, 0.13], alongHead(0.08), tip),
    ellipsoid(C.coat, [0.046, 0.046, 0.08], alongHead(0.2), tip, 6, 4),
    ellipsoid(C.nose, [0.032, 0.032, 0.032], alongHead(0.27), tip, 5, 4),
    eye(1), eye(-1),
  ]);
}

/** The two pricked ears, round the point between their roots (EARS), where the head mesh puts them. */
function earsGeometry() {
  const [, y, z] = alongHead(0.06);
  const ear = (side) => part(new ConeGeometry(0.05, 0.2, 5), COLOURS.coat, {
    position: [side * 0.07, y + 0.1 - EARS[1], z - 0.04 - EARS[2]], rotation: [-0.25, 0, side * -0.6],
  });
  return mergeParts([ear(1), ear(-1)]);
}

/** How far (rad) a tapped deer's ears are flicked `since` seconds after her tap: back and forth FLICKS times, then still. */
function earFlick(since) {
  const { FLICKS, FLICK, FLICK_TIME, LOOK } = BOUND;
  const t = since - LOOK / 2;
  if (!(t > 0 && t < FLICK_TIME)) return 0;
  return -FLICK * Math.sin((2 * Math.PI * FLICKS * t) / FLICK_TIME);
}

// ---------------------------------------------------------------------------------------------------------------
// The deer in the world
// ---------------------------------------------------------------------------------------------------------------

/**
 * Where the deer stand (m along the track, in order), in the `autumn` of `layout`: halfway between one and the next of
 * the autumn's start, its stops and its end, the first two of those that are at least STOP_CLEAR from every stop and
 * TUNNEL_CLEAR from the tunnel (`tunnel`, or null). Only if fewer than two are clear are SPOTS of the way through the
 * autumn tried too, held to the same: a deer is left out rather than stood behind a photo sign.
 * @param {import('./layout.js').Layout} layout
 * @param {import('./layout.js').ZoneSeg} autumn
 * @param {import('./tunnel.js').TunnelSpan|null} tunnel
 * @returns {number[]}
 */
function deerSpots(layout, autumn, tunnel) {
  const { STOP_CLEAR, TUNNEL_CLEAR, SPOTS } = DEER;
  const edges = [autumn.start, ...layout.stops.filter((stop) => stop.zone === autumn.id).map((stop) => stop.distance), autumn.end];
  const halfway = edges.slice(1).map((edge, i) => (edges[i] + edge) / 2);
  const shares = SPOTS.map((share) => autumn.start + share * (autumn.end - autumn.start));
  const clear = (d) => layout.stops.every((stop) => Math.abs(stop.distance - d) >= STOP_CLEAR)
    && !(tunnel && d > tunnel.from - TUNNEL_CLEAR && d < tunnel.to + TUNNEL_CLEAR);
  return [...halfway, ...shares].filter(clear).slice(0, SPOTS.length).sort((a, b) => a - b);
}

/**
 * The deer of the ride.
 * @param {{ layout: import('./layout.js').Layout, path: import('./trackPath.js').TrackPath }} options
 * @returns {{
 *   group: Group,
 *   update: (dt: number, d: number, time: number) => void,
 *   targets: import('../ride/taps.js').Tappable[],
 * }}
 *   Add `group` to the scene: a child for each deer (none without an autumn), named 'deer', with `userData` of its
 *   `distance` along the track and its `offset` from it (m, + to the right), and its three meshes, 'deer-body',
 *   'deer-head' and, on the head, 'deer-ears'. Call `update` every frame with the seconds since the last, the train's
 *   distance along the track (m) and the seconds since the start (the clock a tap's reaction starts on). `targets` are
 *   the deer ('deer'), one for each, for taps.
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
  const ears = earsGeometry();

  /**
   * @type {Array<{ root: Group, head: Mesh, ears: Mesh, phase: number, home: Vector3, yaw: number,
   *                awayYaw: number, out: Vector3, tapped: number, groundOut: (metres: number) => number }>}
   *   Each deer: its meshes, its nod's phase, where it stands and which way it faces there, which way (and the
   *   direction, level) is straight out from the track on its side, when she tapped it, and how high the ground is so
   *   many metres further out.
   */
  const standing = [];
  if (autumn) {
    deerSpots(layout, autumn, tunnel).forEach((distance, k) => {
      const side = k % 2 === 0 ? 1 : -1;
      const offset = side * rngRange(rng, ...DEER.OFFSET);
      const lie = { water: envAt(layout, distance, env).water, tunnel };
      const ground = terrainHeight(distance, offset, lie);
      const root = new Group();
      root.name = 'deer';
      root.rotation.order = 'YXZ'; // turned to face its way, then pitched in a leap
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
      const earsMesh = new Mesh(ears, MATERIALS.solid);
      earsMesh.name = 'deer-ears';
      earsMesh.position.set(...EARS);
      headMesh.add(earsMesh);
      for (const mesh of [bodyMesh, headMesh, earsMesh]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      root.add(bodyMesh, headMesh);
      group.add(root);
      const out = right.clone().multiplyScalar(side);
      standing.push({
        root, head: headMesh, ears: earsMesh, phase: rngRange(rng, 0, TAU),
        home: root.position.clone(), yaw: root.rotation.y, awayYaw: Math.atan2(out.x, out.z), out, tapped: -Infinity,
        groundOut: (metres) => terrainHeight(distance, offset + side * metres, lie),
      });
    });
  }

  /**
   * Puts `deer` where it is `since` seconds into its bound: its leaps out over the ground, turning to run straight
   * away, and lost among the trees at the end of it (shrinking away over the last of it, rather than gone at once).
   */
  function bound(deer, since) {
    const { STARTLE, TIME, AWAY, LEAPS, LEAP, TURN, LOST } = BOUND;
    const u = Math.min(1, Math.max(0, (since - STARTLE) / TIME));
    const turn = smoothstep(0, TURN, u);
    let yaw = deer.awayYaw - deer.yaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); // the short way round
    deer.root.rotation.y = deer.yaw + yaw * turn;
    const phase = u < 1 ? (LEAPS * u) % 1 : 1; // how far through the leap it is in
    deer.root.position.copy(deer.home).addScaledVector(deer.out, AWAY * u);
    deer.root.position.y = deer.groundOut(AWAY * u) + LEAP * Math.sin(Math.PI * phase);
    deer.root.scale.setScalar(STAND.SIZE * (1 - smoothstep(1 - LOST, 1, u)));
    // Nose up as it takes off, down as it lands.
    deer.root.rotation.x = -PITCH * Math.cos(Math.PI * phase) * Math.min(1, u * 8);
  }

  /** Back where it stood, as it stood. */
  function settle(deer) {
    deer.tapped = -Infinity;
    deer.root.position.copy(deer.home);
    deer.root.rotation.set(0, deer.yaw, 0);
    deer.root.scale.setScalar(STAND.SIZE);
    deer.ears.rotation.x = 0;
  }

  const middle = new Vector3(0, BOUND.AT, 0);

  return {
    group,
    update(_dt, d, time) {
      for (const deer of standing) {
        const along = deer.root.userData.distance - d;
        // Gone until the train is HIDE past it (or, after a jump back, as far before it); back on its spot then.
        if (deer.tapped > -Infinity && Math.abs(along) >= BOUND.HIDE) settle(deer);
        const since = time - deer.tapped;
        const tapped = since >= 0 && since < Infinity;
        const gone = tapped && since >= BOUND.STARTLE + BOUND.TIME;
        deer.root.visible = Math.abs(along) < STAND.RANGE && !gone;
        if (!deer.root.visible) continue;
        // Tapped, it looks up at once, whatever the train's distance, and flicks its ears.
        const lift = tapped ? Math.max(deerHeadLift(along), smoothstep(0, BOUND.LOOK, since)) : deerHeadLift(along);
        deer.head.rotation.x = -DEER.HEAD_UP * lift + STAND.NOD * Math.sin(STAND.RATE * time + deer.phase) * (1 - lift);
        deer.ears.rotation.x = tapped ? earFlick(since) : 0;
        if (tapped && since >= BOUND.STARTLE) bound(deer, since);
      }
    },
    targets: standing.map((deer) => ({
      name: 'deer',
      radius: BOUND.REACH,
      position: (out) => (deer.root.visible ? out.copy(middle).multiplyScalar(STAND.SIZE).add(deer.root.position) : null),
      react(now, fx) {
        if (!(now - deer.tapped < BOUND.STARTLE + BOUND.TIME)) deer.tapped = now; // not again while it is off
        fx.play('deer-rustle');
      },
    })),
  };
}
