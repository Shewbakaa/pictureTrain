// Butterflies, white, lemon and pale blue, fluttering low over the spring meadow beside the track, flapping and
// wandering about as they go. They are the spring's own small touch, and not another particle kind (the particles show
// one kind at a time), so they have their own mesh: one InstancedMesh of the birds' flapping material (birds.js
// BIRD_MATERIAL), whose wings flap in the vertex shader to each butterfly's own phase and rate (BUTTERFLIES.FLAP, a
// little faster than a songbird's). A butterfly is a thin body and two pairs of flat wings (a forewing with a dark tip
// and a hindwing), built from parts like the birds (birds.js `wingedGeometry`) and tinted per instance, so its wings are
// whichever colour it is and its body stays dark. They are drawn larger than life (SIZE), so that one a few metres off
// still reads as a butterfly on her phone.
//
// They live in a box round her, like the particles (particles.js): ALONG metres of track, mostly ahead of her where she
// looks (BEHIND metres of it behind), a few metres out either side of it and low. Each has a place of its own in the
// world and a path it wanders round, so the train rolls through butterflies that stay where they are, and one
// wandering out of the end of the box comes back in at the other (wrapped, like the particles' sides). Every one is
// shrunk to nothing towards the ends of the box, so none pops in or out as it wraps. The box is laid along the track
// (from `d`, the train's distance along it), not along the world's axes: the ground is level only within TERRAIN.FLAT
// of the track and hills rise beyond it, which would swallow butterflies flying 0.3 to 1.6 m above the level ground,
// so they keep to the flat verge, which is where the flowers are.
//
// None come near the camera: one is smaller and smaller as it nears her eye, and gone by EYE_CLEAR metres from it (as the
// particles fade out near the eye), and likewise within SIGN_CLEAR metres of a photo sign's spot (so none flutters in
// front of a photo) and in the tunnel's portals and hill. A butterfly that would be in one of those places is not
// drawn there; it comes back into view as it flies out again.
//
// They follow the spring's weight (ambienceTiming.js `zoneWeights`), not a place in the ride: as spring gives way
// they leave one by one, flying up and away and shrinking to nothing, and a ride with no spring has none anywhere.
// The quality tier's `particles` share thins them.
//
// Nothing is allocated in a frame. DOM-free at import, so the Node unit tests can import it.

import {
  Color, CylinderGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, SphereGeometry,
  Vector3,
} from '../three.js';
import { zoneWeights } from '../audio/ambienceTiming.js';
import { BIRD_MATERIAL, plate, wingedGeometry } from './birds.js';
import { avoidSpots } from './dressing.js';
import { TERRAIN } from './terrain.js';
import { tunnelSpan } from './tunnel.js';
import { part } from '../util/geo.js';
import { clamp, smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {import('./environment.js').Env} Env
 */

/**
 * COUNT: butterflies at the highest quality (and by default). ALONG: how much track (m) they live along, BEHIND of it
 * behind her, and ACROSS how far (m) either side of the track, within the flat verge (TERRAIN.FLAT). HEIGHT: how high (m) above the
 * ground they fly, from the lowest to the highest. EYE_CLEAR, SIGN_CLEAR: none comes nearer (m) than this to her eye, or
 * to a photo sign's spot (horizontally); TUNNEL_CLEAR: nor to the tunnel's portals, beyond its ends (m).
 * FLAP: wingbeats a second, between these. SIZE: how many times life size they are drawn. COLOURS: sRGB hex, which each
 * butterfly takes in turn.
 */
export const BUTTERFLIES = Object.freeze({
  COUNT: 14,
  ALONG: 30,
  BEHIND: 10,
  ACROSS: TERRAIN.FLAT - 0.5,
  HEIGHT: Object.freeze([0.3, 1.6]),
  EYE_CLEAR: 2.5,
  SIGN_CLEAR: 2,
  TUNNEL_CLEAR: 6,
  FLAP: Object.freeze([6, 9]),
  SIZE: 6,
  COLOURS: Object.freeze(['#fdfdf7', '#f9e27a', '#a9c8f0']),
});

/**
 * How a butterfly wanders about its place, along the track, across it and up and down, each by an amplitude (m) from
 * these ranges: two swings added, SLOW (rad/s) and one QUICK times as fast, so its path is a darting loop, not a circle
 * (it goes about 1 to 3 m/s). The centres are kept so that the amplitudes fit within the box.
 */
const WANDER = Object.freeze({
  ALONG: Object.freeze([1.5, 3.5]), ACROSS: Object.freeze([0.8, 1.6]), UP: Object.freeze([0.15, 0.3]),
  SLOW: Object.freeze([0.35, 0.7]), QUICK: Object.freeze([1.9, 2.6]),
});

/** How big each swing is in the wander (the two shares add to 1, so a path never goes past its amplitude). */
const SWING = Object.freeze({ SLOW: 0.65, QUICK: 0.35 });

/**
 * The fades, each over this far (m) past where it starts. ENDS: a butterfly grows in over the last ENDS metres of the
 * box's ends. EYE and SIGN: past EYE_CLEAR from her eye and SIGN_CLEAR from a sign. TUNNEL: past TUNNEL_CLEAR from the
 * tunnel.
 */
const EASE = Object.freeze({ ENDS: 4, EYE: 0.6, SIGN: 1, TUNNEL: 3 });

/**
 * As spring gives way, butterfly number i has left (its weight of spring ran out) at LEAVE.FROM · i / COUNT, and is all
 * there from SPAN more. RISE: how far up (m) a butterfly that has left has flown.
 */
const LEAVE = Object.freeze({ FROM: 0.6, SPAN: 0.25, RISE: 3 });

/** Each butterfly's size is its SIZE times a number between these. */
const SIZE_VARY = Object.freeze([0.85, 1.15]);

/** Its wings flap this hard (0 to 1), between these. */
const FLAP_HARD = Object.freeze([0.85, 1]);

/** The same butterflies every ride. */
const SEED = 6029;

const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);
const ORIGIN = new Vector3();

// ---------------------------------------------------------------------------------------------------------------
// The butterfly's shape
// ---------------------------------------------------------------------------------------------------------------

/**
 * A butterfly, life size (about 8 cm across): a thin dark body (a thorax, a long abdomen, a head and two feelers) and,
 * on its right (+X), a forewing with a dark tip and a hindwing behind it (the left pair is the mirror), lying flat in
 * X and Z. The wings are white so that each instance's colour (the mesh's instance colour) becomes theirs. It faces +Z.
 */
function butterflyModel() {
  const C = { wing: '#ffffff', tip: '#8d909a', body: '#4a403a' };
  const ball = (r, scale, z, y = 0) => part(new SphereGeometry(r, 5, 4), C.body, { position: [0, y, z], scale });
  const feeler = (side) => part(new CylinderGeometry(0.0007, 0.0004, 0.028, 3), C.body, {
    position: [side * 0.0043, 0.012, 0.0315], rotation: [0.96, 0, side * -0.3],
  });
  const flat = (corners, colour) => part(plate(corners.map(([x, z]) => [x, 0, z]), 0.0006), colour);
  return {
    body: [
      ball(0.0055, [1, 1, 1.6], 0.003),
      ball(0.0045, [0.9, 0.9, 3.8], -0.02),
      ball(0.0045, [1, 1, 1], 0.0155),
      feeler(1), feeler(-1),
    ],
    wing: [
      // The forewing (the inner part, then the tip) in front, the hindwing behind it, just clear of it.
      flat([[0.006, 0.010], [0.006, -0.004], [0.028, -0.008], [0.028, 0.019], [0.016, 0.018]], C.wing),
      flat([[0.028, -0.008], [0.040, 0.006], [0.034, 0.022], [0.028, 0.019]], C.tip),
      flat([[0.006, -0.0045], [0.0285, -0.0085], [0.030, -0.020], [0.020, -0.030], [0.008, -0.026]], C.wing),
    ],
    shoulder: [0.006, 0],
  };
}

/**
 * The butterfly's geometry, life size, as birds.js `wingedGeometry` builds a bird's: `wing` (0 on the body, up to ±1 at
 * the wing tips) for the flapping, and vertex colours of white wings and a dark body. A fresh geometry every call.
 * @returns {import('../three.js').BufferGeometry}
 */
export function butterflyGeometry() {
  return wingedGeometry(butterflyModel());
}

// ---------------------------------------------------------------------------------------------------------------
// The butterflies in the world
// ---------------------------------------------------------------------------------------------------------------

/** `value` wrapped into [0, size). */
const wrap = (value, size) => ((value % size) + size) % size;

/**
 * @typedef {{ centre: number, amp: number, rate: number, quick: number, a: number, b: number }} Swing
 *   One way a butterfly wanders: about `centre`, by up to `amp` (m), by two swings at `rate` (rad/s) and `quick` times it.
 */

/** Where the swing `w` has a butterfly at `time` (s), and how fast (m/s) it is moving there. */
const swingAt = (w, time) => w.centre + w.amp * (SWING.SLOW * Math.sin(w.rate * time + w.a) + SWING.QUICK * Math.sin(w.quick * w.rate * time + w.b));
const swingSpeed = (w, time) => w.amp * w.rate * (SWING.SLOW * Math.cos(w.rate * time + w.a) + SWING.QUICK * w.quick * Math.cos(w.quick * w.rate * time + w.b));

/**
 * The butterflies of the ride.
 * @param {{ maxCount?: number, path: import('./trackPath.js').TrackPath, layout?: import('./layout.js').Layout }} options
 *   `layout` says where the photo signs (dressing.js `avoidSpots`) and the tunnel are, which they keep clear of.
 * @returns {{
 *   mesh: InstancedMesh,
 *   update: (dt: number, env: Env, cameraPosition: Vector3, d: number) => void,
 *   setQuality: (share: number) => void,
 * }}
 *   Add `mesh` to the scene. Call `update` every frame with the seconds since the last one, the environment where the
 *   train is, the camera's world position and the train's distance along the track (m); BIRD_MATERIAL's time (what
 *   flaps the wings) is kept by the birds' update (birds.js). `setQuality` is the quality tier's `particles` share (0 to
 *   1) of the butterflies.
 */
export function createButterflies({ maxCount = BUTTERFLIES.COUNT, path, layout = null }) {
  const count = Math.max(1, Math.floor(maxCount));
  const { ALONG, BEHIND, ACROSS, HEIGHT, EYE_CLEAR, SIGN_CLEAR, TUNNEL_CLEAR, FLAP, SIZE, COLOURS } = BUTTERFLIES;
  const rng = createRng(SEED);

  // Each butterfly's character: its place and how it wanders about it, its size, its flap, and the spring weight it leaves at.
  /** @type {(centre: number, amp: number) => Swing} */
  const swing = (centre, amp) => ({
    centre, amp, rate: rngRange(rng, ...WANDER.SLOW), quick: rngRange(rng, ...WANDER.QUICK), a: rngRange(rng, 0, TAU), b: rngRange(rng, 0, TAU),
  });
  const fliers = Array.from({ length: count }, (_, i) => {
    const along = rngRange(rng, ...WANDER.ALONG), across = rngRange(rng, ...WANDER.ACROSS), up = rngRange(rng, ...WANDER.UP);
    return {
      along: swing(rng() * ALONG, along),
      across: swing(rngRange(rng, -(ACROSS - across), ACROSS - across), across),
      up: swing(rngRange(rng, HEIGHT[0] + up, HEIGHT[1] - up), up),
      size: rngRange(rng, ...SIZE_VARY),
      leaves: (LEAVE.FROM * i) / count,
    };
  });

  const mesh = new InstancedMesh(butterflyGeometry(), BIRD_MATERIAL, count);
  mesh.name = 'butterflies';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false; // they move with the train
  mesh.count = 0;
  mesh.visible = false;
  // Colours in turn, so every tier's first few have all three; flaps: each at its own phase, rate and how hard.
  const flap = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    mesh.setColorAt(i, tint.set(COLOURS[i % COLOURS.length]));
    flap.setXYZ(i, rngRange(rng, 0, TAU), rngRange(rng, ...FLAP), rngRange(rng, ...FLAP_HARD));
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.geometry.setAttribute('aFlap', flap);

  // Where the photo signs stand, in the world (the first of the layout's avoid spots are the signs), and the tunnel.
  const signs = layout ? avoidSpots(layout).slice(0, layout.stops.length).map((s) => path.frameAt(s.distance, s.right, 0, new Vector3())) : [];
  const tunnel = layout ? tunnelSpan(layout) : null;

  let drawCount = count;
  let time = 0;

  // Per-frame scratch.
  const weights = {};
  const position = new Vector3(), heading = new Vector3(), forward = new Vector3(), right = new Vector3();
  const basis = new Matrix4(), matrix = new Matrix4(), turn = new Quaternion(), size = new Vector3();

  /** Draws `n` butterflies (none hides the mesh) and sends their matrices to the GPU. */
  function show(n) {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n > 0) mesh.instanceMatrix.needsUpdate = true;
  }

  /** How much of its size a butterfly at distance `s` along the track keeps for the tunnel: none within TUNNEL_CLEAR of it. */
  function tunnelFade(s) {
    if (!tunnel) return 1;
    return smoothstep(tunnel.from - TUNNEL_CLEAR, tunnel.from - TUNNEL_CLEAR - EASE.TUNNEL, s)
      + smoothstep(tunnel.to + TUNNEL_CLEAR, tunnel.to + TUNNEL_CLEAR + EASE.TUNNEL, s);
  }

  function update(seconds, env, cameraPosition, d) {
    time += seconds > 0 ? seconds : 0;
    zoneWeights(env, weights);
    const weight = weights.spring;
    if (!(weight > 0) || !Number.isFinite(d) || drawCount === 0) {
      show(0);
      return;
    }
    path.tangentAt(d, forward);
    path.sideAt(d, right);
    const start = d - BEHIND;
    for (let i = 0; i < drawCount; i++) {
      const b = fliers[i];
      // Its place in the world on the track's frame (along, out to the right, up), wrapped into the box.
      const s = start + wrap(swingAt(b.along, time) - start, ALONG);
      const gone = 1 - smoothstep(b.leaves, b.leaves + LEAVE.SPAN, weight); // as the spring gives way: up and away
      path.frameAt(s, swingAt(b.across, time), swingAt(b.up, time) + LEAVE.RISE * gone, position);
      // It heads the way it is wandering (the train's frame is near enough for its heading).
      heading.set(0, 0, 0)
        .addScaledVector(forward, swingSpeed(b.along, time))
        .addScaledVector(right, swingSpeed(b.across, time))
        .addScaledVector(UP, swingSpeed(b.up, time));
      if (heading.lengthSq() < 1e-8) heading.copy(forward);
      turn.setFromRotationMatrix(basis.lookAt(heading, ORIGIN, UP));
      // Shrunk to nothing at the ends of the box, by her eye, by a sign and by the tunnel, and as the spring gives way.
      let fade = smoothstep(-BEHIND, -BEHIND + EASE.ENDS, s - d) * smoothstep(ALONG - BEHIND, ALONG - BEHIND - EASE.ENDS, s - d)
        * smoothstep(EYE_CLEAR, EYE_CLEAR + EASE.EYE, position.distanceTo(cameraPosition))
        * tunnelFade(s)
        * (1 - gone);
      for (let k = 0; k < signs.length && fade > 0; k++) {
        fade *= smoothstep(SIGN_CLEAR, SIGN_CLEAR + EASE.SIGN, Math.hypot(position.x - signs[k].x, position.z - signs[k].z));
      }
      mesh.setMatrixAt(i, matrix.compose(position, turn, size.setScalar(SIZE * b.size * fade)));
    }
    show(drawCount);
  }

  return {
    mesh,
    update,
    setQuality(share) {
      drawCount = Math.ceil(count * clamp(share, 0, 1));
    },
  };
}
