// Each scene's music as numbers (site/src/audio/zoneMusic.js): which piece plays in which zone, how two pieces
// crossfade at a zone boundary (a dip: never two loud together), where a recording's loop fades, when a recording
// starts loading, and how loud each recording is played.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECES, PIECE_NAMES, TUNE_LUFS, ZONE_MUSIC, pieceFor, pieceShare, pieceShares, seamLevel, zonesToLoad,
} from '../../site/src/audio/zoneMusic.js';
import { ZONE_IDS } from '../../site/src/content/normalize.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import fixture from '../fixtures/content.fixture.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const playable = { spring: { failed: false }, summer: { failed: false }, autumn: { failed: false }, evening: { failed: false } };

test('every scene but winter has its recording; winter has the carol; the tune is only a fallback', () => {
  assert.deepEqual(Object.keys(PIECES).sort(), ['autumn', 'evening', 'spring', 'summer']);
  for (const [zone, piece] of Object.entries(PIECES)) {
    assert.equal(piece.file, `music/zones/${zone}.mp3`, 'a path relative to the page');
  }
  assert.deepEqual(PIECE_NAMES, ['tune', ...ZONE_IDS]);
  for (const zone of ['spring', 'summer', 'autumn', 'evening']) assert.equal(pieceFor(zone, playable), zone);
  assert.equal(pieceFor('winter', playable), 'winter', 'the carol');
  assert.equal(pieceFor('winter', {}), 'winter', 'the carol needs no file');
});

test('a recording that cannot play gives its scene the built-in tune, and only its scene', () => {
  const broken = { ...playable, summer: { failed: true } };
  assert.equal(pieceFor('summer', broken), 'tune');
  assert.equal(pieceFor('spring', broken), 'spring');
  assert.equal(pieceFor('autumn', broken), 'autumn');
  assert.equal(pieceFor('spring', {}), 'tune', 'no recording at all: the tune');
  const held = { ...playable, autumn: { failed: false, blocked: true } };
  assert.equal(pieceFor('autumn', held), 'tune', 'held back until a tap: the tune for now');
});

test('each recording is trimmed to the tune\'s loudness: its trim makes up the gap from its measured LUFS', () => {
  for (const piece of Object.values(PIECES)) {
    assert.ok(piece.lufs <= -24 && piece.lufs >= -27, 'the files were normalised to about −25 to −26 LUFS');
    assert.ok(close(piece.lufs + 20 * Math.log10(piece.trim), TUNE_LUFS, 1e-9), `${piece.file} lands on the tune`);
  }
  // The quietest file is lifted the most.
  const trims = Object.entries(PIECES).sort((a, b) => a[1].lufs - b[1].lufs).map(([, p]) => p.trim);
  for (let i = 1; i < trims.length; i++) assert.ok(trims[i] <= trims[i - 1]);
});

test('a piece\'s share follows its zone\'s weight: none until past the middle, all of it at the full weight', () => {
  assert.equal(pieceShare(0), 0);
  assert.equal(pieceShare(1), 1);
  assert.equal(pieceShare(0.45), 0, 'silent until its zone is nearly half the blend');
  assert.ok(pieceShare(0.5) > 0 && pieceShare(0.5) < 0.25, 'barely there at the boundary itself');
  let last = 0;
  for (let w = 0; w <= 1.0001; w += 0.01) {
    const share = pieceShare(w);
    assert.ok(share >= last - 1e-12, `it only grows (${w})`);
    last = share;
  }
  assert.equal(pieceShare(-1), 0);
  assert.equal(pieceShare(2), 1);
});

test('at every zone boundary the two pieces dip: never both loud, never louder together than one alone', () => {
  for (let i = 0; i < ZONE_IDS.length; i++) {
    for (let j = 0; j < ZONE_IDS.length; j++) {
      if (i === j) continue;
      const [a, b] = [ZONE_IDS[i], ZONE_IDS[j]];
      const pa = pieceFor(a, playable);
      const pb = pieceFor(b, playable);
      let dipped = false;
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const shares = pieceShares({ [a]: 1 - t, [b]: t }, playable, {});
        assert.ok(!(shares[pa] > 0.25 && shares[pb] > 0.25), `${a} to ${b} at ${t}: ${shares[pa]}, ${shares[pb]}`);
        assert.ok(shares[pa] ** 2 + shares[pb] ** 2 <= 1 + 1e-9, `${a} to ${b} at ${t}: no louder together`);
        for (const name of PIECE_NAMES) {
          if (name !== pa && name !== pb) assert.equal(shares[name], 0, `${name} stays silent between ${a} and ${b}`);
        }
        if (shares[pa] < 0.25 && shares[pb] < 0.25) dipped = true;
      }
      assert.ok(dipped, `${a} to ${b} dips`);
      const start = pieceShares({ [a]: 1, [b]: 0 }, playable, {});
      const end = pieceShares({ [a]: 0, [b]: 1 }, playable, {});
      assert.deepEqual([start[pa], start[pb], end[pa], end[pb]], [1, 0, 0, 1]);
    }
  }
});

test('the carol takes over from the tune exactly as before: the same dip, the tune gone by the middle', () => {
  // Autumn's recording missing: autumn plays the tune, so this is the tune giving way to the carol.
  for (let w = 0; w <= 1.0001; w += 0.05) {
    const shares = pieceShares({ autumn: 1 - w, winter: w }, {}, {});
    const tune = Math.cos((Math.PI / 2) * Math.min(1, w / ZONE_MUSIC.MIX_OVERLAP));
    assert.ok(close(shares.tune, w >= ZONE_MUSIC.MIX_OVERLAP ? 0 : tune, 1e-9), `tune at ${w}`);
    assert.ok(close(shares.tune, pieceShare(1 - w), 1e-12));
    assert.ok(close(shares.winter, pieceShare(w), 1e-12));
  }
});

test('two zones playing the same piece play it whole across their boundary: no dip, no new start', () => {
  const failed = { ...playable, spring: { failed: true }, summer: { failed: true } };
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const shares = pieceShares({ spring: 1 - t, summer: t }, failed, {});
    assert.ok(close(shares.tune, 1, 1e-9), `the tune at ${t}`);
  }
});

test('pieceShares writes into the object it is given, every piece named', () => {
  const out = {};
  assert.equal(pieceShares({ spring: 1 }, playable, out), out);
  assert.deepEqual(Object.keys(out).sort(), [...PIECE_NAMES].sort());
  assert.equal(out.spring, 1);
  assert.equal(pieceShares({}, playable, out).spring, 0, 'no weights yet: nothing plays');
});

test('the loop seam: a recording fades out over its last seconds, and in again only after it has looped', () => {
  const { SEAM_OUT, SEAM_IN } = ZONE_MUSIC;
  assert.ok(SEAM_OUT >= 2 && SEAM_OUT <= 5, 'a gentle fade, seconds long');
  assert.ok(SEAM_IN >= 0.5 && SEAM_IN <= 2);
  const D = 87;
  assert.equal(seamLevel(0, D, false), 1, 'its first pass starts at full: its zone\'s crossfade brings it in');
  assert.equal(seamLevel(40, D, false), 1);
  assert.equal(seamLevel(D - SEAM_OUT, D, false), 1, 'the fade out begins SEAM_OUT before the end');
  assert.ok(close(seamLevel(D - SEAM_OUT / 2, D, false), 0.5, 1e-9));
  assert.equal(seamLevel(D, D, false), 0, 'silent at the seam');
  assert.equal(seamLevel(0, D, true), 0, 'after the seam it comes back from silence');
  assert.ok(close(seamLevel(SEAM_IN / 2, D, true), 0.5, 1e-9));
  assert.equal(seamLevel(SEAM_IN, D, true), 1);
  assert.equal(seamLevel(D - SEAM_OUT / 2, D, true), seamLevel(D - SEAM_OUT / 2, D, false), 'every pass fades out');
  // While the file's length is not known yet, nothing is faded.
  assert.equal(seamLevel(3, NaN, false), 1);
  assert.equal(seamLevel(3, Infinity, true), 1);
  assert.equal(seamLevel(0, 0, true), 1);
});

test('a recording starts loading once its zone is within PRELOAD_RANGE of the train, or is the next zone', () => {
  const { content } = normalizeContent(fixture);
  const L = buildLayout(content);
  const zone = (id) => L.zones.find((z) => z.id === id);
  assert.ok(ZONE_MUSIC.PRELOAD_RANGE >= 200 && ZONE_MUSIC.PRELOAD_RANGE <= 300, 'about 250 m');
  const nearIn = (zones, d) => Object.entries(zonesToLoad(zones, d, {})).filter(([, yes]) => yes).map(([id]) => id);
  const near = (d) => nearIn(L.zones, d);

  // At the start: the meadow and the beach (the next zone, 210 m on), not the rest.
  assert.deepEqual(near(0), ['spring', 'summer']);
  // The autumn forest comes in exactly PRELOAD_RANGE before it begins.
  const autumn = zone('autumn').start;
  assert.ok(!near(autumn - ZONE_MUSIC.PRELOAD_RANGE - 1).includes('autumn'));
  assert.ok(near(autumn - ZONE_MUSIC.PRELOAD_RANGE).includes('autumn'));
  // Inside the beach the forest is next; the meadow behind still counts while it is near.
  const beach = (zone('summer').start + zone('summer').end) / 2;
  assert.deepEqual(near(beach), ['spring', 'summer', 'autumn']);
  // A long zone: its next zone loads from the moment the train is in it, though it is more than 250 m away.
  const long = [{ id: 'spring', start: 0, end: 900 }, { id: 'summer', start: 900, end: 1000 }, { id: 'evening', start: 1000, end: 1100 }];
  assert.deepEqual(nearIn(long, 10), ['spring', 'summer']);
  // At the finale (the winter hills 210 m behind it) and past the end of the track.
  assert.deepEqual(near(L.finaleDistance), ['winter', 'evening']);
  assert.deepEqual(near(L.total + 100), ['evening']);
  // Every zone is named, true or false, in the object it is given.
  const out = {};
  assert.equal(zonesToLoad(L.zones, 0, out), out);
  assert.deepEqual(Object.keys(out).sort(), [...ZONE_IDS].sort());
});
