// The finale's foley, the little real-world sounds of the two of them meeting on the platform: the station bell as
// the train pulls in, a whoosh as she hops down from the carriage, a light tap and a rustle of her dress as she lands
// on the wooden platform, the station house door creaking open with the jingle of its little shop bell, his footsteps
// on the boards, two heartbeats as they face each other, the bouquet's paper crinkling as he holds it out, and doves
// flying off the station roof as the fireworks go up. finale/foleyTiming.js says when; cueSounds.js plays them.
//
// Each is a few oscillators or the kit's shared noise and dust through filters, played into the output it is given
// (the finale's own bus, which Ride again hushes at once) from context time `at`, at `level` (0 to 1). Each returns
// false, playing nothing, at no level or when the kit's node budget has no room for it, and counts its nodes in the
// budget (NODES) until it ends.
//
// The levels are set for the mix after the master chain and measured there offline
// (tests/e2e/finaleFoleyLevels.spec.js): the station bell peaks about −22 dBFS, the shop bell about −26, and the rest
// about −30: soft, under the music, the whistle and the fireworks.

import { fallen, voiceParts } from './voiceParts.js';
import { STATION_BELL } from './sfxTiming.js';
import { FOLEY } from '../finale/foleyTiming.js';

/**
 * A small bell's partials: ratios of its NOTE, each with its share of the strike and its own decay (s, to −60 dB),
 * the fundamental ringing longest. A strike rises over ATTACK; one that lands while the bell still rings starts from
 * where its ring has fallen to.
 * @typedef {{ ratio: number, gain: number, decay: number }} Partial
 */

/**
 * The platform bell: two strikes STATION_BELL.APART apart, the second SECOND as hard, of a small brass bell on C6
 * (in the whistle's F major), a little to the station house's side (PAN).
 */
const BELL = {
  LEVEL: 0.0181, NOTE: 1046.5, ATTACK: 0.002, SECOND: 0.8, PAN: 0.2,
  PARTIALS: [
    { ratio: 1, gain: 1, decay: 1.4 },
    { ratio: 2.01, gain: 0.4, decay: 0.9 },
    { ratio: 2.76, gain: 0.3, decay: 0.6 },
    { ratio: 5.4, gain: 0.12, decay: 0.3 },
  ],
};

/**
 * The shop bell over the station house door: a tiny bell on a spring (F7), struck as the door swings into it and
 * bouncing back a few times, lighter each time (SHAKES: when, s, and how hard), give or take JITTER.
 */
const JINGLE = {
  LEVEL: 0.0102, NOTE: 2793.8, ATTACK: 0.0015, PAN: 0.3, JITTER: 0.008,
  PARTIALS: [
    { ratio: 1, gain: 1, decay: 0.45 },
    { ratio: 1.47, gain: 0.55, decay: 0.3 },
    { ratio: 2.09, gain: 0.35, decay: 0.2 },
  ],
  SHAKES: [[0, 1], [0.07, 0.65], [0.13, 0.5], [0.2, 0.32], [0.28, 0.18]],
};

/**
 * A step on the wooden platform: a soft, low thud (a sine dropping from THUD to THUD_TO Hz) with the board's hollow
 * knock (noise through a bandpass at KNOCK) and a little click of the heel (noise above CLICK), each dying away over
 * its own decay (s, to −60 dB). His are heavier and lower; hers, the tap as she lands from her hop, lighter. Each
 * step varies a little (VARY) in pitch and weight.
 */
const STEP = {
  his: {
    LEVEL: 0.0105, THUD: 125, THUD_TO: 82, THUD_DECAY: 0.11, KNOCK: 650, KNOCK_Q: 1.6, KNOCK_DECAY: 0.05, KNOCK_GAIN: 0.55,
    CLICK: 3200, CLICK_DECAY: 0.014, CLICK_GAIN: 0.22, VARY: 0.12,
  },
  hers: {
    LEVEL: 0.0092, THUD: 185, THUD_TO: 120, THUD_DECAY: 0.08, KNOCK: 900, KNOCK_Q: 1.6, KNOCK_DECAY: 0.04, KNOCK_GAIN: 0.6,
    CLICK: 3800, CLICK_DECAY: 0.012, CLICK_GAIN: 0.3, VARY: 0.05,
  },
};

/**
 * A heartbeat: a low "lub" and FOLEY.HEART.DUB later a softer, a little higher "dub" (DUB_SHARE), each a thump of a
 * triangle under a lowpass (LOW), its pitch sagging from the first number of LUB or DUB to the second, rising over
 * ATTACK and gone RING seconds after it began. Felt more than heard.
 */
const HEART = { LEVEL: 0.0118, LUB: [56, 46], DUB: [64, 52], DUB_SHARE: 0.7, ATTACK: 0.012, LUB_RING: 0.15, LOW: 150 };

/**
 * Her hop: a breath of noise through a bandpass that sweeps from FROM up to PEAK Hz as she rises (RISE of her time in
 * the air) and down to TO as she comes down, swelling with it and gone as she lands.
 */
const WHOOSH = { LEVEL: 0.0141, FROM: 450, PEAK: 1400, TO: 650, Q: 0.9, RISE: 0.4 };

/**
 * A brush of fabric or paper: noise (HISS of it) and the dust's crackles (DUST of them) through a highpass (HIGH)
 * and a bandpass (BAND), swelling in GRAINS (start s, level) over LENGTH. Her dress as she lands is soft and
 * smooth; the bouquet's paper as he holds it out crisp and crackling.
 */
const BRUSH = {
  dress: {
    LEVEL: 0.0119, LENGTH: 0.3, BAND: 2200, Q: 0.8, HIGH: 900, HISS: 1, DUST: 0,
    GRAINS: [[0, 0], [0.025, 0.7], [0.08, 0.35], [0.13, 1], [0.2, 0.45], [0.3, 0]],
  },
  crinkle: {
    LEVEL: 0.0191, LENGTH: 0.6, BAND: 4200, Q: 0.7, HIGH: 2500, HISS: 0.3, DUST: 1,
    GRAINS: [[0, 0], [0.03, 0.8], [0.09, 0.45], [0.16, 1], [0.25, 0.55], [0.33, 0.9], [0.42, 0.4], [0.5, 0.6], [0.6, 0]],
  },
};

/**
 * The station house door's creak: a soft triangle squeak whose pitch rises from FROM to TO as the door swings, its
 * hinge rubbing (an FM wobble DEPTH Hz deep at a RUB rate of the first number rising to the second) under a lowpass
 * (LOW), swelling over ATTACK and fading by LENGTH. Gentle: a well-loved door.
 */
const CREAK = { LEVEL: 0.0116, FROM: 420, TO: 640, LENGTH: 0.55, ATTACK: 0.07, RUB: [26, 40], DEPTH: 60, LOW: 1800, PAN: 0.3 };

/**
 * Doves flying off the station roof: COUNT of them, each setting off AFTER seconds after the first, beating its wings
 * BEATS times (between the two numbers), RATE a second at first and slowing to SLOW of that, each beat a puff of noise
 * through the dove's own bandpass (BAND, between the two numbers) BEAT seconds long. The first beats clap; each one
 * after is FADE softer as they fly off, from over the station house (PAN's first number) away to one side.
 */
const DOVES = {
  LEVEL: 0.0173, COUNT: 3, AFTER: [0, 0.09, 0.2], BEATS: [8, 11], RATE: 9, SLOW: 0.7, BAND: [850, 1500], Q: 0.9,
  BEAT: 0.06, FADE: 0.15, PAN: [0.15, 0.6],
};

/** How long each bell rings after its last strike: its longest-ringing partial's decay (s). */
const BELL_RING = Math.max(...BELL.PARTIALS.map((p) => p.decay));
const JINGLE_RING = Math.max(...JINGLE.PARTIALS.map((p) => p.decay));

/** Every envelope closes with a ramp this long (s) down to exactly zero before its sources stop. */
const TAIL = 0.02;

/** How many audio nodes each sound holds while it plays, counted against the kit's budget. */
const NODES = Object.freeze({
  bell: 2 * BELL.PARTIALS.length + 2,
  'shop-bell': 2 * JINGLE.PARTIALS.length + 2,
  step: 8,
  land: 8,
  heartbeat: 3,
  hop: 3,
  dress: 4,
  crinkle: 6,
  door: 6,
  doves: 1 + 2 * DOVES.COUNT + 1,
});

/** The names of the finale's foley voices, as cueSounds.js plays them. */
export const FOLEY_NAMES = Object.freeze(Object.keys(NODES));

const toSilence = (decay) => decay / Math.log(1000);

/**
 * The finale's foley voices on `kit`, into `out`, by cue name: each `(at, level)` returns false, playing nothing, at
 * no level or when the kit's node budget has no room for it. Exported so they can be rendered offline.
 * @param {import('./sfx.js').Kit} kit
 * @param {AudioNode} out  the finale's own bus (cueSounds.js), or any node in an offline render
 * @returns {Record<string, (at: number, level?: number) => boolean>}
 */
export function createFoleySounds(kit, out) {
  const parts = voiceParts(kit);
  const between = (low, high) => low + kit.random() * (high - low);

  /** A sound's output, panned to `pan`: the gain to feed (at `level`), and the node joining it to `out`. */
  function outlet(pan, level) {
    const joint = parts.pan(pan, out);
    return { into: parts.gain(level, joint), joint };
  }
  const joining = ({ into, joint }) => (joint === out ? into : joint);

  /**
   * A bell's `partials` of `note` struck at each of `strikes` ([time, strength]) into `into`, from `at` until `end`.
   * Returns one of its oscillators (they all stop at `end`).
   */
  function ring(partials, note, attack, strikes, into, at, end) {
    let osc = null;
    for (const partial of partials) {
      const env = parts.gain(0, into);
      const tau = toSilence(partial.decay);
      let ringing = 0;
      let struck = -Infinity;
      for (const [t, strength] of strikes) {
        ringing = struck > -Infinity ? fallen(ringing, t - struck, tau) : 0;
        env.gain.setValueAtTime(ringing, t);
        env.gain.linearRampToValueAtTime(partial.gain * strength, t + attack);
        env.gain.setTargetAtTime(0, t + attack, tau);
        ringing = partial.gain * strength;
        struck = t + attack;
      }
      osc = parts.tone('sine', note * partial.ratio, env, at, end);
    }
    return osc;
  }

  /** A struck envelope on `param`: from 0 at `t` up to `peak` over `attack`, then down to −60 dB over `decay`. */
  function hit(param, t, peak, attack, decay) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.exponentialRampToValueAtTime(peak * 0.001, t + decay);
    param.linearRampToValueAtTime(0, t + decay + TAIL);
  }

  function step(kind, name) {
    return (at, level = 1) => {
      if (!(level > 0) || !kit.room(NODES[name])) return false;
      const S = STEP[kind];
      const weight = S.LEVEL * level * (1 - S.VARY * kit.random());
      const pitch = 1 + S.VARY * (kit.random() - 0.5);
      const end = at + Math.max(S.THUD_DECAY, S.KNOCK_DECAY, S.CLICK_DECAY) + TAIL;
      const into = parts.gain(weight, out);
      const thud = parts.gain(0, into);
      hit(thud.gain, at, 1, 0.004, S.THUD_DECAY);
      const low = parts.tone('sine', S.THUD * pitch, thud, at, end);
      low.frequency.setValueAtTime(S.THUD * pitch, at);
      low.frequency.exponentialRampToValueAtTime(S.THUD_TO * pitch, at + S.THUD_DECAY * 0.6);
      const knock = parts.gain(0, into);
      hit(knock.gain, at, S.KNOCK_GAIN, 0.002, S.KNOCK_DECAY);
      const click = parts.gain(0, into);
      hit(click.gain, at, S.CLICK_GAIN, 0.001, S.CLICK_DECAY);
      const src = parts.source(kit.noise, at, end);
      src.connect(parts.filter('bandpass', S.KNOCK * pitch, S.KNOCK_Q, knock));
      src.connect(parts.filter('highpass', S.CLICK, 0.7, click));
      kit.track(src, NODES[name], into);
      return true;
    };
  }

  function brush(name) {
    return (at, level = 1) => {
      if (!(level > 0) || !kit.room(NODES[name])) return false;
      const B = BRUSH[name];
      const end = at + B.LENGTH + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      for (const [t, share] of B.GRAINS) if (t > 0) env.gain.linearRampToValueAtTime(B.LEVEL * level * share, at + t);
      const high = parts.filter('highpass', B.HIGH, 0.7, parts.filter('bandpass', B.BAND, B.Q, env));
      const noise = parts.source(kit.noise, at, end);
      if (B.HISS === 1) noise.connect(high);
      else noise.connect(parts.gain(B.HISS, high));
      if (B.DUST > 0) parts.source(kit.dust, at, end).connect(B.DUST === 1 ? high : parts.gain(B.DUST, high));
      kit.track(noise, NODES[name], env);
      return true;
    };
  }

  return {
    bell(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.bell)) return false;
      const B = BELL;
      const second = at + STATION_BELL.APART;
      const end = second + BELL_RING + TAIL;
      const sound = outlet(B.PAN, B.LEVEL * level);
      const osc = ring(B.PARTIALS, B.NOTE, B.ATTACK, [[at, 1], [second, B.SECOND]], sound.into, at, end);
      kit.track(osc, NODES.bell, joining(sound));
      return true;
    },

    'shop-bell'(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES['shop-bell'])) return false;
      const J = JINGLE;
      const shakes = J.SHAKES.map(([t, strength], i) => [at + t + (i > 0 ? kit.random() * J.JITTER : 0), strength]);
      const end = shakes[shakes.length - 1][0] + JINGLE_RING + TAIL;
      const sound = outlet(J.PAN, J.LEVEL * level);
      const osc = ring(J.PARTIALS, J.NOTE * between(0.99, 1.01), J.ATTACK, shakes, sound.into, at, end);
      kit.track(osc, NODES['shop-bell'], joining(sound));
      return true;
    },

    step: step('his', 'step'),
    land: step('hers', 'land'),

    heartbeat(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.heartbeat)) return false;
      const H = HEART;
      const { DUB, RING } = FOLEY.HEART;
      const dub = at + DUB;
      const end = dub + RING;
      const env = parts.gain(0, out);
      const peak = H.LEVEL * level;
      hit(env.gain, at, peak, H.ATTACK, H.LUB_RING - TAIL);
      hit(env.gain, dub, peak * H.DUB_SHARE, H.ATTACK, RING - TAIL);
      const osc = parts.tone('triangle', H.LUB[0], parts.filter('lowpass', H.LOW, 0.7, env), at, end);
      osc.frequency.setValueAtTime(H.LUB[0], at);
      osc.frequency.exponentialRampToValueAtTime(H.LUB[1], at + H.LUB_RING);
      osc.frequency.setValueAtTime(H.DUB[0], dub);
      osc.frequency.exponentialRampToValueAtTime(H.DUB[1], end);
      kit.track(osc, NODES.heartbeat, env);
      return true;
    },

    hop(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.hop)) return false;
      const W = WHOOSH;
      const air = FOLEY.AIRTIME;
      const top = at + air * W.RISE;
      const end = at + air + TAIL;
      const env = parts.gain(0, out);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(W.LEVEL * level, top);
      env.gain.linearRampToValueAtTime(0, at + air);
      const band = parts.filter('bandpass', W.FROM, W.Q, env);
      band.frequency.setValueAtTime(W.FROM, at);
      band.frequency.exponentialRampToValueAtTime(W.PEAK, top);
      band.frequency.exponentialRampToValueAtTime(W.TO, at + air);
      const src = parts.source(kit.noise, at, end);
      src.connect(band);
      kit.track(src, NODES.hop, env);
      return true;
    },

    dress: brush('dress'),
    crinkle: brush('crinkle'),

    door(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.door)) return false;
      const C = CREAK;
      const end = at + C.LENGTH + TAIL;
      const sound = outlet(C.PAN, 0);
      const env = sound.into.gain;
      env.setValueAtTime(0, at);
      env.linearRampToValueAtTime(C.LEVEL * level, at + C.ATTACK);
      env.linearRampToValueAtTime(C.LEVEL * level * 0.7, at + C.LENGTH * 0.6);
      env.linearRampToValueAtTime(0, at + C.LENGTH);
      const squeak = parts.tone('triangle', C.FROM, parts.filter('lowpass', C.LOW, 0.7, sound.into), at, end);
      squeak.frequency.setValueAtTime(C.FROM, at);
      squeak.frequency.linearRampToValueAtTime(C.TO, at + C.LENGTH);
      const rub = parts.tone('sine', C.RUB[0], parts.gain(C.DEPTH, squeak.frequency), at, end);
      rub.frequency.setValueAtTime(C.RUB[0], at);
      rub.frequency.linearRampToValueAtTime(C.RUB[1], at + C.LENGTH);
      kit.track(squeak, NODES.door, joining(sound));
      return true;
    },

    doves(at, level = 1) {
      if (!(level > 0) || !kit.room(NODES.doves)) return false;
      const D = DOVES;
      // Every dove's wingbeats, worked out first so the sound knows when its last one ends.
      const flights = [];
      let end = at;
      for (let d = 0; d < D.COUNT; d++) {
        const beats = Math.floor(between(D.BEATS[0], D.BEATS[1] + 1));
        const times = [];
        let t = at + D.AFTER[d];
        for (let i = 0; i < beats; i++) {
          times.push(t);
          t += (1 / D.RATE) / (1 - (1 - D.SLOW) * (i / (beats - 1)));
        }
        flights.push({ times, band: between(D.BAND[0], D.BAND[1]) });
        end = Math.max(end, times[times.length - 1] + D.BEAT + TAIL);
      }
      const joint = parts.pan(D.PAN[0], out);
      const into = joint === out ? parts.gain(1, out) : joint;
      if (joint !== out) {
        joint.pan.setValueAtTime(D.PAN[0], at);
        joint.pan.linearRampToValueAtTime(D.PAN[1], end);
      }
      const src = parts.source(kit.noise, at, end);
      for (const { times, band } of flights) {
        const env = parts.gain(0, into);
        times.forEach((t, i) => hit(env.gain, t, D.LEVEL * level * (1 - D.FADE) ** i * between(0.8, 1), 0.008, D.BEAT));
        src.connect(parts.filter('bandpass', band, D.Q, env));
      }
      kit.track(src, NODES.doves, into);
      return true;
    },
  };
}
