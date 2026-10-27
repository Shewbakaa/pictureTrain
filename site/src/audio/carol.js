// The winter carol: Silent Night (Franz Gruber, 1818, public domain), written out for the built-in tune's
// instruments (music.js): the melody on the music-box bell, a pad holding each bar's chord, and a soft bass rocking
// between root and fifth, in 6/8 at a slow lilt and in the tune's key, F major. It is the winter hills' music,
// played faintly (her own song, when there is one, carries on through winter instead), and dips with the music of
// the scenes either side across their boundaries (zoneMusic.js pieceShare), so two melodies never clash.
//
// Pure and DOM-free, so the Node unit tests can import it.

import { createRng } from '../util/rng.js';
import { clamp } from '../util/math.js';

export const CAROL = Object.freeze({
  BPM: 48,   // dotted quarters a minute: two lilting beats to the bar, slow
  KEY: 65,   // F4, the key note (MIDI); the tune is in F major too
  LEVEL: 0.6, // the carol's level against the tune's (the music bus sets both): it plays faintly, 3 dB under
});

/**
 * The melody, bar by bar: each note's step above the key note (semitones) and its length in eighth notes, six to a
 * bar. The words are there to find one's place.
 */
const MELODY = [
  [[7, 1.5], [9, 0.5], [7, 1], [4, 3]], // Si-lent night,
  [[7, 1.5], [9, 0.5], [7, 1], [4, 3]], // ho-ly night,
  [[14, 2], [14, 1], [11, 3]], // all is calm,
  [[12, 2], [12, 1], [7, 3]], // all is bright
  [[9, 2], [9, 1], [12, 1.5], [11, 0.5], [9, 1]], // 'round yon vir-gin
  [[7, 1.5], [9, 0.5], [7, 1], [4, 3]], // mo-ther and child.
  [[9, 2], [9, 1], [12, 1.5], [11, 0.5], [9, 1]], // Ho-ly in-fant so
  [[7, 1.5], [9, 0.5], [7, 1], [4, 3]], // ten-der and mild,
  [[14, 2], [14, 1], [17, 1.5], [14, 0.5], [11, 1]], // sleep in hea-ven-ly
  [[12, 3], [16, 3]], // peace,
  [[12, 1.5], [7, 0.5], [4, 1], [7, 1.5], [5, 0.5], [2, 1]], // sleep in hea-ven-ly
  [[0, 6]], // peace.
];

/** The chords under it: I (F), IV (B♭) and V (C), each a pitch-class triad, one or two to a bar. */
const F = [5, 9, 0];
const B_FLAT = [10, 2, 5];
const C = [0, 4, 7];
const CHORDS = [[F], [F], [C], [F], [B_FLAT], [F], [B_FLAT], [F], [C], [F], [F, C], [F]];

/** Bars of the melody that swell a little (the climb to "sleep in heavenly peace") or settle (the last line). */
const SHAPE = [1, 1, 1.04, 1, 1, 0.97, 1, 0.97, 1.08, 1.06, 0.95, 0.9];

/** A breath of one bar, the home chord alone, before the carol begins again. */
const BREATH_BARS = 1;

/** Pad chords sit in the octave from MIDI E3 (52), like the tune's; the bass in octave 2 (C2 to B2). */
const PAD_LOW = 52;
const BASS_LOW = 36;

/** @typedef {import('./compose.js').Note} Note */

/**
 * Writes the carol out, the same each time.
 * @returns {{ lengthSec: number, notes: Note[] }}  as composeLoop's: notes sorted by start time `t` (s from the
 *   loop's start), each starting and ending inside the loop
 */
export function composeCarol() {
  const rng = createRng(1818);
  const eighth = 60 / CAROL.BPM / 3;
  const barLen = 6 * eighth;
  /** @type {Note[]} */
  const notes = [];
  const jitter = (amount) => (rng() * 2 - 1) * amount;

  MELODY.forEach((line, bar) => {
    const start = bar * barLen;
    let slot = 0; // eighths into the bar
    for (const [step, eighths] of line) {
      // The lilt: the first beat of the bar leans in, the second a little, the notes between are lighter.
      const accent = slot === 0 ? 0.08 : slot === 3 ? 0.04 : -0.04;
      const vel = clamp((0.6 + accent + jitter(0.03)) * SHAPE[bar], 0.3, 0.9);
      notes.push({ t: start + slot * eighth, midi: CAROL.KEY + step, dur: eighths * eighth, vel, voice: 'bell' });
      slot += eighths;
    }
    accompany(notes, CHORDS[bar], start, barLen, 1);
  });
  const breath = MELODY.length * barLen;
  accompany(notes, [F], breath, barLen * BREATH_BARS, 0.7);

  notes.sort((a, b) => a.t - b.t);
  return { lengthSec: breath + barLen * BREATH_BARS, notes };
}

/**
 * The pad and bass for `chords` over `length` seconds from `start`, the chords sharing it equally. The bass takes
 * the root on the first beat and the fifth below on the second, rocking with the lilt; `level` scales them.
 */
function accompany(notes, chords, start, length, level) {
  const span = length / chords.length;
  chords.forEach((chord, i) => {
    const t = start + i * span;
    for (const pc of chord) notes.push({ t, midi: inOctaveFrom(pc, PAD_LOW), dur: span, vel: 0.8 * level, voice: 'pad' });
    const root = inOctaveFrom(chord[0], BASS_LOW);
    const fifth = inOctaveFrom(chord[2], BASS_LOW);
    if (chords.length > 1) {
      notes.push({ t, midi: root, dur: span, vel: 0.75 * level, voice: 'bass' });
    } else {
      notes.push({ t, midi: root, dur: span / 2, vel: 0.75 * level, voice: 'bass' });
      notes.push({ t: t + span / 2, midi: fifth, dur: span / 2, vel: 0.55 * level, voice: 'bass' });
    }
  });
}

/** Pitch class `pc` in the octave starting at MIDI note `low`. */
function inOctaveFrom(pc, low) {
  return low + ((((pc - low) % 12) + 12) % 12);
}
