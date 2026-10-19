// The two stations: `Day 1`, where the ride starts, and `Day 365`, where it ends and the finale plays out.
//
// Each has a platform on the right of the track, a canopy on green posts with a scalloped valance, a hanging
// name board facing the arriving train (its name drawn on a canvas in Cormorant Garamond, its digits in Nunito as
// util/canvasText.js explains), a bench, flower planters and an old street lamp. The finale station adds a little
// station house behind the platform, whose door the boy comes out of in the finale (Task 14), more lamps and string
// lights between them.
//
// Both stations stand on straight track (app.js keeps the start and the finale straight), so each is built in
// the frame of its centre: local +X is right of the track, +Y up and -Z ahead (further along the track). On the
// finale platform the stretch where the couple meet (Task 14: she steps off at 0.4 m along, he walks from the
// door at 7.5 m along, 7.0 m right, to 1.2 m along, 3.6 m right) is kept clear of posts and furniture, and the
// canopy starts ahead of it, so a camera pulled out to the right of the platform sees the two of them under
// the open sky.
//
// Each station is drawn in at most five draw calls: everything solid merged into one mesh, everything that
// glows (lamp glass, windows) in another, the string-light bulbs as one InstancedMesh, the halos round the
// lamps (render/materials.js `halo`) and the name board.
//
// DOM-free at import time; `createStation` draws its board on a canvas when there is a document, and leaves the
// board plain otherwise (the Node unit tests).

import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry,
  Float32BufferAttribute, Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Points,
  Quaternion, SRGBColorSpace, Vector3,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, moveParts, part, triangleSoup } from '../util/geo.js';
import { displayTextWidth, fillDisplayText } from '../util/canvasText.js';
import { createPropGeometry } from './props.js';

/** The platform: its top's height and how far its near and far edges are right of the centre line (m). */
export const STATION = Object.freeze({ PLATFORM_TOP: 0.6, PLATFORM_NEAR: 2.4, PLATFORM_FAR: 6.0 });

/** Where the start station's platform is centred (m along the track): it runs from the start, 0, to 16. */
export const START_STATION_DISTANCE = 8;

/** The platform is this long (m), centred on the station's distance. */
const PLATFORM_LENGTH = 2 * START_STATION_DISTANCE;

/**
 * Each station's look and where its things stand, in metres `along` the track from its centre (ahead +) and
 * `right` of the centre line. The canopy runs from `canopy[0]` to `canopy[1]` along, on posts at `posts`;
 * `board` is where the name board hangs.
 */
const KINDS = Object.freeze({
  start: {
    name: 'Day 1',
    roof: '#ee8c86',
    canopy: [-0.5, 8], posts: [-0.1, 3.9, 7.7], board: 7.85,
    lamps: [-7.3], bench: -4.2, planters: [-6.2, -2.2],
    house: false, strings: [],
  },
  finale: {
    name: 'Day 365',
    roof: '#5d6fa8',
    canopy: [2.2, 8], posts: [2.7, 7.9], board: 2.45,
    lamps: [-7.4, -3.0, 1.4], bench: -5.3, planters: [-1.3, -7.7],
    house: true, strings: [[-7.4, -3.0], [-3.0, 1.4]],
  },
});

/** Colours (sRGB hex). */
const COLOURS = Object.freeze({
  wall: '#c98a72',      // the platform's brick side
  paving: '#eadfcb',
  coping: '#fff3d1',    // the pale edge stone along the track
  post: '#3f6f5d',
  valance: '#fff7ea',
  boardFrame: '#3f6f5d',
  boardPaper: '#fff8ec',
  boardInk: '#33493c',
  heart: '#e0607e',
  wood: '#b07642',
  wire: '#3b3a40',
  houseWalls: '#f6e2bd',
  houseRoof: '#c8594a',
  houseTrim: '#fffaf2',
  door: '#3f6f5d',
  doorKnob: '#f2c14e',
  chimney: '#a8705a',
  windowGlow: '#ffd27a',
  clockFace: '#fffdf6',
  clockHands: '#2d2a32',
});

/** The string-light bulbs, in turn. */
const BULBS = ['#ffd27a', '#ffb3c6', '#fff1c9', '#ffc58f'];

/** The canopy roof: its underside's height at the front and back edges (m above the rails' ground), its edges' offsets. */
const ROOF = Object.freeze({ FRONT: 2.4, BACK: 6.3, LOW: 3.55, HIGH: 3.9, THICK: 0.12 });

/**
 * The name board (m): its size, the height of its bottom edge and how far right its centre is. It hangs just
 * inside the canopy's front edge, so that from the seat at the start (looking ahead down a narrow portrait
 * view) the whole board shows.
 */
const BOARD = Object.freeze({ WIDTH: 1.7, HEIGHT: 0.53, BOTTOM: 2.5, RIGHT: 3.35, FRAME: 0.07, DEPTH: 0.08 });

/** The station house on the finale platform: its front wall's offset, its extent along the track and its walls' height. */
const HOUSE = Object.freeze({ FRONT: 7.0, BACK: 10.4, FROM: 5.6, TO: 9.4, WALL: 3.0, RISE: 1.5, DOOR_AT: 7.5 });

/** Lamps, bench and planters stand this far right, on the back of the platform. */
const FURNITURE_RIGHT = 5.55;

/** String lights hang from this height (m above the platform) and sag this much in the middle, a bulb every BULB_STEP m. */
const STRING = Object.freeze({ HANG: 2.6, SAG: 0.32, BULB_STEP: 0.34, BULB_RADIUS: 0.065 });

const TOP = STATION.PLATFORM_TOP;

/** A point `along` metres ahead, `right` metres right and `up` metres up, in the station's frame. */
const at = (along, right, up) => [right, up, -along];

const box = (w, h, d) => new BoxGeometry(w, h, d);

/** A four-sided pyramid on a 1 x 1 square base at the origin, 1 tall, its base edges along the axes. */
const unitPyramid = (colour) => part(new ConeGeometry(Math.SQRT1_2, 1, 4), colour, { position: [0, 0.5, 0], rotation: [0, Math.PI / 4, 0] });

/** A box between two corners in the station's frame (along, right, up), coloured. */
function slab(alongA, alongB, rightA, rightB, upA, upB, colour) {
  return part(box(Math.abs(rightB - rightA), Math.abs(upB - upA), Math.abs(alongB - alongA)), colour, {
    position: at((alongA + alongB) / 2, (rightA + rightB) / 2, (upA + upB) / 2),
  });
}

/** A rod from point a to point b (station frame), r thick. */
function rod(a, b, r, colour, sides = 6) {
  const pa = new Vector3(...at(...a)), pb = new Vector3(...at(...b));
  const length = pa.distanceTo(pb);
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
  const p = part(new CylinderGeometry(r, r, length, sides), colour);
  p.matrix.compose(pa.clone().add(pb).multiplyScalar(0.5), turn, new Vector3(1, 1, 1));
  return p;
}

/** The platform: a brick block with a paved top and a pale edge stone along the track. */
function platform() {
  const half = PLATFORM_LENGTH / 2;
  const { PLATFORM_NEAR: near, PLATFORM_FAR: far } = STATION;
  return [
    slab(-half, half, near, far, -0.35, TOP - 0.06, COLOURS.wall),
    slab(-half, half, near + 0.32, far, TOP - 0.06, TOP, COLOURS.paving),
    // The edge stone overhangs the brick a little, towards the train.
    slab(-half, half, near - 0.06, near + 0.32, TOP - 0.1, TOP, COLOURS.coping),
  ];
}

/** The underside height of the canopy roof `right` metres out. */
const roofAt = (right) => ROOF.LOW + ((right - ROOF.FRONT) / (ROOF.BACK - ROOF.FRONT)) * (ROOF.HIGH - ROOF.LOW);

/** The canopy: a roof sloping down towards the track, on posts with braces, with a scalloped valance at the front. */
function canopy(kind) {
  const [from, to] = kind.canopy;
  const parts = [];
  // The roof slab, tilted across the track.
  const slope = Math.atan2(ROOF.HIGH - ROOF.LOW, ROOF.BACK - ROOF.FRONT);
  const width = Math.hypot(ROOF.BACK - ROOF.FRONT, ROOF.HIGH - ROOF.LOW);
  const middle = (ROOF.FRONT + ROOF.BACK) / 2;
  parts.push(part(box(width, ROOF.THICK, to - from), kind.roof, {
    position: at((from + to) / 2, middle, roofAt(middle) + ROOF.THICK / 2),
    rotation: [0, 0, slope],
  }));
  // A fascia board along the front edge, and the valance hanging from it: a row of pointed boards.
  parts.push(slab(from, to, ROOF.FRONT - 0.04, ROOF.FRONT + 0.04, ROOF.LOW - 0.12, ROOF.LOW + ROOF.THICK, COLOURS.valance));
  const count = Math.round((to - from) / 0.3);
  const step = (to - from) / count;
  for (let i = 0; i < count; i++) {
    const along = from + (i + 0.5) * step;
    parts.push(part(box(0.05, 0.16, step * 0.78), COLOURS.valance, { position: at(along, ROOF.FRONT, ROOF.LOW - 0.2) }));
    parts.push(...moveParts([unitPyramid(COLOURS.valance)], {
      position: at(along, ROOF.FRONT, ROOF.LOW - 0.28),
      rotation: [Math.PI, 0, 0],
      scale: [0.05, 0.11, step * 0.78],
    }));
  }
  // Posts on the back of the platform, each with a brace up to the roof towards the track.
  const postRight = FURNITURE_RIGHT + 0.25;
  for (const along of kind.posts) {
    const top = roofAt(postRight);
    parts.push(rod([along, postRight, TOP], [along, postRight, top], 0.075, COLOURS.post, 8));
    parts.push(part(new CylinderGeometry(0.13, 0.15, 0.22, 8), COLOURS.post, { position: at(along, postRight, TOP + 0.11) }));
    parts.push(rod([along, postRight, top - 0.75], [along, postRight - 0.9, roofAt(postRight - 0.9)], 0.04, COLOURS.post, 5));
    // A beam under the roof from the post to the front.
    parts.push(rod([along, postRight, top - 0.03], [along, ROOF.FRONT + 0.05, roofAt(ROOF.FRONT) - 0.03], 0.05, COLOURS.post, 4));
  }
  return parts;
}

/** The name board's frame and the two rods it hangs from, at `along`. The paper is its own mesh (`boardFace`). */
function boardFrame(along) {
  const { WIDTH, HEIGHT, BOTTOM, RIGHT, FRAME, DEPTH } = BOARD;
  const top = BOTTOM + HEIGHT;
  const parts = [part(box(WIDTH + 2 * FRAME, HEIGHT + 2 * FRAME, DEPTH), COLOURS.boardFrame, { position: at(along, RIGHT, BOTTOM + HEIGHT / 2) })];
  for (const side of [-1, 1]) {
    const right = RIGHT + side * WIDTH * 0.38;
    parts.push(rod([along, right, top + FRAME], [along, right, roofAt(right)], 0.018, COLOURS.wire, 4));
  }
  return parts;
}

/**
 * The station house behind the finale platform: a plinth up to the platform's height, cream walls, a red gable
 * roof running along the track, a green door facing the track with a clock above it, and lit windows.
 * @returns {{ body: object[], glow: object[] }}
 */
function stationHouse() {
  const { FRONT, BACK, FROM, TO, WALL, RISE, DOOR_AT } = HOUSE;
  const body = [], glow = [];
  const depth = BACK - FRONT;
  const length = TO - FROM;
  const centre = (FRONT + BACK) / 2;
  const mid = (FROM + TO) / 2;
  // The plinth fills the gap from the platform to the door, so the boy steps straight out onto the platform.
  body.push(slab(FROM - 0.6, TO + 0.6, STATION.PLATFORM_FAR, BACK + 0.4, -0.8, TOP - 0.06, COLOURS.wall));
  body.push(slab(FROM - 0.6, TO + 0.6, STATION.PLATFORM_FAR, BACK + 0.4, TOP - 0.06, TOP, COLOURS.paving));
  body.push(slab(FROM, TO, FRONT, BACK, TOP, TOP + WALL, COLOURS.houseWalls));
  // The gable: a three-sided prism along the track (a cylinder lying along Z with one edge up).
  body.push(part(new CylinderGeometry(1, 1, length, 3), COLOURS.houseWalls, {
    position: at(mid, centre, TOP + WALL + RISE / 3),
    rotation: [-Math.PI / 2, 0, 0],
    scale: [depth / Math.sqrt(3), 1, RISE / 1.5],
  }));
  // The roof: two slabs from the eaves up to the ridge, overhanging all round, and a ridge cap.
  const SLAB = 0.16, EAVE = 0.3, OVERHANG = 0.3;
  const slope = Math.hypot(depth / 2, RISE);
  const angle = Math.atan2(RISE, depth / 2);
  for (const side of [-1, 1]) {
    const s = (slope + EAVE - SLAB / 2) / 2;
    const right = centre + side * (s * Math.cos(angle) + (SLAB / 2) * Math.sin(angle));
    const up = TOP + WALL + RISE - s * Math.sin(angle) + (SLAB / 2) * Math.cos(angle);
    body.push(part(box(slope + EAVE + SLAB / 2, SLAB, length + 2 * OVERHANG), COLOURS.houseRoof, {
      position: at(mid, right, up),
      rotation: [0, 0, -side * angle],
    }));
  }
  body.push(part(box(0.2, 0.12, length + 2 * OVERHANG + 0.02), COLOURS.houseRoof, { position: at(mid, centre, TOP + WALL + RISE + SLAB * 0.9) }));
  body.push(slab(TO - 1.1, TO - 0.6, centre + 0.5, centre + 1.0, TOP + WALL + 0.6, TOP + WALL + RISE + 0.7, COLOURS.chimney));
  // The door, its knob and a step, on the front wall facing the track; a little clock above it.
  const face = FRONT - 0.02;
  body.push(slab(DOOR_AT - 0.48, DOOR_AT + 0.48, face - 0.05, face, TOP, TOP + 1.95, COLOURS.houseTrim));
  body.push(slab(DOOR_AT - 0.4, DOOR_AT + 0.4, face - 0.08, face, TOP, TOP + 1.85, COLOURS.door));
  body.push(part(new IcosahedronGeometry(0.045, 0), COLOURS.doorKnob, { position: at(DOOR_AT + 0.27, face - 0.12, TOP + 0.95) }));
  const clock = TOP + 2.45;
  const facing = [0, 0, Math.PI / 2]; // a cylinder turned to face across the track
  body.push(part(new CylinderGeometry(0.3, 0.3, 0.06, 12), COLOURS.door, { position: at(DOOR_AT, face - 0.03, clock), rotation: facing }));
  body.push(part(new CylinderGeometry(0.24, 0.24, 0.06, 12), COLOURS.clockFace, { position: at(DOOR_AT, face - 0.06, clock), rotation: facing }));
  body.push(part(box(0.02, 0.16, 0.035), COLOURS.clockHands, { position: at(DOOR_AT, face - 0.1, clock + 0.07) }));
  body.push(part(box(0.02, 0.035, 0.12), COLOURS.clockHands, { position: at(DOOR_AT - 0.05, face - 0.1, clock) }));
  // Lit windows: either side of the door, and one at each end of the house.
  const windowAt = (along, right, rotation) => {
    const frame = part(box(0.08, 0.84, 0.74), COLOURS.houseTrim, { position: at(along, right, TOP + 1.45), rotation });
    const pane = part(box(0.1, 0.66, 0.56), COLOURS.windowGlow, { position: at(along, right, TOP + 1.45), rotation });
    const bar = part(box(0.11, 0.04, 0.56), COLOURS.houseTrim, { position: at(along, right, TOP + 1.45), rotation });
    body.push(frame, bar);
    glow.push(pane);
  };
  for (const along of [DOOR_AT - 1.25, DOOR_AT + 1.25]) windowAt(along, FRONT - 0.01, [0, 0, 0]);
  for (const along of [FROM, TO]) windowAt(along, centre, [0, Math.PI / 2, 0]);
  return { body, glow };
}

/**
 * Several coloured triangle soups (props.js geometries, merged parts), each moved by its matrix, as one
 * geometry. They all carry `position` and `color` and none mirrors, so the corners can be copied as they are.
 */
function mergeSoups(pieces) {
  let count = 0;
  for (const { geometry } of pieces) count += geometry.attributes.position.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const corner = new Vector3();
  let at3 = 0;
  for (const { geometry, matrix } of pieces) {
    const p = geometry.attributes.position, c = geometry.attributes.color;
    for (let i = 0; i < p.count; i++, at3 += 3) {
      corner.fromBufferAttribute(p, i).applyMatrix4(matrix).toArray(positions, at3);
      colors[at3] = c.getX(i);
      colors[at3 + 1] = c.getY(i);
      colors[at3 + 2] = c.getZ(i);
    }
  }
  return triangleSoup(positions, colors);
}

/** The matrix that stands a prop at (along, right, up) with its front (+Z) turned to face the track. */
function facingTrack(along, right, up, scale = 1) {
  return new Matrix4().compose(new Vector3(...at(along, right, up)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2), new Vector3(scale, scale, scale));
}

/**
 * The points of a string of lights from lamp `a` to lamp `b` (metres along), hanging in a soft curve.
 * @returns {Vector3[]}  in the station's frame
 */
function stringPoints(a, b) {
  const count = Math.max(2, Math.round(Math.abs(b - a) / STRING.BULB_STEP));
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const up = TOP + STRING.HANG - STRING.SAG * 4 * t * (1 - t);
    points.push(new Vector3(...at(a + (b - a) * t, FURNITURE_RIGHT - 0.08, up)));
  }
  return points;
}

/**
 * The text on the name board, on a canvas. Null without a document (the Node unit tests).
 * @param {string} name
 * @returns {HTMLCanvasElement|null}
 */
function drawBoard(name) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round((1024 * BOARD.HEIGHT) / BOARD.WIDTH);
  const g = canvas.getContext('2d');
  if (!g) return null;
  const { width: w, height: h } = canvas;
  const paper = g.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#fffbf3');
  paper.addColorStop(1, '#f7ebd4');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  // A thin rule inset from the edge.
  g.strokeStyle = COLOURS.boardInk;
  g.globalAlpha = 0.55;
  g.lineWidth = 5;
  g.strokeRect(22, 22, w - 44, h - 44);
  g.globalAlpha = 1;
  // The name, as big as fits between two little hearts.
  let size = Math.round(h * 0.62);
  const room = w * 0.66;
  const measured = displayTextWidth(g, name, size);
  if (measured > room) size = Math.floor((size * room) / measured);
  g.fillStyle = COLOURS.boardInk;
  const textWidth = fillDisplayText(g, name, w / 2, h * 0.5, size);
  for (const side of [-1, 1]) heart(g, w / 2 + side * (textWidth / 2 + h * 0.2), h * 0.5, h * 0.14);
  return canvas;
}

/** A small heart centred on (x, y), `r` across each lobe. */
function heart(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.fillStyle = COLOURS.heart;
  g.beginPath();
  g.moveTo(0, r * 1.15);
  g.bezierCurveTo(-r * 1.9, -r * 0.1, -r * 0.9, -r * 1.4, 0, -r * 0.45);
  g.bezierCurveTo(r * 0.9, -r * 1.4, r * 1.9, -r * 0.1, 0, r * 1.15);
  g.fill();
  g.restore();
}

/** The board's paper: a face towards the arriving train and one towards the train once it has passed, both reading the right way round. */
function boardFace(along, canvas) {
  const { WIDTH, HEIGHT, BOTTOM, RIGHT, DEPTH } = BOARD;
  const x0 = RIGHT - WIDTH / 2, x1 = RIGHT + WIDTH / 2, y0 = BOTTOM, y1 = BOTTOM + HEIGHT;
  const z = -along, front = z + DEPTH / 2 + 0.004, back = z - DEPTH / 2 - 0.004;
  const geometry = new BufferGeometry();
  // Front (facing +Z, back down the track) then back (facing -Z), each two triangles.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([
    x0, y0, front, x1, y0, front, x1, y1, front, x0, y1, front,
    x1, y0, back, x0, y0, back, x0, y1, back, x1, y1, back,
  ]), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  geometry.computeVertexNormals();
  let map = null;
  if (canvas) {
    map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
  }
  const material = new MeshBasicMaterial({ map, color: map ? 0xffffff : new Color(COLOURS.boardPaper) });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'station-board';
  return mesh;
}

/**
 * One of the two stations.
 * @param {{ path: import('./trackPath.js').TrackPath, distance: number, kind: 'start'|'finale' }} options
 *   `distance` is the middle of the platform (m along the track); the start station's is 8, so its platform
 *   runs from 0 to 16.
 * @returns {Group}
 */
export function createStation({ path, distance, kind }) {
  const look = KINDS[kind];
  if (!look) throw new Error(`createStation: "${kind}" is not a kind of station`);
  const group = new Group();
  group.name = `station-${kind}`;

  // The solid parts, the lit ones, and props placed whole.
  const parts = [...platform(), ...canopy(look), ...boardFrame(look.board)];
  const glowParts = [];
  if (look.house) {
    const house = stationHouse();
    parts.push(...house.body);
    glowParts.push(...house.glow);
  }
  const pieces = [];
  const glowPieces = [];
  const lamp = createPropGeometry('lamp_post');
  const lantern = lamp.glow.boundingBox.getCenter(new Vector3());
  const halos = [];
  for (const along of look.lamps) {
    const matrix = facingTrack(along, FURNITURE_RIGHT, TOP);
    pieces.push({ geometry: lamp.body, matrix });
    glowPieces.push({ geometry: lamp.glow, matrix });
    halos.push(...lantern.clone().applyMatrix4(matrix).toArray());
  }
  pieces.push({ geometry: createPropGeometry('bench').body, matrix: facingTrack(look.bench, FURNITURE_RIGHT - 0.1, TOP) });
  const flowers = createPropGeometry('flower_patch', 0).body;
  for (const along of look.planters) {
    parts.push(slab(along - 0.45, along + 0.45, FURNITURE_RIGHT - 0.22, FURNITURE_RIGHT + 0.22, TOP, TOP + 0.36, COLOURS.wood));
    pieces.push({ geometry: flowers, matrix: facingTrack(along, FURNITURE_RIGHT, TOP + 0.3, 1.05) });
  }

  // The string lights: a thin wire through every bulb.
  const bulbs = [];
  for (const [a, b] of look.strings) {
    const points = stringPoints(a, b);
    for (let i = 0; i + 1 < points.length; i++) {
      parts.push(rod([-points[i].z, points[i].x, points[i].y], [-points[i + 1].z, points[i + 1].x, points[i + 1].y], 0.012, COLOURS.wire, 3));
    }
    bulbs.push(...points.slice(1, -1));
  }

  pieces.push({ geometry: mergeParts(parts), matrix: new Matrix4() });
  const body = new Mesh(mergeSoups(pieces), MATERIALS.solid);
  body.name = 'station-body';
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  if (glowParts.length) glowPieces.push({ geometry: mergeParts(glowParts), matrix: new Matrix4() });
  if (glowPieces.length) {
    const glow = new Mesh(mergeSoups(glowPieces), MATERIALS.glow);
    glow.name = 'station-glow';
    group.add(glow);
  }

  if (bulbs.length) {
    const bulb = mergeParts([part(new IcosahedronGeometry(STRING.BULB_RADIUS, 0), '#ffffff')]);
    const lights = new InstancedMesh(bulb, MATERIALS.glow, bulbs.length);
    lights.name = 'station-string-lights';
    const matrix = new Matrix4();
    const colour = new Color();
    bulbs.forEach((p, i) => {
      // Each bulb hangs just under the wire.
      lights.setMatrixAt(i, matrix.makeTranslation(p.x, p.y - STRING.BULB_RADIUS * 0.8, p.z));
      lights.setColorAt(i, colour.set(BULBS[i % BULBS.length]));
    });
    lights.computeBoundingSphere();
    group.add(lights);
  }

  const glowing = new Points(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(halos, 3)), MATERIALS.halo);
  glowing.name = 'station-halos';
  glowing.geometry.computeBoundingSphere();
  group.add(glowing);

  group.add(boardFace(look.board, drawBoard(look.name)));

  // Into place: the frame of the platform's middle, which is on a straight stretch.
  const basis = new Matrix4().makeBasis(path.sideAt(distance), new Vector3(0, 1, 0), path.tangentAt(distance).negate());
  group.quaternion.setFromRotationMatrix(basis);
  path.pointAt(distance, group.position);
  return group;
}
