// The winter carol (site/src/audio/carol.js): Silent Night (Franz Gruber, 1818, public domain) in 6/8, written
// out for the built-in tune's music box, and how it takes over from the tune across the winter boundary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAROL, composeCarol } from '../../site/src/audio/carol.js';
import { pieceShares } from '../../site/src/audio/zoneMusic.js';
import { MUSIC } from '../../site/src/audio/compose.js';

const loop = composeCarol();
const eighth = 60 / CAROL.BPM / 3;
const bar = 6 * eighth;
const bells = loop.notes.filter((n) => n.voice === 'bell');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/**
 * Silent Night as Gruber wrote it, written here on its own to check the score against: each note's step above the
 * key note (semitones) and its length in eighth notes, bar by bar in 6/8.
 */
const SILENT_NIGHT = [
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

test('the opening phrase is Silent Night\'s, note for note and in its rhythm', () => {
  // "Silent night, holy night, all is calm, all is bright": a dotted lilt, then the leap up and the fall home.
  const opening = SILENT_NIGHT.slice(0, 4).flat();
  const heard = bells.slice(0, opening.length);
  heard.forEach((note, i) => {
    const [step, eighths] = opening[i];
    assert.equal(note.midi - CAROL.KEY, step, `note ${i + 1}'s pitch`);
    assert.ok(close(note.dur, eighths * eighth), `note ${i + 1}'s length`);
  });
  assert.equal(heard[0].t, 0, 'it starts on the first beat');
});

test('the whole melody is Silent Night, bar by bar in 6/8', () => {
  const expected = SILENT_NIGHT.flatMap((notes, b) => {
    let at = b * bar;
    return notes.map(([step, eighths]) => {
      const note = { t: at, midi: CAROL.KEY + step, dur: eighths * eighth };
      at += eighths * eighth;
      return note;
    });
  });
  assert.equal(bells.length, expected.length);
  bells.forEach((note, i) => {
    assert.ok(close(note.t, expected[i].t, 1e-6), `note ${i + 1} at ${note.t} (expected ${expected[i].t})`);
    assert.equal(note.midi, expected[i].midi, `note ${i + 1}'s pitch`);
    assert.ok(close(note.dur, expected[i].dur, 1e-6), `note ${i + 1}'s length`);
  });
  for (const notes of SILENT_NIGHT) assert.equal(notes.reduce((sum, [, e]) => sum + e, 0), 6, 'six eighths a bar');
});

test('it is in the tune\'s key, F major, every voice of it', () => {
  assert.equal(CAROL.KEY % 12, 5, 'F');
  for (const note of loop.notes) assert.ok(MUSIC.SCALE_PCS.includes(note.midi % 12), `${note.voice} ${note.midi}`);
});

test('each bar\'s first melody note is a note of the chord under it', () => {
  for (let b = 0; b < SILENT_NIGHT.length; b++) {
    const downbeat = bells.find((n) => close(n.t, b * bar, 1e-6));
    const chord = loop.notes.filter((n) => n.voice === 'pad' && close(n.t, b * bar, 1e-6)).map((n) => n.midi % 12);
    assert.ok(chord.length >= 3, `bar ${b + 1} has a chord`);
    assert.ok(chord.includes(downbeat.midi % 12), `bar ${b + 1}: ${downbeat.midi} over ${chord}`);
  }
});

test('a slow lilt, sorted, and loopable: it ends at home and starts again from there', () => {
  assert.ok(CAROL.BPM >= 40 && CAROL.BPM <= 60, 'dotted quarters a minute: slow');
  for (let i = 1; i < loop.notes.length; i++) assert.ok(loop.notes[i].t >= loop.notes[i - 1].t, 'sorted by time');
  for (const note of loop.notes) {
    assert.ok(note.t >= 0 && note.t < loop.lengthSec, 'starts inside the loop');
    assert.ok(note.t + note.dur <= loop.lengthSec + 1e-9, 'and ends inside it');
    assert.ok(note.vel > 0 && note.vel <= 1);
    assert.ok(['bell', 'pad', 'bass'].includes(note.voice));
  }
  assert.ok(close(loop.lengthSec % bar, 0, 1e-9) || close(loop.lengthSec % bar, bar, 1e-9), 'whole bars');
  assert.ok(loop.lengthSec > SILENT_NIGHT.length * bar, 'a breath before it begins again');
  const last = bells[bells.length - 1];
  assert.equal(last.midi, CAROL.KEY, 'the melody ends on the key note');
  const firstChord = loop.notes.filter((n) => n.voice === 'pad' && n.t === 0).map((n) => n.midi % 12).sort();
  assert.deepEqual(firstChord, [0, 5, 9], 'and the loop starts on the home chord, F major');
});

test('the carol takes over from the tune across the winter boundary, never both at once', () => {
  // The autumn forest without its recording plays the tune: the carol's crossing as it was before the scenes had
  // pieces of their own (zoneMusic.js pieceShares, the same dip at every boundary).
  const carolMix = (w) => {
    const shares = pieceShares({ autumn: 1 - w, winter: w }, {}, {});
    return { tune: shares.tune, carol: shares.winter };
  };
  const mix = carolMix(0);
  assert.equal(mix.tune, 1);
  assert.equal(mix.carol, 0);
  const winter = carolMix(1);
  assert.ok(close(winter.tune, 0) && close(winter.carol, 1));
  let tune = 1;
  let carol = 0;
  for (let w = 0; w <= 1.0001; w += 0.01) {
    const m = carolMix(w);
    assert.ok(m.tune <= tune + 1e-12 && m.carol >= carol - 1e-12, `the tune only fades and the carol only grows (${w})`);
    tune = m.tune;
    carol = m.carol;
    assert.ok(m.tune ** 2 + m.carol ** 2 <= 1 + 1e-9, `together no louder than one alone (${w})`);
    if (m.tune > 0.25 && m.carol > 0.25) assert.fail(`both clearly heard at ${w}`);
  }
  // Outside the middle of the blend only one of them is heard.
  assert.equal(carolMix(0.35).carol, 0);
  assert.equal(carolMix(0.65).tune, 0);
});
