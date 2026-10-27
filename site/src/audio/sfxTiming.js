// The train's sounds as numbers: when its chugs and rail-joint clicks fall and how loud they are, when the brakes
// come on, and the whistle's notes. sfx.js plays them; trainSounds.js makes them.
//
// Everything here keeps to real time. The app passes the ride's own speed (m/s, which a ?speed= time warp leaves
// alone) and the real seconds of each frame, so the chugs come at the same pace however fast a test runs the ride.
// The clicks are tied to the distance the train covers instead, and a warped train crosses joints far faster than
// any real one: those clicks pass through a gate that holds them to real time, and the extra ones are skipped
// rather than played late in a burst.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { RIDE } from '../ride/rideController.js';
import { clamp } from '../util/math.js';

export const TRAIN = Object.freeze({
  CHUG_EVERY: 5,        // metres of track per chug: 1.3 chugs a second at the 6.5 m/s cruise
  JOINT_EVERY: 12,      // metres between rail joints
  BOGIE_GAP: 2,         // metres between the two bogies that click over each joint, one after the other
  BOGIE_DELAY_MIN: 0.08, // the second click never comes sooner (s) than this after the first...
  BOGIE_DELAY_MAX: 0.5, // ...nor later, so a crawling train still sounds the pair together
  MAX_HOP: 24,          // a frame that moves the train further than this (m) is a jump or a restart: no click
  JOINT_GAP: 1,         // real seconds between one joint's clicks and the next, at least (a real ride: 1.85 s)
  MAX_STEP: RIDE.MAX_DT, // the longest frame the chug clock counts (s), as the ride does
  DEPART_PHASE: 0.5,    // where the chug clock starts as the train sets off: the first chug follows the whistle
  BRAKE_EPS: 0.01,      // metres of slack in telling when braking has begun
});

/** Chugs a second at `speed` (m/s): none standing still, about 1.3 at cruise. */
export function chugRate(speed) {
  return speed > 0 ? speed / TRAIN.CHUG_EVERY : 0;
}

/** Seconds between chugs at `speed`; Infinity standing still. */
export function chugInterval(speed) {
  const rate = chugRate(speed);
  return rate > 0 ? 1 / rate : Infinity;
}

/** A chug's loudness (0–1) at `speed`: silent standing still, full at cruise, and still heard setting off. */
export function chugLevel(speed) {
  return Math.sqrt(clamp(speed / RIDE.CRUISE, 0, 1));
}

/** A rail-joint click's loudness (0–1) at `speed`: the wheels strike the joint harder the faster they go. */
export function clickLevel(speed) {
  return clamp(speed / RIDE.CRUISE, 0, 1);
}

/** Seconds from the first bogie's click over a joint to the second's at `speed`. */
export function bogieDelay(speed) {
  const delay = speed > 0 ? TRAIN.BOGIE_GAP / speed : Infinity;
  return clamp(delay, TRAIN.BOGIE_DELAY_MIN, TRAIN.BOGIE_DELAY_MAX);
}

/**
 * A clock that ticks once per chug. `step(speed, seconds)` moves it on by a frame and returns how long before the
 * frame's end the chug fell (s), or -1 if none did. A frame counts for at most TRAIN.MAX_STEP seconds, so a stalled
 * page gives one chug at most, never a burst. `reset(phase)` sets how far (0–1) it is towards the next chug.
 */
export function createChugClock() {
  let phase = 0;
  return {
    get phase() {
      return phase;
    },
    reset(next = 0) {
      phase = next;
    },
    step(speed, seconds) {
      const rate = chugRate(speed);
      if (!(rate > 0) || !(seconds > 0)) return -1;
      phase += rate * Math.min(seconds, TRAIN.MAX_STEP);
      if (phase < 1) return -1;
      phase -= Math.floor(phase);
      return phase / rate;
    },
  };
}

/**
 * The rail joint the train crossed moving from `from` to `to` (m along the track): that joint's distance, or -1 for
 * none. Several joints in one step (a time-warped frame) count as the last one alone, and a move backwards or one
 * longer than TRAIN.MAX_HOP (a jump along the timeline, a restart) crosses none.
 */
export function jointCrossed(from, to) {
  if (!(to > from) || to - from > TRAIN.MAX_HOP) return -1;
  const joint = Math.floor(to / TRAIN.JOINT_EVERY) * TRAIN.JOINT_EVERY;
  return joint > from ? joint : -1;
}

/**
 * Lets a sound through at most once every `gap` seconds: `open(now)` is true if it may sound at `now` (and starts
 * the next wait), false if it comes too soon and is to be skipped. `reset()` forgets the last one.
 */
export function createGate(gap) {
  let last = -Infinity;
  return {
    open(now) {
      if (now - last < gap) return false;
      last = now;
      return true;
    },
    reset() {
      last = -Infinity;
    },
  };
}

/**
 * Whether the train, making `speed` m/s with `toStop` metres left to where it stops next, is braking for it: the
 * ride brakes along v = √(2·BRAKE·remaining), so it is braking once the distance it needs to stop covers what is left.
 */
export function isBraking(speed, toStop) {
  return speed > 0 && toStop <= (speed * speed) / (2 * RIDE.BRAKE) + TRAIN.BRAKE_EPS;
}

const toot = (t, dur) => Object.freeze({ t, dur });

/**
 * The whistle: a chord (MIDI notes) and, for each kind, its toots (start `t` and length `dur`, s). `depart` is the
 * "choo-choo" as the train sets off; `finale` the longer, happy one as it pulls into the Day 365 station.
 */
export const WHISTLE = Object.freeze({
  CHORD: Object.freeze([69, 72, 77]), // A4 C5 F5: an F major chord, in the tune's key
  depart: Object.freeze([toot(0, 0.3), toot(0.42, 0.45)]),
  finale: Object.freeze([toot(0, 0.25), toot(0.37, 0.25), toot(0.74, 1.5)]),
});

/** At the Day 365 station the whistle blows this long after the steam's sigh, which comes as the train stops (s). */
export const FINALE_WHISTLE_AFTER = 0.35;

const longToot = WHISTLE.finale[WHISTLE.finale.length - 1];

/**
 * The station bell as the train pulls in at the Day 365 station: two strikes ("ding-ding") APART seconds apart, the
 * first AFTER seconds after the train stops, which is 0.15 s after the whistle's long last toot has ended, so that
 * nothing masks it. It rings on as she hops down.
 */
export const STATION_BELL = Object.freeze({
  APART: 0.38,
  AFTER: FINALE_WHISTLE_AFTER + longToot.t + longToot.dur + 0.15,
});
