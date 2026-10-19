// The soundtrack: her song when content.js names one, otherwise the built-in tune (compose.js) played live with
// Web Audio, a soft music-box bell with a little echo over a warm pad and bass, quiet behind the ride.
//
// Phones only let sound start from a tap, so start() is called while her tap on "Begin the ride" is being handled
// and makes its browser calls before it returns. If the browser holds the sound back anyway, the music shows as
// off ('blocked') and a tap on the music button tries again. When the page goes into the background (another app,
// a locked phone) the sound is held, and it comes back as she left it.
//
// The built-in tune's AudioContext is unlocked by that same tap even when her song is the one playing, so that if
// the song cannot play (a mistyped file name, say) the tune takes over without asking for another tap.

import { composeLoop, midiToFreq } from './compose.js';

/** The built-in tune's overall level, and how long it takes to fade in at the start of the ride (s). */
const MASTER_GAIN = 0.16;
const START_FADE = 3;

/** How long the music fades out or in when she taps the music button, or comes back to the page (s). */
const TOGGLE_FADE = 0.4;

/** How long the built-in tune takes to fall silent when the page goes into the background (s). */
const HIDE_FADE = 0.04;

/**
 * The compressor after the master gain. Web Audio's compressor adds its own makeup gain, which lifts the whole tune
 * by about 10 dB to around −21 dBFS RMS; its threshold sits above the tune, so it leaves the music alone and only
 * catches the loudest bell strikes, by a decibel at most (measured offline).
 */
const COMPRESSOR = { threshold: -20, knee: 6, ratio: 20, attack: 0.01, release: 0.4 };

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

/** Her song's volume. iPhones ignore it: there the song plays at the phone's own volume. */
const FILE_VOLUME = 0.55;

/** How long to wait for the browser to let the AudioContext run before counting it as held back (ms). */
const RESUME_WAIT_MS = 2000;

/**
 * @typedef {{ state: 'off'|'playing'|'blocked', source: 'generated'|'file', suspended: boolean,
 *             start: () => Promise<void>, toggle: () => Promise<void>, setHidden: (hidden: boolean) => void }} Music
 */

/**
 * The music player. Nothing is created until start().
 * @param {{ src?: string, onChange?: () => void }} options  `src` is content.music: '' for the built-in tune, or
 *   a path relative to the page. `onChange` hears every change of `state`, `source` or `suspended`.
 * @returns {Music}  `state` is what the music button shows: 'blocked' means the browser held the sound back, and the
 *   button tries again. `suspended` is true while the page is in the background, holding the sound.
 */
export function createMusic({ src = '', onChange = () => {} } = {}) {
  let state = 'off';
  let source = src ? 'file' : 'generated';
  let started = false;
  let hidden = false;
  let wanted = false; // she wants music: true from start(), then flipped by the music button
  let heard = false; // the music has played at least once
  let request = 0; // counts the requests to sound or to fall quiet: a late answer to an older one is ignored

  /** @type {AudioContext|null} */
  let ctx = null;
  let synth = null;
  let scheduler = null;
  let quietTimer = 0;

  /** @type {HTMLAudioElement|null} */
  let audio = null;
  let volumeTimer = 0;

  const setState = (next) => {
    state = next;
    onChange();
  };

  // The AudioContext, for the built-in tune.

  function openContext() {
    if (ctx) return true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      ctx = new AudioContextClass({ latencyHint: 'playback' });
    } catch (error) {
      console.warn('[music] This browser cannot play the built-in tune.', error);
      return false;
    }
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
      if (scheduler) scheduler.stop();
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

  /** Her song could not be played: say which file, and play the built-in tune instead. */
  function fallBack() {
    if (source !== 'file') return;
    console.warn(`[music] Could not play "${src}" — using the built-in tune.`);
    clearInterval(volumeTimer);
    audio.pause();
    source = 'generated';
    onChange();
    if (wanted) turnOn(START_FADE);
  }

  // Either kind.

  /** Makes sound from the source in use; its browser call (resume or play) is made before this returns. */
  function wake() {
    return source === 'file' ? wakeFile() : wakeContext();
  }

  /** Brings the sound up once the browser lets it run. */
  function sound(fade) {
    if (source === 'file') {
      fadeVolume(FILE_VOLUME, fade);
      if (ctx) idleContext(0); // her song plays: the tune's context waits, unlocked, in case it is needed
      return;
    }
    if (!synth) {
      synth = createSynth(ctx);
      scheduler = createScheduler(ctx, synth, composeLoop());
    }
    scheduler.start();
    synth.fade(true, fade);
  }

  /** Fades the sound out over `fade` s and then lets the browser rest (pauses her song, suspends the context). */
  function quiet(fade) {
    if (source === 'file') {
      if (audio) fadeVolume(0, fade, () => audio.pause());
      return;
    }
    if (synth) synth.fade(false, fade);
    if (ctx) idleContext(synth ? fade : 0);
  }

  /** Silences the sound at once for the background. */
  function hold() {
    if (source === 'file') {
      clearInterval(volumeTimer);
      if (audio) {
        audio.pause();
        audio.volume = 0; // so it fades back in
      }
      return;
    }
    quiet(HIDE_FADE);
  }

  function turnOn(fade) {
    const id = ++request;
    wanted = true;
    return wake().then((outcome) => {
      if (id !== request) {
        if (!wanted) quiet(0); // she turned it off while the browser was answering
        return;
      }
      if (outcome === 'failed') return fallBack();
      if (outcome === 'aborted') return; // a pause for the background interrupted it; it is retried on return
      if (outcome !== 'ok') return setState(outcome === 'blocked' ? 'blocked' : 'off');
      heard = true;
      sound(fade);
      setState('playing');
      if (hidden) hold();
    }).catch((error) => {
      console.warn('[music] The music could not play.', error);
      setState('off');
    });
  }

  function turnOff() {
    request += 1;
    wanted = false;
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
    /** Call it inside the tap that starts the ride. */
    start() {
      if (started) return Promise.resolve();
      started = true;
      usePlaybackSession();
      if (source === 'file' && openContext()) ctx.resume().catch(() => {});
      onChange();
      return turnOn(START_FADE);
    },
    /** The music button. Turning it on is a tap, so it can also start sound the browser held back before. */
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
      else if (!hidden && wanted && state !== 'blocked') turnOn(TOGGLE_FADE);
      onChange();
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

/** iOS 17+: the music plays like a video's sound, through the silent switch, rather than as a page's beeps. */
function usePlaybackSession() {
  try {
    if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // An older or stricter browser: it plays as it would anyway.
  }
}

/**
 * The built-in tune's instruments on `ctx`, ending in its destination. Exported so the tune can be rendered offline
 * (OfflineAudioContext) to check its levels.
 * @param {BaseAudioContext} ctx
 * @returns {{ fade: (on: boolean, seconds: number) => void, playNote: (note: import('./compose.js').Note, at: number) => void }}
 */
export function createSynth(ctx) {
  const compressor = ctx.createDynamicsCompressor();
  for (const [name, value] of Object.entries(COMPRESSOR)) compressor[name].value = value;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(compressor);

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

  // The master level, faded by linear ramps. The level at any moment is worked out here rather than read back from
  // the AudioParam, which not every browser reports mid-ramp.
  let from = 0;
  let to = 0;
  let rampStart = 0;
  let rampEnd = 0;
  const levelAt = (t) => (t >= rampEnd ? to : from + ((to - from) * (t - rampStart)) / (rampEnd - rampStart));

  return {
    fade(on, seconds) {
      const now = ctx.currentTime;
      const level = levelAt(now);
      const end = now + Math.max(seconds, 0.01);
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(level, now);
      master.gain.linearRampToValueAtTime(on ? MASTER_GAIN : 0, end);
      [from, to, rampStart, rampEnd] = [level, on ? MASTER_GAIN : 0, now, end];
    },
    playNote(note, at) {
      voices[note.voice](note, at);
    },
  };
}

/**
 * Plays `loop` round and round on `synth`: every TICK_MS it books the notes starting in the next LOOKAHEAD seconds
 * of the context's clock. While the context is suspended its clock stands still, so the tune picks up where it left
 * off. A note whose moment has already passed (the page stalled) is skipped rather than played late.
 */
function createScheduler(ctx, synth, loop) {
  let timer = 0;
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
    start() {
      if (timer) return;
      if (loopStart < 0) loopStart = ctx.currentTime + 0.05;
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      clearInterval(timer);
      timer = 0;
    },
  };
}
