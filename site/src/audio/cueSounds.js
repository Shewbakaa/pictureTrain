// Sounds that answer something on screen: a quiet paper rustle as a stop's card slides up, a sparkle of high bell
// notes as the hearts rise between the two of them at the finale, and a soft pop and crackle for each of the
// finale's fireworks, in time with their bursts (finale/fireworkTiming.js), for as long as the finale plays.
//
// They play into the effects bus through the sound effects' one-shots (sfx.js), so they keep to the Sound button,
// a video's sound and the page going into the background like every other sound. The levels are set for the mix
// after the master chain and measured there offline (tests/e2e/ambienceLevels.spec.js): the pops and the sparkle,
// the celebration, peak about −18 dBFS so they are clearly heard under the music; the rustle is far quieter.

import { fireworkBlooms, FIREWORK_TIMING } from '../finale/fireworkTiming.js';
import { voiceParts } from './voiceParts.js';

/** The stop card rises a beat after the train stops (styles.css: #stop-card's 0.6 s animation delay). */
export const CARD_RISES_AFTER = 0.6;

/**
 * The paper rustle: the dust's crinkles and a breath of noise through a bandpass, swelling in GRAINS (start s,
 * level) over LENGTH seconds as the card slides.
 */
const RUSTLE = {
  LEVEL: 0.025, LENGTH: 0.4, FREQ: 3500, Q: 0.6, HIGH: 2500, HISS: 0.35,
  GRAINS: [[0, 0], [0.03, 0.7], [0.09, 0.4], [0.15, 1], [0.24, 0.55], [0.4, 0]],
};

/**
 * The sparkle: NOTES (MIDI) of F major, high, rising one after another STEP seconds apart (give or take JITTER), each
 * a bell with a quick strike and a DECAY (to −60 dB), softer as they climb.
 */
const SPARKLE = {
  LEVEL: 0.0256, NOTES: [84, 89, 93, 96, 101], STEP: 0.075, JITTER: 0.012, ATTACK: 0.003, DECAY: 0.9, FALL: 0.12,
};

/**
 * A firework: a soft, low thump (a sine falling from THUMP to THUMP_TO Hz) with a puff of lowpassed noise (POP),
 * then a crackle of high-passed dust that rises CRACKLE.AFTER the pop and dies away over CRACKLE.DECAY. Each burst
 * of the finale sits at its own place across the sky (PANS, by burst).
 */
const FIREWORK = {
  LEVEL: 0.0476, THUMP: 95, THUMP_TO: 45, THUMP_LENGTH: 0.18, THUMP_GAIN: 0.8,
  POP: { LOW: 1200, ATTACK: 0.004, DECAY: 0.35 },
  CRACKLE: { HIGH: 2500, AFTER: 0.12, RISE: 0.1, DECAY: 1.1, GAIN: 0.7 },
  PANS: [-0.35, 0.3, -0.1, 0.45],
};

/** Every envelope closes with a ramp this long (s) down to exactly zero before its sources stop. */
const TAIL = 0.02;

/** How many audio nodes each sound holds while it plays, counted against the kit's budget. */
const NODES = Object.freeze({ rustle: 6, sparkle: 11, firework: 10 });

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const toSilence = (decay) => decay / Math.log(1000);

/**
 * The cue sounds' voices on `kit`, each starting at context time `at` at `level` (0 to 1) and returning false,
 * playing nothing, at no level or when the kit's node budget has no room for it. Exported so they can be rendered
 * offline.
 * @param {import('./sfx.js').Kit} kit
 */
export function createCueSounds(kit) {
  const parts = voiceParts(kit);
  const out = kit.buses.effects;

  return {
    rustle(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.rustle)) return false;
      const R = RUSTLE;
      const end = at + R.LENGTH + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      for (const [t, share] of R.GRAINS) if (t > 0) env.gain.linearRampToValueAtTime(R.LEVEL * level * share, at + t);
      const band = parts.filter('bandpass', R.FREQ, R.Q, parts.filter('highpass', R.HIGH, 0.7, env));
      const dust = parts.source(kit.dust, at, end);
      dust.connect(band);
      parts.source(kit.noise, at, end).connect(parts.gain(R.HISS, band));
      kit.track(dust, NODES.rustle, env);
      return true;
    },

    sparkle(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.sparkle)) return false;
      const S = SPARKLE;
      const tau = toSilence(S.DECAY);
      const mix = parts.gain(S.LEVEL * level, out);
      let last = null;
      S.NOTES.forEach((midi, i) => {
        const start = at + i * S.STEP + kit.random() * S.JITTER;
        const end = start + S.DECAY + TAIL;
        const env = parts.gain(0, mix);
        const peak = 1 - S.FALL * i;
        env.gain.setValueAtTime(0, start);
        env.gain.linearRampToValueAtTime(peak, start + S.ATTACK);
        env.gain.setTargetAtTime(0, start + S.ATTACK, tau);
        last = parts.tone('sine', midiToHz(midi), env, start, end);
      });
      kit.track(last, NODES.sparkle, mix);
      return true;
    },

    firework(at, level = 1, pan = 0) {
      if (!(level > 0) || !kit.room(NODES.firework)) return false;
      const F = FIREWORK;
      const C = F.CRACKLE;
      const crackleFrom = at + C.AFTER;
      const end = crackleFrom + C.RISE + C.DECAY + TAIL;
      const joint = parts.pan(pan, out);
      const mix = parts.gain(F.LEVEL * level, joint);

      const thump = parts.gain(0, mix);
      thump.gain.setValueAtTime(0, at);
      thump.gain.linearRampToValueAtTime(F.THUMP_GAIN, at + 0.006);
      thump.gain.exponentialRampToValueAtTime(F.THUMP_GAIN * 0.001, at + F.THUMP_LENGTH);
      thump.gain.linearRampToValueAtTime(0, at + F.THUMP_LENGTH + TAIL);
      const low = parts.tone('sine', F.THUMP, thump, at, at + F.THUMP_LENGTH + TAIL);
      low.frequency.setValueAtTime(F.THUMP, at);
      low.frequency.exponentialRampToValueAtTime(F.THUMP_TO, at + F.THUMP_LENGTH);

      const puff = parts.gain(0, mix);
      puff.gain.setValueAtTime(0, at);
      puff.gain.linearRampToValueAtTime(1, at + F.POP.ATTACK);
      puff.gain.exponentialRampToValueAtTime(0.001, at + F.POP.DECAY);
      puff.gain.linearRampToValueAtTime(0, at + F.POP.DECAY + TAIL);
      parts.source(kit.noise, at, at + F.POP.DECAY + TAIL).connect(parts.filter('lowpass', F.POP.LOW, 0.7, puff));

      const crackle = parts.gain(0, mix);
      crackle.gain.setValueAtTime(0, crackleFrom);
      crackle.gain.linearRampToValueAtTime(C.GAIN, crackleFrom + C.RISE);
      crackle.gain.exponentialRampToValueAtTime(C.GAIN * 0.001, crackleFrom + C.RISE + C.DECAY);
      crackle.gain.linearRampToValueAtTime(0, end);
      const dust = parts.source(kit.dust, crackleFrom, end);
      dust.connect(parts.filter('highpass', C.HIGH, 0.7, crackle));

      kit.track(dust, NODES.firework, joint === out ? mix : joint);
      return true;
    },
  };
}

/**
 * The cues, played through `sfx`'s one-shots once the sound is on: `card()` as a stop's card comes up, `hearts()` at
 * the finale's 'hearts' event, and `fireworks(time, bursts)` every frame while the finale plays, with its clock and
 * how many bursts are going (finale.time, finale.bursts), to pop with each bloom.
 * @param {import('./sfx.js').Sfx} sfx
 */
export function createCues(sfx) {
  let voices = null;
  const voice = (kit) => voices || (voices = createCueSounds(kit));
  sfx.define('rustle', { gap: 0.5, play: (kit, at, level) => voice(kit).rustle(at, level) });
  sfx.define('sparkle', { gap: 2, play: (kit, at, level) => voice(kit).sparkle(at, level) });
  // One per burst, each in its own place across the sky; a burst blooms every FIREWORK_TIMING.PERIOD.
  const bursts = FIREWORK.PANS.map((pan, b) => {
    const name = `firework-${b}`;
    sfx.define(name, { gap: FIREWORK_TIMING.PERIOD / 2, play: (kit, at, level) => voice(kit).firework(at, level, pan) });
    return name;
  });

  let last = 0; // the finale time the fireworks were last heard to
  const pop = (b) => {
    sfx.play(bursts[b % bursts.length]);
  };

  return {
    card() {
      sfx.play('rustle', CARD_RISES_AFTER);
    },
    hearts() {
      sfx.play('sparkle');
    },
    fireworks(time, count) {
      // A finale clock that has gone back (riding again ends in another finale) reports nothing for that frame.
      fireworkBlooms(last, time, count, pop);
      last = time;
    },
  };
}
