import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, zoneAt } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import fixture from '../fixtures/content.fixture.js';

const content = normalizeContent(fixture).content;
const withMoments = (moments) => normalizeContent({ moments }).content;

test('default layout distances', () => {
  const L = buildLayout(content);
  assert.deepEqual(L.zones.map((z) => [z.id, z.start, z.end]),
    [['spring', 0, 210], ['summer', 210, 390], ['autumn', 390, 570], ['winter', 570, 750], ['evening', 750, 990]]);
  assert.deepEqual(L.stops.map((s) => s.distance), [85, 155, 265, 335, 445, 515, 625, 695, 805, 875]);
  assert.deepEqual(L.stops.map((s) => s.side), ['right', 'left', 'right', 'left', 'right', 'left', 'right', 'left', 'right', 'left']);
  assert.equal(L.finaleDistance, 960);
  assert.equal(L.total, 1030);
});

test('a zone without moments is a short scenic stretch', () => {
  const L = buildLayout(withMoments([{ zone: 'spring' }, { zone: 'evening' }]));
  assert.deepEqual(L.zones.map((z) => [z.start, z.end]), [[0, 140], [140, 180], [180, 220], [220, 260], [260, 430]]);
  assert.deepEqual(L.stops.map((s) => s.distance), [85, 315]);
  assert.equal(L.finaleDistance, 400);
  assert.equal(L.total, 470);
});

test('zero moments goes straight to the finale', () => {
  const L = buildLayout(withMoments([]));
  assert.deepEqual(L.stops, []);
  assert.equal(L.zones.at(-1).end, 290);
  assert.equal(L.finaleDistance, 260);
});

test('zoneAt blends across a boundary', () => {
  const L = buildLayout(content);
  assert.deepEqual(zoneAt(L, 100).blend, { a: 'spring', b: 'spring', t: 0 });
  const mid = zoneAt(L, 210).blend;
  assert.equal(mid.a, 'spring');
  assert.equal(mid.b, 'summer');
  assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
  assert.deepEqual(zoneAt(L, 195).blend, { a: 'spring', b: 'spring', t: 0 });
  assert.deepEqual(zoneAt(L, 225).blend, { a: 'summer', b: 'summer', t: 0 });
  assert.ok(zoneAt(L, 224).blend.t > 0.9);
  assert.equal(zoneAt(L, -5).current.id, 'spring');
  assert.equal(zoneAt(L, 5000).current.id, 'evening');
});

test('zones list their moments and stops name them', () => {
  const L = buildLayout(content);
  assert.deepEqual(L.zones.map((z) => z.momentIndices), [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]);
  assert.deepEqual(L.stops.map((s) => [s.index, s.zone]), content.moments.map((m) => [m.index, m.zone]));

  const U = buildLayout(withMoments([{ zone: 'spring' }, { zone: 'winter' }, { zone: 'winter' }, { zone: 'evening' }]));
  assert.deepEqual(U.zones.map((z) => [z.id, z.start, z.end, z.momentIndices]),
    [['spring', 0, 140, [0]], ['summer', 140, 180, []], ['autumn', 180, 220, []], ['winter', 220, 400, [1, 2]], ['evening', 400, 570, [3]]]);
  assert.deepEqual(U.stops.map((s) => [s.index, s.distance, s.zone, s.side]),
    [[0, 85, 'spring', 'right'], [1, 275, 'winter', 'left'], [2, 345, 'winter', 'right'], [3, 455, 'evening', 'left']]);
  assert.equal(U.finaleDistance, 540);
  assert.equal(U.total, 610);
});
