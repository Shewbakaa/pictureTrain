// The photo signs: one beside the track at each moment's stop, showing its photo.
//
// A sign is a cream frame on two wooden posts with the photo in it, upright, a date placard below it (drawn on a
// canvas in Cormorant Garamond, like the station boards) and a little heart on top. It stands SIGN.AHEAD metres
// past its stop and SIGN.OUT metres out on the stop's side, turned toward the arriving train, so she can see the
// photo coming and read it squarely once the train has stopped and her head has turned to it (`signLookYaw`).
//
// The frame takes the photo's shape within limits (`signDimensions`); a photo more extreme than that is cropped
// to fill it from its middle (`coverUv`), so a panorama or a tall screenshot is never squashed.
//
// The photo and its placard are unlit, so they read the same whatever the light, and so is the front of the cream
// frame round the photo: lit, a sign in the shade turned it the grey-green of the ground's bounced light.
//
// Each sign is four draw calls: the wood and the frame merged into one mesh, the frame's front, the photo and the
// placard.
//
// DOM-free at import time: `createPhotoSign` draws the placard on a canvas only when there is a document, and a
// photo without a canvas leaves the frame plain, so the Node unit tests can build signs.

import {
  BoxGeometry, CanvasTexture, Color, ExtrudeGeometry, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial,
  PlaneGeometry, SRGBColorSpace, Shape, Vector3,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { clamp } from '../util/math.js';
import { displayTextWidth, drawHeart, fillDisplayText } from '../util/canvasText.js';
import { mergeParts, part } from '../util/geo.js';
import { COUPLE_HALF_WIDTH } from './figures.js';

/**
 * Where a sign stands and its size (m): AHEAD past its stop, OUT from the centre line, its face turned TURN
 * (rad) from square-on to the track toward the arriving train. The photo is PHOTO_H tall with its bottom
 * PHOTO_BOTTOM above the ground, in a frame FRAME wide. The couple stands COUPLE_OUT further out than the sign.
 */
export const SIGN = Object.freeze({
  AHEAD: 3.5,
  OUT: 3.4,
  TURN: MathUtils.degToRad(35),
  PHOTO_H: 1.6,
  PHOTO_BOTTOM: 1.0,
  FRAME: 0.08,
  COUPLE_OUT: 1.4,
});

/** The date placard (m): its height, its widest, and the gap between it and the frame above. */
const PLACARD = Object.freeze({ HEIGHT: 0.28, MAX_WIDTH: 1.1, GAP: 0.07, BORDER: 0.035 });

/** The heart on top (m): its lobes' size, and how far above the frame its middle is. */
const HEART = Object.freeze({ R: 0.12, ABOVE: 0.2 });

/** Colours (sRGB hex). */
const COLOURS = Object.freeze({
  frame: '#f9eedb',
  backing: '#b07642',
  post: '#9c6a3e',
  placardWood: '#a86b3c',
  paper: '#fff8ec',
  ink: '#5a3b2b',
  heart: '#e8607e',
});

/** Turning her head this far (rad, + = left) looks at a stop's sign from her seat. */
const LOOK_YAW = 0.75;

/** The couple stands at least this far round (rad) from the sign's near edge, as she sees them from her seat. */
const COUPLE_MARGIN = MathUtils.degToRad(0.6);

const UP = new Vector3(0, 1, 0);

/**
 * The size of the photo on a sign (m): always PHOTO_H tall, and as wide as the photo's shape allows between
 * 0.6 and 1.8 times that. A photo with no usable shape gets a square.
 * @param {number} aspect  the photo's width / height
 * @returns {{ photoW: number, photoH: number }}
 */
export function signDimensions(aspect) {
  const shape = aspect > 0 && Number.isFinite(aspect) ? clamp(aspect, 0.6, 1.8) : 1;
  return { photoW: shape * SIGN.PHOTO_H, photoH: SIGN.PHOTO_H };
}

/**
 * The texture repeat and offset that fill a frame of shape `frameAspect` with the middle of a photo of shape
 * `imageAspect` ("cover"): the photo's extra width (or height) is cropped equally from both sides.
 * @returns {{ repeat: [number, number], offset: [number, number] }}
 */
export function coverUv(imageAspect, frameAspect) {
  if (!(imageAspect > 0 && frameAspect > 0)) return { repeat: [1, 1], offset: [0, 0] };
  if (imageAspect > frameAspect) {
    const x = frameAspect / imageAspect;
    return { repeat: [x, 1], offset: [(1 - x) / 2, 0] };
  }
  if (imageAspect < frameAspect) {
    const y = imageAspect / frameAspect;
    return { repeat: [1, y], offset: [0, (1 - y) / 2] };
  }
  return { repeat: [1, 1], offset: [0, 0] };
}

/** How far to turn her head (rad, + = left) to look at the sign of a stop on `side`. */
export function signLookYaw(side) {
  return side === 'left' ? LOOK_YAW : -LOOK_YAW;
}

/** A heart outline for ExtrudeGeometry, its lobes `r` across, its point at the bottom, centred on the origin. */
export function heartShape(r) {
  const shape = new Shape();
  shape.moveTo(0, -r * 1.15);
  shape.bezierCurveTo(-r * 1.9, r * 0.1, -r * 0.9, r * 1.4, 0, r * 0.45);
  shape.bezierCurveTo(r * 0.9, r * 1.4, r * 1.9, r * 0.1, 0, -r * 1.15);
  return shape;
}

/**
 * The parts of a sign whose photo is `photoW` wide, in its own frame: the ground at y = 0, the photo's face on
 * z = 0 facing +Z. `parts` are lit (wood, the frame's bars, the heart); `front` is the frame's unlit front face.
 * The frame's bars overlap the photo's edge a little, so no gap shows.
 */
function signParts(photoW, placardW) {
  const { PHOTO_H: h, PHOTO_BOTTOM: bottom, FRAME: f } = SIGN;
  const middle = bottom + h / 2;
  const top = bottom + h + f;
  const bar = f + 0.015;
  // The frame's four bars as [width, height, x, y], standing proud of the photo. Each is a lit back part and an
  // unlit front part 2 cm deep, so the two never share a plane (which would shimmer far off, where the depth
  // buffer is coarse).
  const bars = [
    [photoW + 2 * f, bar, 0, top - bar / 2],
    [photoW + 2 * f, bar, 0, bottom - f + bar / 2],
    [bar, h, -(photoW / 2 + f - bar / 2), middle],
    [bar, h, photoW / 2 + f - bar / 2, middle],
  ];
  const parts = bars.map(([w, height, x, y]) => part(new BoxGeometry(w, height, 0.055), COLOURS.frame, { position: [x, y, -0.0075] }));
  const front = bars.map(([w, height, x, y]) => part(new BoxGeometry(w, height, 0.02), COLOURS.frame, { position: [x, y, 0.03] }));
  // The board behind the photo.
  parts.push(part(new BoxGeometry(photoW + 2 * f, h + 2 * f, 0.04), COLOURS.backing, { position: [0, middle, -0.055] }));
  // Two posts behind it, sunk into the ground, and a rail between them that carries the placard.
  const postX = Math.max(0.3, photoW / 2 - 0.1);
  const postTop = top - 0.05;
  for (const x of [-postX, postX]) {
    parts.push(part(new BoxGeometry(0.1, postTop + 0.15, 0.1), COLOURS.post, { position: [x, (postTop - 0.15) / 2, -0.125] }));
  }
  const placardY = bottom - f - PLACARD.GAP - PLACARD.HEIGHT / 2;
  parts.push(part(new BoxGeometry(2 * postX + 0.1, 0.08, 0.06), COLOURS.post, { position: [0, placardY, -0.08] }));
  // The placard's board, the paper (a mesh of its own) sits just in front of it.
  const b = PLACARD.BORDER;
  parts.push(part(new BoxGeometry(placardW + 2 * b, PLACARD.HEIGHT + 2 * b, 0.05), COLOURS.placardWood, {
    position: [0, placardY, -0.025],
  }));
  // The little heart on top.
  const heart = new ExtrudeGeometry(heartShape(HEART.R), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 1, curveSegments: 7,
  });
  parts.push(part(heart, COLOURS.heart, { position: [0, top + HEART.ABOVE, -0.045] }));
  return { parts, front, placardY };
}

/**
 * The date on the placard: on a canvas, in the display font between two hearts; just a heart when there is no
 * date. Null without a document (the Node unit tests).
 */
function drawPlacard(date, width) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = Math.round((768 * PLACARD.HEIGHT) / width);
  const g = canvas.getContext('2d');
  if (!g) return null;
  const { width: w, height: h } = canvas;
  const paper = g.createLinearGradient(0, 0, 0, h);
  paper.addColorStop(0, '#fffbf3');
  paper.addColorStop(1, '#f6e8d2');
  g.fillStyle = paper;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = COLOURS.ink;
  g.globalAlpha = 0.45;
  g.lineWidth = 4;
  g.strokeRect(14, 14, w - 28, h - 28);
  g.globalAlpha = 1;
  if (!date) {
    drawHeart(g, w / 2, h / 2, h * 0.16, COLOURS.heart);
    return canvas;
  }
  let size = Math.round(h * 0.58);
  const room = w * 0.72;
  const measured = displayTextWidth(g, date, size);
  if (measured > room) size = Math.max(12, Math.floor((size * room) / measured));
  g.fillStyle = COLOURS.ink;
  const textWidth = fillDisplayText(g, date, w / 2, h * 0.5, size);
  for (const side of [-1, 1]) drawHeart(g, w / 2 + side * (textWidth / 2 + h * 0.22), h * 0.5, h * 0.11, COLOURS.heart);
  return canvas;
}

/** An unlit picture `width` x `height` (m), centred at `position`, facing +Z, showing `canvas` (or plain `colour`). */
function picture(width, height, position, canvas, colour) {
  let map = null;
  if (canvas) {
    map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 4;
  }
  const material = new MeshBasicMaterial({ map, color: map ? 0xffffff : new Color(colour), toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(width, height), material);
  mesh.position.set(...position);
  return mesh;
}

/**
 * A photo sign, standing on its origin and facing +Z. `placeSign` stands it beside the track.
 * @param {import('../photos/photos.js').PhotoAsset|null} asset  its photo; without a canvas the frame shows plain paper
 * @param {{ date?: string }} [options]  the text on the placard
 * @returns {Group}  `userData.photoW` is the photo's width on the sign (m)
 */
export function createPhotoSign(asset, { date = '' } = {}) {
  const aspect = asset ? asset.aspect : 1;
  const { photoW, photoH } = signDimensions(aspect);
  const placardW = Math.min(photoW, PLACARD.MAX_WIDTH);
  const group = new Group();
  group.name = `sign-${asset ? asset.index : ''}`;
  group.userData.photoW = photoW;

  const { parts, front, placardY } = signParts(photoW, placardW);
  const body = new Mesh(mergeParts(parts), MATERIALS.solid);
  body.name = 'sign-body';
  body.castShadow = true;
  body.receiveShadow = true;

  const photo = picture(photoW, photoH, [0, SIGN.PHOTO_BOTTOM + photoH / 2, 0], asset && asset.canvas, COLOURS.paper);
  photo.name = 'sign-photo';
  if (photo.material.map) {
    const { repeat, offset } = coverUv(aspect, photoW / photoH);
    photo.material.map.repeat.set(...repeat);
    photo.material.map.offset.set(...offset);
  }

  // The paper stands clear of its board for the same reason as the frame's front.
  const placard = picture(placardW, PLACARD.HEIGHT, [0, placardY, 0.015], drawPlacard(date, placardW), COLOURS.paper);
  placard.name = 'sign-placard';

  const frameFront = new Mesh(mergeParts(front), MATERIALS.glow);
  frameFront.name = 'sign-frame';

  group.add(body, frameFront, photo, placard);
  return group;
}

/** Turns `object` upright with its front (+Z) along the horizontal unit vector `facing`. */
function face(object, facing) {
  const x = new Vector3().crossVectors(UP, facing);
  object.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, UP, facing));
}

/**
 * Stands a sign beside the track for `stop`: SIGN.AHEAD metres past it, SIGN.OUT metres out on its side, facing
 * the track turned SIGN.TURN toward the arriving train.
 * @param {import('../three.js').Object3D} sign
 * @param {import('./trackPath.js').TrackPath} path
 * @param {import('./layout.js').Stop} stop
 */
export function placeSign(sign, path, stop) {
  const d = stop.distance + SIGN.AHEAD;
  const out = stop.side === 'right' ? 1 : -1;
  path.frameAt(d, SIGN.OUT * out, 0, sign.position);
  const facing = path.sideAt(d).multiplyScalar(-out * Math.cos(SIGN.TURN))
    .addScaledVector(path.tangentAt(d), -Math.sin(SIGN.TURN));
  face(sign, facing);
}

/**
 * Stands the couple beside a stop's sign, SIGN.COUPLE_OUT metres further out than it, facing her seat. Seen from
 * her seat they stand just clear of the sign's nearer edge, so the sign never hides them; the wider the photo,
 * the further round that is.
 * @param {import('../three.js').Object3D} couple  facing +Z, its middle on its origin (world/figures.js `createCouple`)
 * @param {import('./trackPath.js').TrackPath} path
 * @param {import('./layout.js').Stop} stop
 * @param {number} photoW  the width of the photo on the sign (`signDimensions`)
 */
export function placeCouple(couple, path, stop, photoW) {
  const { AHEAD, OUT, TURN, FRAME, COUPLE_OUT } = SIGN;
  const halfWidth = photoW / 2 + FRAME;
  // Bearings from her seat, round from straight ahead toward the sign's side. The track is straight enough over
  // these few metres to work them out on the flat.
  const edge = Math.atan2(OUT + halfWidth * Math.sin(TURN), AHEAD - halfWidth * Math.cos(TURN));
  const out = OUT + COUPLE_OUT;
  const distance = out / Math.sin(edge);
  const bearing = edge + Math.atan2(COUPLE_HALF_WIDTH, distance) + COUPLE_MARGIN;
  const side = stop.side === 'right' ? 1 : -1;
  path.frameAt(stop.distance + out / Math.tan(bearing), out * side, 0, couple.position);
  face(couple, path.pointAt(stop.distance).sub(couple.position).setY(0).normalize());
}
