// When the finale's own sounds come, on its clock: a whoosh as she hops down from the carriage, a light tap and a
// rustle of her dress as she lands, the station house door creaking open with its little shop bell as he sets off,
// his footsteps on the platform, two heartbeats as they face each other, the bouquet's paper crinkling as he holds
// it out, the sparkle as the hearts rise and doves flying off the roof as the fireworks start. The fireworks' own
// pops keep to fireworkTiming.js, and the station bell to the train's arrival (audio/sfxTiming.js). The ride's cues
// play them (audio/cueSounds.js); audio/foleySounds.js makes them.
//
// Each is tied to the choreography (finaleTimes.js) rather than set by hand: the hop and the landing are the keys of
// her hop, the door his walk's start, the heartbeats placed back from the hand-off. His footsteps follow his pace
// along the platform, read from the same walk finale.js moves him by, but at a person's cadence (two to two and a
// half steps a second) rather than his little legs' quick swing: slower as he sets off, brisk as he hurries over,
// slower again as he nears her, and none once he has all but stopped, before the hand-off.
//
// Pure and DOM-free, so the Node unit tests and the sounds can import it without the finale's scene.

import { EASES } from './timeline.js';
import { FINALE_TIMES as T, HIM, HOP, PACE_SPAN, WALK_EASE } from './finaleTimes.js';
import { clamp } from '../util/math.js';

/**
 * AIRTIME: how long her hop's whoosh lasts, while she is in the air (s). SHOP_BELL: how long after the door starts
 * creaking its bell jingles, as the door swings into it (s). HEART: two beats APART seconds apart, each a "lub" and,
 * DUB seconds later, a softer "dub" that has died away RING seconds after it; the second has died away as the
 * hand-off begins. STEP: his footsteps, the first OFF seconds after he sets off, then SLOW steps a second rising to
 * FAST with his pace (in full from FULL_PACE m/s), and none once his pace falls under STILL m/s; each softer the
 * slower he goes, SOFT of full at a standstill.
 */
export const FOLEY = Object.freeze({
  AIRTIME: HOP.land - HOP.takeoff,
  SHOP_BELL: 0.1,
  HEART: Object.freeze({ BEATS: 2, APART: 0.8, DUB: 0.2, RING: 0.14 }),
  STEP: Object.freeze({ OFF: 0.3, SLOW: 1.2, FAST: 2.5, FULL_PACE: 5, STILL: 0.25, SOFT: 0.55 }),
});

const H = FOLEY.HEART;
const lastBeat = T.handoffStart - H.RING - H.DUB;
const cue = (name, t) => Object.freeze({ name, t });

/** The finale's foley cues but his footsteps (footfalls), by name, in time order (s on the finale's clock). */
export const FOLEY_CUES = Object.freeze([
  cue('hop', HOP.takeoff),
  cue('land', HOP.land),
  cue('dress', HOP.land),
  cue('door', T.himWalkStart),
  cue('shop-bell', T.himWalkStart + FOLEY.SHOP_BELL),
  ...Array.from({ length: H.BEATS }, (_, i) => cue('heartbeat', lastBeat - (H.BEATS - 1 - i) * H.APART)),
  cue('crinkle', T.handoffStart),
  cue('sparkle', T.hearts),
  cue('doves', T.fireworks),
].sort((a, b) => a.t - b.t));

/** How far he walks from the station house door to her (m, straight across the platform). */
const WALK_LENGTH = Math.hypot(HIM.end[0] - HIM.door[0], HIM.end[1] - HIM.door[1]);
const ease = EASES[WALK_EASE];

/** How far he has walked from the door at `t` (m), as the finale's 'him' track moves him. */
function walked(t) {
  return WALK_LENGTH * ease(clamp((t - T.himWalkStart) / (T.himWalkEnd - T.himWalkStart), 0, 1));
}

/** His pace at `t` (m/s), measured as finale.js measures it. */
function paceAt(t) {
  return (walked(t + PACE_SPAN) - walked(t - PACE_SPAN)) / (2 * PACE_SPAN);
}

/**
 * His footsteps (finale time `t`, s, and `level`, 0 to 1), worked out once: a step clock that ticks at his cadence,
 * which follows his pace, from his first step until he has all but stopped.
 */
const FOOTSTEPS = (() => {
  const S = FOLEY.STEP;
  const dt = 1e-4;
  const steps = [];
  let towards = 1; // the step clock: a step falls each time it comes round
  for (let t = T.himWalkStart + S.OFF; t < T.himWalkEnd; t += dt) {
    const going = clamp(paceAt(t) / S.FULL_PACE, 0, 1);
    if (t > (T.himWalkStart + T.himWalkEnd) / 2 && paceAt(t) < S.STILL) break;
    if (towards >= 1) {
      steps.push(Object.freeze({ t, level: S.SOFT + (1 - S.SOFT) * going }));
      towards -= 1;
    }
    towards += (S.SLOW + (S.FAST - S.SLOW) * going) * dt;
  }
  return Object.freeze(steps);
})();

/**
 * His footsteps after finale time `from` and up to `to`: calls `visit('step', t, level)` for each, in time order,
 * `level` (0 to 1) softer as he sets off and as he arrives. Allocates nothing.
 * @param {number} from
 * @param {number} to
 * @param {(name: string, t: number, level: number) => void} visit
 */
export function footfalls(from, to, visit) {
  for (let i = 0; i < FOOTSTEPS.length; i++) {
    const { t, level } = FOOTSTEPS[i];
    if (t <= from) continue;
    if (t > to) break;
    visit('step', t, level);
  }
}

/**
 * Every foley cue and footstep after finale time `from` and up to `to`: calls `visit(name, t, level)` for each, in
 * time order (`level` is 1 but for his footsteps). Back-to-back stretches report each exactly once; a stretch that
 * runs backwards has none. Allocates nothing.
 * @param {number} from
 * @param {number} to
 * @param {(name: string, t: number, level: number) => void} visit
 */
export function foleyCues(from, to, visit) {
  if (!(to > from)) return;
  let at = from;
  for (let i = 0; i < FOLEY_CUES.length; i++) {
    const { name, t } = FOLEY_CUES[i];
    if (t <= from) continue;
    if (t > to) break;
    footfalls(at, t, visit);
    at = t;
    visit(name, t, 1);
  }
  footfalls(at, to, visit);
}
