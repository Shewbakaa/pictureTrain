// The ambience as numbers: how loud each zone's sounds are at any point of the ride, where the sea's waves sit as
// she looks about, when the random events (birds, a gull, sleigh bells) may come, and the one moment the evening's
// clock tower chimes. ambience.js plays them.
//
// Each zone's ambience follows the scenery: inside a zone it is that zone's alone, and across a boundary the two
// zones crossfade with envAt's blend (zoneA, zoneB and t), the same blend the sky, the fog and the particles follow.
//
// Everything here keeps to real time, like the train's sounds (sfxTiming.js): the event clocks run on the real
// seconds of each frame, so a ?speed= time warp that races through the zones never piles events up, and a stalled
// frame counts for no more than MAX_STEP.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { ZONE_IDS } from '../content/normalize.js';
import { TRAIN } from './sfxTiming.js';
import { clamp } from '../util/math.js';

export const AMBIENCE = Object.freeze({
  MAX_STEP: 0.1,    // the longest frame (s) an event clock counts, as the ride does
  MIN_WEIGHT: 0.05, // a zone fainter than this has no events: none at the far edge of a blend
  WAVE_WIDTH: 0.7,  // how far to one side (pan, 0 to 1) the waves can sit: the sea is wide, not a point
  CHIME_AT: 0.5,    // the clock tower chimes as the evening's weight passes this: at the boundary itself
});

/**
 * How much of each zone's ambience plays at `env` (an Env from envAt): zone A's share is 1 − t and zone B's t, every
 * other zone's 0. Inside a zone, A and B are the same zone, which gets 1. Writes into `out` and returns it, so the
 * frame loop allocates nothing.
 * @param {{ zoneA: string, zoneB: string, t: number }} env
 * @param {Record<string, number>} [out]
 * @returns {Record<string, number>}  zone id to weight, 0 to 1
 */
export function zoneWeights(env, out = {}) {
  for (let i = 0; i < ZONE_IDS.length; i++) out[ZONE_IDS[i]] = 0;
  out[env.zoneA] += 1 - env.t;
  out[env.zoneB] += env.t;
  return out;
}

/**
 * A zone's bed (its continuous sound: breeze, waves, wind...) at the zone's `weight`: equal power, so two beds of
 * noise crossfading at a boundary sound as loud together as either does alone.
 */
export function bedGain(weight) {
  return Math.sin((clamp(weight, 0, 1) * Math.PI) / 2);
}

/**
 * Where the waves sit (stereo pan, −1 left to +1 right) when she has turned her head `yaw` (rad, + is left) and the
 * sea lies on `side` of the track. Looking ahead, a sea on the left is to her left; facing it, or with her back to
 * it, it is in the middle (in front of her, or behind).
 * @param {number} yaw
 * @param {'left'|'right'} side
 */
export function wavePan(yaw, side) {
  const toSea = (side === 'left' ? Math.PI / 2 : -Math.PI / 2) - yaw; // + is to her left
  return -AMBIENCE.WAVE_WIDTH * Math.sin(toSea);
}

/**
 * Random events of one kind, `min` to `max` seconds apart (uniformly) when their zone is fully heard. `step(seconds,
 * weight)` moves it on by a frame of `seconds` real seconds (at most MAX_STEP) with the zone at `weight`, and is
 * true when an event is due. A fainter zone's events come more rarely (time runs at `weight`), and one under
 * MIN_WEIGHT has none, so two events of a kind are never less than `min` real seconds apart.
 * @param {number} min
 * @param {number} max
 * @param {() => number} random  in [0, 1); seeded, so tests and renders repeat
 */
export function createEventClock(min, max, random) {
  const next = () => min + random() * (max - min);
  let wait = min / 2 + random() * (max - min / 2); // the first can come a little sooner, as a zone opens
  return {
    step(seconds, weight) {
      if (!(seconds > 0) || !(weight >= AMBIENCE.MIN_WEIGHT)) return false;
      wait -= Math.min(seconds, AMBIENCE.MAX_STEP) * Math.min(weight, 1);
      if (wait > 0) return false;
      wait = next();
      return true;
    },
  };
}

/**
 * The evening's clock-tower chime, once as the train rolls into the evening. `step(weight, distance)` takes the
 * evening's weight and the train's distance (m) each frame, and is true on the frame the weight passes CHIME_AT
 * with the train moving forward. A jump along the timeline (a move further than TRAIN.MAX_HOP) is not rolling in,
 * and strikes nothing. It strikes again only after the evening has gone (riding again from the start, or jumping
 * back to an earlier moment).
 */
export function createChimeTrigger() {
  let ready = true;
  let lastWeight = 0;
  let lastDistance = NaN;
  return {
    step(weight, distance) {
      const rolling = distance > lastDistance && distance - lastDistance <= TRAIN.MAX_HOP;
      const strike = ready && rolling && lastWeight < AMBIENCE.CHIME_AT && weight >= AMBIENCE.CHIME_AT;
      if (strike) ready = false;
      if (weight <= 0) ready = true;
      lastWeight = weight;
      lastDistance = distance;
      return strike;
    },
  };
}
