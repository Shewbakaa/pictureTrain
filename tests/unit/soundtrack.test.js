// The built-in soundtrack (music.js createSoundtrack): each scene's piece, crossfading with the zone blend. The
// recordings of spring, summer, autumn and the evening; Silent Night in the winter hills; and the built-in tune for a
// scene whose recording cannot play. On the stub AudioContext (audioStub.js), with the scheduler's timer ticked by
// hand and stand-in recordings that log what they are asked to do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundtrack } from '../../site/src/audio/music.js';
import { composeCarol } from '../../site/src/audio/carol.js';
import { composeLoop } from '../../site/src/audio/compose.js';
import { ZONE_MUSIC } from '../../site/src/audio/zoneMusic.js';
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

/** A stand-in recording (recording.js): `log` lists its starts ('top' or 'play') and stops ('rewind' or 'pause'). */
function stubRecording(ctx, name, trim) {
  const log = [];
  return {
    name, trim, log, file: `music/zones/${name}.mp3`, output: ctx.createGain(), failed: false, playing: false, updates: 0,
    unlock() {},
    load() {},
    start(fromTop) { log.push(fromTop ? 'top' : 'play'); this.playing = true; },
    stop(rewind) { log.push(rewind ? 'rewind' : 'pause'); this.playing = false; },
    update() { this.updates += 1; },
  };
}

const ZONES = ['spring', 'summer', 'autumn', 'winter', 'evening'];

function setup({ recorded = ['spring', 'summer', 'autumn', 'evening'] } = {}) {
  const { ctx, starts } = stubContext();
  const out = ctx.createGain();
  const timer = manualTimer();
  const recordings = {};
  recorded.forEach((zone, i) => { recordings[zone] = stubRecording(ctx, zone, 3 + i / 4); });
  const soundtrack = createSoundtrack(ctx, out, { timer, recordings });
  /** Runs the clock on to `t` in 50 ms ticks, as the browser would. */
  const runTo = (t) => {
    while (ctx.currentTime < t - 1e-9) {
      ctx.currentTime = Math.min(t, ctx.currentTime + 0.05);
      timer.tick();
    }
  };
  /** The oscillators started at or after `from`, as offsets from `origin`. */
  const since = (from, origin = from) => starts.filter((s) => s.type === 'osc' && s.at >= from - 1e-9).map((s) => s.at - origin);
  /** Every zone's weight: `weights` given, the rest 0. */
  const zones = (weights) => Object.fromEntries(ZONES.map((z) => [z, weights[z] || 0]));
  /** The pieces playing now: recordings playing and synth pieces booking notes. */
  const playing = () => Object.values(recordings).filter((r) => r.playing).length + timer.count;
  /**
   * Rides frame by frame (1/60 s) from zone `a` into zone `b` across their blend (`seconds` long, as at the cruise
   * speed), and on for `after` seconds; returns the most pieces that played at once.
   */
  const cross = (a, b, seconds = 4.6, after = 2) => {
    let most = 0;
    const frames = Math.round((seconds + after) * 60);
    for (let f = 0; f <= frames; f++) {
      const t = Math.min(1, f / (seconds * 60));
      runTo(ctx.currentTime + 1 / 60);
      soundtrack.setZones(zones({ [a]: 1 - t, [b]: t }));
      most = Math.max(most, playing());
    }
    return most;
  };
  return { ctx, starts, soundtrack, timer, runTo, since, recordings, zones, playing, cross };
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

test('each scene plays its own recording from its top, and nothing else: no tune, no carol', () => {
  for (const zone of ['spring', 'summer', 'autumn', 'evening']) {
    const t = setup();
    t.soundtrack.setZones(t.zones({ [zone]: 1 }));
    t.soundtrack.play();
    t.runTo(6);
    assert.deepEqual(t.recordings[zone].log, ['top'], zone);
    for (const other of Object.values(t.recordings)) if (other.name !== zone) assert.deepEqual(other.log, []);
    assert.equal(t.since(0).length, 0, 'not a note of the tune or the carol');
    assert.equal(t.timer.count, 0);
    assert.equal(t.soundtrack.loudest, zone);
    assert.equal(t.soundtrack.shares[zone], 1);
  }
});

test('a recording plays at its share times its trim, which brings it to the tune\'s loudness', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ summer: 1 }));
  t.soundtrack.play();
  const { summer } = t.recordings;
  // The first weights heard are set at once; later ones ease.
  assert.equal(t.soundtrack.gainOf('summer').gain.value, summer.trim);
  t.soundtrack.setZones(t.zones({ summer: 0.6, autumn: 0.4 }));
  const share = t.soundtrack.shares.summer;
  assert.ok(share > 0 && share < 1);
  assert.ok(Math.abs(t.soundtrack.gainOf('summer').gain.target - share * summer.trim) < 1e-12);
});

test('riding from spring into summer: spring until the dip, then summer from its top; spring pauses and rewinds', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  const most = t.cross('spring', 'summer');
  assert.ok(most <= 2, `${most} pieces at once`);
  assert.deepEqual(t.recordings.spring.log, ['top', 'rewind'], 'paused and back at its top once its zone has gone');
  assert.deepEqual(t.recordings.summer.log, ['top']);
  assert.equal(t.soundtrack.loudest, 'summer');
  assert.equal(t.playing(), 1);
});

test('a piece plays on through its fade-out tail, and only then pauses and rewinds', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  t.soundtrack.setZones(t.zones({ autumn: 1 })); // a jump along the timeline, under the blush
  assert.deepEqual(t.recordings.autumn.log, ['top']);
  assert.deepEqual(t.recordings.spring.log, ['top'], 'still easing out');
  assert.equal(t.soundtrack.gainOf('spring').gain.target, 0);
  t.runTo(5 + ZONE_MUSIC.TAIL - 0.05);
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  assert.deepEqual(t.recordings.spring.log, ['top']);
  t.runTo(5 + ZONE_MUSIC.TAIL + 0.01);
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  assert.deepEqual(t.recordings.spring.log, ['top', 'rewind']);
  assert.equal(t.soundtrack.loudest, 'autumn');
});

test('a piece whose zone comes back during its tail plays on rather than starting again', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  t.soundtrack.setZones(t.zones({ summer: 1 }));
  t.runTo(5.2);
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  assert.deepEqual(t.recordings.spring.log, ['top']);
  assert.ok(t.soundtrack.gainOf('spring').gain.target > 0);
});

test('never more than two pieces at once: a jump from a boundary cuts the two fading tails short', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.runTo(2);
  t.soundtrack.setZones(t.zones({ spring: 0.5, summer: 0.5 })); // at the boundary: both a little
  assert.equal(t.playing(), 2);
  t.soundtrack.setZones(t.zones({ evening: 1 })); // jumped from there
  assert.ok(t.playing() <= 2, `${t.playing()} playing`);
  assert.deepEqual(t.recordings.evening.log, ['top']);
  // Whichever order the pieces are worked through in, the starting piece finds room.
  const u = setup();
  u.soundtrack.setZones(u.zones({ summer: 0.5, autumn: 0.5 }));
  u.soundtrack.play();
  assert.equal(u.playing(), 2);
  u.soundtrack.setZones(u.zones({ spring: 1 }));
  assert.ok(u.playing() <= 2, `${u.playing()} playing`);
  assert.deepEqual(u.recordings.spring.log, ['top']);
});

test('every boundary of the ride crosses with at most two pieces playing', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  for (let i = 0; i + 1 < ZONES.length; i++) {
    const most = t.cross(ZONES[i], ZONES[i + 1]);
    assert.ok(most <= 2, `${ZONES[i]} to ${ZONES[i + 1]}: ${most}`);
    assert.equal(t.soundtrack.loudest, ZONES[i + 1]);
  }
  for (const zone of ['spring', 'summer', 'autumn']) assert.deepEqual(t.recordings[zone].log, ['top', 'rewind'], zone);
  assert.deepEqual(t.recordings.evening.log, ['top'], 'the evening plays on, into the finale');
});

test('playing frames tend each recording\'s loop seam; a paused one is left alone', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  assert.ok(t.recordings.spring.updates >= 2);
  assert.equal(t.recordings.summer.updates, 0);
  t.soundtrack.pause();
  const before = t.recordings.spring.updates;
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  assert.equal(t.recordings.spring.updates, before);
});

test('the sound going off pauses the pieces where they are; back on, they play on from there', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ spring: 0.5, summer: 0.5 }));
  t.soundtrack.play();
  t.soundtrack.pause();
  assert.deepEqual(t.recordings.spring.log, ['top', 'pause']);
  assert.deepEqual(t.recordings.summer.log, ['top', 'pause']);
  t.soundtrack.play();
  assert.deepEqual(t.recordings.spring.log, ['top', 'pause', 'play']);
  // She rode on into the autumn with the sound off: back on, autumn starts from its top, and the rest are rewound.
  t.soundtrack.pause();
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  t.soundtrack.play();
  assert.deepEqual(t.recordings.autumn.log, ['top']);
  assert.equal(t.recordings.spring.log[t.recordings.spring.log.length - 1], 'rewind');
  assert.equal(t.playing(), 1);
});

test('a scene whose recording fails plays the built-in tune from its top instead, and the others keep theirs', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ summer: 1 }));
  t.soundtrack.play();
  t.runTo(3);
  t.recordings.summer.failed = true; // its file would not load
  t.soundtrack.setZones(t.zones({ summer: 1 }));
  const failedAt = t.ctx.currentTime;
  t.runTo(10);
  assert.equal(t.soundtrack.loudest, 'tune');
  const offsets = t.since(failedAt, failedAt);
  assert.ok(offsets.length > 20, `${offsets.length} oscillators`);
  assert.ok(onGrid(offsets, tuneLoop), 'the tune, from its top');
  // On into autumn: its own recording again, and the tune gives way.
  t.cross('summer', 'autumn');
  assert.equal(t.soundtrack.loudest, 'autumn');
  assert.equal(t.timer.count, 0, 'the tune has stopped');
  assert.deepEqual(t.recordings.autumn.log, ['top']);
});

test('with no recordings at all, every scene but winter plays the tune, on and on across their boundaries', () => {
  const t = setup({ recorded: [] });
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  const before = t.since(0).length;
  t.cross('spring', 'summer');
  assert.equal(t.soundtrack.shares.tune, 1);
  assert.ok(onGrid(t.since(0, 0), tuneLoop), 'one pass of the tune: never started again');
  assert.ok(t.since(0).length > before);
});

test('outside winter the carol is not even written out', () => {
  const t = setup({ recorded: [] });
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  t.soundtrack.play();
  t.runTo(6);
  const offsets = t.since(0, 0);
  assert.ok(offsets.length > 20, `${offsets.length} oscillators in 6 s`);
  assert.ok(onGrid(offsets, tuneLoop), 'every note is the tune\'s');
  assert.equal(t.timer.count, 1, 'one scheduler running');
  assert.equal(t.soundtrack.shares.winter || 0, 0);
});

test('into the winter hills: the autumn recording gives way and the carol begins from its first note', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  t.soundtrack.setZones(t.zones({ winter: 1 }));
  const entered = t.ctx.currentTime;
  t.runTo(25);
  const offsets = t.since(entered + 0.3, entered);
  assert.ok(offsets.length > 40);
  assert.ok(onGrid(offsets, carolLoop), 'every note from here on is the carol\'s, from its top');
  const first = t.starts.filter((s) => Math.abs(s.at - (entered + 0.05)) < 1e-9).map((s) => Math.round(s.node.frequency.value * 100) / 100);
  assert.ok(first.includes(523.25), 'its first note: C5, "Si-"');
  assert.ok(first.includes(174.61) && first.includes(220) && first.includes(261.63), 'over F major');
  assert.equal(t.soundtrack.shares.autumn, 0);
  assert.equal(t.soundtrack.shares.winter, 1);
  assert.equal(t.soundtrack.loudest, 'winter');
});

test('into the winter hills with the tune: the tune stops and the carol plays, faintly', () => {
  const t = setup({ recorded: [] });
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  t.soundtrack.play();
  t.runTo(5);
  t.soundtrack.setZones(t.zones({ winter: 1 }));
  t.runTo(25);
  assert.equal(t.timer.count, 1, 'the tune\'s scheduler has stopped');
  assert.equal(t.soundtrack.shares.tune, 0);
  assert.equal(t.soundtrack.shares.winter, 1);
  assert.ok(Math.abs(t.soundtrack.gainOf('winter').gain.target - 0.6) < 1e-12, 'at CAROL.LEVEL: faint');
});

test('out of winter again: the carol stops and the evening begins from its top', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ winter: 1 }));
  t.soundtrack.play();
  t.runTo(20);
  t.soundtrack.setZones(t.zones({ evening: 1 }));
  t.runTo(30);
  assert.equal(t.timer.count, 0, 'the carol books no more notes');
  assert.equal(t.soundtrack.shares.winter, 0);
  assert.deepEqual(t.recordings.evening.log, ['top']);
});

test('across the winter boundary the tune and the carol both fade, never both clearly heard', () => {
  const t = setup({ recorded: [] });
  t.soundtrack.play();
  for (let w = 0; w <= 1; w += 0.05) {
    t.soundtrack.setZones(t.zones({ autumn: 1 - w, winter: w }));
    const { tune = 0, winter = 0 } = t.soundtrack.shares;
    assert.ok(!(tune > 0.25 && winter > 0.25), `at ${w}: tune ${tune}, carol ${winter}`);
  }
});

test('paused, nothing books a note; playing again, each picks up where it was', () => {
  const t = setup({ recorded: [] });
  t.soundtrack.setZones(t.zones({ autumn: 1 }));
  t.soundtrack.play();
  t.runTo(3);
  t.soundtrack.pause();
  const held = t.starts.length;
  t.runTo(6);
  assert.equal(t.starts.length, held, 'nothing booked while paused');
  t.soundtrack.setZones(t.zones({ winter: 1 })); // she rode into winter with the sound off
  t.runTo(8);
  assert.equal(t.starts.length, held);
  t.soundtrack.play();
  const back = t.ctx.currentTime;
  t.runTo(12);
  assert.ok(onGrid(t.since(back, back), carolLoop), 'the carol, from its top');
  assert.ok(t.since(back, back).length > 10);
});

test('a winter first zone starts with the carol, and nothing else is written into the mix', () => {
  const t = setup();
  t.soundtrack.setZones(t.zones({ winter: 1 }));
  t.soundtrack.play();
  t.runTo(10);
  assert.ok(onGrid(t.since(0, 0), carolLoop));
  for (const r of Object.values(t.recordings)) assert.deepEqual(r.log, []);
});

test('before it has heard where the train is, nothing plays and no piece is the loudest', () => {
  const t = setup();
  t.soundtrack.play();
  t.runTo(3);
  assert.equal(t.soundtrack.loudest, null);
  assert.equal(t.playing(), 0);
  t.soundtrack.setZones(t.zones({ spring: 1 }));
  assert.deepEqual(t.recordings.spring.log, ['top']);
});
