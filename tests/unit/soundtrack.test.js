// The built-in soundtrack (music.js createSoundtrack): the tune, and Silent Night in its place in the winter hills,
// crossfading with the winter blend. On the stub AudioContext (audioStub.js), with the scheduler's timer ticked by
// hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundtrack } from '../../site/src/audio/music.js';
import { composeCarol } from '../../site/src/audio/carol.js';
import { composeLoop } from '../../site/src/audio/compose.js';
import { stubContext } from './audioStub.js';

/** A timer the test ticks by hand: tick() runs every scheduler that is running. */
function manualTimer() {
  const running = new Set();
  return {
    start: (fn) => { running.add(fn); return fn; },
    stop: (id) => { running.delete(id); },
    tick: () => { for (const fn of [...running]) fn(); },
    get count() { return running.size; },
  };
}

function setup() {
  const { ctx, starts } = stubContext();
  const out = ctx.createGain();
  const timer = manualTimer();
  const soundtrack = createSoundtrack(ctx, out, timer);
  /** Runs the clock on to `t` in 50 ms ticks, as the browser would. */
  const runTo = (t) => {
    while (ctx.currentTime < t - 1e-9) {
      ctx.currentTime = Math.min(t, ctx.currentTime + 0.05);
      timer.tick();
    }
  };
  /** The oscillators started at or after `from`, as offsets from `origin`. */
  const since = (from, origin = from) => starts.filter((s) => s.type === 'osc' && s.at >= from - 1e-9).map((s) => s.at - origin);
  return { ctx, starts, soundtrack, timer, runTo, since };
}

/** Whether every offset in `offsets` is the start of one of `loop`'s notes, the loop starting at 0.05. */
function onGrid(offsets, loop) {
  const times = loop.notes.map((n) => n.t + 0.05);
  return offsets.every((o) => {
    const inLoop = o % loop.lengthSec;
    return times.some((t) => Math.abs(t - inLoop) < 1e-6 || Math.abs(t - inLoop - loop.lengthSec) < 1e-6);
  });
}

const tuneLoop = composeLoop();
const carolLoop = composeCarol();

test('outside winter only the tune plays, and the carol is not even written out', () => {
  const t = setup();
  t.soundtrack.setWinter(0);
  t.soundtrack.play();
  t.runTo(6);
  const offsets = t.since(0, 0);
  assert.ok(offsets.length > 20, `${offsets.length} oscillators in 6 s`);
  assert.ok(onGrid(offsets, tuneLoop), 'every note is the tune\'s');
  assert.equal(t.timer.count, 1, 'one scheduler running');
});

test('into the winter hills: the tune stops and the carol begins from its first note, faintly', () => {
  const t = setup();
  t.soundtrack.play();
  t.runTo(5);
  t.soundtrack.setWinter(1);
  const entered = t.ctx.currentTime;
  t.runTo(25);
  // (The tune's notes already booked a moment ahead still play out, into its fading gain.)
  const offsets = t.since(entered + 0.3, entered);
  assert.ok(offsets.length > 40);
  assert.ok(onGrid(offsets, carolLoop), 'every note from here on is the carol\'s, from its top');
  const first = t.starts.filter((s) => Math.abs(s.at - (entered + 0.05)) < 1e-9).map((s) => Math.round(s.node.frequency.value * 100) / 100);
  assert.ok(first.includes(523.25), 'its first note: C5, "Si-"');
  assert.ok(first.includes(174.61) && first.includes(220) && first.includes(261.63), 'over F major');
  assert.equal(t.timer.count, 1, 'the tune\'s scheduler has stopped');
  assert.equal(t.soundtrack.shares.tune, 0);
  assert.equal(t.soundtrack.shares.carol, 1);
});

test('out of winter again: the carol stops and the tune comes back from its top', () => {
  const t = setup();
  t.soundtrack.play();
  t.soundtrack.setWinter(1);
  t.runTo(20);
  t.soundtrack.setWinter(0);
  const left = t.ctx.currentTime;
  t.runTo(30);
  const offsets = t.since(left + 0.3, left);
  assert.ok(offsets.length > 20);
  assert.ok(onGrid(offsets, tuneLoop), 'the tune, from its top');
  assert.equal(t.soundtrack.shares.tune, 1);
  assert.equal(t.soundtrack.shares.carol, 0);
});

test('across the boundary both fade, never both clearly heard', () => {
  const t = setup();
  t.soundtrack.play();
  for (let w = 0; w <= 1; w += 0.05) {
    t.soundtrack.setWinter(w);
    const { tune, carol } = t.soundtrack.shares;
    assert.ok(!(tune > 0.25 && carol > 0.25), `at ${w}: tune ${tune}, carol ${carol}`);
  }
});

test('paused, neither books a note; playing again, each picks up where it was', () => {
  const t = setup();
  t.soundtrack.play();
  t.runTo(3);
  t.soundtrack.pause();
  const held = t.starts.length;
  t.runTo(6);
  assert.equal(t.starts.length, held, 'nothing booked while paused');
  t.soundtrack.setWinter(1); // she rode into winter with the sound off
  t.runTo(8);
  assert.equal(t.starts.length, held);
  t.soundtrack.play();
  const back = t.ctx.currentTime;
  t.runTo(12);
  assert.ok(onGrid(t.since(back, back), carolLoop), 'the carol, from its top');
  assert.ok(t.since(back, back).length > 10);
});

test('a winter first zone starts with the carol, and the tune is never written into the mix', () => {
  const t = setup();
  t.soundtrack.setWinter(1);
  t.soundtrack.play();
  t.runTo(10);
  assert.ok(onGrid(t.since(0, 0), carolLoop));
});
