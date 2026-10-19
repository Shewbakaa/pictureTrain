import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor, TIERS, effectivePixelRatio } from '../../site/src/perf/quality.js';

const feed = (g, ms, seconds) => { let changed = null; for (let t = 0; t < seconds; t += ms / 1000) { const c = g.sample(ms / 1000); if (c) changed = c; } return changed; };

test('starts at medium', () => assert.equal(createQualityGovernor().tier, 'medium'));

test('a slow device steps down after warmup plus one window', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 40, 1.4), null);
  assert.equal(feed(g, 40, 2.2), 'low');
});

test('a fast device steps up once', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 8, 4), 'high');
  assert.equal(feed(g, 8, 10), null);
  assert.equal(g.tier, 'high');
});

test('never steps back up after a step down', () => {
  const g = createQualityGovernor();
  feed(g, 40, 4);
  feed(g, 8, 10);
  assert.equal(g.tier, 'low');
});

test('a forced tier never changes', () => {
  const g = createQualityGovernor({ forced: 'high' });
  feed(g, 60, 10);
  assert.equal(g.tier, 'high');
});

test('effectivePixelRatio caps by the device', () => {
  assert.equal(effectivePixelRatio(TIERS.high, 3), 2);
  assert.equal(effectivePixelRatio(TIERS.medium, 1), 1);
});

// ---------------------------------------------------------------------------------------------
// Beyond the brief: the tier table itself, settings(), the change cap, frames that should not
// count (a backgrounded tab, bad values) and a screen with no known pixel ratio.
// ---------------------------------------------------------------------------------------------

test('the tiers are exactly the planned ones, and fixed', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(TIERS)), {
    low: { pixelRatio: 1, density: 0.45, shadows: false, particles: 0.35 },
    medium: { pixelRatio: 1.5, density: 0.75, shadows: false, particles: 0.7 },
    high: { pixelRatio: 2, density: 1, shadows: true, particles: 1 },
  });
  assert.ok(Object.isFrozen(TIERS) && Object.values(TIERS).every(Object.isFrozen));
});

test('settings() follows the tier', () => {
  const g = createQualityGovernor();
  assert.equal(g.settings(), TIERS.medium);
  feed(g, 8, 4);
  assert.equal(g.settings(), TIERS.high);
  assert.equal(createQualityGovernor({ forced: 'low' }).settings(), TIERS.low);
});

test('it changes at most maxChanges times', () => {
  const g = createQualityGovernor({ initial: 'high', maxChanges: 1 });
  feed(g, 60, 20);
  assert.equal(g.tier, 'medium');
});

test('a steady phone keeps its tier', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 18, 20), null);
  assert.equal(g.tier, 'medium');
});

test('one huge frame after the phone was locked does not step a steady phone down', () => {
  const g = createQualityGovernor();
  feed(g, 18, 3);
  assert.equal(g.sample(30), null);
  assert.equal(feed(g, 18, 6), null);
  assert.equal(g.tier, 'medium');
});

// A phone in Low Power Mode (or any screen capped at 30 Hz) hands out frames every 33.3 ms however idle the GPU
// is: a steady cadence there is the cap, not a struggling phone.
const feedPattern = (g, msPattern, seconds) => {
  let changed = null;
  for (let t = 0, i = 0; t < seconds; i += 1) {
    const ms = msPattern[i % msPattern.length];
    t += ms / 1000;
    const c = g.sample(ms / 1000);
    if (c) changed = c;
  }
  return changed;
};

test('a steady 30 fps cadence is a refresh cap and does not step down', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 1000 / 30, 20), null);
  assert.equal(g.tier, 'medium');
  // Timestamps wobble a little either side of the cap; that is still the cap.
  const wobbly = createQualityGovernor();
  assert.equal(feedPattern(wobbly, [32.1, 34.6, 33.3, 31.9, 34.8, 33.1], 20), null);
  assert.equal(wobbly.tier, 'medium');
});

test('a jittery 30-45 ms cadence is a struggling phone and steps down', () => {
  const g = createQualityGovernor();
  assert.equal(feedPattern(g, [30, 45, 36, 41, 31, 44, 38, 33], 4), 'low');
  // Even when its average happens to land on 33.3 ms, it is the spread that gives it away.
  const centred = createQualityGovernor();
  assert.equal(feedPattern(centred, [26, 41, 28, 39, 30, 36], 4), 'low');
});

test('frames that are not a positive time are ignored', () => {
  const g = createQualityGovernor({ warmup: 0, window: 0.1 });
  for (const dt of [0, NaN, undefined, -1]) assert.equal(g.sample(dt), null);
  // Had the last one counted, its -1 s would keep the window from filling, so a fast phone could not step up.
  assert.equal(feed(g, 8, 0.2), 'high');
});

test('effectivePixelRatio copes with a screen that reports no pixel ratio', () => {
  assert.equal(effectivePixelRatio(TIERS.high, 1.5), 1.5);
  for (const bad of [undefined, 0, NaN]) assert.equal(effectivePixelRatio(TIERS.high, bad), 1);
});
