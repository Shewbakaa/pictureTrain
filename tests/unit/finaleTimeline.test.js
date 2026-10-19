import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline } from '../../site/src/finale/timeline.js';

const tl = createTimeline(
  [{ key: 'x', keys: [{ t: 1, v: 0 }, { t: 3, v: 10 }] }, { key: 'p', keys: [{ t: 0, v: [0, 0] }, { t: 2, v: [2, 4], ease: 'inOut' }] }],
  [{ name: 'a', t: 1 }, { name: 'b', t: 2.5 }],
);

test('holds outside the key range', () => {
  assert.equal(tl.sample(0).x, 0);
  assert.equal(tl.sample(9).x, 10);
});

test('linear interpolation', () => assert.equal(tl.sample(2).x, 5));

test('arrays and easing', () => {
  assert.deepEqual(tl.sample(1).p, [1, 2]);
  assert.ok(tl.sample(0.5).p[0] < 0.5);
});

test('duration is the last key or event', () => assert.equal(tl.duration, 3));

test('events fire once across contiguous intervals', () => {
  const fired = [];
  let prev = 0;
  for (let t = 0.1; t <= 3.01; t += 0.1) { fired.push(...tl.events(prev, t)); prev = t; }
  assert.deepEqual(fired, ['a', 'b']);
});
