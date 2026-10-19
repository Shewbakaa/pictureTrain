// Remembers how far along the ride she has got, so after a reload the timeline still opens every moment she has
// already reached (the ride itself always starts again from Day 1).
//
// localStorage can be missing, full, or throw on every access (private browsing, blocked site data, some in-app
// browsers), so every access is guarded and the ride simply forgets when storage will not work.
//
// DOM-free (it only uses the storage it is given), so the Node unit tests can import it.

/** The storage key. Bump the version if the saved shape ever changes, so old saves are ignored rather than misread. */
export const PROGRESS_KEY = 'pictureTrain.progress.v1';

/** The browser's localStorage, or null where there is none or touching it throws. */
function browserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * The saved progress: `reachedMax` is the furthest moment she has stood at (0-based), -1 for none. Anything
 * missing, unreadable or out of range counts as none, and it never comes back beyond the last moment.
 * @param {{ getItem(key: string): string|null }|null} [storage]
 * @param {{ momentCount?: number }} [options]  the number of moments in the ride, to clamp to
 * @returns {{ reachedMax: number }}
 */
export function loadProgress(storage = browserStorage(), { momentCount } = {}) {
  let reachedMax = -1;
  try {
    const saved = JSON.parse(storage.getItem(PROGRESS_KEY));
    if (saved && Number.isInteger(saved.reachedMax) && saved.reachedMax >= 0) reachedMax = saved.reachedMax;
  } catch {
    // Nothing saved, unreadable, or no storage at all: she starts fresh.
  }
  if (Number.isInteger(momentCount)) reachedMax = Math.min(reachedMax, momentCount - 1);
  return { reachedMax };
}

/**
 * Saves `reachedMax`. Never throws: a ride that cannot remember still rides.
 * @param {{ reachedMax: number }} progress
 * @param {{ setItem(key: string, value: string): void }|null} [storage]
 */
export function saveProgress({ reachedMax }, storage = browserStorage()) {
  try {
    storage.setItem(PROGRESS_KEY, JSON.stringify({ reachedMax }));
  } catch {
    // Storage is full or blocked; the progress is simply not kept.
  }
}
