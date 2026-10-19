// Video moments: a moment's photo can be a short clip instead (content.js `photo` ending in .mp4, .m4v, .webm or
// .mov). The clip plays on its sign beside the track and in the stop card, looping and muted; a tap on the card's
// speaker turns its sound on (and the music fades out for it, app.js).
//
// Phones decode video in hardware, but only so much of it, so only one clip plays at a time: the one at the stop
// the train is standing at, or the nearest video sign coming up within VIDEO.AHEAD metres (`videoToPlay`). The
// director (`createVideoDirector`) plays that one and pauses the rest. Phones only start a video on their own when
// it is muted and inline, so every clip starts muted; a browser that holds even that back (iOS Low Power Mode)
// leaves the clip `blocked`, and the tap on the speaker starts it.
//
// DOM-free: the director only calls play(), pause() and sets `muted` and `currentTime` on what it is given, so the
// Node unit tests drive it with stand-ins.

/** Distances along the track (m): a video sign starts playing AHEAD of the train, and stops once BEHIND it. */
export const VIDEO = Object.freeze({
  EXTENSIONS: Object.freeze(['.mp4', '.m4v', '.webm', '.mov']),
  AHEAD: 60,
  BEHIND: 5,
});

/**
 * What a content.js `photo` path names: 'video' (by its ending, any case, ignoring a ?query or #hash), 'image',
 * or 'none' for an empty path.
 * @param {string} path
 * @returns {'video'|'image'|'none'}
 */
export function mediaKind(path) {
  if (typeof path !== 'string' || path.trim() === '') return 'none';
  const bare = path.split(/[?#]/)[0].toLowerCase();
  return VIDEO.EXTENSIONS.some((ending) => bare.endsWith(ending)) ? 'video' : 'image';
}

/**
 * The one clip to play: the stop the train stands at, if it is a video; otherwise the nearest video stop between
 * VIDEO.BEHIND metres back and VIDEO.AHEAD metres ahead; otherwise none.
 * @param {{ stops: number[], isVideo: boolean[], distance: number, stoppedIndex?: number }} where
 *   `stops` are the stops' distances, `isVideo` whether each stop's moment is a video, `stoppedIndex` the stop the
 *   train is standing at (-1 while it moves)
 * @returns {number}  a stop index, or -1
 */
export function videoToPlay({ stops, isVideo, distance, stoppedIndex = -1 }) {
  if (stoppedIndex >= 0) return isVideo[stoppedIndex] ? stoppedIndex : -1;
  let best = -1;
  let bestGap = Infinity;
  for (let i = 0; i < stops.length; i++) {
    if (!isVideo[i]) continue;
    const ahead = stops[i] - distance;
    if (ahead < -VIDEO.BEHIND || ahead > VIDEO.AHEAD) continue;
    const gap = Math.abs(ahead);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * @typedef {{ muted: boolean, paused: boolean, currentTime: number, play: () => Promise<void>, pause: () => void }} Playable
 *   what the director needs of an HTMLVideoElement
 */

/**
 * Plays one clip at a time.
 * @param {(Playable|null)[]} videos  by moment index; null for a photo moment
 * @param {{ onChange?: () => void }} [options]  `onChange` hears every change of `sound`
 * @returns {{ readonly current: number, readonly sound: boolean, readonly blocked: boolean,
 *             play: (index: number) => void, restart: () => void, setSound: (on: boolean) => void,
 *             setHidden: (hidden: boolean) => void }}
 *   `play` is cheap to call every frame: it only acts when the clip changes. `current` is the clip it plays (-1 for
 *   none), `sound` whether its sound is on, `blocked` whether the browser refused to start it.
 */
export function createVideoDirector(videos, { onChange = () => {} } = {}) {
  let current = -1;
  let sound = false;
  let blocked = false;
  let hidden = false;
  let attempt = 0; // counts play() requests: a late answer to an older one is ignored

  const video = () => (current >= 0 ? videos[current] || null : null);

  function setSoundFlag(on) {
    if (on === sound) return;
    sound = on;
    onChange();
  }

  function start() {
    const v = video();
    if (!v || hidden) return;
    const id = ++attempt;
    let outcome;
    try {
      outcome = v.play();
    } catch (error) {
      outcome = Promise.reject(error);
    }
    Promise.resolve(outcome).then(() => {
      if (id === attempt) blocked = false;
    }, (error) => {
      if (id !== attempt) return;
      if (error && error.name === 'AbortError') return; // paused (or switched) while starting
      blocked = true;
      if (sound) {
        v.muted = true;
        setSoundFlag(false);
      }
    });
  }

  function stop(v) {
    if (!v) return;
    attempt += 1;
    v.muted = true;
    if (!v.paused) v.pause();
  }

  return {
    get current() { return current; },
    get sound() { return sound; },
    get blocked() { return blocked; },
    play(index) {
      const next = index >= 0 && videos[index] ? index : -1;
      if (next === current) return;
      stop(video());
      current = next;
      blocked = false;
      setSoundFlag(false);
      if (current >= 0) start();
    },
    restart() {
      const v = video();
      if (v) v.currentTime = 0;
    },
    /** Her tap on the speaker: so it can also start a clip the browser held back. */
    setSound(on) {
      const v = video();
      if (!v) {
        setSoundFlag(false);
        return;
      }
      v.muted = !on;
      setSoundFlag(Boolean(on));
      if (on && (v.paused || blocked)) start();
    },
    setHidden(value) {
      const next = Boolean(value);
      if (next === hidden) return;
      hidden = next;
      const v = video();
      if (!v) return;
      if (hidden) {
        attempt += 1;
        if (!v.paused) v.pause();
      } else if (!blocked) {
        start();
      }
    },
  };
}
