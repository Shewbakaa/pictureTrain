// Photo loading (Task 10): downscaling and the soft placeholders. Loading itself needs a browser (e2e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, placeholderPalette } from '../../site/src/photos/photos.js';

test('fitWithin keeps aspect and never upscales', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1024), { width: 1024, height: 768 });
  assert.deepEqual(fitWithin(3024, 4032, 1024), { width: 768, height: 1024 });
  assert.deepEqual(fitWithin(800, 600, 1024), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, NaN, 1024), { width: 1024, height: 1024 });
});

test('placeholder palettes are deterministic and varied', () => {
  assert.deepEqual(placeholderPalette(3), placeholderPalette(3));
  assert.ok(new Set([0, 1, 2, 3, 4].map((i) => placeholderPalette(i).from)).size >= 5);
});

// Beyond the brief.

test('fitWithin keeps at least a pixel on each side of an extreme panorama', () => {
  assert.deepEqual(fitWithin(20000, 10, 1024), { width: 1024, height: 1 });
  assert.deepEqual(fitWithin(Infinity, 600, 1024), { width: 1024, height: 1024 });
});

test('placeholder palettes cycle, and any index gets one', () => {
  const hex = /^#[0-9a-f]{6}$/i;
  const firsts = [];
  for (let i = 0; i < 24; i++) {
    const p = placeholderPalette(i);
    assert.ok(hex.test(p.from) && hex.test(p.to) && hex.test(p.ink), JSON.stringify(p));
    firsts.push(p.from);
  }
  const period = firsts.indexOf(firsts[0], 1);
  assert.ok(period >= 5, 'at least five palettes before they repeat');
  assert.deepEqual(placeholderPalette(period + 2), placeholderPalette(2));
  for (const odd of [-1, NaN, 2.5]) assert.ok(hex.test(placeholderPalette(odd).from), String(odd));
});
