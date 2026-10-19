import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLoop, MUSIC, midiToFreq } from '../../site/src/audio/compose.js';

const loop = composeLoop();
const barLen = (4 * 60) / MUSIC.BPM;

test('loop length', () => assert.ok(Math.abs(loop.lengthSec - MUSIC.BARS * barLen) < 1e-9));

test('melody stays in F major and range', () => {
  for (const n of loop.notes.filter((n) => n.voice === 'bell')) {
    assert.ok(MUSIC.SCALE_PCS.includes(n.midi % 12));
    assert.ok(n.midi >= 65 && n.midi <= 89);
  }
});

test('pads follow the progression every bar', () => {
  for (let b = 0; b < MUSIC.BARS; b++) {
    const pads = loop.notes.filter((n) => n.voice === 'pad' && Math.abs(n.t - b * barLen) < 1e-6);
    assert.ok(pads.some((n) => n.midi % 12 === MUSIC.PROGRESSION_ROOTS[b % 4] % 12), `bar ${b}`);
  }
});

test('sorted, inside the loop, sane velocities', () => {
  for (let i = 1; i < loop.notes.length; i++) assert.ok(loop.notes[i].t >= loop.notes[i - 1].t);
  for (const n of loop.notes) assert.ok(n.t >= 0 && n.t < loop.lengthSec && n.vel > 0 && n.vel <= 1 && n.dur > 0);
});

test('gentle density', () => {
  for (let b = 0; b < MUSIC.BARS; b++) {
    const k = loop.notes.filter((n) => n.voice === 'bell' && n.t >= b * barLen && n.t < (b + 1) * barLen).length;
    assert.ok(k >= 2 && k <= 8, `bar ${b} has ${k} bell notes`);
  }
});

test('deterministic per seed', () => {
  assert.deepEqual(composeLoop({ seed: 3 }), composeLoop({ seed: 3 }));
  assert.notDeepEqual(composeLoop({ seed: 3 }).notes, composeLoop({ seed: 4 }).notes);
});

test('midiToFreq', () => assert.equal(midiToFreq(69), 440));

test('about 70% of the melody is chord tones', () => {
  const bells = loop.notes.filter((n) => n.voice === 'bell');
  const chordTones = bells.filter((n) => {
    const bar = Math.floor(n.t / barLen + 1e-9);
    return loop.notes.some((p) => p.voice === 'pad' && Math.abs(p.t - bar * barLen) < 1e-6 && p.midi % 12 === n.midi % 12);
  });
  const share = chordTones.length / bells.length;
  assert.ok(share >= 0.6 && share <= 0.8, `chord-tone share ${share}`);
});
