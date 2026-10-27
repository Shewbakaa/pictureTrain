// Each zone's bed: the soft, continuous sound under its scene. A light breeze over the spring meadow, waves rolling
// in and out at the summer beach, leaves rustling in gusts in the autumn forest, a muffled wind over the winter
// hills, and crickets in the evening town. The random events over them (birds, a gull, sleigh bells...) are in
// natureSounds.js; ambience.js decides which beds play and how loud.
//
// A bed is made of a few nodes that stay in place while its zone is near, into a `fade` gain on the ambience bus
// that ambience.js moves with the zone's weight. Nothing in it repeats exactly: its tick() books the next few
// moments of its life (the breeze's next gust, the next wave, the next chirp) a little ahead of the context's
// clock, each drawn at random from the kit's seeded random numbers. Booked ahead in the context's time, they pause
// with it when the sound is held, and pick up where they were.
//
// The levels are set for the mix after the master chain and measured there offline
// (tests/e2e/ambienceLevels.spec.js): each bed comes to about −36 dBFS RMS at full weight, well under the music,
// and the crickets about 6 dB under that, because their high tones carry.

import { voiceParts } from './voiceParts.js';

/**
 * The spring breeze: noise under a lowpass whose cutoff wanders (LOW), above a highpass, its level drifting between
 * gusts (GUST, shares of LEVEL) that come every EVERY seconds and ease in over EASE seconds (time constants).
 */
const BREEZE = { LEVEL: 0.05, LOW: [450, 1000], HIGH: 90, GUST: [0.45, 1], EVERY: [1.5, 3.5], EASE: [0.8, 1.6] };

/**
 * The summer waves: noise under a lowpass, one wave every PERIOD seconds. Each builds for BUILD of its period from
 * the TROUGH (a share of its PEAK at LEVEL) as its cutoff opens, breaks over BREAK with the cutoff wide open
 * (CUT.crest: the hiss of the foam), then washes back to the trough over the rest. The sea's side follows her
 * view: the pan moves there with PAN_EASE (a time constant, s), for any move of at least PAN_STEP.
 */
const WAVES = {
  LEVEL: 0.066, TROUGH: 0.16, PEAK: [0.7, 1], PERIOD: [8, 10], BUILD: 0.42, BREAK: 0.1,
  CUT: { trough: 320, build: 750, crest: [2000, 2900] }, Q: 0.5, PAN_EASE: 0.25, PAN_STEP: 0.02,
};

/**
 * The autumn leaves: the dust's crackles with a little hiss (HISS) through a bandpass, rustling at CALM between
 * gusts. A gust rises (RISE, a time constant) to GUST, holds HOLD seconds and falls (FALL), every EVERY seconds.
 */
const LEAVES = {
  LEVEL: 0.105, HISS: 0.3, FREQ: 3000, Q: 0.7, HIGH: 1200, CALM: 0.2, GUST: [0.65, 1], EVERY: [3.5, 8],
  RISE: 0.35, HOLD: [0.6, 1.4], FALL: 0.7, FIRST: [0.5, 2.5],
};

/** The winter wind: muffled noise, its hollow (a bandpass, FREQ) and its level drifting slowly, as the breeze's. */
const WIND = { LEVEL: 0.086, FREQ: [260, 620], Q: 1.6, LOW: 1100, GUST: [0.4, 1], EVERY: [2.5, 5], EASE: [1.2, 2.2] };

/**
 * The evening crickets: a few of them, each a pure tone chirping in quick pulses (PULSE_ON on, PULSE_OFF off: about
 * 30 a second) a few at a time, every `period` seconds give or take JITTER, now and then resting (REST_CHANCE of a
 * chirp is followed by a rest of REST seconds). `level` is each one's loudness (the faint one is further off).
 */
const CRICKETS = {
  VOICES: [
    { freq: 4520, pulses: 3, period: 0.58, level: 1, pan: -0.45 },
    { freq: 4180, pulses: 4, period: 0.83, level: 0.8, pan: 0.5 },
    { freq: 4890, pulses: 3, period: 0.47, level: 0.45, pan: 0.1 },
  ],
  LEVEL: 0.0188, PULSE_ON: 0.022, PULSE_OFF: 0.012, FADE_PULSE: 0.12, JITTER: 0.06, REST_CHANCE: 0.04, REST: [1.5, 4],
  SOFTER: 0.8, CURVE_POINTS: 64,
};

/** Nothing is booked sooner than this after the context's clock (s). */
const LEAD = 0.02;

/**
 * @typedef {{
 *   fade: GainNode, tick: (until: number) => void, setPan: (pan: number) => void, waveAt: (time: number) => number,
 *   free: () => void,
 * }} Bed
 *   `fade` is the bed's level on the ambience bus (0 to 1: ambience.js sets it from the zone's weight); `tick`
 *   books its sound up to context time `until`; `setPan` places it (only the waves move); `waveAt` is how many
 *   waves have come by context time `time`, its fraction how far into the one then (NaN for a bed of no waves, or a
 *   time no wave is booked for: the sea's waves keep time with it, seaWaves.js); `free` stops it for good and gives
 *   its nodes back to the kit's budget.
 */

/** The zones that have a bed. */
export const BED_ZONES = Object.freeze(['spring', 'summer', 'autumn', 'winter', 'evening']);

/**
 * The most audio nodes each zone's bed is made of (with its stereo pans: one fewer for each where the browser has
 * none). A bed holds them in the kit's node budget for as long as it stays.
 */
export const BED_NODES = Object.freeze({ spring: 5, summer: 5, autumn: 7, winter: 5, evening: 10 });

/**
 * `zone`'s bed on `kit`, silent until its `fade` is raised, holding its nodes in the kit's budget; null, making
 * nothing, while the budget has no room for it.
 * @param {import('./sfx.js').Kit} kit
 * @param {string} zone
 * @returns {Bed|null}
 */
export function createBed(kit, zone) {
  if (!kit.room(BED_NODES[zone] || 0)) return null;
  const parts = voiceParts(kit);
  const fade = parts.gain(0, kit.buses.ambience);
  const between = ([low, high]) => low + kit.random() * (high - low);
  const now = () => kit.ctx.currentTime;
  const sources = [];
  const bed = {
    fade,
    tick() {},
    setPan() {},
    waveAt: () => NaN,
    free() {
      for (const source of sources) source.stop(now());
      fade.disconnect();
      kit.release(held);
    },
  };
  const build = { spring: breeze, summer: waves, autumn: leaves, winter: wind, evening: crickets }[zone];
  if (build) build();
  const held = parts.made; // no more than BED_NODES[zone], which there was room for
  kit.hold(held);
  return bed;

  /** The shared noise, from now on, into `into`. */
  function noiseInto(into) {
    const src = parts.source(kit.noise, now());
    src.connect(into);
    sources.push(src);
  }

  /** The level `gust` and the filter setting `param` wander: a new aim every S.EVERY seconds, eased into. */
  function drift(gust, param, S, range) {
    let next = now();
    bed.tick = (until) => {
      while (next < until) {
        const at = Math.max(next, now() + LEAD);
        gust.gain.setTargetAtTime(S.LEVEL * between(S.GUST), at, between(S.EASE));
        param.setTargetAtTime(between(range), at, between(S.EASE));
        next = at + between(S.EVERY);
      }
    };
  }

  function breeze() {
    const gust = parts.gain(BREEZE.LEVEL * 0.7, fade);
    const low = parts.filter('lowpass', 700, 0.5, parts.filter('highpass', BREEZE.HIGH, 0.7, gust));
    noiseInto(low);
    drift(gust, low.frequency, BREEZE, BREEZE.LOW);
  }

  function wind() {
    const gust = parts.gain(WIND.LEVEL * 0.7, fade);
    const hollow = parts.filter('bandpass', 400, WIND.Q, parts.filter('lowpass', WIND.LOW, 0.7, gust));
    noiseInto(hollow);
    drift(gust, hollow.frequency, WIND, WIND.FREQ);
  }

  function waves() {
    const W = WAVES;
    const pan = parts.pan(0, fade);
    const swell = parts.gain(W.LEVEL * W.TROUGH, pan);
    const low = parts.filter('lowpass', W.CUT.trough, W.Q, swell);
    noiseInto(low);
    let next = now() + LEAD;
    let lastPan = NaN;
    const booked = []; // the last few waves booked: { count, start, end }, oldest first
    let count = 0;
    bed.waveAt = (time) => {
      for (const wave of booked) {
        if (time >= wave.start && time < wave.end) return wave.count + (time - wave.start) / (wave.end - wave.start);
      }
      return NaN;
    };
    bed.tick = (until) => {
      if (next >= until) return;
      const start = Math.max(next, now() + LEAD);
      const period = between(W.PERIOD);
      const peak = W.LEVEL * between(W.PEAK);
      const built = start + W.BUILD * period;
      const broken = built + W.BREAK * period;
      const end = start + period;
      swell.gain.setValueAtTime(W.LEVEL * W.TROUGH, start);
      swell.gain.exponentialRampToValueAtTime(peak * 0.5, built);
      swell.gain.exponentialRampToValueAtTime(peak, broken);
      swell.gain.exponentialRampToValueAtTime(W.LEVEL * W.TROUGH, end);
      low.frequency.setValueAtTime(W.CUT.trough, start);
      low.frequency.exponentialRampToValueAtTime(W.CUT.build, built);
      low.frequency.exponentialRampToValueAtTime(between(W.CUT.crest), broken);
      low.frequency.exponentialRampToValueAtTime(W.CUT.trough, end);
      booked.push({ count: count++, start, end });
      if (booked.length > 3) booked.shift();
      next = end;
    };
    if (pan !== fade) {
      bed.setPan = (value) => {
        if (Math.abs(value - lastPan) < W.PAN_STEP) return;
        lastPan = value;
        pan.pan.setTargetAtTime(value, now(), W.PAN_EASE);
      };
    }
  }

  function leaves() {
    const L = LEAVES;
    const gust = parts.gain(L.LEVEL * L.CALM, fade);
    const band = parts.filter('bandpass', L.FREQ, L.Q, parts.filter('highpass', L.HIGH, 0.7, gust));
    const dust = parts.source(kit.dust, now());
    dust.connect(band);
    sources.push(dust);
    noiseInto(parts.gain(L.HISS, band));
    let next = now() + between(L.FIRST);
    bed.tick = (until) => {
      while (next < until) {
        const at = Math.max(next, now() + LEAD);
        const hold = between(L.HOLD);
        gust.gain.setTargetAtTime(L.LEVEL * between(L.GUST), at, L.RISE);
        gust.gain.setTargetAtTime(L.LEVEL * L.CALM, at + 2.5 * L.RISE + hold, L.FALL);
        next = at + 2.5 * L.RISE + hold + between(L.EVERY);
      }
    };
  }

  function crickets() {
    const C = CRICKETS;
    const length = (pulses) => pulses * (C.PULSE_ON + C.PULSE_OFF);
    const voices = C.VOICES.map((v) => {
      const chirp = parts.gain(0, parts.pan(v.pan, fade));
      sources.push(parts.tone('sine', v.freq, chirp, now()));
      const level = C.LEVEL * v.level;
      return {
        chirp, period: v.period, length: length(v.pulses),
        curves: [chirpCurve(v.pulses, level), chirpCurve(v.pulses, level * C.SOFTER)],
        next: now() + kit.random() * v.period, end: 0,
      };
    });
    bed.tick = (until) => {
      for (const v of voices) {
        while (v.next < until) {
          // A curve may not overlap another on the same gain: each chirp starts after the last has ended.
          const at = Math.max(v.next, now() + LEAD, v.end + LEAD);
          v.chirp.gain.setValueCurveAtTime(v.curves[kit.random() < 0.5 ? 0 : 1], at, v.length);
          v.end = at + v.length;
          const rest = kit.random() < C.REST_CHANCE ? between(C.REST) : 0;
          v.next = at + v.period * (1 + (kit.random() * 2 - 1) * C.JITTER) + rest;
        }
      }
    };
  }
}

/**
 * One chirp's level over its `pulses` pulses (a smooth bump each, every later one a little softer), peaking at
 * `level`, as a curve for setValueCurveAtTime. It ends at 0, which the gain then holds until the next chirp.
 */
function chirpCurve(pulses, level) {
  const C = CRICKETS;
  const curve = new Float32Array(C.CURVE_POINTS);
  const every = C.PULSE_ON + C.PULSE_OFF;
  const length = pulses * every;
  for (let i = 0; i < curve.length; i++) {
    const t = (i / (curve.length - 1)) * length;
    const k = Math.min(Math.floor(t / every), pulses);
    const into = t - k * every;
    const bump = k < pulses && into < C.PULSE_ON ? Math.sin((Math.PI * into) / C.PULSE_ON) ** 2 : 0;
    curve[i] = level * bump * (1 - C.FADE_PULSE * k);
  }
  return curve;
}
