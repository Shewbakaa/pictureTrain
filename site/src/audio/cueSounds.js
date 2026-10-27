// Sounds that answer something on screen: a quiet paper rustle as a stop's card slides up, and the finale's own sounds
// on its clock. As the train pulls in at the Day 365 station the platform bell rings ("ding-ding") with the whistle;
// then, as the finale plays, its foley (foleySounds.js, at the times in finale/foleyTiming.js: her hop and landing,
// his door and his footsteps, two heartbeats, the bouquet's paper, doves taking off), a sparkle of high bell notes as
// the hearts rise between the two of them, and a soft pop and crackle for each of the fireworks, in time with their
// bursts (finale/fireworkTiming.js), for as long as the finale plays.
//
// They play into the effects bus through the sound effects' one-shots (sfx.js), so they keep to the Sound button,
// a video's sound and the page going into the background like every other sound. The finale's own go through a bus
// of their own on the way, which Ride again or a jump from the finale fades out at once (silence), so nothing of the
// finale goes on sounding into the ride. The finale's clock drives them every frame (finale(time, bursts)), and only
// a frame's step of it at a time: a clock that jumps (?ft=, skipTo) or stands still (freeze) plays nothing of what it
// passed over, never a burst. The levels are set for the mix after the master chain and measured there offline
// (tests/e2e/ambienceLevels.spec.js and finaleFoleyLevels.spec.js): the pops and the sparkle, the celebration, peak
// about −18 dBFS so they are clearly heard under the music; the rustle and the foley are far quieter.

import { fireworkBlooms, FIREWORK_TIMING } from '../finale/fireworkTiming.js';
import { foleyCues } from '../finale/foleyTiming.js';
import { MAX_STEP } from '../finale/finaleTimes.js';
import { createFoleySounds, FOLEY_NAMES } from './foleySounds.js';
import { STATION_BELL } from './sfxTiming.js';
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
 * How the finale's foley one-shots are gated (s between plays, sfx.define): his footsteps are paced by his walk
 * (and a slow frame can hold two), and the two heartbeats come 0.8 s apart.
 */
const FOLEY_GAP = Object.freeze({ step: 0, heartbeat: 0.5, bell: 3, doves: 2 });
const FOLEY_GAP_ELSE = 1;

/** Ride again or a jump from the finale fades the finale's sounds out over this long (s), under the blush. */
const HUSH = 0.15;

/** The finale's clock moving on by more than this in a frame is a jump (finale.js moves it MAX_STEP at most). */
const FRAME_STEP = MAX_STEP + 1e-6;

/** The most of the finale's sounds `heard` lists (app state's finaleCues), from the station bell on. */
const HEARD_MAX = 64;

/**
 * The cue sounds' voices on `kit`, into `out` (the effects bus unless given), each starting at context time `at` at
 * `level` (0 to 1) and returning false, playing nothing, at no level or when the kit's node budget has no room for
 * it. Exported so they can be rendered offline.
 * @param {import('./sfx.js').Kit} kit
 * @param {AudioNode} [out]
 */
export function createCueSounds(kit, out = kit.buses.effects) {
  const parts = voiceParts(kit);

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
 * The cues, played through `sfx`'s one-shots once the sound is on: `card()` as a stop's card comes up; `arrival()` as
 * the train pulls in at the Day 365 station (the station bell, and the finale's sounds back on); `finale(time,
 * bursts)` every frame while the finale plays, with its clock and how many firework bursts are going (finale.time,
 * finale.bursts); and `silence()` as she rides again or jumps back from the finale. `heard` lists the finale's
 * sounds played since the train pulled in, by name ('bell', 'hop', ..., 'step', ..., 'firework'), the first
 * HEARD_MAX of them, for app state. The frame loop's call allocates nothing unless a sound starts.
 * @param {import('./sfx.js').Sfx} sfx
 */
export function createCues(sfx) {
  /** @type {GainNode|null} */
  let bus = null; // the finale's own bus, into the effects bus: made with its first sound
  let busCtx = null;
  let card = null;
  let celebration = null;
  let foley = null;
  const finaleBus = (kit) => {
    if (!bus) {
      busCtx = kit.ctx;
      bus = kit.ctx.createGain();
      bus.connect(kit.buses.effects);
    }
    return bus;
  };
  const cardVoice = (kit) => card || (card = createCueSounds(kit));
  const finaleVoice = (kit) => celebration || (celebration = createCueSounds(kit, finaleBus(kit)));
  const foleyVoice = (kit) => foley || (foley = createFoleySounds(kit, finaleBus(kit)));

  sfx.define('rustle', { gap: 0.5, play: (kit, at, level) => cardVoice(kit).rustle(at, level) });
  sfx.define('sparkle', { gap: 2, play: (kit, at, level) => finaleVoice(kit).sparkle(at, level) });
  for (const name of FOLEY_NAMES) {
    const gap = name in FOLEY_GAP ? FOLEY_GAP[name] : FOLEY_GAP_ELSE;
    sfx.define(name, { gap, play: (kit, at, level) => foleyVoice(kit)[name](at, level) });
  }
  // One per burst, each in its own place across the sky; a burst blooms every FIREWORK_TIMING.PERIOD.
  const bursts = FIREWORK.PANS.map((pan, b) => {
    const name = `firework-${b}`;
    sfx.define(name, { gap: FIREWORK_TIMING.PERIOD / 2, play: (kit, at, level) => finaleVoice(kit).firework(at, level, pan) });
    return name;
  });

  const heard = [];
  let heardTo = 0; // the finale time its sounds were last heard to
  let now = 0; // the finale time of this frame
  let hushed = false; // since silence(), until the train next pulls in at the Day 365 station

  const note = (name) => {
    if (heard.length < HEARD_MAX) heard.push(name);
  };
  // A sound due at finale time `t` is played back to then (a frame late at most).
  const hear = (name, t, level) => {
    if (sfx.play(name, t - now, level)) note(name);
  };
  const pop = (b, t) => {
    if (sfx.play(bursts[b % bursts.length], t - now)) note('firework');
  };

  return {
    card() {
      sfx.play('rustle', CARD_RISES_AFTER);
    },
    arrival() {
      hushed = false;
      heardTo = 0;
      heard.length = 0;
      if (bus) {
        bus.gain.cancelScheduledValues(busCtx.currentTime);
        bus.gain.setValueAtTime(1, busCtx.currentTime);
      }
      if (sfx.play('bell', STATION_BELL.AFTER)) note('bell');
    },
    finale(time, count) {
      now = time;
      const step = time - heardTo;
      // A clock gone back (riding again ends in another finale), jumped or held reports nothing for that frame.
      if (!hushed && step > 0 && step <= FRAME_STEP) {
        foleyCues(heardTo, time, hear);
        fireworkBlooms(heardTo, time, count, pop);
      }
      heardTo = time;
    },
    silence() {
      if (hushed) return;
      hushed = true;
      if (!bus) return;
      const at = busCtx.currentTime;
      bus.gain.cancelScheduledValues(at);
      bus.gain.setValueAtTime(1, at);
      bus.gain.linearRampToValueAtTime(0, at + HUSH);
    },
    get heard() {
      return heard;
    },
  };
}
