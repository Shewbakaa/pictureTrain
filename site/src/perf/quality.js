// Automatic quality tiers, so the ride stays smooth on whatever phone she has.
//
// The app starts in the middle tier and feeds the governor every frame's duration. After a warmup (the first
// frames include shader compiles and uploads, which say nothing about the phone), it averages the frame time
// over each window: a slow window steps down a tier, a fast one steps up, but only if it has never had to step
// down (a phone that struggled once is not trusted with more again). It changes at most `maxChanges` times, so
// it settles instead of hunting, and a forced tier (`?quality=`) never changes.
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
 * @param {{ initial?: TierName, forced?: TierName|null, warmup?: number, window?: number, slowMs?: number,
 *           fastMs?: number, maxChanges?: number }} [options]
 *   Times are seconds except `slowMs` and `fastMs`, which are milliseconds of average frame time: above
 *   `slowMs` is slow, below `fastMs` is fast.
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
  let windowFrames = 0;
  let changes = 0;
  let steppedDown = false;

  function sample(dtSeconds) {
    if (forced !== null || changes >= maxChanges || !(dtSeconds > 0)) return null;
    if (waitLeft > 0) {
      waitLeft -= dtSeconds;
      return null;
    }
    windowTime += Math.min(dtSeconds, LONGEST_FRAME);
    windowFrames += 1;
    if (windowTime < window) return null;

    const averageMs = (windowTime / windowFrames) * 1000;
    windowTime = 0;
    windowFrames = 0;
    const at = ORDER.indexOf(tier);
    let next = null;
    if (averageMs > slowMs && at > 0) {
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
