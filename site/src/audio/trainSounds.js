// The train's own sounds, made with Web Audio from the shared noise buffer and a few oscillators: the whistle, the
// chug of the engine, the clickety-clack of the wheels over the rail joints, and steam (a puff as the train sets
// off, the brakes, a long sigh at a stop). sfx.js decides when they play, with the timing in sfxTiming.js.
//
// The levels are set for the mix after the master chain (mixer.js), and measured there offline
// (tests/e2e/audioLevels.spec.js): the whistle peaks about −20 dBFS, the chug comes to about −34 dBFS RMS while
// cruising with the clicks well below it, and the steam stays softer than the whistle. Each one's loudest moment
// stays under the music's.

import { midiToFreq } from './compose.js';
import { WHISTLE } from './sfxTiming.js';

/**
 * The whistle: the chord's notes as sines (each note's share in GAINS, the lowest strongest) with a breath of
 * band-passed noise, a soft ATTACK, each toot starting BEND cents flat and rising to pitch over BEND_TIME as the
 * steam comes up, and a gentle vibrato. LEVEL is a note's peak gain at full share.
 */
const WHISTLE_SOUND = {
  LEVEL: 0.012, GAINS: [1, 0.8, 0.6], ATTACK: 0.04, RELEASE: 0.06, SAG: 0.85, BEND: -45, BEND_TIME: 0.08,
  VIBRATO_RATE: 5.5, VIBRATO_DEPTH: 9, BREATH: 0.6, BREATH_FREQ: 900, BREATH_Q: 0.8,
};

/**
 * A chug: a soft "chuff" of band-passed noise, a quick ATTACK and a DECAY (to −60 dB). Every other chug is a little
 * softer (ACCENT) and lower, the two cylinders taking turns. LEVEL is its peak gain at full speed.
 */
const CHUG = { LEVEL: 0.25, ATTACK: 0.03, DECAY: 0.7, FREQ: 520, LOW_FREQ: 440, Q: 1.1, ACCENT: 0.75 };

/** A rail-joint click: a short tick of band-passed noise. LEVEL is its peak gain at full speed. */
const CLICK = { LEVEL: 0.16, ATTACK: 0.002, DECAY: 0.06, FREQ: 1800, Q: 2.5 };

/**
 * Steam: high-passed noise (HIGH, falling to HIGH_END for the sigh) under a lowpass (LOW, falling to LOW_END). It
 * rises over ATTACK, eases down to SAG of its LEVEL over HOLD, then dies away over DECAY (to −60 dB). A puff as the
 * train sets off, a soft swell as the brakes come on, and a long "pshhh" sigh at a stop.
 */
const STEAM = {
  puff: { LEVEL: 0.03, ATTACK: 0.03, HOLD: 0.12, SAG: 0.8, DECAY: 0.6, HIGH: 2200, HIGH_END: 2200, LOW: 7000, LOW_END: 7000 },
  brake: { LEVEL: 0.02, ATTACK: 0.25, HOLD: 0.1, SAG: 0.9, DECAY: 0.5, HIGH: 3000, HIGH_END: 3000, LOW: 8000, LOW_END: 8000 },
  sigh: { LEVEL: 0.03, ATTACK: 0.08, HOLD: 0.8, SAG: 0.55, DECAY: 1.5, HIGH: 3200, HIGH_END: 1200, LOW: 8000, LOW_END: 3500 },
};

/** Every envelope closes with a ramp this long (s) down to exactly zero before its sources stop. */
const TAIL = 0.02;

/** How many audio nodes each sound holds while it plays, counted against the kit's budget. */
const TRAIN_NODES = Object.freeze({ whistle: 12, chug: 3, click: 3, steam: 4 });

/**
 * @typedef {{ whistle: (kind: 'depart'|'finale', at: number) => boolean, chug: (at: number, level: number) => boolean,
 *             click: (at: number, level: number) => boolean, steam: (kind: 'puff'|'brake'|'sigh', at: number) => boolean }} TrainSounds
 */

/**
 * The train's sounds, played into the kit's effects bus. Each starts at context time `at` and returns false,
 * playing nothing, when the kit has no room for it. `level` (0–1) scales a chug or click with the train's speed.
 * @param {import('./sfx.js').Kit} kit
 * @returns {TrainSounds}
 */
export function createTrainSounds(kit) {
  const { ctx } = kit;
  const out = kit.buses.effects;
  let accent = false;

  /** The shared noise, from a random point in it, between `at` and `end`. */
  const noise = (at, end) => {
    const src = ctx.createBufferSource();
    src.buffer = kit.noise;
    src.loop = true;
    src.start(at, kit.random() * kit.noise.duration);
    src.stop(end);
    return src;
  };

  const filter = (type, frequency, q, into) => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    node.connect(into);
    return node;
  };

  /** A gain into the effects bus, at zero from `at`: a sound's envelope. */
  const envelope = (at) => {
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.connect(out);
    return env;
  };

  /**
   * A burst: up to `peak` over `attack`, easing down to `peak · sag` over `hold`, then an exponential decay to
   * −60 dB over `decay`. Returns when it ends.
   */
  const burst = (env, at, peak, attack, decay, hold = 0, sag = 1) => {
    const held = at + attack + hold;
    const decayed = held + decay;
    env.gain.linearRampToValueAtTime(peak, at + attack);
    if (hold > 0) env.gain.linearRampToValueAtTime(peak * sag, held);
    env.gain.exponentialRampToValueAtTime(peak * 0.001, decayed);
    env.gain.linearRampToValueAtTime(0, decayed + TAIL);
    return decayed + TAIL;
  };

  return {
    whistle(kind, at) {
      const toots = WHISTLE[kind];
      if (!toots || !kit.room(TRAIN_NODES.whistle)) return false;
      const S = WHISTLE_SOUND;
      const final = toots[toots.length - 1];
      const end = at + final.t + final.dur + TAIL;
      const env = envelope(at);
      for (const toot of toots) {
        const start = at + toot.t;
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(1, start + S.ATTACK);
        env.gain.linearRampToValueAtTime(S.SAG, start + toot.dur - S.RELEASE);
        env.gain.linearRampToValueAtTime(0, start + toot.dur);
      }
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = S.VIBRATO_RATE;
      const depth = ctx.createGain();
      depth.gain.value = S.VIBRATO_DEPTH;
      vibrato.connect(depth);
      vibrato.start(at);
      vibrato.stop(end);
      WHISTLE.CHORD.forEach((midi, i) => {
        const share = ctx.createGain();
        share.gain.value = S.LEVEL * S.GAINS[i];
        share.connect(env);
        const osc = ctx.createOscillator();
        osc.frequency.value = midiToFreq(midi);
        for (const toot of toots) {
          osc.detune.setValueAtTime(S.BEND, at + toot.t);
          osc.detune.linearRampToValueAtTime(0, at + toot.t + S.BEND_TIME);
        }
        depth.connect(osc.detune);
        osc.connect(share);
        osc.start(at);
        osc.stop(end);
      });
      const breath = ctx.createGain();
      breath.gain.value = S.LEVEL * S.BREATH;
      breath.connect(env);
      const src = noise(at, end);
      src.connect(filter('bandpass', S.BREATH_FREQ, S.BREATH_Q, breath));
      kit.track(src, TRAIN_NODES.whistle, env);
      return true;
    },

    chug(at, level) {
      if (!(level > 0) || !kit.room(TRAIN_NODES.chug)) return false;
      accent = !accent;
      const env = envelope(at);
      const end = burst(env, at, CHUG.LEVEL * level * (accent ? 1 : CHUG.ACCENT), CHUG.ATTACK, CHUG.DECAY);
      const src = noise(at, end);
      src.connect(filter('bandpass', accent ? CHUG.FREQ : CHUG.LOW_FREQ, CHUG.Q, env));
      kit.track(src, TRAIN_NODES.chug, env);
      return true;
    },

    click(at, level) {
      if (!(level > 0) || !kit.room(TRAIN_NODES.click)) return false;
      const env = envelope(at);
      const end = burst(env, at, CLICK.LEVEL * level, CLICK.ATTACK, CLICK.DECAY);
      const src = noise(at, end);
      src.connect(filter('bandpass', CLICK.FREQ, CLICK.Q, env));
      kit.track(src, TRAIN_NODES.click, env);
      return true;
    },

    steam(kind, at) {
      const S = STEAM[kind];
      if (!S || !kit.room(TRAIN_NODES.steam)) return false;
      const env = envelope(at);
      const end = burst(env, at, S.LEVEL, S.ATTACK, S.DECAY, S.HOLD, S.SAG);
      const low = filter('lowpass', S.LOW, 0.7, env);
      low.frequency.setValueAtTime(S.LOW, at);
      low.frequency.exponentialRampToValueAtTime(S.LOW_END, end);
      const high = filter('highpass', S.HIGH, 0.7, low);
      high.frequency.setValueAtTime(S.HIGH, at);
      high.frequency.exponentialRampToValueAtTime(S.HIGH_END, end);
      const src = noise(at, end);
      src.connect(high);
      kit.track(src, TRAIN_NODES.steam, env);
      return true;
    },
  };
}
