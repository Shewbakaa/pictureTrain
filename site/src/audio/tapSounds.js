// The small sounds that answer the scenery: for now the shimmer that goes with a shooting star (world/nightSky.js).
// sfx.js defines each as a one-shot, so it keeps to the Sound button, a video's sound and the page going into the
// background like every other sound.
//
// Each is built of oscillators on the kit's context and played into the output it is given (the effects bus unless
// told otherwise) from context time `at`, at `level` (0 to 1). It returns false, playing nothing, at no level or when
// the kit's node budget has no room for it, and counts its nodes in the budget (NODES) until it ends.
//
// The levels are set for the mix after the master chain and measured there offline (tests/e2e/audioLevels.spec.js):
// the shimmer peaks about −30 dBFS, very soft, far under the music.

import { TAIL, toSilence, voiceParts } from './voiceParts.js';

/**
 * The shimmer: NOTES (MIDI) of F major, very high, coming one after another STEP seconds apart (give or take JITTER)
 * like the star falling, each a soft bell that rises over ATTACK and rings out over DECAY (to −60 dB), a little
 * quieter each time (FALL). Every note is two sines, the second DETUNE times the first's frequency, and their slow
 * beating is the shimmer.
 */
const SHIMMER = { LEVEL: 0.0048, NOTES: [96, 101, 105], STEP: 0.09, JITTER: 0.02, ATTACK: 0.05, DECAY: 1.5, FALL: 0.15, DETUNE: 1.0016 };

/** How many audio nodes each sound holds while it plays, counted against the kit's budget: a mix, and a gain and two sines a note. */
const NODES = Object.freeze({ shimmer: 1 + 3 * SHIMMER.NOTES.length });

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
  };
}
