// The finale's own sounds keep time with what the finale draws (site/src/finale/foleyTiming.js): her hop and landing
// from the keys of her hop, his door as he sets off from it, his footsteps at a person's cadence over his walk, two
// heartbeats before the hand-off, the bouquet's paper at the hand-off, the sparkle with the hearts and the doves
// with the fireworks. And the station bell as the train pulls in (audio/sfxTiming.js), after the whistle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE_TIMES as T, finaleTracks } from '../../site/src/finale/finale.js';
import { FOLEY, FOLEY_CUES, foleyCues, footfalls } from '../../site/src/finale/foleyTiming.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { FINALE_WHISTLE_AFTER, STATION_BELL, WHISTLE } from '../../site/src/audio/sfxTiming.js';
import { FINALE_PATH } from './finaleStage.js';

const tracks = finaleTracks(FINALE_PATH, 960);
const track = (key) => tracks.find((tr) => tr.key === key);
/** When the named cue sounds on the finale's clock (s), every time it does. */
const cue = (name) => FOLEY_CUES.filter((c) => c.name === name).map((c) => c.t);
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the station bell rings twice as the train pulls in, once the whistle has finished', () => {
  const last = WHISTLE.finale[WHISTLE.finale.length - 1];
  const whistled = FINALE_WHISTLE_AFTER + last.t + last.dur;
  assert.ok(STATION_BELL.AFTER > whistled, 'after the whistle, so nothing masks it');
  assert.ok(STATION_BELL.AFTER <= whistled + 0.3, 'straight after it');
  assert.ok(STATION_BELL.APART >= 0.25 && STATION_BELL.APART <= 0.5, 'a "ding-ding"');
});

test('her hop whooshes as she takes off, and taps and rustles as she lands: the keys of her hop', () => {
  const up = track('herUp');
  const takeoff = up.keys[0].t;
  const landing = up.keys[up.keys.length - 1].t;
  assert.deepEqual(cue('hop'), [takeoff]);
  assert.deepEqual(cue('land'), [landing]);
  assert.deepEqual(cue('dress'), [landing]);
  // ...as the finale moves her: on the carriage floor until the take-off, rising just after; coming down until the
  // landing, and on the platform from then on.
  const tl = createTimeline([up]);
  const height = (t) => tl.sample(t).herUp;
  assert.equal(height(takeoff - 0.05), height(takeoff));
  assert.ok(height(takeoff + 0.02) > height(takeoff) + 0.01);
  assert.ok(height(landing - 0.02) > height(landing) + 0.01);
  assert.equal(height(landing + 1), height(landing));
  // The whoosh lasts while she is in the air.
  assert.equal(FOLEY.AIRTIME, landing - takeoff);
});

test('his door creaks as he sets off from it, its little shop bell jingling with it', () => {
  const tl = createTimeline([track('him')]);
  const at = (t) => tl.sample(t).him.slice();
  const [door] = cue('door');
  assert.deepEqual(cue('door'), [T.himWalkStart]);
  assert.deepEqual(at(door), at(0), 'he stands at the door until then');
  assert.ok(apart(at(door + 0.05), at(door)) > 0, 'and is on his way just after');
  const bells = cue('shop-bell');
  assert.equal(bells.length, 1);
  assert.ok(bells[0] >= door && bells[0] <= door + 0.2, `the bell at ${bells[0]}`);
});

test('his footsteps keep a person\'s cadence over his walk: slower as he sets off, brisk as he hurries, slower as he nears her, none once he has stopped', () => {
  const tl = createTimeline([track('him')]);
  const where = (t) => tl.sample(t).him.slice();
  const pace = (t) => apart(where(t + 0.05), where(t - 0.05)) / 0.1; // as the finale moves him
  const steps = [];
  footfalls(0, T.end, (name, t, level) => steps.push({ name, t, level }));
  const n = steps.length - 1;
  assert.ok(steps.length >= 4 && steps.length <= 7, `${steps.length} footsteps`);
  for (const { name, t, level } of steps) {
    assert.equal(name, 'step');
    assert.ok(level > 0 && level <= 1, `level ${level}`);
    assert.ok(pace(t) >= FOLEY.STEP.STILL, `at ${t.toFixed(2)} s he is walking (${pace(t).toFixed(2)} m/s)`);
  }
  // The first a beat after the door's bell, as he steps off.
  assert.ok(steps[0].t > cue('shop-bell')[0] && steps[0].t <= T.himWalkStart + 0.5, `the first at ${steps[0].t}`);
  // Two to two and a half steps a second as he strides; slower at either end.
  const gaps = steps.slice(1).map((s, i) => s.t - steps[i].t);
  for (const gap of gaps) assert.ok(gap >= 0.4 - 1e-6 && gap <= 1 / FOLEY.STEP.SLOW, `a step ${gap.toFixed(3)} s after the last`);
  const striding = gaps.slice(1, -1);
  assert.ok(striding.length >= 1 && striding.every((gap) => gap <= 0.5), `striding ${striding.map((g) => g.toFixed(3))}`);
  assert.ok(gaps[0] > Math.max(...striding) && gaps[n - 1] > Math.max(...striding), `gaps ${gaps.map((g) => g.toFixed(3))}`);
  // Softer as he sets off and as he arrives than as he hurries.
  const loudest = Math.max(...steps.map((s) => s.level));
  assert.ok(steps[0].level < loudest && steps[n].level < loudest);
  // None once he has all but stopped, and none so late that it would come after his walk has slowed past a step.
  let still = steps[n].t;
  while (pace(still) >= FOLEY.STEP.STILL) still += 0.001;
  assert.ok(still - steps[n].t < 1 / FOLEY.STEP.SLOW, `he stops ${(still - steps[n].t).toFixed(2)} s after the last step`);
  footfalls(steps[n].t, 100, () => assert.fail('a step after he has stopped'));
  footfalls(-1, T.himWalkStart, () => assert.fail('a step before he sets off'));
  assert.ok(steps[n].t < T.handoffStart - 0.5, `the last at ${steps[n].t}, well before the hand-off`);
});

test('two soft heartbeats, lub-dub, about 0.8 s apart, the second dying away as the hand-off begins', () => {
  const beats = cue('heartbeat');
  const { DUB, RING } = FOLEY.HEART;
  assert.equal(beats.length, 2);
  const apartBy = beats[1] - beats[0];
  assert.ok(apartBy >= 0.7 && apartBy <= 0.85, `${apartBy} s apart (a heart quickened a little)`);
  assert.ok(DUB >= 0.12 && DUB <= 0.3, 'the "dub" close behind the "lub"');
  const over = beats[1] + DUB + RING;
  assert.ok(over <= T.handoffStart + 1e-9 && over >= T.handoffStart - 0.1, `the last beat dies away at ${over}`);
  assert.ok(beats[0] > T.herStepEnd, 'she has turned to face him');
});

test('no footstep lands on a heartbeat: each is at least 0.15 s from every "lub" and "dub", and he reaches her on a beat', () => {
  const thumps = cue('heartbeat').flatMap((t) => [t, t + FOLEY.HEART.DUB]);
  const steps = [];
  footfalls(0, T.end, (name, t) => steps.push(t));
  for (const step of steps) {
    for (const thump of thumps) {
      assert.ok(Math.abs(step - thump) >= 0.15, `a step at ${step.toFixed(3)} s and a beat at ${thump.toFixed(3)} s`);
    }
  }
  assert.ok(cue('heartbeat')[1] > steps[steps.length - 1], 'the last heartbeat comes after his last step');
});

test('the bouquet\'s paper crinkles as he holds it out, the hearts sparkle, and doves fly off as the fireworks start', () => {
  assert.deepEqual(cue('crinkle'), [T.handoffStart]);
  assert.deepEqual(cue('sparkle'), [T.hearts]);
  assert.deepEqual(cue('doves'), [T.fireworks]);
});

test('foleyCues reports every cue and footstep once, in time order, however the finale\'s clock is cut into frames', () => {
  const whole = [];
  foleyCues(0, T.end, (name, t) => whole.push([name, t]));
  const steps = [];
  footfalls(0, T.end, (name, t) => steps.push(t));
  assert.equal(whole.length, FOLEY_CUES.length + steps.length);
  for (let i = 1; i < whole.length; i++) assert.ok(whole[i][1] >= whole[i - 1][1], `${whole[i][0]} after ${whole[i - 1][0]}`);
  const firsts = [...new Set(whole.map(([name]) => name))];
  assert.deepEqual(firsts, ['hop', 'land', 'dress', 'door', 'shop-bell', 'step', 'heartbeat', 'crinkle', 'sparkle', 'doves']);
  for (const frame of [1 / 60, 1 / 24, 0.1]) {
    const pieces = [];
    let t = 0;
    for (; t < T.end; t += frame) foleyCues(t, t + frame, (name, at) => pieces.push([name, at]));
    assert.deepEqual(pieces, whole, `frames of ${frame.toFixed(3)} s`);
  }
  foleyCues(T.end, 100, () => assert.fail('nothing after the finale\'s end'));
  foleyCues(5, 4, () => assert.fail('nothing for a clock gone back'));
});
