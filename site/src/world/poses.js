// How the two of them stand at a stop, posed for its moment (content.js `pose`): where each of them stands and which
// way they face (`coupleLayout`), and how they hold themselves at any moment (`posesAt`). Each pose has a gentle idle
// loop, so they are never frozen statues: everyone breathes, joined hands swing a little, a wave waves, legs swing
// under a bench, a hug rocks and a dance sways slowly round; a celebration hops, a walk marches on the spot, a selfie
// leans in for the picture, a goofy pair flaps and kicks, and a heart keeps falling apart. A tap on them (Task 14)
// makes them wave for a moment (`wavedAt`); a couple who are waving already twirl instead: he spins her once round
// under his arm.
//
// Everything is in the couple's own frame: facing +Z (world/signs.js `placeCouple` turns them toward her seat), their
// middle on the origin, with her on their left (+X), the sign's side, so she is the one who points at it. Where the
// sign is on their right, world/stopCouple.js mirrors them (`mirrorPose`).
//
// Pure: numbers in and out.

import { POSES } from '../content/normalize.js';
import { ARM_SPREAD, COUPLE, COUPLE_HALF_WIDTH, IDLE_POSE } from './figures.js';
import { clamp, easeInOutCubic, lerp, smoothstep } from '../util/math.js';

const TAU = Math.PI * 2;

/**
 * The park bench they sit on for 'sitting' (world/props.js `bench`, facing +Z): it stands BACK metres behind their
 * middle, its seat is SEAT metres high, and it reaches HALF_LENGTH metres either side of its middle. They sit IN
 * metres back from the middle of its seat, clear of its back.
 */
export const BENCH = Object.freeze({ BACK: 0.3, SEAT: 0.489, HALF_LENGTH: 0.8, IN: 0.05 });

/** Everyone breathes: rising BOB metres and back every PERIOD seconds, as the couple always has; he is LAG (rad) behind her. */
const BREATH = Object.freeze({ BOB: COUPLE.BOB, PERIOD: COUPLE.PERIOD, LAG: 0.9 });

/**
 * Holding hands (rad): each holding arm is raised OUT beyond its rest, so the two hands meet between them, and is
 * SWING forward, swinging JOINED either way at half the breath's pace; a free arm sways FREE either way with the
 * breath; their heads tilt TILT toward each other.
 */
const HOLD = Object.freeze({ OUT: COUPLE.REACH - ARM_SPREAD, SWING: COUPLE.HOLD_SWING, JOINED: 0.05, FREE: 0.06, TILT: COUPLE.HEAD_TILT });

/**
 * A wave: the arm raised OUT (rad) and a little FORWARD (rad), and waved SWING (rad) either way RATE times a second,
 * his LAG (rad) behind hers.
 */
const WAVE = Object.freeze({ OUT: 2.5, FORWARD: 0.15, SWING: 0.35, RATE: 1.4, LAG: 1.3 });

/**
 * A hug (rad): her arms HER_ARMS forward, up round his neck, and his HIS_ARMS, round her waist, so their arms pass
 * above and below each other (at one height their near arms crossed in an X), squeezing SQUEEZE with every breath;
 * their heads tip TILT and turn TURN to their left, cheek to cheek, and they rock ROCK either way together every
 * ROCK_PERIOD seconds.
 */
const HUG = Object.freeze({ HER_ARMS: 1.75, HIS_ARMS: 0.95, SQUEEZE: 0.03, TILT: 0.45, TURN: 0.5, ROCK: 0.035, ROCK_PERIOD: 3.2 });

/**
 * On the bench (rad): their legs swing KICK either way, hers every HER_KICK seconds and his every HIS_KICK; their
 * joined hands rest a little FORWARD between them; her head leans HER_TILT toward him, his HIS_TILT toward her.
 */
const SITTING = Object.freeze({ KICK: 0.12, HER_KICK: 1.6, HIS_KICK: 2.3, FORWARD: 0.1, HER_TILT: 0.25, HIS_TILT: 0.12 });

/**
 * A slow dance: they hold both hands, arms ARMS forward (rad), turning SPIN rad/s; the pair sways SWAY (rad) toward
 * and away every PERIOD seconds, stepping STEP (rad) with each sway, and her head tilts HER_TILT (rad).
 */
const DANCE = Object.freeze({ ARMS: 1.2, SPIN: 0.5, SWAY: 0.06, PERIOD: 2.4, STEP: 0.12, HER_TILT: 0.15 });

/**
 * Pointing (rad): she turns her near arm ARM forward and OUT sideways toward the sign, jabbing JAB at it every
 * JAB_PERIOD seconds, and looks HER_LOOK further round; he turns his head LOOK toward it. Her other hand holds his:
 * his arm reaches HIS_REACH forward and hers HER_REACH in.
 */
const POINT = Object.freeze({ ARM: 1.3, OUT: 0.1, JAB: 0.05, JAB_PERIOD: 1.1, HER_LOOK: 0.25, LOOK: 0.75, HIS_REACH: 0.4, HER_REACH: 0.25 });

/**
 * Celebrating (rad, m, s): their near hands held high between them, their near arms ARMS forward (straight up, tipped
 * a little forward) and IN toward each other; their far arms up in a V, ARMS forward and OUT to the side. They hop
 * together, so their hands stay held: HOP metres every HOP_PERIOD seconds, landing in between; their free arms pump
 * PUMP higher at the top of each hop, and their feet tuck TUCK back.
 */
const CHEER = Object.freeze({ ARMS: 2.8, IN: 0.02, OUT: 0.45, HOP: 0.06, HOP_PERIOD: 0.75, PUMP: 0.12, TUCK: 0.25 });

/** How high (0 to 1) a hop is at `phase` (rad): up and down over the first half of each turn, on the ground for the rest. */
const hopAt = (phase) => Math.max(0, Math.sin(phase));

/**
 * Walking hand in hand, on the spot (rad, s): their legs swing STEP either way every STRIDE seconds, in step with each
 * other, their free arms swing ARM against their legs, and they look about LOOK either way every LOOK_PERIOD seconds,
 * taking in the view, his look LOOK_LAG behind hers.
 */
const WALKING = Object.freeze({ STEP: 0.22, STRIDE: 0.9, ARM: 0.3, LOOK: 0.35, LOOK_PERIOD: 5, LOOK_LAG: 1.2 });

/**
 * A selfie (rad, s): his far arm holds the phone up and forward, ARM forward and OUT; her far hand is up by her face,
 * HER_ARM forward and HER_OUT; their near arms go round each other's back, NEAR behind and NEAR_OUT in; their heads lean
 * TILT together. The phone wobbles WOBBLE either way every WOBBLE_PERIOD seconds, and every SNAP_PERIOD seconds they
 * lean SNAP further in for the picture.
 */
const SELFIE = Object.freeze({
  ARM: 2.5, OUT: 0.2, HER_ARM: 2.35, HER_OUT: 0.35, NEAR: -0.35, NEAR_OUT: 0.45, TILT: 0.3,
  WOBBLE: 0.03, WOBBLE_PERIOD: 1.3, SNAP: 0.1, SNAP_PERIOD: 3,
});

/**
 * Being goofy (rad, s): their near hands held, pumped up and down HELD either way about HELD_AT forward; their far arms
 * flap like wings between FLAP_FROM and FLAP_TO out, RATE times a second; their legs kick KICK either way, and their
 * heads wobble WOBBLE either way. He is half a beat behind her, so they are never quite together.
 */
const GOOFY = Object.freeze({ HELD_AT: 0.35, HELD: 0.3, FLAP_FROM: 0.2, FLAP_TO: 1.25, RATE: 2.2, KICK: 0.25, WOBBLE: 0.3 });

/**
 * Making a heart (rad, s): their near arms up between them, ARMS forward and IN, so their hands meet over the middle
 * under the heart they make; their far hands on their hips, HIP behind and HIP_OUT out; heads tilted TILT together.
 * Every PERIOD seconds it falls apart: from SLIP_FROM to SLIP_TO of the way through it their hands slip SLIP_OUT apart
 * and DROP lower, their heads tip away laughing, and the heart shrinks to SHRUNK of its size; then they try again.
 * The heart beats BEAT bigger and back every BEAT_PERIOD seconds.
 */
const HEART = Object.freeze({
  ARMS: 2.9, IN: 0.2, HIP: -0.3, HIP_OUT: 0.35, TILT: 0.2, PERIOD: 4, SLIP_FROM: 0.62, SLIP_TO: 0.86,
  SLIP_OUT: 0.45, DROP: 0.5, SHRUNK: 0.35, BEAT: 0.06, BEAT_PERIOD: 0.8,
});

/**
 * A tap (s, and rad): they wave for TIME seconds, their arms going up over RISE and down over FALL; a hugging or
 * dancing pair look LOOK round toward the train as they wave. A waving couple twirls instead: his holding arm up
 * HIS_ARM and hers HER_ARM, over her head.
 */
const REACT = Object.freeze({ TIME: 2, RISE: 0.3, FALL: 0.5, LOOK: 0.8, HIS_ARM: 2.2, HER_ARM: 2.9 });

/** The poses where they turn to face each other. */
const FACING = Object.freeze(['hug', 'dancing']);

/**
 * How far either side of their middle each pose reaches (m) as it idles, for `placeCouple`; a dance's reach is round
 * them, as they turn. (A tap's wave may reach past it for a moment.)
 */
const HALF_WIDTH = Object.freeze({
  waving: 0.75, hug: 0.44, sitting: 0.81, dancing: 0.58, pointing: 0.69, celebrate: 0.67, selfie: 0.63, goofy: 0.81, heart: 0.71,
});

const at = (x, z, turn) => Object.freeze({ x, z, turn });

/**
 * @typedef {{ x: number, z: number, turn: number }} Place  where one of them stands (m) and how far they are turned
 *   (rad, + to their left) from facing +Z, in the couple's frame
 * @typedef {{ her: Place, him: Place, bench: boolean, halfWidth: number }} CoupleLayout
 */

/** @type {Readonly<Record<string, CoupleLayout>>} */
const LAYOUTS = Object.freeze({
  'holding-hands': Object.freeze({ her: at(COUPLE.APART, 0, 0), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: COUPLE_HALF_WIDTH }),
  waving: Object.freeze({ her: at(COUPLE.APART, 0, 0), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: HALF_WIDTH.waving }),
  hug: Object.freeze({ her: at(0.16, 0, -Math.PI / 2), him: at(-0.16, 0, Math.PI / 2), bench: false, halfWidth: HALF_WIDTH.hug }),
  sitting: Object.freeze({
    her: at(0.24, -BENCH.BACK - BENCH.IN, 0), him: at(-0.24, -BENCH.BACK - BENCH.IN, 0), bench: true, halfWidth: HALF_WIDTH.sitting,
  }),
  dancing: Object.freeze({ her: at(0.3, 0, -Math.PI / 2), him: at(-0.3, 0, Math.PI / 2), bench: false, halfWidth: HALF_WIDTH.dancing }),
  pointing: Object.freeze({ her: at(COUPLE.APART, 0, 0.6), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: HALF_WIDTH.pointing }),
  celebrate: Object.freeze({ her: at(COUPLE.APART, 0, 0), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: HALF_WIDTH.celebrate }),
  walking: Object.freeze({ her: at(COUPLE.APART, 0, 0), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: COUPLE_HALF_WIDTH }),
  selfie: Object.freeze({ her: at(0.24, 0, 0), him: at(-0.24, 0, 0), bench: false, halfWidth: HALF_WIDTH.selfie }),
  goofy: Object.freeze({ her: at(COUPLE.APART, 0, 0), him: at(-COUPLE.APART, 0, 0), bench: false, halfWidth: HALF_WIDTH.goofy }),
  heart: Object.freeze({ her: at(0.32, 0, 0), him: at(-0.32, 0, 0), bench: false, halfWidth: HALF_WIDTH.heart }),
});

/**
 * Where the two of them stand for `pose` (one of content/normalize.js POSES but 'none', which has no couple; any
 * other is holding hands), in the couple's frame: facing +Z, their middle on the origin, the sign on their left.
 * `bench`: they sit on the bench, BENCH.BACK behind. `halfWidth`: how far either side of their middle they reach (m).
 * @param {string} pose
 * @returns {CoupleLayout}  frozen
 */
export function coupleLayout(pose) {
  return (POSES.includes(pose) && LAYOUTS[pose]) || LAYOUTS['holding-hands'];
}

/** Standing still, breathing, every field of a Pose there. */
const standing = (bob) => ({ ...IDLE_POSE, bob, leftArmOut: 0, rightArmOut: 0, headTurn: 0, headTilt: 0, sit: 0 });

/** Her right hand in his left, between them, both arms `forward` (rad); their heads tilted toward each other. */
function holdHands(her, him, forward) {
  her.rightArmOut = HOLD.OUT;
  him.leftArmOut = HOLD.OUT;
  her.rightArm = forward;
  him.leftArm = forward;
  her.headTilt = HOLD.TILT;
  him.headTilt = -HOLD.TILT;
}

/** Raises `who`'s `side` arm ('left' or 'right') `amount` (0 to 1) of the way into a wave at `phase` (rad). */
function waveArm(who, side, phase, amount = 1) {
  who[`${side}Arm`] = lerp(who[`${side}Arm`], WAVE.FORWARD, amount);
  who[`${side}ArmOut`] = lerp(who[`${side}ArmOut`], WAVE.OUT + WAVE.SWING * Math.sin(phase), amount);
}

/**
 * How far a tap's wave is in, `sinceTap` seconds after it: from 0 up to 1 over REACT.RISE, and back down to 0 over the
 * last REACT.FALL of REACT.TIME (2 s). 0 before a tap, after it, and without one (NaN).
 * @param {number} sinceTap
 * @returns {number}  0 to 1
 */
export function wavedAt(sinceTap) {
  if (!(sinceTap >= 0 && sinceTap < REACT.TIME)) return 0;
  return Math.min(smoothstep(0, REACT.RISE, sinceTap), 1 - smoothstep(REACT.TIME - REACT.FALL, REACT.TIME, sinceTap));
}

/**
 * How the two of them hold themselves for `pose` at `time` (s), in the layout's frame (`coupleLayout`), `sinceTap`
 * seconds after a tap on them (NaN or Infinity: none). Pure: the same numbers for the same time.
 * @param {string} pose  as for `coupleLayout`
 * @param {number} time
 * @param {number} [sinceTap]
 * @returns {{ her: Required<import('./figures.js').Pose>, him: Required<import('./figures.js').Pose>, spin: number,
 *             sway: number, twirl: number, heart: number }}
 *   Every field of each Pose is there. `spin`: how far (rad, + to their left) the pair has turned about their
 *   middle; `sway`: how far (rad) the pair leans toward her (+) or away, about the line between their feet; `twirl`:
 *   how far (rad) she has turned about herself, beyond her layout's turn; `heart`: how big the heart they make is
 *   (1 its full size; 0 for every pose but 'heart').
 */
export function posesAt(pose, time, sinceTap = NaN) {
  const t = Number.isFinite(time) ? time : 0;
  const breath = (TAU / BREATH.PERIOD) * t;
  const her = standing(BREATH.BOB * (0.5 + 0.5 * Math.sin(breath)));
  const him = standing(BREATH.BOB * (0.5 + 0.5 * Math.sin(breath + BREATH.LAG)));
  let spin = 0;
  let sway = 0;
  let twirl = 0;
  let heart = 0;

  switch (pose) {
    case 'waving': {
      holdHands(her, him, HOLD.SWING);
      const phase = TAU * WAVE.RATE * t;
      waveArm(her, 'left', phase);
      waveArm(him, 'right', phase + WAVE.LAG);
      break;
    }
    case 'hug': {
      const squeeze = HUG.SQUEEZE * Math.sin(breath);
      for (const [who, arms] of [[her, HUG.HER_ARMS], [him, HUG.HIS_ARMS]]) {
        who.leftArm = arms + squeeze;
        who.rightArm = arms + squeeze;
        who.headTilt = -HUG.TILT;
        who.headTurn = HUG.TURN;
      }
      sway = HUG.ROCK * Math.sin((TAU / HUG.ROCK_PERIOD) * t);
      break;
    }
    case 'sitting': {
      her.sit = 1;
      him.sit = 1;
      holdHands(her, him, SITTING.FORWARD);
      her.headTilt = SITTING.HER_TILT;
      him.headTilt = -SITTING.HIS_TILT;
      const hers = SITTING.KICK * Math.sin((TAU / SITTING.HER_KICK) * t);
      const his = SITTING.KICK * Math.sin((TAU / SITTING.HIS_KICK) * t + 2);
      her.leftLeg = hers;
      her.rightLeg = -hers;
      him.leftLeg = -his;
      him.rightLeg = his;
      her.leftArm = HOLD.FREE * Math.sin(breath);
      him.rightArm = HOLD.FREE * Math.sin(breath + BREATH.LAG);
      break;
    }
    case 'dancing': {
      spin = (DANCE.SPIN * t) % TAU;
      const beat = (TAU / DANCE.PERIOD) * t;
      sway = DANCE.SWAY * Math.sin(beat);
      for (const who of [her, him]) {
        who.leftArm = DANCE.ARMS;
        who.rightArm = DANCE.ARMS;
      }
      // Stepping with the sway, her left foot with his right, across from each other.
      her.leftLeg = DANCE.STEP * Math.sin(beat);
      her.rightLeg = -her.leftLeg;
      him.rightLeg = her.leftLeg;
      him.leftLeg = -her.leftLeg;
      her.headTilt = DANCE.HER_TILT;
      break;
    }
    case 'pointing': {
      her.leftArm = POINT.ARM + POINT.JAB * Math.sin((TAU / POINT.JAB_PERIOD) * t);
      her.leftArmOut = POINT.OUT;
      her.headTurn = POINT.HER_LOOK;
      him.headTurn = POINT.LOOK;
      her.rightArmOut = POINT.HER_REACH;
      him.leftArmOut = HOLD.OUT;
      him.leftArm = POINT.HIS_REACH;
      him.rightArm = HOLD.FREE * Math.sin(breath + BREATH.LAG);
      break;
    }
    case 'celebrate': {
      const up = hopAt((TAU / CHEER.HOP_PERIOD) * t);
      for (const [who, near, far] of [[her, 'right', 'left'], [him, 'left', 'right']]) {
        who.bob += CHEER.HOP * up;
        who[`${near}Arm`] = CHEER.ARMS;
        who[`${near}ArmOut`] = CHEER.IN;
        who[`${far}Arm`] = CHEER.ARMS + CHEER.PUMP * up;
        who[`${far}ArmOut`] = CHEER.OUT;
        who.leftLeg = -CHEER.TUCK * up;
        who.rightLeg = -CHEER.TUCK * up;
      }
      break;
    }
    case 'walking': {
      const swing = Math.sin((TAU / WALKING.STRIDE) * t);
      holdHands(her, him, HOLD.SWING + HOLD.JOINED * swing);
      for (const who of [her, him]) {
        who.leftLeg = WALKING.STEP * swing;
        who.rightLeg = -WALKING.STEP * swing;
      }
      // Each free arm swings against the leg on its side.
      her.leftArm = -WALKING.ARM * swing;
      him.rightArm = WALKING.ARM * swing;
      const look = (TAU / WALKING.LOOK_PERIOD) * t;
      her.headTurn = WALKING.LOOK * Math.sin(look);
      him.headTurn = WALKING.LOOK * Math.sin(look - WALKING.LOOK_LAG);
      break;
    }
    case 'selfie': {
      const wobble = SELFIE.WOBBLE * Math.sin((TAU / SELFIE.WOBBLE_PERIOD) * t);
      // Over the last quarter of each SNAP_PERIOD they lean in further, and back.
      const snap = SELFIE.SNAP * Math.sin(Math.PI * smoothstep(0.75, 1, (t / SELFIE.SNAP_PERIOD) % 1));
      him.rightArm = SELFIE.ARM + wobble;
      him.rightArmOut = SELFIE.OUT;
      her.leftArm = SELFIE.HER_ARM;
      her.leftArmOut = SELFIE.HER_OUT - wobble;
      for (const [who, near] of [[her, 'right'], [him, 'left']]) {
        who[`${near}Arm`] = SELFIE.NEAR;
        who[`${near}ArmOut`] = SELFIE.NEAR_OUT;
      }
      her.headTilt = SELFIE.TILT + snap;
      him.headTilt = -(SELFIE.TILT + snap);
      break;
    }
    case 'goofy': {
      const beat = TAU * GOOFY.RATE * t;
      holdHands(her, him, GOOFY.HELD_AT + GOOFY.HELD * Math.sin(beat / 2));
      for (const [who, far, lag] of [[her, 'left', 0], [him, 'right', Math.PI]]) {
        who[`${far}ArmOut`] = lerp(GOOFY.FLAP_FROM, GOOFY.FLAP_TO, 0.5 + 0.5 * Math.sin(beat + lag));
        const kick = GOOFY.KICK * Math.sin(beat / 2 + lag);
        who.leftLeg = kick;
        who.rightLeg = -kick;
        // Both heads wobble the same way, so they never knock together.
        who.headTilt = GOOFY.WOBBLE * Math.sin(beat / 2 + 1);
      }
      break;
    }
    case 'heart': {
      const through = (t / HEART.PERIOD) % 1;
      const slip = smoothstep(HEART.SLIP_FROM, HEART.SLIP_FROM + 0.06, through) * (1 - smoothstep(HEART.SLIP_TO - 0.06, HEART.SLIP_TO, through));
      for (const [who, near, far] of [[her, 'right', 'left'], [him, 'left', 'right']]) {
        who[`${near}Arm`] = HEART.ARMS - HEART.DROP * slip;
        who[`${near}ArmOut`] = HEART.IN - HEART.SLIP_OUT * slip;
        who[`${far}Arm`] = HEART.HIP;
        who[`${far}ArmOut`] = HEART.HIP_OUT;
      }
      her.headTilt = lerp(HEART.TILT, -HEART.TILT, slip);
      him.headTilt = -her.headTilt;
      heart = lerp(1, HEART.SHRUNK, slip) * (1 + HEART.BEAT * Math.sin((TAU / HEART.BEAT_PERIOD) * t));
      break;
    }
    default: { // holding hands, as they always have
      holdHands(her, him, HOLD.SWING + HOLD.JOINED * Math.sin(breath / 2));
      her.leftArm = HOLD.FREE * Math.sin(breath);
      him.rightArm = HOLD.FREE * Math.sin(breath + BREATH.LAG);
    }
  }

  // A tap: her left arm and his right wave (the outer ones side by side; turned to each other, the ones toward the
  // train), and a pair turned to each other look round at the train. A waving couple twirls instead.
  const waved = wavedAt(sinceTap);
  if (waved > 0) {
    if (pose === 'waving') {
      twirl = TAU * easeInOutCubic(clamp(sinceTap / REACT.TIME, 0, 1));
      her.rightArmOut = lerp(her.rightArmOut, REACT.HER_ARM, waved);
      him.leftArmOut = lerp(him.leftArmOut, REACT.HIS_ARM, waved);
    } else {
      const phase = TAU * WAVE.RATE * sinceTap;
      waveArm(her, 'left', phase, waved);
      waveArm(him, 'right', phase + WAVE.LAG, waved);
      if (FACING.includes(pose)) {
        her.headTurn = lerp(her.headTurn, REACT.LOOK, waved);
        him.headTurn = lerp(him.headTurn, -REACT.LOOK, waved);
      }
    }
  }
  return { her, him, spin, sway, twirl, heart };
}

/**
 * The same pose seen in a mirror (x to -x): left and right swapped, and the head turned and tilted the other way.
 * @param {import('./figures.js').Pose} pose  with every field (`posesAt` gives them)
 * @returns {import('./figures.js').Pose}
 */
export function mirrorPose(pose) {
  return {
    leftLeg: pose.rightLeg,
    rightLeg: pose.leftLeg,
    leftArm: pose.rightArm,
    rightArm: pose.leftArm,
    bob: pose.bob,
    leftArmOut: pose.rightArmOut,
    rightArmOut: pose.leftArmOut,
    headTurn: -pose.headTurn,
    headTilt: -pose.headTilt,
    sit: pose.sit,
  };
}
