// The sky's decorations: puffy low-poly clouds and two hot-air balloons, far out round the train.
//
// They sit on a ring 160 to 220 m out round the camera (seen from above), so however far
// the train goes they stay on the horizon like the sky itself. Nothing out there is fogged, or it would vanish
// into the horizon colour. The balloons are lit by the zone's sun and sky (render/materials.js `distant`). The
// clouds are not lit: lit from below by the zone's ground colour they turn a muddy green or brown, so each facet
// is shaded white on top to a soft lavender underneath, and the whole cloud is tinted towards the zone's horizon
// colour (pale blue by day, peach at dusk).
//
// The ride heads roughly down -Z (the track never turns more than about 20 degrees off it), so the clouds
// gather in the arc ahead (ARC either side of -Z) and drift slowly across it, growing out of nothing at one end
// and melting away at the other. The balloons float ahead, one either side, swaying, bobbing and turning
// slowly; the heart-shaped one keeps its face to the train.
//
// The balloons answer her taps (ride/taps.js `targets`): the burner roars, its flame glows over the basket in a soft
// halo of light, and the balloon rises a little and sinks back. The flame and its halo are drawn only while it glows,
// so at rest they cost nothing.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it.

import {
  AdditiveBlending, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, Quaternion, SphereGeometry, Sprite, SpriteMaterial, Vector3,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, part } from '../util/geo.js';
import { smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/** How many clouds, how far out from the camera (m, seen from above) and how high above it (m). */
export const SKY_DECOR = Object.freeze({
  CLOUDS: 8,
  CLOUD_RING: [175, 220],
  CLOUD_HEIGHT: [36, 105],
});

/**
 * The clouds keep within this angle (rad) either side of straight down -Z, so a portrait view ahead usually has
 * two or three in it, and fade in and out over the last FADE of it.
 */
const ARC = (95 * Math.PI) / 180;
const FADE = (22 * Math.PI) / 180;
/** How fast (rad/s) the clouds drift round: a wind from left to right of the start. */
const DRIFT = 0.004;

const SEED = 271;
const TAU = Math.PI * 2;
const UP = new Vector3(0, 1, 0);

/** A cloud's facets are this colour facing straight up and CLOUD_UNDER facing straight down (sRGB). */
const CLOUD_TOP = '#ffffff';
const CLOUD_UNDER = '#c4cbe6';
/** How far the clouds' tint goes from white towards the zone's horizon colour. */
const CLOUD_TINT = 0.45;

/**
 * A tapped balloon: its flame glows for GLOW seconds, and it rises LIFT metres over RISE seconds and sinks back over
 * SINK. Its hit sphere is REACH metres round the middle of its envelope, AT metres over the basket; far out as it is,
 * the taps' own angle (ride/taps.js MIN_ANGLE) makes it easier to hit still.
 */
const BURN = Object.freeze({ GLOW: 1.2, LIFT: 3, RISE: 2, SINK: 5, REACH: 7, AT: 11 });

/**
 * The flame's colour (sRGB), how tall and wide it is (m), and where its foot is over the basket's base (m); and the halo
 * of light round it, HALO metres across, which lights up the envelope's mouth and shows from far off.
 */
const FLAME = Object.freeze({ COLOUR: '#ffb347', HEIGHT: 2.6, RADIUS: 0.75, FOOT: 1.3, HALO: 7 });

/** How brightly the flame shows `since` seconds after her tap: 0 unlit, up to 1 and flickering, then out after GLOW. */
function flameAt(since) {
  if (!(since >= 0 && since < BURN.GLOW)) return 0;
  const u = since / BURN.GLOW;
  const flicker = 0.85 + 0.15 * Math.sin(since * 37);
  return smoothstep(0, 0.08, u) * (1 - smoothstep(0.7, 1, u)) * flicker;
}

/** How far up (m) the balloon is `since` seconds after her tap: up LIFT over RISE, and back down over SINK. */
function liftAt(since) {
  if (!(since >= 0 && since < BURN.RISE + BURN.SINK)) return 0;
  if (since < BURN.RISE) return BURN.LIFT * smoothstep(0, BURN.RISE, since);
  return BURN.LIFT * (1 - smoothstep(BURN.RISE, BURN.RISE + BURN.SINK, since));
}

/** A cloud: a row of flattened round puffs, a big one in the middle, about 2.6 units across before scaling. */
function cloudGeometry() {
  // [x, y, z, radius]
  const puffs = [[0, 0.32, 0, 0.62], [0.62, 0.12, 0.08, 0.46], [-0.66, 0.1, -0.04, 0.5], [0.28, 0.06, 0.42, 0.4], [-0.22, 0.04, -0.4, 0.42], [1.1, -0.04, -0.06, 0.3], [-1.12, -0.06, 0.1, 0.28]];
  const geometry = mergeParts(puffs.map(([x, y, z, r]) => part(new IcosahedronGeometry(r, 1), CLOUD_TOP, {
    position: [x, y, z],
    scale: [1, 0.72, 1],
  })));
  // Each facet shaded by which way it faces: the facets are flat, so the cloud stays faceted.
  const top = new Color(CLOUD_TOP), under = new Color(CLOUD_UNDER), shade = new Color();
  const normals = geometry.attributes.normal, colours = geometry.attributes.color;
  for (let i = 0; i < normals.count; i++) {
    const up = 0.5 + 0.5 * normals.getY(i);
    shade.lerpColors(under, top, Math.sqrt(up));
    colours.setXYZ(i, shade.r, shade.g, shade.b);
  }
  return geometry;
}

/** The basket, burner frame and ropes hanging under an envelope whose mouth is `mouth` high and `r` wide. */
function basket(mouth, r) {
  const parts = [
    part(new CylinderGeometry(0.85, 0.7, 1.1, 8), '#b07642', { position: [0, 0.55, 0] }),
    part(new CylinderGeometry(0.9, 0.9, 0.16, 8), '#8a5a3b', { position: [0, 1.1, 0] }),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const from = new Vector3(Math.cos(a) * 0.75, 1.15, Math.sin(a) * 0.75);
    const to = new Vector3(Math.cos(a) * r, mouth, Math.sin(a) * r);
    const length = from.distanceTo(to);
    const p = part(new CylinderGeometry(0.05, 0.05, length, 3), '#6e4631');
    p.matrix.compose(from.clone().add(to).multiplyScalar(0.5), new Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize()), new Vector3(1, 1, 1));
    parts.push(p);
  }
  return parts;
}

/** A round hot-air balloon with `colours` in turn round its gores, a skirt and a basket; the basket's base is the origin. */
function stripedBalloon(colours) {
  const R = 5.2, CENTRE = 11.5, GORES = 12;
  const parts = [];
  for (let i = 0; i < GORES; i++) {
    parts.push(part(new SphereGeometry(R, 2, 10, (i * TAU) / GORES, TAU / GORES), colours[i % colours.length], {
      position: [0, CENTRE, 0],
      scale: [1, 1.15, 1],
    }));
  }
  // The skirt narrows from the envelope's lower part down to the mouth.
  for (let i = 0; i < GORES; i++) {
    parts.push(part(new ConeGeometry(R * 0.72, 3.4, GORES, 1, true, (i * TAU) / GORES, TAU / GORES), colours[i % colours.length], {
      position: [0, CENTRE - R * 0.86 - 0.4, 0],
      rotation: [Math.PI, 0, 0],
    }));
  }
  return mergeParts([...parts, ...basket(CENTRE - R * 0.86 - 2.1, 0.75)]);
}

/** A heart-shaped hot-air balloon, its face to +Z, over a basket; the basket's base is the origin. */
function heartBalloon(colour, trim) {
  const heart = [
    part(new SphereGeometry(3.4, 10, 8), colour, { position: [-2.35, 13.2, 0], scale: [1, 1, 0.78] }),
    part(new SphereGeometry(3.4, 10, 8), colour, { position: [2.35, 13.2, 0], scale: [1, 1, 0.78] }),
    part(new ConeGeometry(5.5, 7.0, 12), colour, { position: [0, 9.3, 0], rotation: [Math.PI, 0, 0], scale: [1, 1, 0.55] }),
    // A pale band round the heart's middle, like a ribbon.
    part(new CylinderGeometry(4.82, 4.45, 0.45, 12, 1, true), trim, { position: [0, 11.6, 0], scale: [1, 1, 0.57] }),
  ];
  return mergeParts([...heart, ...basket(5.9, 0.5)]);
}

/**
 * @returns {{
 *   group: Group,
 *   update: (dt: number, cameraPosition: Vector3, env?: import('./environment.js').Env) => void,
 *   targets: import('../ride/taps.js').Tappable[],
 * }}
 *   Add `group` to the scene and call `update` every frame with the seconds since the last one, the camera's
 *   world position and the environment where the train is (which tints the clouds; without it they stay white).
 *   `targets` are the two balloons ('sky-balloon'), for taps; a tapped one answers on the seconds `update` adds up.
 */
export function createSkyDecor() {
  const group = new Group();
  group.name = 'sky-decor';
  const rng = createRng(SEED);

  // The clouds: one shape, each turned, stretched and sized its own way, spread evenly over the arc ahead.
  const cloudMaterial = new MeshBasicMaterial({ vertexColors: true, fog: false });
  const clouds = new InstancedMesh(cloudGeometry(), cloudMaterial, SKY_DECOR.CLOUDS);
  clouds.name = 'sky-clouds';
  clouds.frustumCulled = false; // they move with the camera
  const cloudStates = [];
  for (let i = 0; i < SKY_DECOR.CLOUDS; i++) {
    const share = (i + rngRange(rng, 0.15, 0.85)) / SKY_DECOR.CLOUDS;
    cloudStates.push({
      angle: -ARC + share * 2 * ARC,
      speed: DRIFT * rngRange(rng, 0.75, 1.25),
      radius: rngRange(rng, ...SKY_DECOR.CLOUD_RING),
      height: rngRange(rng, ...SKY_DECOR.CLOUD_HEIGHT),
      size: rngRange(rng, 9, 15),
      stretch: rngRange(rng, 1.0, 1.6),
      turn: rngRange(rng, -0.5, 0.5),
    });
  }
  group.add(clouds);

  // The balloons, ahead to the left and to the right, at `angle` (rad, + towards +X) and `radius` (m) on the ring.
  const balloons = [
    { mesh: new Mesh(stripedBalloon(['#ff7f7a', '#fff3dd', '#ffc857', '#fff3dd']), MATERIALS.distant), angle: -0.2, radius: 168, height: 30, faceCamera: false },
    { mesh: new Mesh(heartBalloon('#f2557a', '#ffe1ea'), MATERIALS.distant), angle: 0.3, radius: 190, height: 42, faceCamera: true },
  ];
  // Each has a flame over its basket, hidden until she taps it: a cone, unlit and never fogged, like the balloon, in a
  // halo of light (the street lamps' glow, render/materials.js).
  const flameShape = new ConeGeometry(FLAME.RADIUS, FLAME.HEIGHT, 8);
  flameShape.translate(0, FLAME.FOOT + FLAME.HEIGHT / 2, 0);
  balloons.forEach((b, i) => {
    b.mesh.name = `sky-balloon-${i}`;
    b.phase = rngRange(rng, 0, TAU);
    b.tapped = -Infinity;
    b.flame = new Mesh(flameShape, new MeshBasicMaterial({ color: FLAME.COLOUR, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    b.flame.name = `sky-balloon-${i}-flame`;
    b.flame.visible = false;
    b.halo = new Sprite(new SpriteMaterial({
      map: MATERIALS.halo.map, color: FLAME.COLOUR, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false,
    }));
    b.halo.name = `sky-balloon-${i}-halo`;
    b.halo.position.y = FLAME.FOOT + FLAME.HEIGHT * 0.6;
    b.halo.scale.setScalar(FLAME.HALO);
    b.halo.visible = false;
    b.mesh.add(b.flame, b.halo);
    group.add(b.mesh);
  });

  let time = 0;
  const matrix = new Matrix4();
  const position = new Vector3();
  const turn = new Quaternion();
  const size = new Vector3();

  /** The point `radius` out at `angle` (0 is -Z, + towards +X) round the camera, `height` above it. */
  const onRing = (camera, angle, radius, height, out) =>
    out.set(camera.x + Math.sin(angle) * radius, camera.y + height, camera.z - Math.cos(angle) * radius);

  const white = new Color(1, 1, 1);

  function update(dt, cameraPosition, env) {
    time += dt;
    if (env) cloudMaterial.color.lerpColors(white, env.skyHorizon, CLOUD_TINT);
    for (let i = 0; i < cloudStates.length; i++) {
      const c = cloudStates[i];
      // Round the arc and back to its start, growing out of nothing and melting away at either end.
      const angle = -ARC + ((((c.angle + c.speed * time + ARC) % (2 * ARC)) + 2 * ARC) % (2 * ARC));
      const grown = smoothstep(ARC, ARC - FADE, Math.abs(angle));
      const s = c.size * Math.max(grown, 1e-3);
      onRing(cameraPosition, angle, c.radius, c.height, position);
      // Each cloud keeps its long side roughly across her view.
      turn.setFromAxisAngle(UP, -angle + c.turn);
      clouds.setMatrixAt(i, matrix.compose(position, turn, size.set(s * c.stretch, s * 0.8, s)));
    }
    clouds.instanceMatrix.needsUpdate = true;

    for (const b of balloons) {
      const angle = b.angle + 0.06 * Math.sin(time * 0.05 + b.phase);
      const since = time - b.tapped;
      onRing(cameraPosition, angle, b.radius, b.height + 1.6 * Math.sin(time * 0.6 + b.phase) + liftAt(since), b.mesh.position);
      // The heart faces the train (its +Z towards the ring's centre) with a gentle sway; the round one turns slowly.
      b.mesh.rotation.y = b.faceCamera ? -angle + 0.25 * Math.sin(time * 0.3 + b.phase) : time * 0.05 + b.phase;
      const glow = flameAt(since);
      b.flame.visible = b.halo.visible = glow > 0;
      b.flame.material.opacity = glow;
      b.halo.material.opacity = 0.9 * glow;
    }
  }

  const middle = new Vector3(0, BURN.AT, 0);
  /** @type {import('../ride/taps.js').Tappable[]} */
  const targets = balloons.map((b) => ({
    name: 'sky-balloon',
    radius: BURN.REACH,
    position: (out) => out.copy(b.mesh.position).add(middle),
    react(now, fx) {
      b.tapped = time;
      fx.play('burner');
    },
  }));

  return { group, update, targets };
}
