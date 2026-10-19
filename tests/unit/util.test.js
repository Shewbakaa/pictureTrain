import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, rngRange, rngPick } from '../../site/src/util/rng.js';
import { clamp, lerp, invLerp, smoothstep, easeInOutCubic, damp } from '../../site/src/util/math.js';

test('createRng is deterministic and in [0,1)', () => {
  const a = createRng(42), b = createRng(42);
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, createRng(43)));
});

test('rngRange and rngPick stay in bounds', () => {
  const r = createRng(1);
  for (let i = 0; i < 500; i++) {
    const v = rngRange(r, -2, 3);
    assert.ok(v >= -2 && v < 3);
    assert.ok(['a', 'b', 'c'].includes(rngPick(r, ['a', 'b', 'c'])));
  }
});

test('math helpers', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(invLerp(10, 20, 15), 0.5);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(easeInOutCubic(0.25) < 0.25);
  assert.ok(Math.abs(damp(0, 10, 2, 1) - 10 * (1 - Math.exp(-2))) < 1e-9);
});
