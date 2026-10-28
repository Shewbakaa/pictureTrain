// The small sounds that answer the scenery and her taps: the shimmer that goes with a shooting star
// (world/nightSky.js), the soft, warm whoosh of the cabin's lantern flaring up when she taps it (train/cabin.js), the
// soft pop of a balloon cluster (world/dressing.js), a snowman's jingle of little bells and the rustle of leaves as a
// deer bounds off (world/deer.js). sfx.js defines each as a one-shot, so it keeps to the Sound button, a video's
// sound and the page going into the background like every other sound. (A gull she taps calls with the ambience's own
// gull voice, and a hot-air balloon roars with its burner, natureSounds.js, on one-shots of their own that ambience.js
// defines: 'gull-tap' and 'burner-tap'.)
//
// Each is built of oscillators on the kit's context and played into the output it is given (the effects bus unless
// told otherwise) from context time `at`, at `level` (0 to 1). It returns false, playing nothing, at no level or when
// the kit's node budget has no room for it, and counts its nodes in the budget (NODES) until it ends.
//
// The levels are set for the mix after the master chain and measured there offline (tests/e2e/audioLevels.spec.js):
// the shimmer peaks about −30 dBFS, very soft, far under the music; the lantern, the pop, the jingle and the rustle
// about −24 dBFS, like the ambience's passing sounds.

import { TAIL, strike, toSilence, voiceParts } from './voiceParts.js';

/**
 * The shimmer: NOTES (MIDI) of F major, very high, coming one after another STEP seconds apart (give or take JITTER)
 * like the star falling, each a soft bell that rises over ATTACK and rings out over DECAY (to −60 dB), a little
 * quieter each time (FALL). Every note is two sines, the second DETUNE times the first's frequency, and their slow
 * beating is the shimmer.
 */
const SHIMMER = { LEVEL: 0.0048, NOTES: [96, 101, 105], STEP: 0.09, JITTER: 0.02, ATTACK: 0.05, DECAY: 1.5, FALL: 0.15, DETUNE: 1.0016 };

/**
 * The lantern: a breath of noise like a flame catching, through a bandpass that swells from FROM up to PEAK Hz as it
 * flares (over ATTACK) and settles to TO as it dies away (over DECAY), with a lowpass (LOW) taking off the hiss, so it
 * stays soft and warm.
 */
const WHOOSH = { LEVEL: 0.0465, FROM: 260, PEAK: 850, TO: 340, Q: 0.8, LOW: 1600, ATTACK: 0.12, DECAY: 0.85 };

/**
 * The pop: a short burst of noise through a bandpass at BAND Hz, the band dropping to DROP Hz as it dies, so it is a
 * soft "puk" more than a bang: in over ATTACK, gone (to −60 dB) over DECAY.
 */
const POP = { LEVEL: 0.0407, BAND: 1400, DROP: 650, Q: 0.9, ATTACK: 0.003, DECAY: 0.16 };

/**
 * The jingle: three little bells (sines at BELLS Hz) shaken SHAKES times, STEP seconds apart, each shake rising over
 * ATTACK and ringing out over RING (to −60 dB), the later ones softer by FALL each.
 */
const JINGLE = { LEVEL: 0.00716, BELLS: [2637, 3520, 4699], SHAKES: [0, 0.14, 0.26, 0.36], ATTACK: 0.004, RING: 0.25, FALL: 0.15 };

/**
 * The rustle: a hiss of noise through a bandpass at BAND Hz, like leaves brushed aside, swelling in over ATTACK, held
 * for HOLD with the deer's steps in it (falling back to STEP of its level FLUTTER times a second), and dying away over
 * RELEASE.
 */
const RUSTLE = { LEVEL: 0.0235, BAND: 2600, Q: 0.8, ATTACK: 0.08, HOLD: 0.45, RELEASE: 0.5, FLUTTER: 7, STEP: 0.4 };

/**
 * How many audio nodes each sound holds while it plays, counted against the kit's budget. The shimmer: a mix, and a
 * gain and two sines a note. The lantern: its noise, two filters and a gain. The pop: its noise, a filter and a gain.
 * The jingle: three sines and a gain. The rustle: its noise, a filter and a gain.
 */
const NODES = Object.freeze({ shimmer: 1 + 3 * SHIMMER.NOTES.length, lantern: 4, pop: 3, jingle: JINGLE.BELLS.length + 1, rustle: 3 });

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * The tap sounds' voices on `kit`, into `out` (the effects bus unless given). Exported so they can be rendered offline.
 * @param {import('./sfx.js').Kit} kit
 * @param {AudioNode} [out]
 */
export function createTapSounds(kit, out = kit.buses.effects) {
  const parts = voiceParts(kit);

  return {
    shimmer(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.shimmer)) return false;
      const S = SHIMMER;
      const tau = toSilence(S.DECAY);
      const mix = parts.gain(S.LEVEL * level, out);
      let last = null;
      S.NOTES.forEach((midi, i) => {
        const start = at + i * S.STEP + kit.random() * S.JITTER;
        const end = start + S.DECAY + TAIL;
        const env = parts.gain(0, mix);
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(1 - S.FALL * i, start + S.ATTACK);
        env.gain.setTargetAtTime(0, start + S.ATTACK, tau);
        const hz = midiToHz(midi);
        parts.tone('sine', hz, env, start, end);
        last = parts.tone('sine', hz * S.DETUNE, env, start, end);
      });
      kit.track(last, NODES.shimmer, mix);
      return true;
    },

    lantern(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.lantern)) return false;
      const W = WHOOSH;
      const top = at + W.ATTACK;
      const gone = top + W.DECAY;
      const end = gone + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(W.LEVEL * level, top);
      env.gain.exponentialRampToValueAtTime(W.LEVEL * level * 0.001, gone);
      env.gain.linearRampToValueAtTime(0, end);
      const band = parts.filter('bandpass', W.FROM, W.Q, parts.filter('lowpass', W.LOW, 0.7, env));
      band.frequency.setValueAtTime(W.FROM, at);
      band.frequency.exponentialRampToValueAtTime(W.PEAK, top);
      band.frequency.exponentialRampToValueAtTime(W.TO, gone);
      const src = parts.source(kit.noise, at, end);
      src.connect(band);
      kit.track(src, NODES.lantern, env);
      return true;
    },

    pop(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.pop)) return false;
      const P = POP;
      const top = at + P.ATTACK;
      const end = top + P.DECAY + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(P.LEVEL * level, top);
      env.gain.setTargetAtTime(0, top, toSilence(P.DECAY));
      env.gain.setValueAtTime(P.LEVEL * level * 0.001, top + P.DECAY);
      env.gain.linearRampToValueAtTime(0, end);
      const band = parts.filter('bandpass', P.BAND, P.Q, env);
      band.frequency.setValueAtTime(P.BAND, top);
      band.frequency.exponentialRampToValueAtTime(P.DROP, top + P.DECAY);
      const src = parts.source(kit.noise, at, end);
      src.connect(band);
      kit.track(src, NODES.pop, env);
      return true;
    },

    jingle(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.jingle)) return false;
      const J = JINGLE;
      const tau = toSilence(J.RING);
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      strike(env.gain, J.SHAKES.map((t, i) => [at + t, 1 - J.FALL * i]), J.LEVEL * level, J.ATTACK, tau);
      const last = at + J.SHAKES[J.SHAKES.length - 1] + J.ATTACK;
      const end = last + J.RING + TAIL;
      env.gain.setValueAtTime(J.LEVEL * level * 0.001, last + J.RING);
      env.gain.linearRampToValueAtTime(0, end);
      // Each bell a little out of tune with the last time, so no two jingles are quite the same.
      let bell = null;
      for (const hz of J.BELLS) bell = parts.tone('sine', hz * (1 + 0.01 * (kit.random() - 0.5)), env, at, end);
      kit.track(bell, NODES.jingle, env);
      return true;
    },

    rustle(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.rustle)) return false;
      const R = RUSTLE;
      const full = at + R.ATTACK;
      const held = full + R.HOLD;
      const end = held + R.RELEASE + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(R.LEVEL * level, full);
      // Its steps: the rustle falls back and swells again as each foot comes down, as many whole steps as fit.
      for (let k = 0; k < Math.floor(R.HOLD * R.FLUTTER); k++) {
        const step = full + k / R.FLUTTER;
        env.gain.linearRampToValueAtTime(R.LEVEL * level * R.STEP, step + 0.5 / R.FLUTTER);
        env.gain.linearRampToValueAtTime(R.LEVEL * level, step + 1 / R.FLUTTER);
      }
      env.gain.setTargetAtTime(0, held, toSilence(R.RELEASE));
      env.gain.setValueAtTime(R.LEVEL * level * 0.001, held + R.RELEASE);
      env.gain.linearRampToValueAtTime(0, end);
      const band = parts.filter('bandpass', R.BAND, R.Q, env);
      const src = parts.source(kit.noise, at, end);
      src.connect(band);
      kit.track(src, NODES.rustle, env);
      return true;
    },
  };
}
