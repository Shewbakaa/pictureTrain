// The little people: her and him, chunky and cute, about 1.15 m tall, in the colours content.js gives them.
//
// A figure is built from simple coloured parts like the props (util/geo.js), merged into one mesh so it costs one
// draw call. To let it walk (the finale, Task 14) without splitting it into a mesh per limb, the mesh is skinned
// rigidly: each part follows exactly one bone (hips, head, a leg, an arm or a hand), and posing a figure turns
// those bones. Every figure faces +Z with its feet on its origin, so its right is -X.
//
// A couple is the two of them side by side, holding hands, bobbing gently. The couples at the stops are posed for
// their moments (world/poses.js, world/stopCouple.js), on top of the extra joints a Pose can turn: an arm raised out
// sideways, the head turned and tilted, and sitting.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it.

import {
  Bone, BufferAttribute, Color, CylinderGeometry, Group, Skeleton, SkinnedMesh, SphereGeometry,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { mergeParts, part, triangleCount } from '../util/geo.js';
import { clamp } from '../util/math.js';

/**
 * Where the joints are (m): the hip joints' height and how far out they are, the shoulders' height and how far
 * out, the neck's height, the arm's length from the shoulder to the middle of the hand, and the head's radius.
 */
const BODY = Object.freeze({ HIP: 0.36, HIP_X: 0.075, SHOULDER: 0.665, SHOULDER_X: 0.2, NECK: 0.72, ARM: 0.3, HEAD: 0.2 });

/** At rest the arms hang this far out from the body (rad), so they clear the round tummy. */
export const ARM_SPREAD = 0.1;

/** How far a walk swings the legs and the arms either way (rad), and how high the body bounces (m). */
const WALK = Object.freeze({ LEG: 0.4, ARM: 0.35, BOB: 0.035 });

/**
 * The couple: how far each stands from their middle (m), how far each holding arm reaches in (rad) and swings forward
 * (rad), how far each head tilts toward the other (rad), and the idle bob: BOB metres up and down every PERIOD seconds.
 */
export const COUPLE = Object.freeze({ APART: 0.26, REACH: 0.2, HOLD_SWING: 0.12, HEAD_TILT: 0.1, BOB: 0.012, PERIOD: 1.8 });

/**
 * Sitting (a Pose's `sit` at 1): the hips go DROP metres lower and the legs LEGS (rad) further forward, out along the
 * seat like a little child's. The hip joints are then SEAT metres above what they sit on: his trousers rest on it.
 */
const SIT = Object.freeze({ DROP: 0.2, LEGS: 1.4, SEAT: 0.06 });

/** How far either side of its middle a couple reaches (m): out to the far side of the outer hand. */
export const COUPLE_HALF_WIDTH = COUPLE.APART + BODY.SHOULDER_X + BODY.ARM * Math.sin(ARM_SPREAD) + 0.052;

/** Fixed colours (sRGB hex): the face, and his trousers and shoes. Everything else comes from the look. */
const COLOURS = Object.freeze({
  eye: '#2d2a32', shine: '#ffffff', mouth: '#a24f4f', blush: '#f49aa2',
  trousers: '#3d4866', hisShoes: '#4a3a33',
});

/**
 * @typedef {{ leftLeg: number, rightLeg: number, leftArm: number, rightArm: number, bob: number,
 *             leftArmOut?: number, rightArmOut?: number, headTurn?: number, headTilt?: number, sit?: number }} Pose
 *   Each limb's swing (rad, + forward) and how far the body rises (m, >= 0). Optionally, all in rad but `sit`: how far
 *   each arm is raised out sideways beyond its rest (ARM_SPREAD), the head's turn (+ to the figure's left) and its
 *   tilt (+ toward its right), and how far the figure sits (0 standing to 1 sitting, SIT). An arm's raise or the
 *   head's turn or tilt left out leaves that joint as it was; `sit` left out is standing.
 */

/** Standing still. */
export const IDLE_POSE = Object.freeze({ leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0, bob: 0 });

/**
 * A step of a walk at `phase` (rad; a full stride is 2π): the legs swing opposite each other, each arm opposite
 * its leg, and the body bounces up as the legs pass. `amount` (0 to 1) eases from standing into a full stride.
 * @param {number} phase
 * @param {number} [amount]
 * @returns {Pose}
 */
export function walkPose(phase, amount = 1) {
  const a = Number.isFinite(amount) ? clamp(amount, 0, 1) : 0;
  const swing = Math.sin(phase) * a;
  const lift = Math.cos(phase);
  return {
    leftLeg: WALK.LEG * swing,
    rightLeg: -WALK.LEG * swing,
    leftArm: -WALK.ARM * swing,
    rightArm: WALK.ARM * swing,
    bob: WALK.BOB * a * lift * lift,
  };
}

const sphere = (segments = 8, rings = 6) => new SphereGeometry(1, segments, rings);

/** The bones, by name, in skinning order. */
const BONES = ['hips', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'leftHand', 'rightHand'];

/**
 * The parts of a figure, each tagged with the bone it follows, in the figure's rest pose (feet on y = 0, facing +Z).
 * @returns {Array<{ bone: string, part: import('../util/geo.js').Part }>}
 */
function figureParts({ skin, hair, outfit, style }) {
  const her = style === 'her';
  const { HIP, HIP_X, SHOULDER, SHOULDER_X, NECK, ARM, HEAD } = BODY;
  const tint = new Color(outfit).lerp(new Color('#ffffff'), 0.55); // her belt and bow
  const shoes = her ? new Color(outfit).multiplyScalar(0.5) : COLOURS.hisShoes;
  const legs = her ? skin : COLOURS.trousers;
  const blush = new Color(skin).lerp(new Color(COLOURS.blush), 0.65);
  const tagged = [];
  const add = (bone, geometry, colour, transform) => tagged.push({ bone, part: part(geometry, colour, transform) });

  // Legs and round shoes, toes forward.
  for (const [bone, x] of [['leftLeg', HIP_X], ['rightLeg', -HIP_X]]) {
    add(bone, new CylinderGeometry(0.056, 0.05, HIP - 0.04, 7), legs, { position: [x, (HIP + 0.04) / 2, 0] });
    add(bone, sphere(8, 5), shoes, { position: [x, 0.045, 0.025], scale: [0.065, 0.045, 0.095] });
  }

  // The body.
  if (her) {
    add('hips', sphere(10, 7), outfit, { position: [0, 0.6, 0], scale: [0.145, 0.15, 0.13] });
    add('hips', new CylinderGeometry(0.13, 0.27, 0.36, 12), outfit, { position: [0, 0.38, 0] });
    add('hips', new CylinderGeometry(0.137, 0.137, 0.035, 12), tint, { position: [0, 0.56, 0] });
  } else {
    add('hips', sphere(10, 7), outfit, { position: [0, 0.55, 0], scale: [0.165, 0.19, 0.145] });
    add('hips', new CylinderGeometry(0.152, 0.16, 0.16, 10), COLOURS.trousers, { position: [0, 0.38, 0] });
  }

  // Arms: a round shoulder and a sleeve in the outfit, a bare forearm and a round hand.
  for (const [side, x] of [['left', SHOULDER_X], ['right', -SHOULDER_X]]) {
    const arm = `${side}Arm`;
    add(arm, sphere(7, 5), outfit, { position: [x, SHOULDER, 0], scale: 0.058 });
    add(arm, new CylinderGeometry(0.056, 0.05, 0.15, 7), outfit, { position: [x, SHOULDER - 0.075, 0] });
    add(arm, new CylinderGeometry(0.044, 0.042, 0.15, 7), skin, { position: [x, SHOULDER - 0.2, 0] });
    add(`${side}Hand`, sphere(7, 5), skin, { position: [x, SHOULDER - ARM, 0], scale: 0.052 });
  }

  // The head: big and round, with dark oval eyes that catch the light, rosy cheeks and a small smile.
  const cy = NECK + HEAD * 0.95;
  const onFace = (x, y) => Math.sqrt(Math.max(0, HEAD * HEAD - x * x - (y - cy) * (y - cy)));
  add('head', new SphereGeometry(HEAD, 12, 8), skin, { position: [0, cy, 0], scale: [1, 0.96, 1] });
  for (const s of [-1, 1]) {
    const ex = 0.072 * s, ey = cy - 0.012;
    add('head', sphere(6, 4), COLOURS.eye, { position: [ex, ey, onFace(ex, ey) - 0.006], scale: [0.024, 0.032, 0.014] });
    add('head', sphere(4, 3), COLOURS.shine, { position: [ex + 0.008, ey + 0.012, onFace(ex, ey) + 0.006], scale: 0.0085 });
    const bx = 0.118 * s, by = cy - 0.055;
    add('head', sphere(6, 3), blush, {
      position: [bx, by, onFace(bx, by) - 0.004], rotation: [0, Math.atan2(bx, onFace(bx, by)), 0], scale: [0.032, 0.02, 0.008],
    });
  }
  add('head', sphere(5, 3), COLOURS.mouth, { position: [0, cy - 0.075, onFace(0, cy - 0.075) - 0.003], scale: [0.022, 0.008, 0.008] });

  // Hair: a cap over the top that leaves the face clear, and a back that covers the back of the head. His is
  // short with a little quiff; hers falls past her shoulders, frames her face and wears a bow.
  const hairAt = [0, cy + 0.008, -0.006];
  add('head', new SphereGeometry(HEAD + 0.016, 12, 5, 0, Math.PI * 2, 0, Math.PI * 0.4), hair, { position: hairAt });
  const back = new SphereGeometry(HEAD + 0.018, 10, 5, Math.PI, Math.PI, Math.PI * 0.36, Math.PI * (her ? 0.56 : 0.4));
  add('head', back, hair, { position: hairAt });
  if (her) {
    add('hips', new CylinderGeometry(0.15, 0.17, 0.3, 10), hair, { position: [0, 0.69, -0.075], scale: [1, 1, 0.55] });
    for (const s of [-1, 1]) {
      add('head', sphere(6, 5), hair, { position: [0.165 * s, cy - 0.06, 0.05], rotation: [0, 0, 0.15 * s], scale: [0.055, 0.12, 0.07] });
      add('head', new CylinderGeometry(0, 0.05, 0.09, 6), tint, {
        position: [0.11 + 0.045 * s, cy + 0.17, 0.02], rotation: [0, 0, (Math.PI / 2) * s],
      });
    }
    add('head', sphere(5, 3), tint, { position: [0.11, cy + 0.17, 0.02], scale: 0.024 });
  } else {
    add('head', sphere(6, 4), hair, { position: [0.04, cy + 0.18, 0.1], rotation: [0.5, 0, -0.3], scale: [0.09, 0.045, 0.06] });
  }
  return tagged;
}

/** The parts merged into one geometry whose every corner follows its part's bone. */
function skinnedGeometry(tagged) {
  const geometry = mergeParts(tagged.map((t) => t.part));
  const corners = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(corners * 4);
  const skinWeight = new Float32Array(corners * 4);
  let at = 0;
  for (const { bone, part: p } of tagged) {
    const index = BONES.indexOf(bone);
    for (let i = triangleCount(p.geometry) * 3; i > 0; i--, at++) {
      skinIndex[at * 4] = index;
      skinWeight[at * 4] = 1;
    }
  }
  geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
  return geometry;
}

/**
 * One of the two of them.
 * @param {{ skin: string, hair: string, outfit: string, style: 'her'|'him' }} look  colours as '#rrggbb'
 * @returns {{ group: Group, parts: Record<string, Bone>, setPose: (pose: Pose) => void }}
 *   `parts` are the bones: hips, head, leftLeg, rightLeg, leftArm, rightArm, leftHand and rightHand (where the
 *   finale puts the bouquet). `setPose` swings the limbs and bobs the body, and turns what else its Pose gives.
 */
export function createFigure(look) {
  const { HIP, HIP_X, SHOULDER, SHOULDER_X, NECK, ARM } = BODY;
  const group = new Group();
  group.name = `figure-${look.style}`;
  group.userData.figure = true;

  const parts = Object.fromEntries(BONES.map((name) => [name, Object.assign(new Bone(), { name })]));
  parts.hips.position.set(0, HIP, 0);
  parts.hips.add(parts.head, parts.leftLeg, parts.rightLeg, parts.leftArm, parts.rightArm);
  parts.head.position.set(0, NECK - HIP, 0);
  parts.leftLeg.position.set(HIP_X, 0, 0);
  parts.rightLeg.position.set(-HIP_X, 0, 0);
  parts.leftArm.position.set(SHOULDER_X, SHOULDER - HIP, 0);
  parts.rightArm.position.set(-SHOULDER_X, SHOULDER - HIP, 0);
  parts.leftArm.add(parts.leftHand);
  parts.rightArm.add(parts.rightHand);
  parts.leftHand.position.set(0, -ARM, 0);
  parts.rightHand.position.set(0, -ARM, 0);

  const mesh = new SkinnedMesh(skinnedGeometry(figureParts(look)), MATERIALS.solid);
  mesh.name = `${group.name}-body`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(parts.hips);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new Skeleton(BONES.map((name) => parts[name])));

  // The arms hang a little away from the body.
  parts.leftArm.rotation.z = ARM_SPREAD;
  parts.rightArm.rotation.z = -ARM_SPREAD;

  function setPose(pose) {
    const sit = pose.sit ?? 0;
    parts.leftLeg.rotation.x = -(pose.leftLeg + SIT.LEGS * sit);
    parts.rightLeg.rotation.x = -(pose.rightLeg + SIT.LEGS * sit);
    parts.leftArm.rotation.x = -pose.leftArm;
    parts.rightArm.rotation.x = -pose.rightArm;
    parts.hips.position.y = HIP + pose.bob - SIT.DROP * sit;
    // Turning about Z by + raises the left arm out to the figure's left (+X); the right arm goes out by -.
    if (pose.leftArmOut !== undefined) parts.leftArm.rotation.z = ARM_SPREAD + pose.leftArmOut;
    if (pose.rightArmOut !== undefined) parts.rightArm.rotation.z = -(ARM_SPREAD + pose.rightArmOut);
    if (pose.headTurn !== undefined) parts.head.rotation.y = pose.headTurn;
    if (pose.headTilt !== undefined) parts.head.rotation.z = pose.headTilt;
  }

  group.updateMatrixWorld(true);
  return { group, parts, setPose };
}

/**
 * How far up (m) to stand a figure that sits (a Pose's `sit` at 1) so that it sits on a seat `seat` metres high.
 * @param {number} seat
 */
export function sittingLift(seat) {
  return seat + SIT.SEAT - (BODY.HIP - SIT.DROP);
}

/**
 * Her and him side by side, facing +Z, holding hands (her right in his left), heads tilted toward each other.
 * @param {{ her: { skin: string, hair: string, outfit: string }, you: { skin: string, hair: string, outfit: string } }} characters
 * @returns {{ group: Group, update: (time: number) => void, her: ReturnType<typeof createFigure>, him: ReturnType<typeof createFigure> }}
 *   Call `update` every frame with the seconds since the start: they bob gently, each to their own beat.
 */
export function createCouple(characters) {
  const group = new Group();
  group.name = 'couple';
  const her = createFigure({ ...characters.her, style: 'her' });
  const him = createFigure({ ...characters.you, style: 'him' });
  her.group.position.x = COUPLE.APART;
  him.group.position.x = -COUPLE.APART;
  group.add(her.group, him.group);

  // The holding arms reach in toward each other; the heads lean together.
  her.parts.rightArm.rotation.z = -COUPLE.REACH;
  him.parts.leftArm.rotation.z = COUPLE.REACH;
  her.parts.head.rotation.z = COUPLE.HEAD_TILT;
  him.parts.head.rotation.z = -COUPLE.HEAD_TILT;

  const herPose = { ...IDLE_POSE, rightArm: COUPLE.HOLD_SWING };
  const hisPose = { ...IDLE_POSE, leftArm: COUPLE.HOLD_SWING };
  const beat = (2 * Math.PI) / COUPLE.PERIOD;

  function update(time) {
    herPose.bob = COUPLE.BOB * (0.5 + 0.5 * Math.sin(beat * time));
    herPose.leftArm = 0.06 * Math.sin(beat * time);
    hisPose.bob = COUPLE.BOB * (0.5 + 0.5 * Math.sin(beat * time + 0.9));
    hisPose.rightArm = 0.06 * Math.sin(beat * time + 0.9);
    her.setPose(herPose);
    him.setPose(hisPose);
  }
  update(0);

  return { group, update, her, him };
}
