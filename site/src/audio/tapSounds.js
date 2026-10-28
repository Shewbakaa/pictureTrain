// The small sounds that answer the scenery and her taps: the shimmer that goes with a shooting star
// (world/nightSky.js), and the soft, warm whoosh of the cabin's lantern flaring up when she taps it (train/cabin.js).
// sfx.js defines each as a one-shot, so it keeps to the Sound button, a video's sound and the page going into the
// background like every other sound.
//
// Each is built of oscillators on the kit's context and played into the output it is given (the effects bus unless
// told otherwise) from context time `at`, at `level` (0 to 1). It returns false, playing nothing, at no level or when
// the kit's node budget has no room for it, and counts its nodes in the budget (NODES) until it ends.
//
// The levels are set for the mix after the master chain and measured there offline (tests/e2e/audioLevels.spec.js):
// the shimmer peaks about −30 dBFS, very soft, far under the music; the lantern about −24 dBFS, like the ambience's
// passing sounds.

import { TAIL, toSilence, voiceParts } from './voiceParts.js';

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
 * How many audio nodes each sound holds while it plays, counted against the kit's budget. The shimmer: a mix, and a
 * gain and two sines a note. The lantern: its noise, two filters and a gain.
 */
const NODES = Object.freeze({ shimmer: 1 + 3 * SHIMMER.NOTES.length, lantern: 4 });

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
  };
}
