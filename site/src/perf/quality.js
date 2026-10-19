// Automatic quality tiers, so the ride stays smooth on whatever phone she has.
//
// The app starts in the middle tier and feeds the governor every frame's duration. After a warmup (the first
// frames include shader compiles and uploads, which say nothing about the phone), it averages the frame time
// over each window: a slow window steps down a tier, a fast one steps up, but only if it has never had to step
// down (a phone that struggled once is not trusted with more again). It changes at most `maxChanges` times, so
// it settles instead of hunting, and a forced tier (`?quality=`) never changes.
//
// Frame times are the time between animation frames, so they can never beat the screen's refresh: a 60 Hz
// screen never averages below 16.7 ms, and only a faster screen ever steps up. A phone that hands out frames at
// a steady 30 a second (iOS Low Power Mode does, however idle the GPU is) is at its cap, not struggling, so a
// window clustered tightly round 33.3 ms does not step down; one with the same average but a wide spread does.
//
// Pure and DOM-free, so the Node unit tests can import it.

/**
 * @typedef {'low'|'medium'|'high'} TierName
 * @typedef {{ pixelRatio: number, density: number, shadows: boolean, particles: number }} TierSettings
 *   `pixelRatio` is the most device pixels per CSS pixel to draw (fewer if the screen has fewer), `density` the
 *   share of the scenery props to draw, `shadows` whether the sun casts shadows, and `particles` the share of
 *   the ambient particles to draw.
 */

/** @type {Readonly<Record<TierName, Readonly<TierSettings>>>} */
export const TIERS = Object.freeze({
  low: Object.freeze({ pixelRatio: 1, density: 0.45, shadows: false, particles: 0.35 }),
  medium: Object.freeze({ pixelRatio: 1.5, density: 0.75, shadows: false, particles: 0.7 }),
  high: Object.freeze({ pixelRatio: 2, density: 1, shadows: true, particles: 1 }),
});

/** The tiers from lowest to highest. */
const ORDER = ['low', 'medium', 'high'];

/**
 * A frame counts as at most this long (s) in an average. The first frame after the phone was locked or the tab
 * hidden can be many seconds long; on its own it must not decide the tier.
 */
const LONGEST_FRAME = 0.25;

/**
 * After a change the governor waits this long (s) before it measures again, because the change itself costs a
 * frame or two (turning shadows on recompiles the shaders), which would count against the new tier.
 */
const SETTLE = 0.5;

/**
 * A 30 Hz refresh cap (ms per frame), and how close to it a window's average must be, and how little its frame
 * times may spread (standard deviation), for the window to count as the cap rather than a slow phone.
 */
const CAPPED_MS = 1000 / 30;
const CAP_TOLERANCE_MS = 3;
const CAP_JITTER_MS = 2;

/**
 * @param {{ initial?: TierName, forced?: TierName|null, warmup?: number, window?: number, slowMs?: number,
 *           fastMs?: number, maxChanges?: number }} [options]
 *   Times are seconds except `slowMs` and `fastMs`, which are milliseconds of average frame time: above
 *   `slowMs` is slow (unless it is a steady 30 Hz cap, see above), below `fastMs` is fast.
 * @returns {{ readonly tier: TierName, sample: (dtSeconds: number) => TierName|null, settings: () => TierSettings }}
 *   `sample` takes the duration of the frame just drawn and returns the new tier when it changes, otherwise
 *   null. `settings` is the current tier's TierSettings.
 */
export function createQualityGovernor({
  initial = 'medium', forced = null, warmup = 1.5, window = 2.0, slowMs = 24, fastMs = 13, maxChanges = 3,
} = {}) {
  let tier = forced ?? initial;
  let waitLeft = warmup;    // seconds still to ignore before measuring
  let windowTime = 0;       // seconds measured in the current window
  let windowSquares = 0;    // the sum of the squares of its frame times (s²), for their spread
  let windowFrames = 0;
  let changes = 0;
  let steppedDown = false;

  function sample(dtSeconds) {
    if (forced !== null || changes >= maxChanges || !(dtSeconds > 0)) return null;
    if (waitLeft > 0) {
      waitLeft -= dtSeconds;
      return null;
    }
    const frame = Math.min(dtSeconds, LONGEST_FRAME);
    windowTime += frame;
    windowSquares += frame * frame;
    windowFrames += 1;
    if (windowTime < window) return null;

    const average = windowTime / windowFrames;
    const averageMs = average * 1000;
    const spreadMs = Math.sqrt(Math.max(0, windowSquares / windowFrames - average * average)) * 1000;
    windowTime = 0;
    windowSquares = 0;
    windowFrames = 0;
    const atRefreshCap = Math.abs(averageMs - CAPPED_MS) <= CAP_TOLERANCE_MS && spreadMs < CAP_JITTER_MS;
    const at = ORDER.indexOf(tier);
    let next = null;
    if (averageMs > slowMs && !atRefreshCap && at > 0) {
      next = ORDER[at - 1];
      steppedDown = true;
    } else if (averageMs < fastMs && !steppedDown && at < ORDER.length - 1) {
      next = ORDER[at + 1];
    }
    if (next === null) return null;
    tier = next;
    changes += 1;
    waitLeft = SETTLE;
    return tier;
  }

  return {
    get tier() { return tier; },
    sample,
    settings: () => TIERS[tier],
  };
}

/**
 * The pixel ratio to draw at: the tier's, unless the screen has fewer device pixels than that.
 * @param {TierSettings} tierSettings
 * @param {number} deviceRatio  window.devicePixelRatio
 * @returns {number}
 */
export function effectivePixelRatio(tierSettings, deviceRatio) {
  return Math.min(tierSettings.pixelRatio, deviceRatio > 0 ? deviceRatio : 1);
}
