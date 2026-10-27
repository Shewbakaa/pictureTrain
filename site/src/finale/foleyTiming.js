// When the finale's own sounds come, on its clock: a whoosh as she hops down from the carriage, a light tap and a
// rustle of her dress as she lands, the station house door creaking open with its little shop bell as he sets off,
// his footsteps on the platform, two heartbeats as they face each other, the bouquet's paper crinkling as he holds
// it out, the sparkle as the hearts rise and doves flying off the roof as the fireworks start. The fireworks' own
// pops keep to fireworkTiming.js, and the station bell to the train's arrival (audio/sfxTiming.js). The ride's cues
// play them (audio/cueSounds.js); audio/foleySounds.js makes them.
//
// Each is tied to the choreography (finaleTimes.js) rather than set by hand: the hop and the landing are the keys of
// her hop, the door his walk's start, and each footstep the moment one of his legs reaches the end of its swing, read
// from the same walk finale.js poses him by (the walk's phase is his distance walked times his stride, and a foot
// comes down whenever the phase passes a quarter turn, where walkPose spreads his legs widest). So his steps come
// slowly as he sets off, quickly as he hurries over, slowly again as he arrives, and stop as he stands.
//
// Pure and DOM-free, so the Node unit tests and the sounds can import it without the finale's scene.

import { EASES } from './timeline.js';
import { FINALE_TIMES as T, FULL_SWING, HIM, HOP, PACE_SPAN, STRIDE, WALK_EASE } from './finaleTimes.js';
import { clamp } from '../util/math.js';

/**
 * AIRTIME: how long her hop's whoosh lasts, while she is in the air (s). SHOP_BELL: how long after the door starts
 * creaking its bell jingles, as the door swings into it (s). HEART: two beats APART seconds apart, each a "lub" and,
 * DUB seconds later, a softer "dub" that has died away RING seconds after it; the second has died away as the
 * hand-off begins. STEP: a footstep is heard only if his leg swings out at least MIN_SWING of its full swing; his
 * steps are softest (SOFT of full) as he sets off and arrives, full from a pace of FULL_PACE m/s.
 */
export const FOLEY = Object.freeze({
  AIRTIME: HOP.land - HOP.takeoff,
  SHOP_BELL: 0.1,
  HEART: Object.freeze({ BEATS: 2, APART: 0.8, DUB: 0.2, RING: 0.14 }),
  STEP: Object.freeze({ MIN_SWING: 0.25, SOFT: 0.55, FULL_PACE: 2.5 }),
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
const QUARTER = Math.PI / 2;

/** How far he has walked from the door at `t` (m), as the finale's 'him' track moves him. */
function walked(t) {
  return WALK_LENGTH * ease(clamp((t - T.himWalkStart) / (T.himWalkEnd - T.himWalkStart), 0, 1));
}

/** His walk's phase at `t` (rad), as finale.js passes it to walkPose. */
function phaseAt(t) {
  return walked(t) * STRIDE.HIM;
}

/** His pace at `t` (m/s), measured as finale.js measures it. */
function paceAt(t) {
  return (walked(t + PACE_SPAN) - walked(t - PACE_SPAN)) / (2 * PACE_SPAN);
}

/** When his walk's phase reaches `phase` (s): it only grows while he walks, so it is found by halving. */
function timeOfPhase(phase) {
  let lo = T.himWalkStart;
  let hi = T.himWalkEnd;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (phaseAt(mid) < phase) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * His footsteps after finale time `from` and up to `to`: calls `visit('step', t, level)` for each, in time order,
 * `level` (0 to 1) softer as he sets off and arrives. A foot comes down each time his walk's phase passes a quarter
 * turn (legs spread widest), so long as his legs still swing out far enough to take a step. Allocates nothing.
 * @param {number} from
 * @param {number} to
 * @param {(name: string, t: number, level: number) => void} visit
 */
export function footfalls(from, to, visit) {
  const a = Math.max(from, T.himWalkStart);
  const b = Math.min(to, T.himWalkEnd);
  if (!(b > a)) return;
  const reached = phaseAt(b);
  const S = FOLEY.STEP;
  for (let k = Math.floor((phaseAt(a) - QUARTER) / Math.PI) + 1; QUARTER + k * Math.PI <= reached; k++) {
    const t = timeOfPhase(QUARTER + k * Math.PI);
    const pace = paceAt(t);
    if (pace / FULL_SWING.HIM < S.MIN_SWING) continue;
    visit('step', t, S.SOFT + (1 - S.SOFT) * clamp(pace / S.FULL_PACE, 0, 1));
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
