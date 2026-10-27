// A scene's recording (zoneMusic.js PIECES): an audio element played through the ride's one AudioContext, so the
// Sound button, a video's sound, the page going into the background and the master fader govern it with every
// other sound. It goes element → MediaElementAudioSourceNode → `output` (a gain for its loop seam) → the
// soundtrack's gain for its share (music.js) → the music bus.
//
// Phones only let an element play after a tap on it, element by element, so music.js makes every recording, and
// unlock()s it, while her tap on "Begin the ride" is being handled. The element has no file then, so the unlock
// fetches nothing: each file is fetched only once its scene comes near (load()), or when it is first played.
//
// It loops, fading out over its last seconds and back in after the seam (zoneMusic.js seamLevel), so a scene that
// lasts longer than its piece hears it start again gently. A file that cannot be played (missing, not audio, or
// refused by the browser) fails the recording for good, with a warning naming the file, and music.js plays the
// built-in tune in its scene instead.
//
// It touches the DOM only when made: the Node unit tests give it a stand-in element.

import { seamLevel } from './zoneMusic.js';

/** The seam's level follows the frames with this time constant (s), for any move of at least SEAM_STEP. */
const SEAM_EASE = 0.05;
const SEAM_STEP = 0.01;

/**
 * @typedef {{ readonly name: string, readonly file: string, readonly trim: number, readonly output: GainNode,
 *             readonly failed: boolean, unlock: () => void, load: () => void, start: (fromTop: boolean) => void,
 *             stop: (rewind: boolean) => void, update: () => void }} Recording
 *   `trim` is its gain to the tune's loudness (PIECES), for music.js to apply. `unlock()` lets it play later
 *   without a tap: call it inside one. `load()` starts fetching its file (once). `start(fromTop)` plays it, from its
 *   top or from where it was; `stop(rewind)` pauses it, back at its top or where it is. `update()`, every frame
 *   while it plays, moves its loop seam's fade.
 */

/**
 * `name`'s recording of `file` on `ctx`, silent and unloaded until played.
 * @param {AudioContext} ctx
 * @param {string} name  its zone
 * @param {{ file: string, trim: number }} piece
 * @param {{ makeElement?: () => HTMLAudioElement }} [options]  the unit tests' stand-in element
 * @returns {Recording}
 */
export function createRecording(ctx, name, { file, trim }, { makeElement = () => new Audio() } = {}) {
  const output = ctx.createGain();
  let element = null;
  let failed = false;
  let loading = false;
  let wanted = false; // asked to play, and not stopped since
  let looped = false; // it has come round its seam since it last started from its top
  let last = 0; // where it was at the last update (s)
  let level = 1; // where the seam's fade is heading

  try {
    element = makeElement();
    element.preload = 'none';
    element.loop = true;
    ctx.createMediaElementSource(element).connect(output);
    element.addEventListener('error', () => fail());
  } catch {
    fail(); // no audio elements, or none that can play into the context
  }

  function fail() {
    if (failed) return;
    failed = true;
    wanted = false;
    if (element) element.pause();
    console.warn(`[music] Could not play "${file}" — the built-in tune plays in this scene instead.`);
  }

  /** A play() the browser turned down: a pause or a new load interrupting it is no failure; anything else is. */
  function refused(error) {
    if (error && error.name === 'AbortError') return;
    fail();
  }

  function load() {
    if (loading || failed) return;
    loading = true;
    element.preload = 'auto';
    element.src = file;
  }

  function setLevel(next, now) {
    if (next === level) return;
    if (Math.abs(next - level) < SEAM_STEP && next > 0 && next < 1) return;
    level = next;
    output.gain.setTargetAtTime(next, now, SEAM_EASE);
  }

  function rewind() {
    try {
      element.currentTime = 0;
    } catch {
      // Not seekable yet: it starts from its top anyway.
    }
    looped = false;
    last = 0;
    setLevel(1, ctx.currentTime);
  }

  return {
    name,
    file,
    trim,
    output,
    get failed() {
      return failed;
    },
    unlock() {
      if (failed) return;
      try {
        const attempt = element.play();
        if (attempt && attempt.catch) attempt.catch(() => {});
      } catch {
        // Nothing to unlock with: a later play() says whether it can play.
      }
      element.pause();
    },
    load,
    start(fromTop) {
      if (failed) return;
      load();
      if (fromTop) rewind();
      wanted = true;
      let attempt;
      try {
        attempt = element.play();
      } catch (error) {
        refused(error);
        return;
      }
      if (attempt && attempt.catch) attempt.catch(refused);
    },
    stop(back) {
      wanted = false;
      if (failed) return;
      element.pause();
      if (back) rewind();
    },
    update() {
      if (!wanted) return;
      const position = element.currentTime;
      if (position < last - 1) looped = true;
      last = position;
      setLevel(seamLevel(position, element.duration, looped), ctx.currentTime);
    },
  };
}
