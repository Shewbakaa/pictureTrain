// How the two of them stand at a stop, posed for its moment (content.js `pose`): where each of them stands and which
// way they face (`coupleLayout`), and how they hold themselves at any moment (`posesAt`). Each pose has a gentle idle
// loop, so they are never frozen statues: everyone breathes, joined hands swing a little, a wave waves, legs swing
// under a bench, a hug rocks and a dance sways slowly round. A tap on them (Task 14) makes them wave for a moment
// (`wavedAt`); a couple who are waving already twirl instead: he spins her once round under his arm.
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
const HALF_WIDTH = Object.freeze({ waving: 0.75, hug: 0.44, sitting: 0.81, dancing: 0.58, pointing: 0.69 });

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
 *             sway: number, twirl: number }}
 *   Every field of each Pose is there. `spin`: how far (rad, + to their left) the pair has turned about their
 *   middle; `sway`: how far (rad) the pair leans toward her (+) or away, about the line between their feet; `twirl`:
 *   how far (rad) she has turned about herself, beyond her layout's turn.
 */
export function posesAt(pose, time, sinceTap = NaN) {
  const t = Number.isFinite(time) ? time : 0;
  const breath = (TAU / BREATH.PERIOD) * t;
  const her = standing(BREATH.BOB * (0.5 + 0.5 * Math.sin(breath)));
  const him = standing(BREATH.BOB * (0.5 + 0.5 * Math.sin(breath + BREATH.LAG)));
  let spin = 0;
  let sway = 0;
  let twirl = 0;

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
  return { her, him, spin, sway, twirl };
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
