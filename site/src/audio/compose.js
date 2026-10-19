// The built-in tune's score: a sixteen-bar music-box loop in F major, written out note by note from a seed, so it
// sounds the same on every phone and every visit. music.js plays it.
//
// Three voices over the same four chords, I–vi–IV–V, round and round: a pad holding each bar's chord, a soft bass on
// its root every half bar, and a bell melody on top. The melody is four phrases of four bars, A A′ B A″: the second
// and last phrases echo the first, so it is a tune she can recognise rather than a wander, and the last bar ends
// on the V chord, which leads back home to the first.

import { createRng, rngPick } from '../util/rng.js';

/** The tempo, the loop's length in bars, its chords' roots (one a bar, repeating) and the key's pitch classes. */
export const MUSIC = Object.freeze({
  BPM: 68,
  BARS: 16,
  PROGRESSION_ROOTS: Object.freeze([53, 50, 46, 48]), // F3 Dm3 B♭2 C3, I–vi–IV–V
  SCALE_PCS: Object.freeze([5, 7, 9, 10, 0, 2, 4]), // F major: F G A B♭ C D E
});

/** Eighth notes in a bar of 4/4: the melody's grid. */
const SLOTS = 8;

/** The melody's range (MIDI): F4 to F6. */
const MELODY_LOW = 65;
const MELODY_HIGH = 89;

/** Pad notes are voiced in the octave from this note (MIDI E3) up, which keeps the chords close together. */
const PAD_LOW = 52;

/** The bass plays in octave 2 (MIDI C2 to B2). */
const BASS_LOW = 36;

/**
 * Of the melody notes off the downbeat, the share that set out to be chord tones. The rest look for another note of
 * the key a step away (a passing note), and take a chord tone when there is none. With every downbeat a chord
 * tone, about 70% of the melody is chord tones and 30% the key's other notes.
 */
const CHORD_TONE_SHARE = 0.5;

/** The widest leap the melody takes from one note to the next (semitones): a fifth. */
const MAX_LEAP = 7;

/** Where a bar's melody notes fall (eighth-note slots), with rests between. */
const RHYTHMS = [[0, 2, 4, 6], [0, 3, 4, 6], [0, 2, 3, 4, 6], [0, 3, 6], [0, 2, 4, 5, 6], [0, 4, 6], [0, 2, 4]];

/** The last bar of a phrase breathes: fewer notes, the last ringing on. */
const CADENCES = [[0, 4], [0, 2, 4], [0, 3, 4]];

/**
 * The phrases, in order. A phrase with `from` > 0 echoes the first: it copies that many of its opening bars, notes
 * and all, and keeps its rhythm for the rest with new notes. `lift` raises the melody's centre (semitones) and
 * `level` scales its velocities.
 */
const PHRASES = [
  { from: 0, lift: 0, level: 1 }, // A
  { from: 2, lift: 0, level: 0.97 }, // A′: same opening, a new answer
  { from: 0, lift: 4, level: 1.06 }, // B: higher and a touch fuller
  { from: 3, lift: 0, level: 0.95 }, // A″: the opening again, closing softly back to the start
];

/** @typedef {{ t: number, midi: number, dur: number, vel: number, voice: 'bell'|'pad'|'bass' }} Note */

/** The frequency (Hz) of a MIDI note number, A4 (69) being 440 Hz. */
export function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

/**
 * Writes the loop out.
 * @param {{ seed?: number }} [options]
 * @returns {{ lengthSec: number, notes: Note[] }}  notes sorted by start time `t` (s from the loop's start), all
 *   starting inside the loop; `dur` is how long a note is held (s), `vel` its loudness in (0, 1]
 */
export function composeLoop({ seed = 11 } = {}) {
  const rng = createRng(seed);
  const barLen = (4 * 60) / MUSIC.BPM;
  const eighth = barLen / SLOTS;
  /** @type {Note[]} */
  const notes = [];
  const jitter = (amount) => (rng() * 2 - 1) * amount;

  // Pads and bass: the bar's chord, held, and its root on beats one and three.
  for (let bar = 0; bar < MUSIC.BARS; bar++) {
    const t = bar * barLen;
    const root = MUSIC.PROGRESSION_ROOTS[bar % MUSIC.PROGRESSION_ROOTS.length];
    const padVel = 0.85 + jitter(0.05);
    for (const pc of triad(root)) notes.push({ t, midi: inOctaveFrom(pc, PAD_LOW), dur: barLen, vel: padVel, voice: 'pad' });
    const bass = inOctaveFrom(root % 12, BASS_LOW);
    notes.push({ t, midi: bass, dur: barLen / 2, vel: 0.85 + jitter(0.03), voice: 'bass' });
    notes.push({ t: t + barLen / 2, midi: bass, dur: barLen / 2, vel: 0.72 + jitter(0.03), voice: 'bass' });
  }

  // The melody, phrase by phrase. A phrase is one pass of the progression, so the first phrase's notes fit the
  // same bars of every other phrase.
  const barsPerPhrase = MUSIC.PROGRESSION_ROOTS.length;
  /** @type {Array<Array<{ slot: number, midi: number }>>} */
  let first = [];
  let prev = rngPick(rng, [69, 72, 77]); // A4, C5 or F5 to start
  const opening = prev;
  PHRASES.forEach((phrase, p) => {
    const bars = [];
    for (let b = 0; b < barsPerPhrase; b++) {
      const bar = p * barsPerPhrase + b;
      const root = MUSIC.PROGRESSION_ROOTS[b];
      const lastBarOfLoop = bar === MUSIC.BARS - 1;
      let line;
      if (b < phrase.from) {
        line = first[b];
      } else {
        const slots = phrase.from > 0 ? first[b].map((n) => n.slot) : rngPick(rng, b === barsPerPhrase - 1 ? CADENCES : RHYTHMS);
        line = slots.map((slot, i) => {
          const pos = (b + slot / SLOTS) / barsPerPhrase;
          // The melody rises through a phrase and settles at its end; the loop's last note heads for its first.
          let target = 72 + phrase.lift + 5 * Math.sin(Math.PI * pos);
          if (lastBarOfLoop && i === slots.length - 1) target = opening;
          const chordTone = slot === 0 || (lastBarOfLoop && i === slots.length - 1) || rng() < CHORD_TONE_SHARE;
          prev = pickPitch(rng, prev, target, chordTone ? chordTones(root) : passingTones(root, prev) || chordTones(root));
          return { slot, midi: prev };
        });
      }
      prev = line[line.length - 1].midi;
      bars.push(line);
      line.forEach(({ slot, midi }, i) => {
        const next = i + 1 < line.length ? line[i + 1].slot : SLOTS;
        const accent = slot === 0 ? 0.08 : slot === 4 ? 0.04 : slot % 2 === 1 ? -0.04 : 0;
        const vel = Math.min(0.9, Math.max(0.35, (0.62 + accent + jitter(0.05)) * phrase.level));
        notes.push({ t: bar * barLen + slot * eighth, midi, dur: (next - slot) * eighth, vel, voice: 'bell' });
      });
    }
    if (p === 0) first = bars;
  });

  notes.sort((a, b) => a.t - b.t);
  return { lengthSec: MUSIC.BARS * barLen, notes };
}

/** The pitch classes of the key's triad on `root`: root, third and fifth. */
function triad(root) {
  const scale = MUSIC.SCALE_PCS;
  const degree = scale.indexOf(root % 12);
  return [0, 2, 4].map((step) => scale[(degree + step) % scale.length]);
}

/** Pitch class `pc` in the octave starting at MIDI note `low`. */
function inOctaveFrom(pc, low) {
  return low + ((((pc - low) % 12) + 12) % 12);
}

/** Every note of the melody's range in the chord on `root`. */
function chordTones(root) {
  const pcs = triad(root);
  return melodyRange().filter((m) => pcs.includes(m % 12));
}

/**
 * The other notes of the key a step (one or two semitones) from `prev`, leaving out any a semitone above a chord
 * tone (B♭ over F, say), which would rub against the pad. Null if there are none.
 */
function passingTones(root, prev) {
  const pcs = triad(root);
  const tones = melodyRange().filter((m) => {
    const pc = m % 12;
    const step = Math.abs(m - prev);
    return step >= 1 && step <= 2 && MUSIC.SCALE_PCS.includes(pc) && !pcs.includes(pc) && !pcs.includes((pc + 11) % 12);
  });
  return tones.length ? tones : null;
}

function melodyRange() {
  const range = [];
  for (let m = MELODY_LOW; m <= MELODY_HIGH; m++) range.push(m);
  return range;
}

/**
 * One of `pool`, no further than MAX_LEAP from `prev` when it can be, weighted towards a small step and towards
 * `target`; a repeated note is less likely.
 */
function pickPitch(rng, prev, target, candidates) {
  const near = candidates.filter((m) => Math.abs(m - prev) <= MAX_LEAP);
  const pool = near.length ? near : candidates;
  const weights = pool.map((m) => {
    const step = Math.abs(m - prev);
    return (step === 0 ? 0.15 : 1) * Math.exp(-step / 3) * Math.exp(-((m - target) ** 2) / 32);
  });
  let r = rng() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
