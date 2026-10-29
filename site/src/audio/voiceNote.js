// His voice note at the finale (content.js finale.voice): a short recording of his, which plays as his message
// writes itself on the last card, and which a round button on the card plays again (ui/finaleCard.js).
//
// It is an audio element of its own, not routed through the ride's AudioContext, like a stop card's video sound: the
// app fades the ride's sound out under it and back in after (music.setDucked, the path the video's sound takes), so
// the fireworks and the doves go quiet while he speaks. An iPhone plays it at the phone's own volume.
//
// Phones only let an element play by itself after a tap on it, so the app unlock()s it while her tap on "Begin the
// ride" is being handled, as the scenes' recordings are (recording.js): it plays and pauses at once, with no file yet,
// so nothing is fetched. The file is fetched as the train pulls in at the Day 365 station (load()), or when it is
// first played. A play the browser refuses for want of a tap (the unlock did not take) holds it back ('blocked') until
// her tap on its button; a file that cannot be played (missing, or not audio) fails it for good, with a friendly
// warning naming the file, and the card shows no button.
//
// When the page goes into the background (another app, a locked phone) it pauses where it was, and waits there for her
// tap. Paused or played from outside the page (the lock screen's controls), it follows along.
//
// It touches the DOM only when made: the Node unit tests give it a stand-in element and document.

import { clamp } from '../util/math.js';

/**
 * @typedef {'idle'|'playing'|'paused'|'ended'|'failed'|'blocked'} VoiceState
 *   'idle' at its start, not yet played (or stopped); 'paused' where her tap or the page going away left it; 'ended'
 *   once it has played through; 'blocked' while the browser holds it back until a tap; 'failed' for good.
 */

/**
 * @typedef {{ readonly file: string, readonly state: VoiceState, readonly progress: number, unlock: () => void,
 *             load: () => void, play: () => Promise<boolean>, pause: () => void, stop: () => void,
 *             onChange: (fn: () => void) => () => void }} VoiceNote
 *   `unlock()` lets it play later without a tap: call it inside one. `load()` starts fetching its file (once).
 *   `play()` plays it on from where it was (from its top once it has ended), and resolves whether it played. `pause()`
 *   pauses it where it is; `stop()` takes it back to idle at its start. `progress` is how far through it is, 0 to 1.
 *   `onChange(fn)` hears every change of `state`, and returns a function that stops it listening.
 */

/**
 * His voice note of `file`, silent and unloaded until played.
 * @param {string} file  content.finale.voice, a path relative to the page
 * @param {{ makeElement?: () => HTMLAudioElement, doc?: Document }} [options]  the unit tests' stand-ins
 * @returns {VoiceNote}
 */
export function createVoiceNote(file, { makeElement = () => new Audio(), doc = document } = {}) {
  /** @type {VoiceState} */
  let state = 'idle';
  let element = null;
  let loading = false;
  const listeners = new Set();

  function setState(next) {
    if (next === state) return;
    state = next;
    for (const fn of [...listeners]) fn();
  }

  function fail() {
    if (state === 'failed') return;
    if (element) element.pause();
    console.warn(`[content.js] finale.voice: "${file}" could not be played, so there is no voice note.`);
    setState('failed');
  }

  /** Held back for want of a tap: her tap on its button plays it. */
  function block() {
    if (state === 'failed') return;
    element.pause();
    console.warn(`[voice] The browser held back "${file}" until a tap. The button on the last card plays it.`);
    setState('blocked');
  }

  /**
   * A play() the browser turned down: a pause or a new load interrupting it is nothing (whatever paused it has said
   * where it is), a refusal for want of a tap holds it back, and anything else fails it. Always false: it did not play.
   */
  function refused(error) {
    const reason = error && error.name;
    if (reason === 'NotAllowedError') block();
    else if (reason !== 'AbortError') fail();
    return false;
  }

  /** play() then pause() at once: inside a tap, that lets it play later without one. */
  function playAndPause() {
    try {
      const attempt = element.play();
      if (attempt && attempt.catch) attempt.catch(() => {});
    } catch {
      // Nothing to unlock with: a later play() says whether it can play.
    }
    element.pause();
  }

  function load() {
    if (loading || state === 'failed') return;
    loading = true;
    element.preload = 'auto';
    element.src = file;
  }

  function rewind() {
    try {
      element.currentTime = 0;
    } catch {
      // Not seekable yet: it is at its start anyway.
    }
  }

  function pause() {
    if (state !== 'playing') return;
    setState('paused'); // first, so the element's own 'pause' event finds it paused already
    element.pause();
  }

  try {
    element = makeElement();
    element.preload = 'none';
    element.addEventListener('error', () => fail());
    element.addEventListener('ended', () => {
      if (state === 'playing' || state === 'paused') setState('ended');
    });
    // Paused or played from outside the page: the lock screen's controls, or the phone taking the sound for a call.
    // Its 'pause' as it reaches its end is not one ('ended' follows), nor are the unlock's play and pause.
    element.addEventListener('pause', () => {
      if (state === 'playing' && element.paused && !element.ended) setState('paused');
    });
    element.addEventListener('play', () => {
      if (state === 'paused' && !element.paused) setState('playing');
    });
  } catch {
    fail(); // no audio elements here
  }

  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) pause();
    });
  }

  return {
    file,
    get state() {
      return state;
    },
    get progress() {
      if (state === 'ended') return 1;
      if (state === 'failed') return 0;
      const length = element.duration;
      if (!(length > 0) || !Number.isFinite(length)) return 0;
      return clamp(element.currentTime / length, 0, 1);
    },
    unlock() {
      if (state !== 'failed' && state !== 'playing') playAndPause();
    },
    load,
    play() {
      if (state === 'failed') return Promise.resolve(false);
      load();
      if (state === 'ended') rewind();
      setState('playing');
      let attempt;
      try {
        attempt = element.play();
      } catch (error) {
        return Promise.resolve(refused(error));
      }
      return Promise.resolve(attempt).then(() => true, refused);
    },
    pause,
    stop() {
      if (state === 'failed' || state === 'idle') return;
      element.pause();
      rewind();
      setState('idle');
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
