// The loading screen (its markup and look are inline in index.html, so it paints before anything else loads).
// main.js fills the bar as the photos arrive and fades the screen away once the ride (or the 2D story) is shown,
// or leaves it up with a message when the ride cannot start at all.

import { dismiss } from './dom.js';
import { clamp } from '../util/math.js';

/**
 * Fills the loading bar to `fraction` (0..1). Anything that is not a number counts as 0.
 * @param {number} fraction
 */
export function setLoadingProgress(fraction) {
  const bar = document.getElementById('loading-progress');
  if (!bar) return;
  const share = Number.isFinite(fraction) ? clamp(fraction, 0, 1) : 0;
  bar.style.width = `${(share * 100).toFixed(1)}%`;
}

/** Fades the loading screen out, after a short beat so the bar is seen to reach the end, and then hides it. */
export function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) dismiss(loading, [{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: 250 });
}

/**
 * Turns the loading screen into a message, for when the ride cannot start at all (a typo in content.js): the
 * words replace "Getting the train ready…" and the bar goes away, so it never looks as if it is still loading.
 * @param {string} text
 */
export function showLoadingMessage(text) {
  const loading = document.getElementById('loading');
  if (!loading) return;
  const words = loading.querySelector('.loading-text');
  const bar = loading.querySelector('.loading-bar');
  if (words) {
    words.textContent = text;
    words.setAttribute('role', 'alert');
  }
  if (bar) bar.hidden = true;
}
