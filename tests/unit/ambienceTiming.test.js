// The ambience as numbers (site/src/audio/ambienceTiming.js): how loud each zone's ambience is along the track,
// where the sea's waves sit as she looks about, when random events (birds, gulls, bells) may come, and the evening
// chime's one moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENCE, bedGain, createChimeTrigger, createEventClock, wavePan, zoneWeights,
} from '../../site/src/audio/ambienceTiming.js';
import { TRAIN } from '../../site/src/audio/sfxTiming.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout, LAYOUT } from '../../site/src/world/layout.js';
import { normalizeContent, ZONE_IDS } from '../../site/src/content/normalize.js';
import { createRide } from '../../site/src/ride/rideController.js';
import { createRng } from '../../site/src/util/rng.js';
import fixture from '../fixtures/content.fixture.js';

const L = buildLayout(normalizeContent(fixture).content);
const FRAME = 1 / 60;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('inside a zone only its own ambience plays, at full weight', () => {
  for (const zone of L.zones) {
    const w = zoneWeights(envAt(L, (zone.start + zone.end) / 2));
    for (const id of ZONE_IDS) assert.equal(w[id], id === zone.id ? 1 : 0, `${id} in ${zone.id}`);
  }
});

test('across each boundary the two zones crossfade, keeping the same loudness, and no other zone is heard', () => {
  for (let i = 0; i + 1 < L.zones.length; i++) {
    const a = L.zones[i].id;
    const b = L.zones[i + 1].id;
    const boundary = L.zones[i].end;
    let before = -1;
    for (let d = boundary - LAYOUT.BLEND; d <= boundary + LAYOUT.BLEND; d += 0.5) {
      const w = zoneWeights(envAt(L, d));
      assert.ok(close(w[a] + w[b], 1), `${a}+${b} sum to 1 at ${d}`);
      for (const id of ZONE_IDS) if (id !== a && id !== b) assert.equal(w[id], 0, `${id} silent at ${d}`);
      assert.ok(w[b] >= before, `${b} only grows across the boundary (${d})`);
      before = w[b];
      // Two beds of uncorrelated noise crossfading at equal power sound as loud as one.
      assert.ok(close(bedGain(w[a]) ** 2 + bedGain(w[b]) ** 2, 1, 1e-9), `equal power at ${d}`);
    }
    const middle = zoneWeights(envAt(L, boundary));
    assert.ok(close(middle[a], 0.5) && close(middle[b], 0.5), 'halfway at the boundary');
  }
});

test('every zone\'s ambience is present only near its zone', () => {
  const half = LAYOUT.BLEND / 2;
  const last = L.zones[L.zones.length - 1];
  for (let d = 0; d <= L.total; d += 1) {
    const w = zoneWeights(envAt(L, d));
    for (const zone of L.zones) {
      const end = zone === last ? L.total : zone.end + half; // the run-out beyond the last zone is still the evening
      if (w[zone.id] > 0) assert.ok(d > zone.start - half && d <= end, `${zone.id} heard at ${d}`);
    }
  }
});

test('zone weights and bed gains: out is reused, and a bed is silent at 0 and full at 1', () => {
  const out = {};
  assert.equal(zoneWeights(envAt(L, 10), out), out);
  assert.equal(bedGain(0), 0);
  assert.equal(bedGain(1), 1);
  assert.equal(bedGain(-0.2), 0);
  assert.equal(bedGain(1.5), 1);
});

test('the waves come from the sea\'s side of her view, wherever she looks', () => {
  // Looking ahead along the track, the sea is on her left.
  assert.ok(wavePan(0, 'left') <= -0.5, 'ahead: from the left');
  assert.ok(close(wavePan(0, 'left'), -AMBIENCE.WAVE_WIDTH));
  // Turned to face it, it is in front of her; turned away, behind: in the middle either way.
  assert.ok(close(wavePan(Math.PI / 2, 'left'), 0), 'facing the sea');
  assert.ok(close(wavePan(-Math.PI / 2, 'left'), 0), 'her back to the sea');
  // Half turned towards it, it is half way round to the front; turned past it, it is a little to her right.
  assert.ok(wavePan(Math.PI / 4, 'left') > wavePan(0, 'left') && wavePan(Math.PI / 4, 'left') < 0);
  assert.ok(wavePan(1.75, 'left') > 0, 'turned further left than the sea');
  // A sea on the right mirrors it.
  for (const yaw of [-1.75, -1, -0.3, 0, 0.4, 1.2, 1.75]) {
    assert.ok(close(wavePan(yaw, 'right'), -wavePan(-yaw, 'left')), `mirrored at ${yaw}`);
    assert.ok(Math.abs(wavePan(yaw, 'left')) <= AMBIENCE.WAVE_WIDTH + 1e-12);
  }
});

/** Steps `clock` through `seconds` of frames at `weight`, returning the times (s) it fired. */
function run(clock, seconds, weight, frame = FRAME) {
  const fired = [];
  for (let t = 0; t < seconds; t += frame) if (clock.step(frame, weight)) fired.push(t);
  return fired;
}
const gaps = (times) => times.slice(1).map((t, i) => t - times[i]);

test('an event clock keeps at least its minimum gap, and comes at random between its gaps', () => {
  const clock = createEventClock(3, 8, createRng(5));
  const fired = run(clock, 600, 1);
  const between = gaps(fired);
  assert.ok(Math.min(...between) >= 3 - FRAME, `closest ${Math.min(...between)}`);
  assert.ok(Math.max(...between) <= 8 + FRAME, `furthest ${Math.max(...between)}`);
  const mean = between.reduce((s, g) => s + g, 0) / between.length;
  assert.ok(mean > 4.5 && mean < 6.5, `about midway on average (${mean.toFixed(2)} s)`);
  // Not mechanical: the gaps vary.
  assert.ok(new Set(between.map((g) => g.toFixed(1))).size > 20);
});

test('a half-heard zone\'s events come half as often, and a silent zone\'s not at all', () => {
  const full = run(createEventClock(3, 8, createRng(9)), 600, 1).length;
  const half = run(createEventClock(3, 8, createRng(9)), 600, 0.5).length;
  assert.ok(Math.abs(half / full - 0.5) < 0.1, `${half} of ${full}`);
  assert.equal(run(createEventClock(3, 8, createRng(9)), 600, 0).length, 0);
  assert.equal(run(createEventClock(3, 8, createRng(9)), 600, AMBIENCE.MIN_WEIGHT / 2).length, 0, 'not at the far edge of a blend');
});

test('a stalled frame fires an event at most once, never a burst', () => {
  const clock = createEventClock(3, 8, createRng(2));
  let fired = 0;
  for (let i = 0; i < 20; i++) if (clock.step(30, 1)) fired++;
  assert.ok(fired <= Math.ceil((20 * AMBIENCE.MAX_STEP) / 3) + 1, `${fired} events from 20 stalled frames`);
});

test('under a ?speed=50 time warp the events keep to real time, through every zone and stop', () => {
  const ride = createRide({ stops: L.stops.map((s) => s.distance), finaleDistance: L.finaleDistance, speedScale: 50 });
  let dwell = 0; // real seconds at a stop before Continue, as a quick tapper (or the e2e ride) takes
  ride.on('arrive', () => { dwell = 2; });
  ride.start();
  const env = envAt(L, 0);
  const weights = {};
  const random = createRng(3);
  const clocks = ZONE_IDS.map((id) => ({ id, clock: createEventClock(2.2, 6, random), fired: [] }));
  let t = 0;
  for (; t < 120 && ride.state !== 'finale'; t += FRAME) {
    ride.update(FRAME);
    if (ride.state === 'stopped' && (dwell -= FRAME) <= 0) ride.continue();
    zoneWeights(envAt(L, ride.distance, env), weights);
    for (const c of clocks) if (c.clock.step(FRAME, weights[c.id])) c.fired.push(t);
  }
  assert.equal(ride.state, 'finale', `the warped ride reached the end in ${t.toFixed(1)} s`);
  assert.ok(clocks.reduce((n, c) => n + c.fired.length, 0) >= 4, 'events were heard on the way');
  for (const c of clocks) {
    if (c.fired.length > 1) assert.ok(Math.min(...gaps(c.fired)) >= 2.2 - FRAME, `${c.id}: ${gaps(c.fired)}`);
    assert.ok(c.fired.length <= t / 2.2 + 1, `${c.id}: ${c.fired.length} in ${t.toFixed(1)} s`);
  }
});

test('the evening chime strikes once, as the train rolls into the evening', () => {
  const chime = createChimeTrigger();
  const evening = L.zones.find((z) => z.id === 'evening');
  const env = envAt(L, 0);
  const weights = {};
  let struck = [];
  for (let d = evening.start - 60; d < evening.end; d += 0.4) {
    zoneWeights(envAt(L, d, env), weights);
    if (chime.step(weights.evening, d)) struck.push(d);
  }
  assert.equal(struck.length, 1);
  assert.ok(Math.abs(struck[0] - evening.start) <= 0.4, `at the boundary (${struck[0]} vs ${evening.start})`);

  // Staying in the evening (standing at a stop, the finale) strikes no more.
  for (let i = 0; i < 100; i++) assert.equal(chime.step(1, evening.end - 10), false);

  // Riding again from the start: it strikes again as the train comes back into the evening.
  struck = [];
  for (let d = 0; d < evening.end; d += 5) {
    zoneWeights(envAt(L, d, env), weights);
    if (chime.step(weights.evening, d)) struck.push(d);
  }
  assert.equal(struck.length, 1, 'once more on the second ride');
});

test('a jump along the timeline into the evening does not strike the chime', () => {
  const chime = createChimeTrigger();
  const evening = L.zones.find((z) => z.id === 'evening');
  assert.equal(chime.step(0, 100), false);
  assert.equal(chime.step(1, evening.start + 50), false, 'teleported in');
  assert.equal(chime.step(1, evening.start + 50 + TRAIN.MAX_HOP / 2), false);
});
