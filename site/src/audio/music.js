// The soundtrack and the switch for every sound in the ride: her song when content.js names one, otherwise each
// scene's own music (zoneMusic.js), quiet behind the ride. Spring, summer, autumn and the evening town play a
// recording of a piece by Chopin (recording.js); the winter hills play Silent Night (carol.js) on a soft music box
// played live with Web Audio, a bell with a little echo over a warm pad and bass. Each piece follows its zone's
// weight in the scenery's blend, and two pieces dip across a boundary rather than play over each other (setZones).
// A scene whose recording cannot be played has the built-in tune (compose.js) on the music box instead. Her own
// song plays on through every scene instead of all of them.
//
// It owns the ride's one AudioContext and its master chain (mixer.js). The scenes' music plays into the chain's
// music bus, the recordings through it too (element → MediaElementAudioSourceNode); the train's sounds and the
// ambience (sfx.js) play into its other buses. The Sound button, a video's sound and the page going into the
// background move the chain's master fader, so they turn everything on and off together. Her song is an audio
// element beside the chain, faded and paused along with it.
//
// Phones only let sound start from a tap, so start() is called while her tap on "Begin the ride" is being handled
// and makes its browser calls before it returns: it wakes the context and unlocks every scene's recording, one by
// one, as phones ask (without fetching a file: each is fetched as its scene comes near, while the sound is on). If
// the browser holds the sound back anyway, the sound shows as off ('blocked') and a tap on the Sound button tries
// again; if it holds back a scene's recording, the built-in tune stands in for it and that tap lets it go too.
// When the page goes into the background (another app, a locked phone) the sound is held, the recordings paused at
// once, and it comes back as she left it.
//
// The AudioContext and the recordings are unlocked by that same tap even when her song is the one playing: the
// train's sounds play on the context beside the song, and if the song cannot play (a mistyped file name, say) the
// scenes' music can take over without asking for another tap. That is certain only when the song fails at the
// start; if it fails mid-song, the browser may refuse to wake the context without a tap, and then the sound shows
// as off ('blocked') until she taps the Sound button.

import { createMixer } from './mixer.js';
import { createRecording } from './recording.js';
import { createSoundtrack } from './soundtrack.js';
import { PIECES } from './zoneMusic.js';
import { ZONE_IDS } from '../content/normalize.js';

/**
 * How long the scenes' music takes to swell in the first time it plays (s). Everything else comes up at once
 * (FIRST_FADE), so the whistle as the train sets off is heard in full. Its level is the mixer's music bus.
 */
const START_FADE = 3;
const FIRST_FADE = 0.05;

/** How long the sound fades out or in when she taps the Sound button, or comes back to the page (s). */
const TOGGLE_FADE = 0.4;

/** How long the sound takes to fall silent when the page goes into the background (s). */
const HIDE_FADE = 0.04;

/**
 * Her song's volume: 0.37, a third down on the 0.55 it had before the train's sounds joined it, like the built-in
 * music. iPhones ignore it: there the song plays at the phone's own volume.
 */
const FILE_VOLUME = 0.37;

/** How long to wait for the browser to let the AudioContext run before counting it as held back (ms). */
const RESUME_WAIT_MS = 2000;

/**
 * @typedef {{ state: 'off'|'playing'|'blocked', source: 'built-in'|'file', suspended: boolean,
 *             mixer: import('./mixer.js').Mixer|null, audible: boolean, waking: boolean,
 *             carol: number, piece: string|null, start: () => Promise<void>, toggle: () => Promise<void>,
 *             setHidden: (hidden: boolean) => void, setDucked: (ducked: boolean) => void,
 *             setZones: (weights: Record<string, number>, near?: Record<string, boolean>) => void }} Music
 */

/**
 * The music player and sound switch. Nothing is created until start().
 * @param {{ src?: string, onChange?: () => void }} options  `src` is content.music: '' for each scene's own music,
 *   or a path relative to the page. `onChange` hears every change of `state`, `source` or `suspended`.
 * @returns {Music}  `state` is what the Sound button shows: 'blocked' means the browser held the sound back, and the
 *   button tries again. `source` is 'file' while her song is the music, 'built-in' while the scenes' is.
 *   `suspended` is true while the page is in the background, holding the sound. `mixer` is the master chain, null
 *   until start() has made the AudioContext. `audible` is true while sound is on and may be heard (not held for the
 *   background or ducked for a video); `waking` while the browser is still answering a request to turn it on.
 *   `carol` is how much of the scenes' music is the winter carol (0 to 1). `piece` is the piece the train's place
 *   calls for (the largest share), whether or not the sound is on: a zone's own ('spring' to 'evening', 'winter'
 *   being the carol), 'tune' where the built-in tune stands in for a zone's recording, 'file' for her song; null
 *   before start(), and until the scenes' music has first been allowed to play.
 */
export function createMusic({ src = '', onChange = () => {} } = {}) {
  let state = 'off';
  let source = src ? 'file' : 'built-in';
  let started = false;
  let hidden = false;
  let ducked = false; // a video's sound is on: all sound fades out for it and comes back after
  let wanted = false; // she wants sound: true from start(), then flipped by the Sound button
  let heard = false; // the music has played at least once
  let waking = false; // a request to sound is waiting for the browser's answer
  let request = 0; // counts the requests to sound or to fall quiet: a late answer to an older one is ignored

  /** @type {AudioContext|null} */
  let ctx = null;
  /** @type {import('./mixer.js').Mixer|null} */
  let mixer = null;
  /** @type {import('./soundtrack.js').Soundtrack|null} */
  let soundtrack = null; // the scenes' music, made the first time it plays
  /** @type {Record<string, import('./recording.js').Recording>|null} */
  let recordings = null; // each scene's recording, made and unlocked by the tap that first makes the context
  /** @type {Record<string, number>} */
  const weights = {}; // each zone's weight in the scenery's blend, as last heard (setZones)
  let quietTimer = 0;

  /** @type {HTMLAudioElement|null} */
  let audio = null;
  let volumeTimer = 0;

  const setState = (next) => {
    state = next;
    onChange();
  };

  // The AudioContext, for the scenes' music and the train's sounds, with the master chain they play through.

  function openContext() {
    if (ctx) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      ctx = new AudioContextClass({ latencyHint: 'playback' });
    } catch (error) {
      console.warn('[music] This browser cannot play the ride\'s sound.', error);
      return false;
    }
    mixer = createMixer(ctx);
    return true;
  }

  /** Asks the context to run. Resolves 'ok', 'blocked' (refused, or no answer in time) or 'none' (no Web Audio). */
  function wakeContext() {
    clearTimeout(quietTimer);
    if (!openContext()) return Promise.resolve('none');
    if (ctx.state === 'running') return Promise.resolve('ok');
    return new Promise((resolve) => {
      const answer = () => {
        clearTimeout(timer);
        resolve(ctx.state === 'running' ? 'ok' : 'blocked');
      };
      const timer = setTimeout(answer, RESUME_WAIT_MS);
      ctx.resume().then(answer, answer);
    });
  }

  /** Stops the context's clock after `delay` s, once a fade has run. Its scheduled notes wait for it to run again. */
  function idleContext(delay) {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      if (soundtrack) soundtrack.pause();
      if (ctx) ctx.suspend().catch(() => {});
    }, delay * 1000 + 30);
  }

  // Her song.

  function wakeFile() {
    if (!audio) {
      audio = new Audio(src);
      audio.loop = true;
      audio.volume = FILE_VOLUME;
      audio.addEventListener('error', () => fallBack());
    }
    let attempt;
    try {
      attempt = audio.play();
    } catch (error) {
      return Promise.resolve(playOutcome(error));
    }
    return Promise.resolve(attempt).then(() => 'ok', playOutcome);
  }

  /** Moves her song's volume to `to` over `seconds`, then calls `then`. */
  function fadeVolume(to, seconds, then) {
    clearInterval(volumeTimer);
    const from = audio.volume;
    const begun = performance.now();
    const step = () => {
      const k = seconds > 0 ? Math.min(1, (performance.now() - begun) / (seconds * 1000)) : 1;
      audio.volume = from + (to - from) * k;
      if (k < 1) return;
      clearInterval(volumeTimer);
      if (then) then();
    };
    volumeTimer = setInterval(step, 25);
    step();
  }

  /** Her song could not be played: say which file, and play each scene's own music instead. */
  function fallBack() {
    if (source !== 'file') return;
    console.warn(`[music] Could not play "${src}", so each scene's own music plays instead.`);
    clearInterval(volumeTimer);
    audio.pause();
    source = 'built-in';
    onChange();
    if (wanted) turnOn(START_FADE);
  }

  // The scenes' recordings.

  /**
   * Makes every scene's recording on the context and unlocks it, so each can play later without a tap: call it
   * inside a tap, after asking for the context (the Begin tap; a Sound tap too, in case the context could only be
   * made then). No file is fetched yet.
   */
  function makeRecordings() {
    if (recordings || !ctx) return;
    recordings = {};
    for (const zone of Object.keys(PIECES)) {
      recordings[zone] = createRecording(ctx, zone, PIECES[zone]);
      recordings[zone].unlock();
    }
  }

  /** Inside a tap: lets play again any recording the browser held back for want of one. */
  function retryRecordings() {
    if (!recordings) return;
    for (const zone in recordings) recordings[zone].retry();
  }

  // Either kind.

  /**
   * Makes sound from the source in use; its browser calls (resume, and play for her song) are made before this
   * returns. Her song also wakes the context, for the train's sounds beside it, but does not wait for its answer.
   */
  function wake() {
    if (source !== 'file') return wakeContext();
    wakeContext();
    return wakeFile();
  }

  /**
   * Brings the sound up once the browser lets it run: the source in use over `fade` s, and the master chain with
   * it. The first time, the music swells in on its own while the chain comes up at once.
   */
  function sound(fade, first) {
    if (source === 'file') {
      fadeVolume(FILE_VOLUME, fade);
    } else {
      // Made here too, in case the context could only be made now, outside a tap (coming back to the page, say): the
      // scenes still get their pieces, any the browser holds back until a tap played by the tune meanwhile.
      makeRecordings();
      if (!soundtrack) soundtrack = createSoundtrack(ctx, mixer.music, { recordings: recordings || {} });
      soundtrack.setZones(weights);
      soundtrack.play();
      soundtrack.fade(true, fade);
    }
    if (mixer) mixer.fade(true, first ? FIRST_FADE : Math.min(fade, TOGGLE_FADE));
  }

  /**
   * Fades the sound out over `fade` s and then lets the browser rest: her song pauses, the master chain falls
   * silent and the context is suspended.
   */
  function quiet(fade) {
    if (source === 'file' && audio) fadeVolume(0, fade, () => audio.pause());
    if (!ctx) return;
    mixer.fade(false, fade);
    idleContext(fade);
  }

  /**
   * Silences the sound at once for the background. The scenes' music is held now, not once the fade is over: a page
   * in the background may have its timers stopped, and a recording left playing there would go on sounding (and
   * show in the phone's Now Playing).
   */
  function hold() {
    if (soundtrack) soundtrack.pause();
    if (source !== 'file') return quiet(HIDE_FADE);
    clearInterval(volumeTimer);
    if (audio) {
      audio.pause();
      audio.volume = 0; // so it fades back in
    }
    if (ctx) {
      mixer.fade(false, HIDE_FADE);
      idleContext(HIDE_FADE);
    }
  }

  function turnOn(fade) {
    const id = ++request;
    wanted = true;
    waking = true;
    return wake().then((outcome) => {
      if (id !== request) {
        if (!wanted) quiet(0); // she turned it off while the browser was answering
        return;
      }
      waking = false;
      if (outcome === 'failed') return fallBack();
      if (outcome === 'aborted') return; // a pause for the background interrupted it; it is retried on return
      if (outcome !== 'ok') return setState(outcome === 'blocked' ? 'blocked' : 'off');
      const first = !heard;
      heard = true;
      sound(fade, first);
      setState('playing');
      if (hidden) hold();
      else if (ducked) quiet(TOGGLE_FADE);
    }).catch((error) => {
      if (id === request) waking = false;
      console.warn('[music] The music could not play.', error);
      setState('off');
    });
  }

  function turnOff() {
    request += 1;
    wanted = false;
    waking = false;
    setState('off');
    quiet(TOGGLE_FADE);
  }

  const music = {
    get state() {
      return state;
    },
    get source() {
      return source;
    },
    get suspended() {
      return started && hidden;
    },
    get mixer() {
      return mixer;
    },
    get audible() {
      return state === 'playing' && !hidden && !ducked;
    },
    get waking() {
      return waking;
    },
    get carol() {
      return soundtrack ? soundtrack.shares.winter : 0;
    },
    get piece() {
      if (!started) return null;
      if (source === 'file') return 'file';
      return soundtrack ? soundtrack.loudest : null;
    },
    /** Call it inside the tap that starts the ride. */
    start() {
      if (started) return Promise.resolve();
      started = true;
      usePlaybackSession();
      const on = turnOn(START_FADE); // makes the context and asks it to run, before it returns
      makeRecordings();
      onChange();
      return on;
    },
    /**
     * The Sound button. It is a tap, so it can also start sound the browser held back before: the context, and any
     * scene's recording (which takes over from the tune again).
     */
    toggle() {
      if (!started) return music.start();
      retryRecordings();
      if (state === 'playing') {
        turnOff();
        return Promise.resolve();
      }
      const on = turnOn(heard ? TOGGLE_FADE : START_FADE);
      makeRecordings(); // if the context could not be made in the Begin tap but can now
      return on;
    },
    setHidden(value) {
      const next = Boolean(value);
      if (next === hidden) return;
      hidden = next;
      if (!started) return;
      if (hidden && wanted) hold();
      // Sound off moments ago and still fading: the scenes' music is held now, not when the fade's timer comes (a
      // background page's timers may never run).
      else if (hidden && soundtrack) soundtrack.pause();
      else if (!hidden && !ducked && wanted && state !== 'blocked') turnOn(TOGGLE_FADE);
      onChange();
    },
    /** A video's sound is on (true) or off again: all sound fades out for it, and back in after, if she wants it. */
    setDucked(value) {
      const next = Boolean(value);
      if (next === ducked) return;
      ducked = next;
      if (!started || hidden || !wanted || state === 'blocked') return;
      if (ducked) quiet(TOGGLE_FADE);
      else turnOn(TOGGLE_FADE);
    },
    /**
     * Every frame: each zone's weight in the scenery's blend (ambienceTiming.js zoneWeights), which the scenes'
     * music follows, and the zones whose recordings should be loading by now (zoneMusic.js zonesToLoad). They load
     * only while she wants sound and the browser lets it run: with the sound off, a scene's file is fetched when it
     * is played. Her own song plays on through every zone, and no recording is fetched for it.
     */
    setZones(next, near) {
      for (let i = 0; i < ZONE_IDS.length; i++) weights[ZONE_IDS[i]] = next[ZONE_IDS[i]] || 0;
      if (soundtrack) soundtrack.setZones(weights);
      if (!near || !recordings || source === 'file' || !wanted || state === 'blocked') return;
      for (const zone in recordings) if (near[zone]) recordings[zone].load();
    },
  };
  return music;
}

/** What a refused play() means: 'blocked' (needs a tap), 'aborted' (a pause interrupted it) or 'failed'. */
function playOutcome(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError') return 'blocked';
  if (name === 'AbortError') return 'aborted';
  return 'failed';
}

/** iOS 17+: the sound plays like a video's sound, through the silent switch, rather than as a page's beeps. */
function usePlaybackSession() {
  try {
    if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // An older or stricter browser: it plays as it would anyway.
  }
}
