// The cabin she rides in, seen from her seat: the front of a little wooden sightseeing train.
//
// A wooden dashboard runs along the bottom of the view, with two gold-rimmed gauges on its sloping face and a red
// panel below them. A pot of pink flowers stands on its left, a glowing lantern on its right. Two pillars at the
// edges of the view hold up a roof whose front edge runs along the top, and a string of bunting sways under it.
//
// The cabin hangs on the camera's rig (render/stage.js), so it rides along with her but stays put while she looks
// around. A tall phone sees a narrow, tall slice of the world and a landscape screen a wide, short one, so the
// cabin is laid out for the screen (`cabinAnchors`): every piece sits at a fixed share of the view's height and
// width, and the dashboard fills the same share of the screen either way. `fit` rebuilds it whenever the screen
// changes shape; it costs four draw calls (the wood, what glows, the bunting and the lantern's halo).
//
// Everything is built in code from the shared materials, with no textures, and nothing touches the DOM, so the
// Node unit tests can build it.

import {
  AdditiveBlending, ConeGeometry, CylinderGeometry, ExtrudeGeometry, Group, IcosahedronGeometry, InstancedMesh,
  MathUtils, Matrix4, Mesh, Quaternion, Shape, Sprite, SpriteMaterial, TorusGeometry, Vector3, BoxGeometry,
  CircleGeometry, Color,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { clamp } from '../util/math.js';
import { mergeParts, moveParts, part, triangleSoup } from '../util/geo.js';
import { RIDE } from '../ride/rideController.js';

/** Distances ahead of her eye (m, along -Z): the dashboard's far top edge, the pillars, the roof's front edge, the bunting. */
const DEPTH = Object.freeze({ DASHBOARD: 0.9, PILLARS: 1.4, ROOF: 1.46, BUNTING: 1.36 });

/** The cabin floor, below her eye (m). Only seen when she looks down. */
const FLOOR = -1.25;

/**
 * Sizes are given for a tall phone (vertical field of view 80°) and scale with the height of the view, so that
 * each piece takes the same share of the screen at any field of view.
 */
const REFERENCE_HALF_HEIGHT = Math.tan(MathUtils.degToRad(40));

/**
 * The dashboard: the ledge on top (m, before scaling), and the sloping face below it, tilted TILT back from upright
 * and FACE long (m, before scaling). The face is wood with the gauges down to RED_FROM of the way from the middle
 * of the view to its bottom, and the red panel below that. Each gauge is GAUGE of the wood's height across.
 */
const DASH = Object.freeze({ LEDGE: 0.075, TILT: MathUtils.degToRad(35), FACE: 0.45, RED_FROM: 0.9, GAUGE: 0.7 });

/**
 * The bunting: each flag's size (m, before scaling) and the gap between flags (a share of a flag's width), how wide
 * a swag may get between hooks (m), the most flags it has, and how far the flags flutter and lean back in the wind
 * of the train at full speed (rad).
 */
const BUNTING = Object.freeze({ FLAG_W: 0.08, FLAG_H: 0.1, GAP: 0.3, SWAG: 1.3, MAX_FLAGS: 72, SWAY: 0.14, WIND: 0.3 });

/** The bob of the train on its rails, at full speed (m), and how often (Hz). */
const BOB = Object.freeze({ HEIGHT: 0.015, RATE: 1.6 });

/** Colours (sRGB hex). Task 14's train outside is painted in the same ones. */
export const CABIN_COLOURS = Object.freeze({
  wood: '#c98b52',
  trim: '#a86b3c',
  panel: '#d8574a',
  floor: '#8a5a34',
  gold: '#e2b04a',
  cream: '#fff3dc',
  dial: '#fff4dc',
  ink: '#4a3a32',
  needle: '#c0392b',
  pot: '#d9805f',
  potRim: '#c56d4f',
  soil: '#6b4a33',
  stem: '#5c9e5a',
  leaf: '#6fbf73',
  petals: ['#f48fb1', '#f9a8c9', '#ff7aa2', '#f7b8d0'],
  bloomHeart: '#ffd56b',
  lanternFrame: '#5a4636',
  lanternRoof: '#c9584b',
  bulb: '#ffd98a',
  halo: '#ffc46e',
  flags: ['#f28b82', '#fbd25b', '#8fd3c1', '#7fb8f0', '#c9a0f0', '#ffa8c5'],
});

/**
 * Where the cabin's pieces go for a view `vfovDeg` tall (degrees) and `aspect` wide for its height, in the rig's
 * frame (her eye at the origin, looking down -Z, +X right). At a distance z ahead the view is
 * `halfW(z) = tan(vfov/2) * aspect * |z|` either side of the middle.
 *
 * The dashboard's far top edge is DEPTH.DASHBOARD ahead at `topY`, 62% of the way from the middle of the view to
 * its bottom; it is `halfWidth` either side of the middle, just past the view's edges. The flower pot stands at
 * 75% of the way to the left edge and the lantern 78% of the way to the right, both on the dashboard's ledge. The
 * pillars stand just outside the edges (102%), so only a sliver of each shows, and the roof's front edge (`roof.y`)
 * is 90% of the way to the top. The bunting hangs across between the pillars. `scale` is how big the pieces are
 * against their size on a tall phone.
 * @param {number} vfovDeg
 * @param {number} aspect
 */
export function cabinAnchors(vfovDeg, aspect) {
  const t = Math.tan(MathUtils.degToRad(vfovDeg) / 2);
  const halfW = (z) => t * aspect * Math.abs(z);
  const scale = t / REFERENCE_HALF_HEIGHT;
  const topY = -0.62 * t * DEPTH.DASHBOARD;
  const ledgeZ = -DEPTH.DASHBOARD + (DASH.LEDGE * scale) / 2;
  const pillarX = 1.02 * halfW(DEPTH.PILLARS);
  const pillarRadius = 0.05 * halfW(DEPTH.PILLARS);
  const roofY = 0.9 * t * DEPTH.ROOF;
  return {
    scale,
    dashboard: { z: -DEPTH.DASHBOARD, topY, halfWidth: 1.1 * halfW(DEPTH.DASHBOARD) },
    flowers: { x: -0.75 * halfW(ledgeZ), y: topY, z: ledgeZ },
    lantern: { x: 0.78 * halfW(ledgeZ), y: topY, z: ledgeZ },
    pillars: { x: pillarX, z: -DEPTH.PILLARS, radius: pillarRadius },
    roof: { y: roofY, z: -DEPTH.ROOF },
    bunting: { y: roofY - 0.02 * scale, z: -DEPTH.BUNTING, halfWidth: pillarX - pillarRadius, sag: 0.07 * t * DEPTH.BUNTING },
  };
}

const box = (w, h, d) => new BoxGeometry(w, h, d);

/** A rod along X, `length` long and `r` thick, centred on `position`. */
const rodX = (length, r, colour, position) => part(new CylinderGeometry(r, r, length, 8), colour, {
  position, rotation: [0, 0, Math.PI / 2],
});

/** The dashboard: a wooden console in profile, extruded across, with its ledge, trims, red panel and gauges. */
function dashboard(a) {
  const s = a.scale;
  const { topY, halfWidth } = a.dashboard;
  const far = DEPTH.DASHBOARD;
  const near = far - DASH.LEDGE * s;
  const face = DASH.FACE * s;
  const down = Math.cos(DASH.TILT);
  const back = Math.sin(DASH.TILT);
  const bottom = { ahead: near - back * face, y: topY - down * face };

  // The console's side profile, as (metres ahead, height): its hidden front, the far edge, the ledge, the face.
  const profile = new Shape();
  profile.moveTo(far + 0.1 * s, FLOOR);
  profile.lineTo(far + 0.1 * s, topY - 0.09 * s);
  profile.lineTo(far, topY);
  profile.lineTo(near, topY);
  profile.lineTo(bottom.ahead, bottom.y);
  profile.lineTo(bottom.ahead, FLOOR);
  profile.closePath();
  const body = new ExtrudeGeometry(profile, { depth: 2 * halfWidth, bevelEnabled: false });
  const parts = [part(body, CABIN_COLOURS.wood, { position: [-halfWidth, 0, 0], rotation: [0, Math.PI / 2, 0] })];

  // A point on the sloping face, `u` down it from the ledge, `x` across and `lift` in front of it, and the turn
  // that lays a part built facing +Z onto it.
  const onFace = (u, x, lift) => [x, topY - down * u + Math.sin(DASH.TILT) * lift, -near + back * u + down * lift];
  const faceTurn = [-DASH.TILT, 0, 0];
  // How far down the face the wood runs: to where the face is RED_FROM of the way down the view.
  const reach = DASH.RED_FROM * s * REFERENCE_HALF_HEIGHT;
  const wood = (reach * near + topY) / (down + reach * back);
  parts.push(part(box(2 * halfWidth, face - wood, 0.006), CABIN_COLOURS.panel, {
    position: onFace((wood + face) / 2, 0, 0.003), rotation: faceTurn,
  }));
  parts.push(part(box(2 * halfWidth, bottom.y - FLOOR, 0.006), CABIN_COLOURS.panel, {
    position: [0, (bottom.y + FLOOR) / 2, -bottom.ahead + 0.003],
  }));

  // Rounded trims along the far edge, the ledge's near edge and above the red panel.
  parts.push(rodX(2 * halfWidth + 0.02 * s, 0.02 * s, CABIN_COLOURS.trim, [0, topY - 0.012 * s, -far]));
  parts.push(rodX(2 * halfWidth, 0.013 * s, CABIN_COLOURS.trim, [0, topY - 0.006 * s, -near]));
  parts.push(rodX(2 * halfWidth, 0.009 * s, CABIN_COLOURS.trim, onFace(wood, 0, 0.003)));

  // Two gauges on the wood, their needles at different readings.
  const glow = [];
  const gaugeX = 0.3 * a.dashboard.halfWidth / 1.1;
  for (const [x, reading] of [[-gaugeX, -0.7], [gaugeX, 0.9]]) {
    const gauge = gaugeParts(reading);
    const place = { position: onFace(wood / 2, x, 0.004), rotation: faceTurn, scale: DASH.GAUGE * wood };
    parts.push(...moveParts(gauge.solid, place));
    glow.push(...moveParts(gauge.glow, place));
  }
  return { parts, glow };
}

/**
 * A gauge 1 across, facing +Z, centred on the origin: a gold rim, a cream dial (which glows), ticks, and the needle
 * at `reading` (rad from straight up).
 */
function gaugeParts(reading) {
  const r = 0.5;
  const solid = [
    part(new TorusGeometry(r, r * 0.17, 5, 18), CABIN_COLOURS.gold),
    part(new CylinderGeometry(r * 0.16, r * 0.16, r * 0.15, 8), CABIN_COLOURS.gold, {
      position: [0, 0, r * 0.12], rotation: [Math.PI / 2, 0, 0],
    }),
  ];
  for (let i = 0; i < 5; i++) {
    const angle = -2.1 + (i * 4.2) / 4;
    solid.push(part(box(r * 0.07, r * 0.22, r * 0.05), CABIN_COLOURS.ink, {
      position: [Math.sin(angle) * r * 0.72, Math.cos(angle) * r * 0.72, r * 0.03],
      rotation: [0, 0, -angle],
    }));
  }
  solid.push(part(box(r * 0.09, r * 0.72, r * 0.05), CABIN_COLOURS.needle, {
    position: [Math.sin(reading) * r * 0.32, Math.cos(reading) * r * 0.32, r * 0.07],
    rotation: [0, 0, -reading],
  }));
  return { solid, glow: [part(new CircleGeometry(r * 0.95, 18), CABIN_COLOURS.dial, { position: [0, 0, 0.001] })] };
}

/** A pot of pink flowers, standing on the origin (its size on a tall phone). */
function flowerPot() {
  const parts = [
    part(new CylinderGeometry(0.048, 0.036, 0.07, 9), CABIN_COLOURS.pot, { position: [0, 0.035, 0] }),
    part(new CylinderGeometry(0.055, 0.053, 0.018, 9), CABIN_COLOURS.potRim, { position: [0, 0.07, 0] }),
    part(new CylinderGeometry(0.046, 0.046, 0.006, 9), CABIN_COLOURS.soil, { position: [0, 0.078, 0] }),
  ];
  // Leaves fanning out of the pot.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    parts.push(part(new IcosahedronGeometry(1, 0), CABIN_COLOURS.leaf, {
      position: [Math.sin(angle) * 0.04, 0.1, Math.cos(angle) * 0.04],
      rotation: [Math.cos(angle) * 0.7, 0, -Math.sin(angle) * 0.7],
      scale: [0.016, 0.04, 0.008],
    }));
  }
  // Blooms in a dome, each five petals round a golden heart, tipped toward her.
  const blooms = [
    [0, 0.19, 0.005], [0.04, 0.167, 0.022], [-0.042, 0.163, 0.018], [0.018, 0.157, -0.036],
    [-0.024, 0.172, -0.03], [0.05, 0.142, -0.01], [-0.05, 0.138, -0.012], [0.002, 0.148, 0.045],
  ];
  blooms.forEach(([x, y, z], i) => {
    parts.push(part(new CylinderGeometry(0.003, 0.003, y - 0.07, 4), CABIN_COLOURS.stem, {
      position: [x / 2, (y + 0.07) / 2, z / 2], rotation: [z * 6, 0, -x * 6],
    }));
    const petals = CABIN_COLOURS.petals[i % CABIN_COLOURS.petals.length];
    const bloom = [part(new IcosahedronGeometry(0.009, 0), CABIN_COLOURS.bloomHeart, { position: [0, 0.006, 0] })];
    for (let k = 0; k < 5; k++) {
      const angle = (k / 5) * Math.PI * 2;
      bloom.push(part(new IcosahedronGeometry(1, 0), petals, {
        position: [Math.sin(angle) * 0.015, 0, Math.cos(angle) * 0.015],
        rotation: [0, angle, 0],
        scale: [0.012, 0.006, 0.016],
      }));
    }
    parts.push(...moveParts(bloom, { position: [x, y, z], rotation: [0.6 + z * 4, 0, -x * 5] }));
  });
  return parts;
}

/** A little carriage lantern standing on the origin (its size on a tall phone): its frame, and its glowing bulb. */
function lantern() {
  const frame = CABIN_COLOURS.lanternFrame;
  const solid = [
    part(box(0.085, 0.016, 0.085), frame, { position: [0, 0.008, 0] }),
    part(box(0.09, 0.012, 0.09), frame, { position: [0, 0.122, 0] }),
    part(new ConeGeometry(0.068, 0.05, 4), CABIN_COLOURS.lanternRoof, { position: [0, 0.153, 0], rotation: [0, Math.PI / 4, 0] }),
    part(new IcosahedronGeometry(0.009, 0), CABIN_COLOURS.gold, { position: [0, 0.183, 0] }),
    part(new TorusGeometry(0.022, 0.004, 4, 10, Math.PI), CABIN_COLOURS.gold, { position: [0, 0.188, 0] }),
  ];
  for (const x of [-0.036, 0.036]) {
    for (const z of [-0.036, 0.036]) solid.push(part(box(0.009, 0.1, 0.009), frame, { position: [x, 0.066, z] }));
  }
  return { solid, glow: [part(new IcosahedronGeometry(0.03, 1), CABIN_COLOURS.bulb, { position: [0, 0.066, 0] })], bulb: [0, 0.066, 0] };
}

/** The pillars, the low front wall between them, the floor, and the roof. */
function frame(a) {
  const s = a.scale;
  const { x: pillarX, z: pillarZ, radius } = a.pillars;
  const roofY = a.roof.y;
  const wide = pillarX + radius;
  const beam = 0.075 * s;
  const parts = [];
  for (const x of [-pillarX, pillarX]) {
    parts.push(part(new CylinderGeometry(radius, radius, roofY - FLOOR, 8), CABIN_COLOURS.trim, {
      position: [x, (roofY + FLOOR) / 2, pillarZ],
    }));
    // Gold rings: one just above the dashboard, one under the roof.
    for (const y of [a.dashboard.topY * 1.4, roofY - 0.05 * s]) {
      parts.push(part(new CylinderGeometry(radius * 1.3, radius * 1.3, 0.022 * s, 8), CABIN_COLOURS.gold, { position: [x, y, pillarZ] }));
    }
  }
  // The front wall is low enough to stay hidden behind the dashboard; she sees it when she looks to the side.
  const wallTop = -0.95 * s * REFERENCE_HALF_HEIGHT;
  parts.push(part(box(2 * wide, wallTop - FLOOR, 0.06), CABIN_COLOURS.panel, { position: [0, (wallTop + FLOOR) / 2, pillarZ] }));
  parts.push(part(box(2 * wide, 0.03, 0.09), CABIN_COLOURS.trim, { position: [0, wallTop, pillarZ] }));
  parts.push(part(box(2 * wide, 0.04, 2.4), CABIN_COLOURS.floor, { position: [0, FLOOR - 0.02, -0.25] }));

  // The roof: a beam along its front edge with a cream stripe painted along its foot, and the wooden ceiling above
  // it. The beam is shallow, so little of its underside shows: lit from below by the ground, it would turn the
  // colour of the grass.
  const roofFront = -DEPTH.ROOF;
  parts.push(part(box(2 * wide + 0.12, beam, 0.05), CABIN_COLOURS.trim, { position: [0, roofY + beam / 2, roofFront + 0.025] }));
  parts.push(part(box(2 * wide + 0.12, 0.014 * s, 0.004), CABIN_COLOURS.cream, { position: [0, roofY + 0.009 * s, roofFront + 0.052] }));
  parts.push(part(box(2 * wide + 0.16, 0.04, 2.5), CABIN_COLOURS.wood, { position: [0, roofY + beam + 0.02, roofFront - 0.04 + 1.25] }));
  return parts;
}

/**
 * Where the bunting hangs: the string's points, and where each flag hangs from it, in swags between little gold
 * hooks under the roof.
 */
function buntingLayout(a) {
  const s = a.scale;
  const { y, z, halfWidth, sag } = a.bunting;
  const swags = Math.max(1, Math.round((2 * halfWidth) / BUNTING.SWAG));
  const span = (2 * halfWidth) / swags;
  const heightAt = (x) => {
    const along = (x + halfWidth) / span;
    const t = along - Math.floor(along);
    return y - sag * 4 * t * (1 - t);
  };
  const string = [];
  const hooks = [];
  for (let k = 0; k <= swags; k++) hooks.push([-halfWidth + k * span, y, z]);
  for (let i = 0; i <= swags * 12; i++) {
    const x = -halfWidth + (i / 12) * span;
    string.push([x, heightAt(x), z]);
  }
  const flags = [];
  const width = BUNTING.FLAG_W * s;
  const pitch = width * (1 + BUNTING.GAP);
  for (let k = 0; k < swags; k++) {
    const each = Math.max(1, Math.floor((span - width) / pitch));
    const from = -halfWidth + k * span + (span - (each - 1) * pitch) / 2;
    for (let i = 0; i < each && flags.length < BUNTING.MAX_FLAGS; i++) {
      const x = from + i * pitch;
      flags.push({ x, y: heightAt(x), z, phase: flags.length * 1.7 });
    }
  }
  return { string, hooks, flags };
}

/** A flag: a downward-pointing triangle hanging from its top edge at the origin, 1 wide and 1 tall, seen from both sides. */
function flagGeometry() {
  const front = [-0.5, 0, 0, 0, -1, 0, 0.5, 0, 0];
  const back = [0.5, 0, 0, 0, -1, 0, -0.5, 0, 0];
  return triangleSoup([...front, ...back], new Array(18).fill(1));
}

/**
 * The cabin.
 * @returns {{ group: Group, fit: (camera: import('../three.js').PerspectiveCamera) => void,
 *             update: (dt: number, speed: number, time: number) => void, setVisible: (visible: boolean) => void }}
 *   Add `group` to the camera's rig. `fit` lays it out for the camera's field of view and shape (call it whenever
 *   the screen changes; it does nothing if they have not). `update` bobs it with the train's speed (m/s) and sways
 *   the bunting; `time` is the seconds since the start.
 */
export function createCabin() {
  const group = new Group();
  group.name = 'cabin';
  const body = new Mesh(undefined, MATERIALS.solid);
  body.name = 'cabin-body';
  const lit = new Mesh(undefined, MATERIALS.glow);
  lit.name = 'cabin-glow';
  const flags = new InstancedMesh(flagGeometry(), MATERIALS.solid, BUNTING.MAX_FLAGS);
  flags.name = 'cabin-bunting';
  const colour = new Color();
  for (let i = 0; i < BUNTING.MAX_FLAGS; i++) flags.setColorAt(i, colour.set(CABIN_COLOURS.flags[i % CABIN_COLOURS.flags.length]));
  const halo = new Sprite(new SpriteMaterial({
    map: MATERIALS.halo.map, color: CABIN_COLOURS.halo, transparent: true, opacity: 0.8,
    depthWrite: false, blending: AdditiveBlending, fog: false,
  }));
  halo.name = 'cabin-lantern-halo';
  group.add(body, lit, flags, halo);

  let laidOut = '';
  let hanging = [];
  let flagSize = 0;

  function layOut(vfov, aspect) {
    const a = cabinAnchors(vfov, aspect);
    const s = a.scale;
    const dash = dashboard(a);
    const light = lantern();
    const atLantern = { position: [a.lantern.x, a.lantern.y, a.lantern.z], scale: s };
    const { string, hooks, flags: spots } = buntingLayout(a);
    const solid = [
      ...dash.parts,
      ...frame(a),
      ...moveParts(flowerPot(), { position: [a.flowers.x, a.flowers.y, a.flowers.z], scale: s }),
      ...moveParts(light.solid, atLantern),
    ];
    for (let i = 0; i + 1 < string.length; i++) solid.push(rod(string[i], string[i + 1], 0.0035 * s, CABIN_COLOURS.ink));
    for (const hook of hooks) solid.push(part(new IcosahedronGeometry(0.012 * s, 0), CABIN_COLOURS.gold, { position: hook }));

    body.geometry.dispose();
    body.geometry = mergeParts(solid);
    lit.geometry.dispose();
    lit.geometry = mergeParts([...dash.glow, ...moveParts(light.glow, atLantern)]);
    halo.position.set(a.lantern.x + light.bulb[0] * s, a.lantern.y + light.bulb[1] * s, a.lantern.z + light.bulb[2] * s);
    halo.scale.setScalar(0.24 * s);

    hanging = spots;
    flagSize = s;
    flags.count = spots.length;
    swayFlags(0, 0);
    flags.computeBoundingSphere();
  }

  const turn = new Quaternion();
  const matrix = new Matrix4();
  const at = new Vector3();
  const size = new Vector3();
  const X_AXIS = new Vector3(1, 0, 0);

  /** Each flag swings about the string: a gentle flutter, blown back a little more the faster the train goes. */
  function swayFlags(time, wind) {
    size.set(BUNTING.FLAG_W * flagSize, BUNTING.FLAG_H * flagSize, 1);
    for (let i = 0; i < hanging.length; i++) {
      const f = hanging[i];
      const swing = BUNTING.SWAY * (0.5 + 0.5 * wind) * Math.sin(time * 2.4 + f.phase) - BUNTING.WIND * wind;
      turn.setFromAxisAngle(X_AXIS, swing);
      flags.setMatrixAt(i, matrix.compose(at.set(f.x, f.y, f.z), turn, size));
    }
    flags.instanceMatrix.needsUpdate = true;
  }

  function fit(camera) {
    const key = `${camera.fov}:${camera.aspect}`;
    if (key === laidOut) return;
    laidOut = key;
    layOut(camera.fov, camera.aspect);
  }

  function update(dt, speed, time) {
    const pace = clamp(speed / RIDE.CRUISE, 0, 1) || 0;
    group.position.y = BOB.HEIGHT * pace * Math.sin(2 * Math.PI * BOB.RATE * time);
    swayFlags(time, pace);
    halo.material.opacity = 0.8 * (0.92 + 0.05 * Math.sin(time * 11) + 0.03 * Math.sin(time * 17.3));
  }

  // Laid out for a tall phone until the app fits it to the real screen.
  layOut(80, 390 / 844);

  return {
    group,
    fit,
    update,
    setVisible(visible) {
      group.visible = visible;
    },
  };
}

/** A thin rod from a to b ([x, y, z]), r thick. */
function rod(a, b, r, colour) {
  const from = new Vector3(...a);
  const to = new Vector3(...b);
  const p = part(new CylinderGeometry(r, r, from.distanceTo(to), 4), colour);
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
  p.matrix.compose(from.clone().add(to).multiplyScalar(0.5), turn, new Vector3(1, 1, 1));
  return p;
}
