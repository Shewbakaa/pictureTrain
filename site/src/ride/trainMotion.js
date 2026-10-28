// The train moving under her: a gentle rock from side to side, a small drop as each bogie strikes a rail joint, and
// a tip back as the train pulls away (forward as it brakes). All of it is small, a fraction of a degree and a few
// millimetres, and none of it is meant to be noticed as motion, only to make the seat feel like it is on rails
// rather than on a camera dolly.
//
// The bumps are timed with the clickety-clack she hears (audio/sfxTiming.js): the same joints, and the second bogie's
// strike as long after the first as its click comes. The app applies the numbers to her seat each frame (app.js).
//
// A frame that moves the train backwards or further than TRAIN.MAX_HOP (a jump along the timeline, "Ride again")
// is no ride at all, so the motion starts afresh rather than bumping over joints it never crossed or lurching as
// the speed drops to nothing.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { clamp } from '../util/math.js';
import { RIDE } from './rideController.js';
import { TRAIN, bogieDelay, clickLevel, jointCrossed } from '../audio/sfxTiming.js';

/**
 * How the train moves under her. Roll and pitch are angles (rad), the bump a drop (m), and each spring rings at its
 * own rate (Hz) and dies away at its damping (0 rings on for ever, 1 does not ring at all).
 */
export const TRAIN_MOTION = Object.freeze({
  ROLL: 0.0061,         // how far the train rocks from side to side at cruise: 0.35 degrees
  ROLL_RATE: 0.5,       // the rock's rate (Hz)
  WANDER: 0.3,          // a second, slower sway, a share of ROLL, so the rock never repeats exactly...
  WANDER_RATE: 0.13,    // ...at this rate (Hz)
  BUMP: 0.004,          // how far each bogie's strike of a rail joint drops her at cruise (m)
  BUMP_HZ: 9,
  BUMP_DAMPING: 0.35,
  PITCH: 0.0087,        // how far she tips at full acceleration: 0.5 degrees
  PITCH_HZ: 1.6,
  PITCH_DAMPING: 0.45,
  HEAD_LAG: 0.3,        // how much less than her seat her head drops over a bump (a share of the drop)
});

/** A change smaller than this (rad, m, per second) is as good as still: a settled spring sits exactly at rest. */
const REST = 1e-9;

const TAU = 2 * Math.PI;

/**
 * A damped spring, stepped by the exact solution of its motion rather than in small slices, so that a long frame
 * is as steady as a short one. `x` is where it is, `step(dt, target)` lets it swing on towards `target` for `dt`
 * seconds, and `kick(peak)` pushes it so that its first swing reaches `peak` from where it rests.
 */
function createSpring(hz, damping) {
  const w = TAU * hz;
  const decay = damping * w;                           // how fast a swing dies away (1/s)
  const rate = w * Math.sqrt(1 - damping * damping);   // the rate it swings at: a little slower than w (rad/s)
  // A push of speed 1 swings it out this far (m or rad) before it comes back.
  const reach = Math.exp(-(decay / rate) * Math.atan(rate / decay)) / w;
  let x = 0;
  let v = 0;
  return {
    get x() {
      return x;
    },
    kick(peak) {
      v += peak / reach;
    },
    step(dt, target = 0) {
      const away = x - target;
      const fade = Math.exp(-decay * dt);
      const cos = Math.cos(rate * dt);
      const sin = Math.sin(rate * dt);
      let nextAway = fade * (away * cos + ((v + decay * away) / rate) * sin);
      v = fade * (v * cos - ((w * w * away + decay * v) / rate) * sin);
      if (Math.abs(nextAway) < REST && Math.abs(v) < REST) {
        nextAway = 0;
        v = 0;
      }
      x = target + nextAway;
    },
    reset() {
      x = 0;
      v = 0;
    },
  };
}

/**
 * @typedef {object} TrainMotion
 * @property {(dt: number, speed: number, distance: number) => void} update
 *   Every frame: `dt` real seconds, the train making `speed` m/s (the ride's own, which a ?speed= time warp leaves
 *   alone) and `distance` m along the track.
 * @property {() => void} reset  Back to still, as after a jump along the track.
 * @property {number} roll     rad about the way she faces, a rock from side to side
 * @property {number} pitch    rad about her right hand; above 0 tilts the view up: she tips back as the train pulls away
 * @property {number} lift     m up from her seat, never above 0: a bump drops her
 * @property {number} headLag  m up from her seat for the camera alone, so the dashboard jolts a hair against the view
 */

/** @returns {TrainMotion} */
export function createTrainMotion() {
  const bump = createSpring(TRAIN_MOTION.BUMP_HZ, TRAIN_MOTION.BUMP_DAMPING);
  const tip = createSpring(TRAIN_MOTION.PITCH_HZ, TRAIN_MOTION.PITCH_DAMPING);
  /** The second bogie's strikes still to come: `in` seconds from the end of the last frame, `level` its strength (0–1). */
  let strikes = [];
  let clock = 0;        // seconds of motion since the start or the last reset, which the rock swings by
  let roll = 0;
  let primed = false;   // there is a last frame to measure this one against
  let lastSpeed = 0;
  let lastDistance = 0;

  /** Lets the bump spring swing on for `step` seconds, striking at each second bogie's moment on the way. */
  function swingBump(step) {
    let left = step;
    while (strikes.length > 0 && strikes[0].in <= left) {
      const strike = strikes.shift();
      bump.step(strike.in);
      bump.kick(-TRAIN_MOTION.BUMP * strike.level);
      left -= strike.in;
      for (const later of strikes) later.in -= strike.in;
    }
    bump.step(left);
    for (const later of strikes) later.in -= left;
  }

  const motion = {
    update(dt, speed, distance) {
      if (primed && (distance < lastDistance || distance - lastDistance > TRAIN.MAX_HOP)) motion.reset();
      // A frame counts for as long as the ride's own does: its speed moved on by no more than that.
      const step = clamp(dt, 0, TRAIN.MAX_STEP) || 0;
      const level = clickLevel(speed); // 0 standing still, 1 at cruise: the rock and the bumps grow with the speed
      const accel = primed && step > 0 ? (speed - lastSpeed) / step : 0;
      const crossed = primed && jointCrossed(lastDistance, distance) >= 0;
      primed = true;
      lastSpeed = speed;
      lastDistance = distance;

      clock += step;
      roll = level > 0
        ? TRAIN_MOTION.ROLL * level * (
          Math.sin(TAU * TRAIN_MOTION.ROLL_RATE * clock) + TRAIN_MOTION.WANDER * Math.sin(TAU * TRAIN_MOTION.WANDER_RATE * clock))
        : 0;
      tip.step(step, TRAIN_MOTION.PITCH * clamp(accel / RIDE.ACCEL, -1, 1));
      swingBump(step);
      if (crossed) {
        // The first bogie strikes the joint now, as its click sounds; the second follows as its click does.
        bump.kick(-TRAIN_MOTION.BUMP * level);
        strikes.push({ in: bogieDelay(speed), level });
        strikes.sort((a, b) => a.in - b.in);
      }
    },
    reset() {
      bump.reset();
      tip.reset();
      strikes = [];
      clock = 0;
      roll = 0;
      primed = false;
    },
    get roll() {
      return roll;
    },
    get pitch() {
      return tip.x;
    },
    get lift() {
      return bump.x < 0 ? bump.x : 0; // the spring's small rebound above its rest is left out: the rail only drops her
    },
    get headLag() {
      return motion.lift < 0 ? -TRAIN_MOTION.HEAD_LAG * motion.lift : 0;
    },
  };
  return motion;
}
