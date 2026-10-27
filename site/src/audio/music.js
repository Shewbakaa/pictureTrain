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
// one, as phones ask (without fetching a file: each is fetched as its scene comes near). If the browser holds the
// sound back anyway, the sound shows as off ('blocked') and a tap on the Sound button tries again. When the page
// goes into the background (another app, a locked phone) the sound is held, and it comes back as she left it.
//
// The AudioContext and the recordings are unlocked by that same tap even when her song is the one playing: the
// train's sounds play on the context beside the song, and if the song cannot play (a mistyped file name, say) the
// scenes' music can take over without asking for another tap. That is certain only when the song fails at the
// start; if it fails mid-song, the browser may refuse to wake the context without a tap, and then the sound shows
// as off ('blocked') until she taps the Sound button.

import { composeLoop, midiToFreq } from './compose.js';
import { CAROL, composeCarol } from './carol.js';
import { createFader, createMixer } from './mixer.js';
import { createRecording } from './recording.js';
import { PIECES, PIECE_NAMES, ZONE_MUSIC, pieceShares } from './zoneMusic.js';
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
 * The bell: a sine with a slightly sharp octave partial, a 5 ms strike and a long exponential decay, softened by a
 * lowpass and given a small echo. LEVEL is a note's peak gain at full velocity.
 */
const BELL = { LEVEL: 0.9, PARTIAL: 2.002, PARTIAL_GAIN: 0.25, ATTACK: 0.005, DECAY: 1.6, LOWPASS: 3200 };
const ECHO = { TIME: 0.38, FEEDBACK: 0.28, WET: 0.22 };

/** The pad: three triangles ±6 cents apart, through a lowpass, swelling in and dying away slowly. */
const PAD = { DETUNE: 6, LOWPASS: 900, ATTACK: 1.2, RELEASE: 1.5, GAIN: 0.05 };

/** The bass: a plain sine, with a soft start and a release that ends with the note. */
const BASS = { GAIN: 0.08, ATTACK: 0.06, RELEASE: 0.25 };

/** Every envelope closes with a ramp this long (s) down to exactly zero before its oscillators stop. */
const TAIL = 0.02;

/** A lowpass Q (dB in Web Audio) for a Butterworth response: no resonant bump at the cutoff. */
const FLAT_Q = -3;

/** The scheduler wakes every TICK_MS and books every note starting within LOOKAHEAD seconds. */
const TICK_MS = 50;
const LOOKAHEAD = 0.25;

/** The schedulers' timer: every TICK_MS. The unit tests and offline renders tick by hand instead. */
const INTERVAL = Object.freeze({ start: (tick) => setInterval(tick, TICK_MS), stop: (id) => clearInterval(id) });

/**
 * How quickly each piece follows the zone blend (s, a time constant), so a jump along the timeline from one scene
 * to another eases across rather than clicks.
 */
const CROSSFADE_EASE = 0.12;

/** The smallest change in a piece's share of the music worth moving its gain for. */
const SHARE_STEP = 0.01;

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
 *   `carol` is how much of the scenes' music is the winter carol (0 to 1). `piece` is the loudest piece: a zone's
 *   own ('spring' to 'evening', 'winter' being the carol), 'tune' where the built-in tune stands in for a zone's
 *   recording, 'file' for her song; null before start() and while nothing plays.
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
  /** @type {Soundtrack|null} */
  let soundtrack = null; // the scenes' music, made the first time it plays
  /** @type {Record<string, import('./recording.js').Recording>|null} */
  let recordings = null; // each scene's recording, made and unlocked by the Begin tap
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
    console.warn(`[music] Could not play "${src}" — each scene's own music plays instead.`);
    clearInterval(volumeTimer);
    audio.pause();
    source = 'built-in';
    onChange();
    if (wanted) turnOn(START_FADE);
  }

  // The scenes' recordings.

  /**
   * Makes every scene's recording on the context and unlocks it, so each can play later without a tap: call it
   * inside the Begin tap, after the context is made. No file is fetched yet.
   */
  function makeRecordings() {
    if (recordings || !ctx) return;
    recordings = {};
    for (const zone of Object.keys(PIECES)) {
      recordings[zone] = createRecording(ctx, zone, PIECES[zone]);
      recordings[zone].unlock();
    }
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

  /** Silences the sound at once for the background. */
  function hold() {
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
    /** The Sound button. Turning it on is a tap, so it can also start sound the browser held back before. */
    toggle() {
      if (!started) return music.start();
      if (state === 'playing') {
        turnOff();
        return Promise.resolve();
      }
      return turnOn(heard ? TOGGLE_FADE : START_FADE);
    },
    setHidden(value) {
      const next = Boolean(value);
      if (next === hidden) return;
      hidden = next;
      if (!started) return;
      if (hidden && wanted) hold();
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
     * music follows, and the zones whose recordings should be loading by now (zoneMusic.js zonesToLoad). Her own
     * song plays on through every zone, and no recording is fetched for it.
     */
    setZones(next, near) {
      for (let i = 0; i < ZONE_IDS.length; i++) weights[ZONE_IDS[i]] = next[ZONE_IDS[i]] || 0;
      if (soundtrack) soundtrack.setZones(weights);
      if (!near || !recordings || source === 'file') return;
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

/**
 * The built-in tune's instruments on `ctx`, playing into `out` (the mixer's music bus) through a fader of their
 * own, silent until fade(true). Exported so the tune can be rendered offline (OfflineAudioContext) to check its
 * levels.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @returns {{ fade: (on: boolean, seconds: number) => void, playNote: (note: import('./compose.js').Note, at: number) => void }}
 */
export function createSynth(ctx, out) {
  const master = ctx.createGain();
  master.connect(out);
  const fader = createFader(ctx, master.gain); // between silence and its full level, which the music bus sets

  const lowpass = (frequency) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    filter.Q.value = FLAT_Q;
    return filter;
  };

  // The bell, straight and through a feedback echo.
  const bells = lowpass(BELL.LOWPASS);
  bells.connect(master);
  const echo = ctx.createDelay(1);
  echo.delayTime.value = ECHO.TIME;
  const feedback = ctx.createGain();
  feedback.gain.value = ECHO.FEEDBACK;
  const wet = ctx.createGain();
  wet.gain.value = ECHO.WET;
  bells.connect(echo);
  echo.connect(feedback);
  feedback.connect(echo);
  echo.connect(wet);
  wet.connect(master);

  const pads = lowpass(PAD.LOWPASS);
  pads.connect(master);

  /** A sine or triangle at `frequency` into `into`, from `at` until `end`. Returns the oscillator. */
  const oscillator = (type, frequency, into, at, end, detune = 0) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(into);
    osc.start(at);
    osc.stop(end);
    return osc;
  };

  /** A gain into `into`, at zero from `at`: a note's envelope. freeAfter disconnects it once the note is over. */
  const envelope = (into, at) => {
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.connect(into);
    return env;
  };
  const freeAfter = (osc, env) => {
    osc.onended = () => env.disconnect();
  };

  const voices = {
    bell(note, at) {
      const f = midiToFreq(note.midi);
      const peak = BELL.LEVEL * note.vel;
      const decayed = at + BELL.ATTACK + BELL.DECAY;
      const end = decayed + TAIL;
      const env = envelope(bells, at);
      env.gain.linearRampToValueAtTime(peak, at + BELL.ATTACK);
      env.gain.exponentialRampToValueAtTime(peak * 0.001, decayed);
      env.gain.linearRampToValueAtTime(0, end);
      const partial = ctx.createGain();
      partial.gain.value = BELL.PARTIAL_GAIN;
      partial.connect(env);
      oscillator('sine', f, env, at, end);
      freeAfter(oscillator('sine', f * BELL.PARTIAL, partial, at, end), env);
    },
    pad(note, at) {
      const f = midiToFreq(note.midi);
      const peak = PAD.GAIN * note.vel;
      const held = at + Math.max(note.dur, PAD.ATTACK);
      const end = held + PAD.RELEASE;
      const env = envelope(pads, at);
      env.gain.linearRampToValueAtTime(peak, at + PAD.ATTACK);
      env.gain.setValueAtTime(peak, held);
      env.gain.linearRampToValueAtTime(0, end);
      let last = null;
      for (const cents of [-PAD.DETUNE, 0, PAD.DETUNE]) last = oscillator('triangle', f, env, at, end, cents);
      freeAfter(last, env);
    },
    bass(note, at) {
      const peak = BASS.GAIN * note.vel;
      const end = at + Math.max(note.dur, BASS.ATTACK + BASS.RELEASE);
      const env = envelope(master, at);
      env.gain.linearRampToValueAtTime(peak, at + BASS.ATTACK);
      env.gain.exponentialRampToValueAtTime(peak * 0.55, end - BASS.RELEASE);
      env.gain.linearRampToValueAtTime(0, end);
      freeAfter(oscillator('sine', midiToFreq(note.midi), env, at, end), env);
    },
  };

  return {
    fade: fader.fade,
    playNote(note, at) {
      voices[note.voice](note, at);
    },
  };
}

/**
 * @typedef {{ play: () => void, pause: () => void, fade: (on: boolean, seconds: number) => void,
 *             setZones: (weights: Record<string, number>) => void, readonly shares: Record<string, number>,
 *             readonly loudest: string|null, gainOf: (name: string) => GainNode|null }} Soundtrack
 */

/**
 * The scenes' music on `ctx`, into `out` (the mixer's music bus): each zone's piece (zoneMusic.js), behind a gain
 * that follows the zone blend (pieceShares) and then one fader for them all. The recordings are `recordings`
 * (recording.js), each at its share times its trim; the winter carol (carol.js) and the built-in tune (compose.js),
 * the stand-in for a scene whose recording cannot play, are each on instruments of their own (createSynth), made
 * the first time they are heard.
 *
 * A piece starts from its top as its zone becomes audible (its share rises from 0): the carol from "Silent night"
 * as the train rolls into winter, a recording from its first note. Once its share has fallen back to 0 a carol or
 * tune books no more notes (those booked ring out), and a recording plays on for ZONE_MUSIC.TAIL while its gain
 * eases out, then pauses and goes back to its top. No more than ZONE_MUSIC.MAX_PLAYING pieces play at once: a piece
 * starting while two others play cuts short the tails of those fading out (only a jump along the timeline from the
 * middle of a blend makes three).
 *
 * `play()` and `pause()` run and hold the pieces (pause once the sound has faded out: each recording pauses where
 * it is, and plays on from there); `fade` swells the music in (its first 3 s) or out; `setZones` takes each zone's
 * weight, every frame. `shares` is how much of each piece (PIECE_NAMES) is playing (0 to 1, where its gain is
 * heading; the carol's gain is CAROL.LEVEL at most, a recording's its trim), and `loudest` names the piece with the
 * largest share, or null while none is heard. `gainOf(name)` is a piece's gain, null until it is first heard.
 * Exported so the unit tests and offline renders can drive it with their own `timer` ({ start(tick) → id,
 * stop(id) }) and recordings.
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out
 * @param {{ timer?: { start: (tick: () => void) => unknown, stop: (id: unknown) => void },
 *           recordings?: Record<string, import('./recording.js').Recording> }} [options]
 * @returns {Soundtrack}
 */
export function createSoundtrack(ctx, out, { timer = INTERVAL, recordings = {} } = {}) {
  const faded = ctx.createGain();
  faded.connect(out);
  const fader = createFader(ctx, faded.gain);

  /** A piece's gain: silent until it has a share. */
  const shareGain = () => {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(faded);
    return gain;
  };
  /** A piece played on instruments of its own: the carol, or the tune. */
  const played = (name, loop, level) => () => {
    const gain = shareGain();
    const synth = createSynth(ctx, gain);
    synth.fade(true, 0.01); // the soundtrack's fader swells it in, and its share brings it in and out
    const scheduler = createScheduler(ctx, synth, loop, timer);
    return { name, level, gain, tails: false, start: scheduler.start, stop: scheduler.stop, update() {} };
  };
  /** A scene's recording: it plays on through a tail as its share falls to 0. */
  const recorded = (recording) => () => {
    const gain = shareGain();
    recording.output.connect(gain);
    return {
      name: recording.name,
      level: recording.trim,
      gain,
      tails: true,
      start: (fromTop) => recording.start(fromTop),
      stop: (rewind) => recording.stop(rewind),
      update: () => recording.update(),
    };
  };
  /** @type {Record<string, () => object>} how to make each piece, the first time it is heard */
  const makers = { tune: played('tune', composeLoop(), 1), winter: played('winter', composeCarol(), CAROL.LEVEL) };
  for (const zone of Object.keys(recordings)) makers[zone] = recorded(recordings[zone]);

  const pieces = {}; // name to piece, once made
  const made = []; // the same, as a list
  const shares = {};
  for (const name of PIECE_NAMES) shares[name] = 0;
  const weights = {};
  const mix = {}; // every piece's share for the weights, worked out each frame
  let playing = false;
  let first = true; // until the first weights, shares are set at once; after them they ease

  /**
   * Starts or stops the piece for its share: playing while the music plays and the piece is heard, from its top if
   * it was silent; a recording whose share has just fallen to 0 plays on through its tail.
   */
  function run(p) {
    if (playing && p.share > 0) {
      p.tailEnd = 0;
      if (!p.on) {
        makeRoom(p);
        p.start(p.fromTop);
        p.on = true;
      }
      p.fromTop = false;
    } else if (playing && p.share === 0 && p.on && p.tails) {
      if (!p.tailEnd) p.tailEnd = ctx.currentTime + ZONE_MUSIC.TAIL;
    } else {
      halt(p);
    }
  }

  /** Stops the piece: back to its top if its share is 0 (even while held), else where it is. */
  function halt(p) {
    const silent = p.share === 0;
    if (p.on || (silent && !p.fromTop)) p.stop(silent);
    p.on = false;
    p.tailEnd = 0;
    if (silent) p.fromTop = true;
  }

  /** Before `p` starts: if two others are playing, those fading out stop now. */
  function makeRoom(p) {
    let on = 0;
    for (const q of made) if (q !== p && q.on) on += 1;
    if (on < ZONE_MUSIC.MAX_PLAYING) return;
    for (const q of made) if (q !== p && q.on && q.share === 0) halt(q);
  }

  function setShare(name, share) {
    let p = pieces[name];
    if (!p) {
      if (!(share > 0) || !makers[name]) return;
      p = pieces[name] = makers[name]();
      Object.assign(p, { share: 0, on: false, fromTop: true, tailEnd: 0 });
      made.push(p);
    }
    const change = Math.abs(share - p.share);
    if (change === 0 || (change < SHARE_STEP && share > 0 && share < 1)) return;
    p.share = share;
    shares[name] = share;
    if (first) p.gain.gain.value = share * p.level;
    else p.gain.gain.setTargetAtTime(share * p.level, ctx.currentTime, CROSSFADE_EASE);
    run(p);
  }

  return {
    get shares() {
      return shares;
    },
    get loudest() {
      let loudest = null;
      let top = 0;
      for (const p of made) {
        if (p.share > top) {
          top = p.share;
          loudest = p.name;
        }
      }
      return loudest;
    },
    gainOf(name) {
      return pieces[name] ? pieces[name].gain : null;
    },
    play() {
      playing = true;
      for (const p of made) run(p);
    },
    pause() {
      playing = false;
      for (const p of made) run(p);
    },
    fade(on, seconds) {
      fader.fade(on, seconds);
    },
    setZones(next) {
      for (let i = 0; i < ZONE_IDS.length; i++) weights[ZONE_IDS[i]] = next[ZONE_IDS[i]] || 0;
      pieceShares(weights, recordings, mix);
      // The pieces fading first, then those rising, so a piece starting finds the room it needs.
      for (let i = 0; i < PIECE_NAMES.length; i++) {
        if (mix[PIECE_NAMES[i]] <= shares[PIECE_NAMES[i]]) setShare(PIECE_NAMES[i], mix[PIECE_NAMES[i]]);
      }
      for (let i = 0; i < PIECE_NAMES.length; i++) {
        if (mix[PIECE_NAMES[i]] > shares[PIECE_NAMES[i]]) setShare(PIECE_NAMES[i], mix[PIECE_NAMES[i]]);
      }
      first = false;
      const now = ctx.currentTime;
      for (let i = 0; i < made.length; i++) {
        const p = made[i];
        if (p.tailEnd && now >= p.tailEnd) halt(p);
        if (p.on) p.update();
      }
    },
  };
}

/**
 * Plays `loop` round and round on `synth`: every TICK_MS (on `timer`) it books the notes starting in the next
 * LOOKAHEAD seconds of the context's clock. While the context is suspended its clock stands still, so the tune
 * picks up where it left off; `start(true)` begins it again from the top instead. A note whose moment has already
 * passed (the page stalled) is skipped rather than played late.
 */
function createScheduler(ctx, synth, loop, timer) {
  let running = null;
  let index = 0; // the next note to book
  let loopStart = -1; // the context time the current pass of the loop began at
  const tick = () => {
    const now = ctx.currentTime;
    for (;;) {
      const note = loop.notes[index];
      const at = loopStart + note.t;
      if (at >= now + LOOKAHEAD) break;
      if (at >= now) synth.playNote(note, at);
      index += 1;
      if (index === loop.notes.length) {
        index = 0;
        loopStart += loop.lengthSec;
      }
    }
  };
  return {
    start(fromTop = false) {
      if (running !== null) return;
      if (fromTop || loopStart < 0) {
        loopStart = ctx.currentTime + 0.05;
        index = 0;
      }
      tick();
      running = timer.start(tick);
    },
    stop() {
      if (running === null) return;
      timer.stop(running);
      running = null;
    },
  };
}
