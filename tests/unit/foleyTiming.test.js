// The finale's own sounds keep time with what the finale draws (site/src/finale/foleyTiming.js): her hop and landing
// from the keys of her hop, his door as he sets off from it, a footfall each time one of his legs swings out, two
// heartbeats before the hand-off, the bouquet's paper at the hand-off, the sparkle with the hearts and the doves
// with the fireworks. And the station bell as the train pulls in (audio/sfxTiming.js), with the whistle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE_TIMES as T, finaleTracks } from '../../site/src/finale/finale.js';
import { FOLEY, FOLEY_CUES, foleyCues, footfalls } from '../../site/src/finale/foleyTiming.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { walkPose } from '../../site/src/world/figures.js';
import { FINALE_WHISTLE_AFTER, STATION_BELL, WHISTLE } from '../../site/src/audio/sfxTiming.js';
import { FINALE_PATH, finaleOnStage } from './finaleStage.js';

const tracks = finaleTracks(FINALE_PATH, 960);
const track = (key) => tracks.find((tr) => tr.key === key);
/** When the named cue sounds on the finale's clock (s), every time it does. */
const cue = (name) => FOLEY_CUES.filter((c) => c.name === name).map((c) => c.t);
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the station bell rings twice as the train pulls in, inside the whistle\'s long last toot', () => {
  const last = WHISTLE.finale[WHISTLE.finale.length - 1];
  const tootFrom = FINALE_WHISTLE_AFTER + last.t;
  const tootTo = tootFrom + last.dur;
  assert.ok(STATION_BELL.AFTER > tootFrom, 'once the long toot is under way');
  assert.ok(STATION_BELL.AFTER + STATION_BELL.APART < tootTo, 'both strikes before it ends');
  assert.ok(STATION_BELL.APART >= 0.25 && STATION_BELL.APART <= 0.5, 'a "ding-ding"');
  assert.ok(STATION_BELL.AFTER < 3, 'while the train is pulling in, before she hops down');
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

test('his footsteps fall with his walk as the finale poses it: one each time a leg swings out, slowing as he arrives, none once he stands', () => {
  const { scene, finale } = finaleOnStage();
  const leg = scene.getObjectByName('finale-him').getObjectByName('leftLeg');
  finale.begin();
  const legAt = (t) => {
    finale.skipTo(t);
    finale.update(0);
    return Math.abs(leg.rotation.x);
  };
  const full = Math.abs(walkPose(Math.PI / 2, 1).leftLeg);
  const steps = [];
  footfalls(0, T.end, (name, t, level) => steps.push({ name, t, level }));
  assert.ok(steps.length >= 8, `${steps.length} footsteps`);
  // Each falls as a leg reaches the far end of its swing, swinging in full.
  for (const { name, t, level } of steps) {
    assert.equal(name, 'step');
    assert.ok(level > 0 && level <= 1, `level ${level}`);
    const here = legAt(t);
    assert.ok(Math.abs(here - full) < 1e-3, `at ${t.toFixed(3)} s the leg is out ${here.toFixed(4)} rad of ${full}`);
    assert.ok(here >= legAt(t - 0.004) && here >= legAt(t + 0.004), `at ${t.toFixed(3)} s the swing is at its end`);
  }
  // And each time the finale swings a leg out, there is one: scanning what it draws at 480 frames a second.
  const outs = [];
  const dt = 1 / 480;
  let before = legAt(T.himWalkStart - dt);
  let here = legAt(T.himWalkStart);
  for (let t = T.himWalkStart; t <= T.end; t += dt) {
    const next = legAt(t + dt);
    if (here > 0.9 * full && here > before && here >= next) outs.push(t);
    before = here;
    here = next;
  }
  assert.equal(outs.length, steps.length, `${outs.length} swings drawn, ${steps.length} footsteps`);
  outs.forEach((t, i) => assert.ok(Math.abs(t - steps[i].t) <= dt, `swing ${i}: drawn at ${t.toFixed(4)}, heard at ${steps[i].t.toFixed(4)}`));
  // Slowing as he arrives: the last steps come further and further apart, and softer than his stride's.
  const gaps = steps.slice(1).map((s, i) => s.t - steps[i].t);
  const n = gaps.length;
  assert.ok(gaps[n - 1] > gaps[n - 2] && gaps[n - 2] > gaps[n - 3], `gaps ${gaps.map((g) => g.toFixed(3))}`);
  assert.ok(steps[n].level < Math.max(...steps.map((s) => s.level)), 'the last step is a softer one');
  // He sets off from the door, and once he is all but standing beside her, there are no more.
  assert.ok(steps[0].t > T.himWalkStart);
  assert.ok(steps[n].t < T.himWalkEnd - 0.3, `the last at ${steps[n].t}`);
  footfalls(steps[n].t, 100, () => assert.fail('a step after he stands'));
  footfalls(-1, T.himWalkStart, () => assert.fail('a step before he sets off'));
});

test('two soft heartbeats, lub-dub, about 0.8 s apart, the second dying away as the hand-off begins', () => {
  const beats = cue('heartbeat');
  const { DUB, RING } = FOLEY.HEART;
  assert.equal(beats.length, 2);
  assert.ok(Math.abs(beats[1] - beats[0] - 0.8) <= 0.05, `${beats[1] - beats[0]} s apart`);
  assert.ok(DUB >= 0.12 && DUB <= 0.3, 'the "dub" close behind the "lub"');
  const over = beats[1] + DUB + RING;
  assert.ok(over <= T.handoffStart + 1e-9 && over >= T.handoffStart - 0.1, `the last beat dies away at ${over}`);
  assert.ok(beats[0] > T.herStepEnd, 'she has turned to face him');
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
