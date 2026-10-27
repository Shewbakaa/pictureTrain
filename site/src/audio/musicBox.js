// The music box: the instruments the winter carol (carol.js) and the built-in tune (compose.js) are played on, live
// with Web Audio, and the scheduler that plays a written-out loop on them. A soft music-box bell with a little echo,
// over a warm pad and bass. soundtrack.js plays them among the scenes' music.
//
// It touches no DOM, so offline renders (OfflineAudioContext) and the Node unit tests can use it; its scheduler's
// default timer is setInterval, called only once a loop starts.

import { midiToFreq } from './compose.js';
import { createFader } from './mixer.js';

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
export const INTERVAL = Object.freeze({ start: (tick) => setInterval(tick, TICK_MS), stop: (id) => clearInterval(id) });

/**
 * The music box's instruments on `ctx`, playing into `out` through a fader of their own, silent until fade(true).
 * Exported so the tune and the carol can be rendered offline (OfflineAudioContext) to check their levels.
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
 * Plays `loop` round and round on `synth`: every TICK_MS (on `timer`) it books the notes starting in the next
 * LOOKAHEAD seconds of the context's clock. While the context is suspended its clock stands still, so the tune
 * picks up where it left off; `start(true)` begins it again from the top instead. A note whose moment has already
 * passed (the page stalled) is skipped rather than played late. `timer` ({ start(tick) → id, stop(id) }) runs its
 * booking; the unit tests and offline renders tick it by hand.
 * @param {BaseAudioContext} ctx
 * @param {{ playNote: (note: import('./compose.js').Note, at: number) => void }} synth
 * @param {{ lengthSec: number, notes: import('./compose.js').Note[] }} loop
 * @param {{ start: (tick: () => void) => unknown, stop: (id: unknown) => void }} [timer]
 * @returns {{ start: (fromTop?: boolean) => void, stop: () => void }}
 */
export function createScheduler(ctx, synth, loop, timer = INTERVAL) {
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
