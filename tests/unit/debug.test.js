import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDebugParams } from '../../site/src/debug.js';

test('defaults', () => {
  assert.deepEqual(parseDebugParams(''), {
    speed: 1, at: null, look: 0, quality: null, fallback: false,
    finale: false, ft: null, stats: false, hideUi: false,
  });
});

test('parses and clamps', () => {
  const p = parseDebugParams('?speed=100&at=300&look=45&quality=high&fallback=1&finale=1&ft=7.5&stats=1&ui=0');
  assert.equal(p.speed, 50);
  assert.equal(p.at, 300);
  assert.equal(p.look, 45);
  assert.equal(p.quality, 'high');
  assert.equal(p.fallback, true);
  assert.equal(p.finale, true);
  assert.equal(p.ft, 7.5);
  assert.equal(p.stats, true);
  assert.equal(p.hideUi, true);
});

test('rejects junk', () => {
  const p = parseDebugParams('?speed=abc&at=-5&quality=ultra&ft=x&look=nope');
  assert.equal(p.speed, 1);
  assert.equal(p.at, null);
  assert.equal(p.quality, null);
  assert.equal(p.ft, null);
  assert.equal(p.look, 0);
});
