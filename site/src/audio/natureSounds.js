// The zones' passing sounds, over their beds (ambienceBeds.js): songbirds in the spring meadow, a bee buzzing by
// and a hot-air balloon's burner far off; a seagull at the beach; calmer birds in the autumn forest; sleigh bells
// over the winter hills; and the clock tower in the evening town, striking as the train rolls in. ambience.js
// decides when they come.
//
// Each plays into the ambience bus from context time `at`, at `level` (0 to 1: the zone's weight and a random
// distance), and returns false, playing nothing, at no level or when the kit's node budget has no room for it. The
// birds are several different calls, each drawn afresh from the kit's seeded random numbers, so no two are quite
// the same.
//
// The levels are set for the mix after the master chain and measured there offline
// (tests/e2e/ambienceLevels.spec.js): the loudest of them peak about −24 dBFS, the bee and the burner softer, and
// the sleigh bells about 6 dB louder, to be heard through their quick, light rings.

import { fallen, voiceParts } from './voiceParts.js';

/** A bird: a sine whose pitch glides through each note of its call. LEVEL is its loudest note's peak gain. */
const BIRD = { LEVEL: 0.0204, ATTACK: 0.006 };

/** The spring meadow's songbirds and the autumn forest's calmer, sparser ones. */
export const BIRD_CALLS = Object.freeze({
  spring: Object.freeze(['chirps', 'trill', 'seesaw', 'warble']),
  autumn: Object.freeze(['seesaw', 'seep', 'coo']),
});

/** An autumn bird is calmer: its calls are drawn out by SLOW, pitched LOW and as loud as SOFT of a spring bird's. */
const CALM = { SLOW: 1.3, LOW: 0.88, SOFT: 0.8 };

/**
 * The gull: a nasal, falling "kyow" (a sawtooth through a bandpass), CALLS of them in a row, each a little lower
 * than the one before, far off (a lowpass), out over the sea (its pan, give or take SPREAD). LEVEL is its peak gain.
 */
const GULL = {
  LEVEL: 0.0268, CALLS: [2, 4], FROM: 720, TOP: 1080, TO: 620, LENGTH: [0.26, 0.34], GAP: [0.1, 0.18], BAND: 1500, FAR: 2600,
  SPREAD: 0.15,
};

/** The bee: a buzzing sawtooth flying past, pitch falling a little as it goes and the pan sweeping across. */
const BEE = {
  LEVEL: 0.0147, PITCH: [205, 240], DROP: 0.9, LOW: 1100, PASS: [1.6, 2.4], WOBBLE: 10, WOBBLE_EVERY: 0.08,
};

/** The balloon's burner: a soft, distant roar of filtered noise, swelling in, flickering, and dying away. */
const BURNER = { LEVEL: 0.031, BAND: 450, LOW: 1600, ATTACK: 0.12, HOLD: [1, 1.8], RELEASE: 0.6, FLICKER: 0.15 };

/**
 * Sleigh bells: three little bells ringing high (sines at BELLS Hz, a little detuned each time) with the rattle of
 * their balls (high-passed noise), shaken in a trot (pairs of shakes PAIR apart, every STRIDE), the sleigh passing
 * from one side to the other, loudest in the middle.
 */
const SLEIGH = {
  LEVEL: 0.0196, BELLS: [2950, 3870, 5230], DETUNE: 0.02, RATTLE: 0.6, RATTLE_HIGH: 5500, HIGH: 2000,
  PAIRS: [3, 5], PAIR: 0.13, STRIDE: [0.38, 0.46], RING: [0.08, 0.11], JITTER: 0.012, SWEEP: 0.6,
};
// A bell's ring must end before its next shake (PAIR − JITTER away at the soonest), or their envelopes interleave.

/**
 * The clock tower: STRIKES strikes EVERY seconds apart, far off (a lowpass) to one side (PAN). Each strike rings a
 * bell's partials (ratios of its note, D4) with their own decays (s, to −60 dB), the low hum longest: D, its minor
 * third F and its fifth A, all in the music's key.
 */
const CHIME = {
  LEVEL: 0.0111, NOTE: 293.66, STRIKES: 4, EVERY: 2.1, ATTACK: 0.004, FAR: 2400, PAN: 0.35,
  PARTIALS: [
    { ratio: 0.5, gain: 0.55, decay: 4.5 }, // the hum
    { ratio: 1, gain: 1, decay: 3.2 }, // the strike note
    { ratio: 1.189, gain: 0.45, decay: 2.4 }, // the minor third
    { ratio: 1.498, gain: 0.3, decay: 1.8 }, // the fifth
    { ratio: 2, gain: 0.35, decay: 1.4 }, // the nominal, an octave up
  ],
};

/** How long the chime's longest-ringing partial (the hum) rings after the last strike (s). */
const CHIME_RING = Math.max(...CHIME.PARTIALS.map((p) => p.decay));

/** Every envelope closes with a ramp this long (s) down to exactly zero before its sources stop. */
const TAIL = 0.02;

/** How many audio nodes each sound holds while it plays, counted against the kit's budget. */
const NODES = Object.freeze({ bird: 3, gull: 5, bee: 4, burner: 5, sleigh: 12, chime: 13 });

/** A time constant (s) that falls to −60 dB over `decay` seconds. */
const toSilence = (decay) => decay / Math.log(1000);

/**
 * @typedef {{ t: number, dur: number, from: number, to: number, peak: number }} BirdNote
 *   a note `t` s into the call, `dur` long, gliding from `from` to `to` Hz, at `peak` of the bird's level
 */

/**
 * The calls, each drawn afresh with `between(low, high)`.
 * @type {Record<string, (between: (low: number, high: number) => number) => BirdNote[]>}
 */
const SHAPES = {
  /** A sparrow's chirps: three to five quick notes, each sweeping down. */
  chirps(between) {
    const notes = [];
    let t = 0;
    const count = Math.floor(between(3, 6));
    for (let i = 0; i < count; i++) {
      const dur = between(0.05, 0.075);
      const from = between(4800, 5800);
      notes.push({ t, dur, from, to: from * between(0.68, 0.76), peak: between(0.75, 1) });
      t += dur + between(0.07, 0.12);
    }
    return notes;
  },
  /** A finch's trill: a run of very short notes rocking between two pitches and falling a little. */
  trill(between) {
    const notes = [];
    const count = Math.floor(between(8, 14));
    const base = between(4200, 4900);
    let t = 0;
    for (let i = 0; i < count; i++) {
      const fall = 1 - (0.08 * i) / count;
      const from = base * fall * (i % 2 ? 1.12 : 1);
      notes.push({ t, dur: 0.03, from, to: from * 1.04, peak: 0.7 + 0.3 * Math.sin((Math.PI * (i + 0.5)) / count) });
      t += 0.03 + between(0.016, 0.024);
    }
    return notes;
  },
  /** A tit's two-note whistle, "tea-cher", two or three times. */
  seesaw(between) {
    const notes = [];
    const high = between(3500, 3900);
    const low = high * between(0.8, 0.86);
    const count = Math.floor(between(2, 4));
    let t = 0;
    for (let i = 0; i < count; i++) {
      notes.push({ t, dur: 0.16, from: high, to: high * 0.97, peak: 0.9 });
      notes.push({ t: t + 0.22, dur: 0.18, from: low, to: low * 0.97, peak: 0.75 });
      t += 0.22 + 0.18 + between(0.1, 0.16);
    }
    return notes;
  },
  /** A robin's warble: a short phrase of notes at different pitches, each gliding up or down. */
  warble(between) {
    const notes = [];
    const count = Math.floor(between(4, 8));
    let t = 0;
    for (let i = 0; i < count; i++) {
      const dur = between(0.08, 0.16);
      const from = between(2500, 3900);
      notes.push({ t, dur, from, to: from * between(0.85, 1.2), peak: between(0.6, 1) });
      t += dur + between(0.03, 0.07);
    }
    return notes;
  },
  /** A thin, high "seep", once or twice: a bird calling quietly in the trees. */
  seep(between) {
    const notes = [];
    const count = Math.floor(between(1, 3));
    for (let i = 0; i < count; i++) {
      const from = between(6200, 6800);
      notes.push({ t: i * between(0.45, 0.6), dur: between(0.11, 0.15), from, to: from * 0.9, peak: 0.6 });
    }
    return notes;
  },
  /** A wood pigeon's soft coo: "coo-COO-coo", low and slow (its pitch is not lowered further when calm). */
  coo(between) {
    const pitch = between(0.95, 1.05) / CALM.LOW;
    return [
      { t: 0, dur: 0.3, from: 480 * pitch, to: 520 * pitch, peak: 0.7 },
      { t: 0.48, dur: 0.45, from: 545 * pitch, to: 500 * pitch, peak: 1 },
      { t: 1.15, dur: 0.32, from: 500 * pitch, to: 470 * pitch, peak: 0.75 },
    ];
  },
};

/**
 * @typedef {{
 *   bird: (zone: 'spring'|'autumn', at: number, level: number) => boolean,
 *   gull: (at: number, level: number, pan?: number) => boolean, bee: (at: number, level: number) => boolean,
 *   burner: (at: number, level: number) => boolean, sleigh: (at: number, level: number) => boolean,
 *   chime: (at: number, level: number) => boolean,
 * }} NatureSounds
 */

/**
 * The zones' passing sounds on `kit`, into its ambience bus.
 * @param {import('./sfx.js').Kit} kit
 * @returns {NatureSounds}
 */
export function createNatureSounds(kit) {
  const parts = voiceParts(kit);
  const out = kit.buses.ambience;
  const between = (low, high) => low + kit.random() * (high - low);
  const side = () => (kit.random() < 0.5 ? -1 : 1);

  /** A sound's output, panned to `pan`: the gain to feed (silent to start), and the node joining it to the bus. */
  function outlet(pan) {
    const joint = parts.pan(pan, out);
    return { into: parts.gain(0, joint), joint };
  }
  /** Counts the sound's nodes until `source` ends, then lets the whole sound go from the bus. */
  function track(source, nodes, { into, joint }) {
    kit.track(source, nodes, joint === out ? into : joint);
  }

  return {
    bird(zone, at, level) {
      if (!(level > 0) || !kit.room(NODES.bird)) return false;
      const calls = BIRD_CALLS[zone] || BIRD_CALLS.spring;
      const shape = calls[Math.floor(kit.random() * calls.length)];
      const calm = zone === 'autumn';
      const slow = calm ? CALM.SLOW : 1;
      const low = calm ? CALM.LOW : 1;
      const soft = calm ? CALM.SOFT : 1;
      const notes = SHAPES[shape](between);
      const last = notes[notes.length - 1];
      const end = at + (last.t + last.dur) * slow + TAIL;
      const sound = outlet(between(-0.75, 0.75));
      const env = sound.into.gain;
      const osc = parts.tone('sine', notes[0].from * low, sound.into, at, end);
      for (const note of notes) {
        const start = at + note.t * slow;
        const dur = note.dur * slow;
        const peak = BIRD.LEVEL * soft * level * note.peak;
        env.setValueAtTime(0, start);
        env.linearRampToValueAtTime(peak, start + BIRD.ATTACK);
        env.linearRampToValueAtTime(peak * 0.6, start + dur * 0.7);
        env.linearRampToValueAtTime(0, start + dur);
        osc.frequency.setValueAtTime(note.from * low, start);
        osc.frequency.exponentialRampToValueAtTime(note.to * low, start + dur);
      }
      track(osc, NODES.bird, sound);
      return true;
    },

    /** `pan` is where the sea is from where she is looking (ambienceTiming.js wavePan). */
    gull(at, level, pan = 0) {
      if (!(level > 0) || !kit.room(NODES.gull)) return false;
      const G = GULL;
      const sound = outlet(Math.max(-1, Math.min(1, pan + between(-G.SPREAD, G.SPREAD))));
      const env = sound.into.gain;
      const voice = parts.filter('bandpass', G.BAND, 1.2, parts.filter('lowpass', G.FAR, 0.7, sound.into));
      const count = Math.floor(between(G.CALLS[0], G.CALLS[1] + 1));
      let t = at;
      const calls = [];
      for (let i = 0; i < count; i++) {
        const dur = between(G.LENGTH[0], G.LENGTH[1]) * (1 - 0.08 * i);
        calls.push({ t, dur, lower: 1 - 0.05 * i, peak: G.LEVEL * level * (1 - 0.12 * i) });
        t += dur + between(G.GAP[0], G.GAP[1]);
      }
      const end = t + TAIL;
      const osc = parts.tone('sawtooth', G.FROM, voice, at, end);
      for (const call of calls) {
        const rise = call.t + 0.06;
        osc.frequency.setValueAtTime(G.FROM * call.lower, call.t);
        osc.frequency.exponentialRampToValueAtTime(G.TOP * call.lower, rise);
        osc.frequency.exponentialRampToValueAtTime(G.TO * call.lower, call.t + call.dur);
        env.setValueAtTime(0, call.t);
        env.linearRampToValueAtTime(call.peak, rise);
        env.linearRampToValueAtTime(call.peak * 0.5, call.t + call.dur * 0.8);
        env.linearRampToValueAtTime(0, call.t + call.dur);
      }
      track(osc, NODES.gull, sound);
      return true;
    },

    bee(at, level) {
      if (!(level > 0) || !kit.room(NODES.bee)) return false;
      const B = BEE;
      const pass = between(B.PASS[0], B.PASS[1]);
      const end = at + pass + TAIL;
      const from = side() * 0.7;
      const sound = outlet(from);
      if (sound.joint !== out) {
        sound.joint.pan.setValueAtTime(from, at);
        sound.joint.pan.linearRampToValueAtTime(-from, end);
      }
      const env = sound.into.gain;
      const peak = B.LEVEL * level;
      env.setValueAtTime(0, at);
      env.linearRampToValueAtTime(peak, at + pass * 0.45);
      env.exponentialRampToValueAtTime(peak * 0.02, at + pass);
      env.linearRampToValueAtTime(0, end);
      const pitch = between(B.PITCH[0], B.PITCH[1]);
      const osc = parts.tone('sawtooth', pitch, parts.filter('lowpass', B.LOW, 1.5, sound.into), at, end);
      // Its wings waver; and it sounds a little lower once it has gone by.
      for (let t = at; t < at + pass; t += B.WOBBLE_EVERY) {
        const drop = t > at + pass * 0.45 ? B.DROP : 1;
        osc.frequency.setTargetAtTime(pitch * drop + between(-B.WOBBLE, B.WOBBLE), t, B.WOBBLE_EVERY / 3);
      }
      track(osc, NODES.bee, sound);
      return true;
    },

    burner(at, level) {
      if (!(level > 0) || !kit.room(NODES.burner)) return false;
      const R = BURNER;
      const hold = between(R.HOLD[0], R.HOLD[1]);
      const lit = at + R.ATTACK;
      const dying = lit + hold;
      const end = dying + R.RELEASE + TAIL;
      const sound = outlet(side() * between(0.2, 0.6)); // one of the balloons, ahead to one side
      const env = sound.into.gain;
      const peak = R.LEVEL * level;
      env.setValueAtTime(0, at);
      env.linearRampToValueAtTime(peak, lit);
      for (let t = lit + 0.15; t < dying; t += 0.15) env.linearRampToValueAtTime(peak * (1 - R.FLICKER * kit.random()), t);
      env.linearRampToValueAtTime(peak, dying);
      env.exponentialRampToValueAtTime(peak * 0.001, dying + R.RELEASE);
      env.linearRampToValueAtTime(0, end);
      const src = parts.source(kit.noise, at, end);
      src.connect(parts.filter('bandpass', R.BAND, 0.7, parts.filter('lowpass', R.LOW, 0.7, sound.into)));
      track(src, NODES.burner, sound);
      return true;
    },

    sleigh(at, level) {
      if (!(level > 0) || !kit.room(NODES.sleigh)) return false;
      const S = SLEIGH;
      // The trot: pairs of shakes, the sleigh passing by (loudest in the middle).
      const shakes = [];
      const pairs = Math.floor(between(S.PAIRS[0], S.PAIRS[1] + 1));
      let t = at;
      for (let i = 0; i < pairs; i++) {
        const near = Math.sin((Math.PI * (i + 0.5)) / pairs);
        shakes.push({ t, loud: near }, { t: t + S.PAIR, loud: near * 0.75 });
        t += between(S.STRIDE[0], S.STRIDE[1]);
      }
      const end = shakes[shakes.length - 1].t + S.RING[1] + 0.05 + TAIL;
      const from = side() * S.SWEEP;
      const sound = outlet(from);
      if (sound.joint !== out) {
        sound.joint.pan.setValueAtTime(from, at);
        sound.joint.pan.linearRampToValueAtTime(-from, end);
      }
      sound.into.gain.value = S.LEVEL * level;
      const high = parts.filter('highpass', S.HIGH, 0.7, sound.into);
      const ring = (env, strength) => {
        for (const shake of shakes) {
          const hit = shake.t + kit.random() * S.JITTER;
          const peak = strength * shake.loud * between(0.6, 1);
          env.gain.setValueAtTime(0, hit);
          env.gain.linearRampToValueAtTime(peak, hit + 0.002);
          env.gain.exponentialRampToValueAtTime(peak * 0.01, hit + between(S.RING[0], S.RING[1]));
        }
        env.gain.linearRampToValueAtTime(0, end);
      };
      for (const pitch of S.BELLS) {
        const env = parts.gain(0, high);
        ring(env, 1);
        parts.tone('sine', pitch * (1 + (kit.random() * 2 - 1) * S.DETUNE), env, at, end);
      }
      const rattle = parts.gain(0, high);
      ring(rattle, S.RATTLE);
      const src = parts.source(kit.noise, at, end);
      src.connect(parts.filter('highpass', S.RATTLE_HIGH, 0.7, rattle));
      track(src, NODES.sleigh, sound);
      return true;
    },

    chime(at, level) {
      if (!(level > 0) || !kit.room(NODES.chime)) return false;
      const C = CHIME;
      const strikes = [];
      for (let i = 0; i < C.STRIKES; i++) strikes.push(at + i * C.EVERY);
      const end = strikes[strikes.length - 1] + CHIME_RING + TAIL;
      const sound = outlet(C.PAN);
      sound.into.gain.value = C.LEVEL * level;
      const far = parts.filter('lowpass', C.FAR, 0.7, sound.into);
      let hum = null;
      for (const partial of C.PARTIALS) {
        const env = parts.gain(0, far);
        const tau = toSilence(partial.decay);
        let ringing = 0; // the partial's level as the strike lands, still ringing from the one before
        let struck = -Infinity;
        for (const t of strikes) {
          ringing = struck > -Infinity ? fallen(ringing, t - struck, tau) : 0;
          env.gain.setValueAtTime(ringing, t);
          env.gain.linearRampToValueAtTime(partial.gain, t + C.ATTACK);
          env.gain.setTargetAtTime(0, t + C.ATTACK, tau);
          ringing = partial.gain;
          struck = t + C.ATTACK;
        }
        const osc = parts.tone('sine', C.NOTE * partial.ratio, env, at, end);
        if (!hum) hum = osc;
      }
      track(hum, NODES.chime, sound);
      return true;
    },
  };
}
