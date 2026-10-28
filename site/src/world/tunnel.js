// The tunnel into winter: the track runs into a hill under a stone portal, through a dark tunnel lit by warm lamps,
// and out under another portal into the snow. The scenery changes from one zone to the next while she is inside, so
// she goes in in one season and comes out in winter without ever seeing the blend.
//
// Where it goes (`tunnelSpan`): centred on the boundary into winter, wherever winter falls in the zone order. If
// winter is first or not in the ride, it goes on the boundary nearest the middle of the ride instead, but never on
// the one into evening, the finale's town. It is as long as fits, up to MAX_LENGTH, leaving STOP_CLEAR metres of
// open track to every stop and always covering the whole blend window (layout.js BLEND), where the scenery changes.
// With the default ride that is 540 to 600 m. If even the blend window will not fit, there is no tunnel.
//
// The hill is the ground's own (terrain.js, given the span): either side of the track it rises MOUND metres over the
// tunnel's stretch and eases down beyond the portals, a roof of ground closes over the tunnel between the portals,
// tucked in behind their tops (`portalTop`), and the props keep off it (dressing.js). This module builds what is in
// it (`createTunnel`):
//   - the shell: walls and an arched roof swept along the curving track, drawn unlit with the dark baked into its
//     vertex colours, so it stays dark however the world outside is lit. The stone is paler near the portals, where
//     daylight reaches in, and warm round each lamp. The frame dims the world's own light while she is inside
//     (`tunnelInside`), so the cabin and the track go dim with her;
//   - a stone portal at each end, set into the hillside: a headwall whose wing walls slope down into the hill either
//     side, a pilaster at each shoulder, a ring of arch stones round the opening, a keystone and a coping. It
//     reaches below the ground and back into the hill, so the hill closes round it with no gap;
//   - a warm lamp on each wall every LAMP_EVERY metres, with a soft halo, going by at a steady rhythm;
//   - the light at the end: an additive white glow over the far opening that comes up over the last EXIT_GLOW.FROM
//     metres inside, so she comes out through a blaze of daylight. It faces back into the tunnel, so once she is out
//     it is gone.
// About five draw calls, and nothing at all is drawn while the train is far from it.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it.

import {
  AdditiveBlending, BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Group, Matrix4, Mesh,
  MeshBasicMaterial, Points, Shape, Vector3,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, triangleSoup } from '../util/geo.js';
import { smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';
import { LAYOUT } from './layout.js';

/**
 * Distances in metres. MAX_LENGTH: the longest the tunnel gets. STOP_CLEAR: open track kept between it and every
 * stop. HALF_WIDTH and HEIGHT: the inside, from the centre line to a wall and from the rails' ground to the crown of
 * the arch. WALL: how thick the lining is. EASE: how far past each portal `inside` takes to go from 0 to 1. LAMP_EVERY:
 * between one lamp and the next along a wall. MOUND: how high the hill over the tunnel stands above the rails' ground.
 */
export const TUNNEL = Object.freeze({
  MAX_LENGTH: 60,
  STOP_CLEAR: 25,
  HALF_WIDTH: 3.2,
  HEIGHT: 4.6,
  WALL: 1.2,
  EASE: 8,
  LAMP_EVERY: 7,
  MOUND: 7.5,
});

/**
 * A portal's headwall (m). Over the opening it is flat-topped, TOP above the rails' ground, out to SHOULDER either
 * side of the centre line; from there its wing walls slope down to WING_TOP at WING, their ends, where they have run
 * into the hillside. It stands from BOTTOM, under the ground, OUT metres out of the hill in front of the tunnel, and
 * reaches IN metres back into it, as far as the lining is thick. The ground's roof over the tunnel (terrain.js) tucks
 * in behind its top.
 */
export const PORTAL = Object.freeze({ SHOULDER: 5.2, TOP: 6.4, WING: 10, WING_TOP: 3.6, BOTTOM: -1.5, OUT: 0.8, IN: TUNNEL.WALL });

/**
 * The height of a portal's top edge (m above the rails' ground) `x` metres either side of the centre line. Past the
 * ends of its wings it carries on down the same slope, into the ground.
 * @param {number} x
 * @returns {number}
 */
export function portalTop(x) {
  const { SHOULDER, TOP, WING, WING_TOP } = PORTAL;
  const out = Math.abs(x) - SHOULDER;
  return out <= 0 ? TOP : TOP + ((WING_TOP - TOP) * out) / (WING - SHOULDER);
}

/**
 * @typedef {{ from: number, to: number, boundary: number }} TunnelSpan
 *   The tunnel runs from `from` to `to` (distances along the track, m), centred on the zone `boundary` it hides.
 */

/**
 * Where the tunnel goes along the ride, or null when there is no room for one (or no boundary to hide).
 * @param {import('./layout.js').Layout} layout
 * @returns {TunnelSpan|null}
 */
export function tunnelSpan(layout) {
  const { zones, stops, total } = layout;
  // Every boundary but the last, which is always the one into evening (normalize.js keeps evening last).
  const boundaries = zones.slice(0, -2).map((zone) => zone.end);
  const winter = zones.findIndex((zone) => zone.id === 'winter');
  let boundary = null;
  if (winter > 0) {
    boundary = zones[winter].start;
  } else {
    for (const b of boundaries) {
      if (boundary === null || Math.abs(b - total / 2) < Math.abs(boundary - total / 2)) boundary = b;
    }
  }
  if (boundary === null) return null;
  let half = TUNNEL.MAX_LENGTH / 2;
  for (const stop of stops) half = Math.min(half, Math.abs(stop.distance - boundary) - TUNNEL.STOP_CLEAR);
  if (half < LAYOUT.BLEND / 2) return null;
  return { from: boundary - half, to: boundary + half, boundary };
}

/**
 * How far inside the tunnel the train is at `d`: 0 out in the open, 1 inside, easing over the first and last EASE
 * metres. 0 when there is no tunnel.
 * @param {TunnelSpan|null} span
 * @param {number} d  distance along the track (m)
 * @returns {number}
 */
export function tunnelInside(span, d) {
  if (!span) return 0;
  const { from, to } = span;
  return smoothstep(from, from + TUNNEL.EASE, d) * (1 - smoothstep(to - TUNNEL.EASE, to, d));
}

// ---------------------------------------------------------------------------------------------------------------
// The tunnel itself
// ---------------------------------------------------------------------------------------------------------------

/**
 * The inside's cross-section (m): the walls stand straight up from FOOT, below the ground so no gap shows at their
 * feet, to SPRING, where the arch begins; the arch is half an ellipse of ARCH_SEGMENTS straight pieces up to HEIGHT.
 * WALL_CUTS are where the walls are cut between (for the lamps' warm light, and the jamb stones of the portals).
 */
const FOOT = -0.3;
const SPRING = 2.2;
const WALL_CUTS = [0.8, 1.6];
const ARCH_SEGMENTS = 10;

/**
 * The tunnel's floor either side of the track (m): VERGE_Y above the ground, from VERGE_FROM out from the centre line
 * (over the track bed's sloping edge, trackMesh.js, which is below it there) to the walls. It is lined like the
 * walls, so the floor stays dark inside too, the light of the world outside dimmed or not.
 */
const VERGE_FROM = 2;
const VERGE_Y = 0.03;

/** The shell's rows are this far apart along the track (m), on the half-metre lattice like the ground's. */
const ROW_STEP = 1;
const ROW_PHASE = 0.5;

/**
 * The lining's colours (sRGB), baked in: DEEP where no light reaches, DAYLIT near a portal (daylight reaches DAYLIGHT
 * metres in), LAMPLIT in a lamp's warm pool (POOL m across, about). SHADE: how much lighter or darker each stone may be.
 */
const LINING = Object.freeze({
  DEEP: '#2a2522',
  DAYLIT: '#7d756b',
  LAMPLIT: '#c08548',
  DAYLIGHT: 10,
  POOL: 1.3,
  SHADE: 0.14,
});

/**
 * How the arch stones go round a portal's opening (m): RING wide (every other one LONG times that), standing PROUD of
 * the headwall's face. The keystone over the crown is KEY wide and stands KEY_ABOVE over the longer stones.
 */
const ARCH_STONES = Object.freeze({ RING: 0.55, LONG: 1.35, PROUD: 0.12, KEY: 0.76, KEY_ABOVE: 0.2 });

/** How thick the coping along the top of a headwall is (m), and how far it overhangs; how wide its pilasters are (m). */
const COPING = 0.3;
const PILASTER = 0.8;

/** The portals' stone (sRGB). */
const STONE = Object.freeze({
  face: '#8f877d',
  pilaster: '#9d958a',
  ring: ['#b3aa9c', '#a49b8d'],
  key: '#c4baa9',
  coping: '#bcb2a3',
});

/** A lamp (m): its glass, on a dark back plate, HEIGHT above the rails' ground. */
const LAMP = Object.freeze({ HEIGHT: 1.9, GLASS: [0.2, 0.3, 0.16], PLATE: [0.28, 0.42, 0.04], GLASS_COLOUR: '#ffd98a', PLATE_COLOUR: '#2b2622' });
/** The halo sits this far out from the wall (m), in front of the glass, so the wall never cuts it. */
const HALO_OUT = 0.35;

/**
 * The light at the end: it comes up from FROM metres before the far portal and is full FULL metres before it. It is
 * brightest (BRIGHT, of white) CENTRE metres above the rails' ground, in the middle of the opening, and RIM at its edge.
 */
const EXIT_GLOW = Object.freeze({ FROM: 25, FULL: 3, CENTRE: 2, BRIGHT: 0.85, RIM: 0.3 });

/** Nothing of the tunnel is drawn while the train is further than this from both its ends (m): the fog hides it. */
const RANGE = 200;

/** The lining's shades are seeded, so it looks the same on every phone. */
const SEED = 4242;

const UP = new Vector3(0, 1, 0);

/** The inside's cross-section, left to right over the inside: [metres right of the centre line, height]. */
function insideProfile() {
  const { HALF_WIDTH, HEIGHT } = TUNNEL;
  const wall = [FOOT, ...WALL_CUTS, SPRING];
  const points = wall.map((y) => [-HALF_WIDTH, y]);
  for (let i = 1; i < ARCH_SEGMENTS; i++) {
    const angle = Math.PI * (1 - i / ARCH_SEGMENTS);
    points.push([HALF_WIDTH * Math.cos(angle), SPRING + (HEIGHT - SPRING) * Math.sin(angle)]);
  }
  points.push(...wall.reverse().map((y) => [HALF_WIDTH, y]));
  return points;
}

/** The same outline pushed `out` metres further out from the opening (the arch stays an ellipse). */
function widened(profile, out) {
  const { HALF_WIDTH, HEIGHT } = TUNNEL;
  return profile.map(([x, y]) => {
    if (y <= SPRING) return [Math.sign(x) * (HALF_WIDTH + out), y];
    const c = x / HALF_WIDTH;
    const s = (y - SPRING) / (HEIGHT - SPRING);
    return [c * (HALF_WIDTH + out), SPRING + s * (HEIGHT - SPRING + out)];
  });
}

/** Where along the track the lamps hang: LAMP_EVERY apart, as many as fit, centred in the tunnel. */
function lampDistances({ from, to }) {
  const count = Math.floor((to - from) / TUNNEL.LAMP_EVERY);
  const first = (from + to) / 2 - ((count - 1) / 2) * TUNNEL.LAMP_EVERY;
  return Array.from({ length: count }, (_, k) => first + k * TUNNEL.LAMP_EVERY);
}

/**
 * The distances of the shell's rows: both portals and, between them, every ROW_STEP metres on the half-metre lattice
 * (terrain.js ROW_PHASE says why: a row in the camera's own plane is garbled by the software renderer).
 */
function rowDistances(from, to) {
  const rows = [from];
  let d = Math.floor(from - ROW_PHASE) + ROW_PHASE;
  while (d < from + 0.1) d += ROW_STEP;
  for (; d < to - 0.1; d += ROW_STEP) rows.push(d);
  rows.push(to);
  return rows;
}

/** A frame at `d` on the centre line at the rails' ground, with +z pointing `forward` (a unit vector) and +y up. */
function frameMatrix(path, d, forward) {
  const x = new Vector3().crossVectors(UP, forward);
  return new Matrix4().makeBasis(x, UP, forward).setPosition(path.frameAt(d, 0, 0));
}

/** A flat polygon ([x, y] points) made solid from z = z0 to z = z1. */
function slab(points, z0, z1) {
  const shape = new Shape(points.map(([x, y]) => ({ x, y })));
  const geometry = new ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.translate(0, 0, z0);
  return geometry;
}

/** A box from corner `a` to corner `b` ([x, y, z] each) as a slab. */
function box([x0, y0, z0], [x1, y1, z1]) {
  return slab([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1);
}

/**
 * The shell: the inside's cross-section and the verges swept along the track from `from` to `to`, their faces looking
 * in. Every corner takes the light where it stands (`lightAt`), and each stone (a quad between two rows) is a shade of
 * its own.
 */
function buildShell(path, { from, to }, lamps) {
  const { HALF_WIDTH } = TUNNEL;
  const sections = [
    insideProfile().reverse(), // right to left, so the faces look in (trackMesh.js sweeps the outside)
    [[-HALF_WIDTH, VERGE_Y], [-VERGE_FROM, VERGE_Y]], // left to right, so the floor faces up
    [[VERGE_FROM, VERGE_Y], [HALF_WIDTH, VERGE_Y]],
  ];
  const rows = rowDistances(from, to);
  const deep = new Color(LINING.DEEP);
  const daylit = new Color(LINING.DAYLIT);
  const lamplit = new Color(LINING.LAMPLIT);
  const reach = 2 * LINING.POOL * LINING.POOL;
  const rng = createRng(SEED);
  const lightAt = (d, x, y) => {
    let pool = 0;
    for (const lamp of lamps) {
      const far = (d - lamp.d) ** 2 + (x - lamp.x) ** 2 + (y - LAMP.HEIGHT) ** 2;
      pool = Math.max(pool, Math.exp(-far / reach));
    }
    const day = 1 - smoothstep(0, LINING.DAYLIGHT, Math.min(d - from, to - d));
    return deep.clone().lerp(daylit, day).lerp(lamplit, pool);
  };
  const rowAt = (d) => sections.map((section) => section.map(([x, y]) => ({ point: path.frameAt(d, x, y), colour: lightAt(d, x, y) })));
  const positions = [];
  const colors = [];
  let row = rowAt(rows[0]);
  for (let r = 1; r < rows.length; r++) {
    const next = rowAt(rows[r]);
    for (let s = 0; s < sections.length; s++) {
      for (let p = 0; p + 1 < sections[s].length; p++) {
        // a, b: this row; f, g: the next row along. Counter-clockwise seen from inside.
        const a = row[s][p], b = row[s][p + 1], f = next[s][p], g = next[s][p + 1];
        const shade = 1 + rngRange(rng, -LINING.SHADE, LINING.SHADE);
        for (const { point, colour } of [a, b, g, a, g, f]) {
          positions.push(point.x, point.y, point.z);
          colors.push(colour.r * shade, colour.g * shade, colour.b * shade);
        }
      }
    }
    row = next;
  }
  const shell = new Mesh(triangleSoup(positions, colors), MATERIALS.glow);
  shell.name = 'tunnel-shell';
  shell.castShadow = true; // keeps the sun off the track inside, where shadows are drawn
  return shell;
}

/**
 * One portal, built at the origin facing +z (out of the tunnel, towards the open track), the opening's plane at z = 0
 * where the shell begins, as coloured parts: the headwall with its wings, the ring of arch stones, the pilasters, the
 * keystone and the coping.
 */
function portalParts() {
  const { SHOULDER, TOP, WING, WING_TOP, BOTTOM, OUT, IN } = PORTAL;
  const { RING, LONG, PROUD, KEY, KEY_ABOVE } = ARCH_STONES;
  const inside = insideProfile();
  const ring = widened(inside, RING);
  // The headwall and its wings: one slab with the opening (the outside of the arch stones) cut up from its foot.
  const outline = [
    [-WING, BOTTOM], [ring[0][0], BOTTOM], ...ring, [ring.at(-1)[0], BOTTOM], [WING, BOTTOM],
    [WING, WING_TOP], [SHOULDER, TOP], [-SHOULDER, TOP], [-WING, WING_TOP],
  ];
  const parts = [{ geometry: slab(outline, -IN, OUT), color: new Color(STONE.face), matrix: new Matrix4() }];
  // The arch stones, every other one longer, standing proud of the face. The stones' inner faces are the opening,
  // exactly the shell's own cross-section, so the lining runs straight on into the portal. One stone spans the crown
  // (no joint there: seen from below, a joint's upright faces fight the stones' undersides along the crown).
  const long = widened(inside, RING * LONG);
  const crown = (inside.length - 1) / 2;
  const joints = [...inside.keys()].filter((i) => i !== crown);
  for (let k = 0; k + 1 < joints.length; k++) {
    const outer = k % 2 === 0 ? ring : long;
    const along = inside.slice(joints[k], joints[k + 1] + 1);
    const stone = [...along, ...outer.slice(joints[k], joints[k + 1] + 1).reverse()];
    parts.push({ geometry: slab(stone, 0, OUT + PROUD), color: new Color(STONE.ring[k % 2]), matrix: new Matrix4() });
  }
  // A pilaster either side, where the wings begin, standing proud of the face.
  for (const side of [-1, 1]) {
    const [x0, x1] = [side * (SHOULDER - PILASTER), side * SHOULDER].sort((a, b) => a - b);
    parts.push({ geometry: box([x0, BOTTOM, 0], [x1, TOP, OUT + PROUD]), color: new Color(STONE.pilaster), matrix: new Matrix4() });
  }
  // The keystone over the crown (its foot just above the opening, inside the crown stone), and the coping along the top.
  const crownHeight = TUNNEL.HEIGHT;
  const key = box([-KEY / 2, crownHeight + 0.02, 0], [KEY / 2, crownHeight + RING * LONG + KEY_ABOVE, OUT + PROUD * 2.5]);
  parts.push({ geometry: key, color: new Color(STONE.key), matrix: new Matrix4() });
  const coping = (points) => ({ geometry: slab(points, -IN - 0.1, OUT + 0.2), color: new Color(STONE.coping), matrix: new Matrix4() });
  const c = COPING;
  parts.push(coping([[-SHOULDER - c, TOP], [SHOULDER + c, TOP], [SHOULDER + c, TOP + c], [-SHOULDER - c, TOP + c]]));
  for (const side of [-1, 1]) {
    const wing = [[side * SHOULDER, TOP], [side * WING, WING_TOP], [side * WING, WING_TOP + c], [side * SHOULDER, TOP + c]];
    parts.push(coping(side > 0 ? wing : wing.reverse()));
  }
  return parts;
}

/** The portals at both ends, as one mesh: each set square to the track where it stands, facing out. */
function buildPortals(path, { from, to }) {
  const model = portalParts();
  const ahead = path.tangentAt(from);
  const parts = [];
  for (const matrix of [frameMatrix(path, from, ahead.clone().negate()), frameMatrix(path, to, path.tangentAt(to))]) {
    for (const p of model) parts.push({ geometry: p.geometry, color: p.color, matrix: matrix.clone().multiply(p.matrix) });
  }
  const portals = new Mesh(mergeParts(parts), MATERIALS.solid);
  portals.name = 'tunnel-portals';
  portals.castShadow = true;
  portals.receiveShadow = true;
  return portals;
}

/** A lamp on each wall at every lamp distance, with a halo in front of each glass. */
function buildLamps(path, lamps) {
  const [gw, gh, gd] = LAMP.GLASS;
  const [pw, ph, pd] = LAMP.PLATE;
  const plate = box([-pw / 2, -ph / 2, 0], [pw / 2, ph / 2, pd]);
  const glass = box([-gw / 2, -gh / 2, pd], [gw / 2, gh / 2, pd + gd]);
  const parts = [];
  const halos = [];
  const inward = new Vector3();
  for (const lamp of lamps) {
    // Built facing +z out from the wall, towards the centre line.
    path.sideAt(lamp.d, inward).multiplyScalar(-Math.sign(lamp.x));
    const matrix = frameMatrix(path, lamp.d, inward);
    matrix.setPosition(path.frameAt(lamp.d, lamp.x, LAMP.HEIGHT));
    parts.push({ geometry: plate, color: new Color(LAMP.PLATE_COLOUR), matrix });
    parts.push({ geometry: glass, color: new Color(LAMP.GLASS_COLOUR), matrix });
    halos.push(...path.frameAt(lamp.d, lamp.x - Math.sign(lamp.x) * HALO_OUT, LAMP.HEIGHT).toArray());
  }
  const mesh = new Mesh(mergeParts(parts), MATERIALS.glow);
  mesh.name = 'tunnel-lamps';
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(halos, 3));
  geometry.computeBoundingSphere();
  const points = new Points(geometry, MATERIALS.halo);
  points.name = 'tunnel-lamp-halos';
  return [mesh, points];
}

/**
 * The light at the end: a fan over the far opening, white in the middle and paler at the rim, added to what is
 * behind it like light. It faces back into the tunnel, towards her.
 */
function buildExitGlow(path, { to }) {
  const rim = insideProfile();
  const centre = [0, EXIT_GLOW.CENTRE];
  const positions = [];
  const colors = [];
  // Facing back along the track, +x is on her right as she looks out; each triangle runs counter-clockwise as she
  // sees it.
  const matrix = frameMatrix(path, to - 0.05, path.tangentAt(to).negate());
  const corner = new Vector3();
  const add = ([x, y], brightness) => {
    corner.set(x, y, 0).applyMatrix4(matrix);
    positions.push(corner.x, corner.y, corner.z);
    colors.push(brightness, brightness, brightness);
  };
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i];
    const b = rim[(i + 1) % rim.length]; // the last runs along the floor, back to the first
    add(centre, EXIT_GLOW.BRIGHT);
    add(b, EXIT_GLOW.RIM);
    add(a, EXIT_GLOW.RIM);
  }
  // Unlit, vertex-coloured and fogged like MATERIALS.glow, so it draws with a shader already compiled for that one.
  const material = new MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
  });
  const glow = new Mesh(triangleSoup(positions, colors), material);
  glow.name = 'tunnel-exit-glow';
  glow.visible = false;
  return glow;
}

/**
 * The tunnel along `span`: its shell, its portals, its lamps and the light at the end.
 * @param {import('./trackPath.js').TrackPath} path
 * @param {TunnelSpan|null} span
 * @returns {{ group: Group, update: (d: number) => void }}
 *   Add `group` to the scene (it is empty when there is no tunnel). Call `update` every frame with where the train
 *   is (m): it brings up the light at the end, and draws nothing while the train is far away.
 */
export function createTunnel(path, span) {
  const group = new Group();
  group.name = 'tunnel';
  if (!span) return { group, update() {} };
  const lamps = lampDistances(span).flatMap((d) => [-1, 1].map((side) => ({ d, x: side * TUNNEL.HALF_WIDTH })));
  const exitGlow = buildExitGlow(path, span);
  group.add(buildShell(path, span, lamps), buildPortals(path, span), ...buildLamps(path, lamps), exitGlow);

  function update(d) {
    group.visible = d > span.from - RANGE && d < span.to + RANGE;
    const glow = d < span.to ? smoothstep(span.to - EXIT_GLOW.FROM, span.to - EXIT_GLOW.FULL, d) : 0;
    exitGlow.material.opacity = glow;
    exitGlow.visible = glow > 0;
  }

  return { group, update };
}
