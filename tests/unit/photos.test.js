// Photo loading (Task 10): downscaling and the soft placeholders. Loading itself needs a browser (e2e).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, loadPhotos, PHOTOS, placeholderPalette } from '../../site/src/photos/photos.js';

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

// Loading through the pool (review fix round 1). The loader is injected and the clock is mocked, so these run in
// Node: a fake photo loads when the test says so, or hangs until it is given up on.

/** Lets every pending promise continuation run. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** A loader whose photos load only when `finish(src)` is called, recording when each request started. */
function fakeLoader() {
  const started = [];
  const waiting = new Map();
  let inFlight = 0;
  let most = 0;
  function loadImage(src, signal) {
    started.push({ src, at: Date.now() });
    inFlight++;
    most = Math.max(most, inFlight);
    return new Promise((resolve, reject) => {
      waiting.set(src, () => { inFlight--; resolve({ naturalWidth: 400, naturalHeight: 300 }); });
      signal.addEventListener('abort', () => { inFlight--; reject(new Error('aborted')); });
    });
  }
  return { loadImage, started, finish: (src) => waiting.get(src)(), get most() { return most; } };
}

const momentsFor = (photos) => photos.map((photo, index) => ({ index, photo, date: '', title: '', caption: '', zone: 'spring' }));
const warningFor = (src) => `[photos] Could not load "${src}" — showing a placeholder. Use JPG or PNG.`;

test('the pool and its limits', () => {
  const { CONCURRENCY, TIMEOUT_MS, TOTAL_MS } = PHOTOS;
  assert.deepEqual({ CONCURRENCY, TIMEOUT_MS, TOTAL_MS }, { CONCURRENCY: 3, TIMEOUT_MS: 15000, TOTAL_MS: 45000 });
});

test('photos load three at a time, each timed from its own request, and come back in moment order', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const loader = fakeLoader();
  const progress = [];
  const moments = momentsFor(['p0', 'p1', 'p2', '', 'p4', 'p5', 'p6']);
  let assets = null;
  const onProgress = (done, total) => progress.push([done, total]);
  loadPhotos(moments, { loadImage: loader.loadImage, onProgress }).then((a) => { assets = a; });

  await settle();
  assert.deepEqual(loader.started, [{ src: 'p0', at: 0 }, { src: 'p1', at: 0 }, { src: 'p2', at: 0 }], 'three requests at once');

  t.mock.timers.tick(10000);
  loader.finish('p0');
  await settle();
  // p0 is done, the photo-less moment needs no request, and p4 takes the free place at 10 s.
  assert.deepEqual(loader.started.map((s) => s.src), ['p0', 'p1', 'p2', 'p4']);
  assert.equal(loader.started[3].at, 10000);

  t.mock.timers.tick(5000); // 15 s: p1 and p2 have had their 15 s, p4 only 5 s of its own
  await settle();
  assert.deepEqual(warnings, [warningFor('p1'), warningFor('p2')]);
  assert.deepEqual(loader.started.slice(4), [{ src: 'p5', at: 15000 }, { src: 'p6', at: 15000 }]);

  t.mock.timers.tick(9000); // 24 s: p4 is 14 s into its own request, so it still counts
  loader.finish('p4');
  loader.finish('p5');
  loader.finish('p6');
  await settle();

  assert.ok(assets, 'finished');
  assert.ok(loader.most <= 3, `${loader.most} requests at once`);
  assert.deepEqual(assets.map((a) => a.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(assets.map((a) => a.isPlaceholder), [false, true, true, true, false, false, false]);
  assert.deepEqual(assets.map((a) => a.src).filter((src) => src.startsWith('p')), ['p0', 'p4', 'p5', 'p6']);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7].map((done) => [done, 7]));
  assert.deepEqual(warnings, [warningFor('p1'), warningFor('p2')], 'no more warnings');
});

test('the loading never takes longer than 45 s, however many photos hang', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const loader = fakeLoader();
  const photos = Array.from({ length: 10 }, (_, i) => `p${i}`);
  let assets = null;
  loadPhotos(momentsFor(photos), { loadImage: loader.loadImage }).then((a) => { assets = a; });

  for (const at of [15000, 30000]) {
    await settle();
    t.mock.timers.tick(15000);
    await settle();
    assert.equal(loader.started.length, (at / 15000 + 1) * 3, `three more requests at ${at} ms`);
  }
  t.mock.timers.tick(14999);
  await settle();
  assert.equal(assets, null, 'still waiting just before 45 s');
  t.mock.timers.tick(1);
  await settle();

  assert.ok(assets, 'done at 45 s, though four rounds of 15 s would take 60 s');
  assert.equal(loader.started.length, 9, 'the last photo is never requested');
  assert.ok(assets.every((a, i) => a.isPlaceholder && a.index === i));
  assert.deepEqual(warnings.slice().sort(), photos.map(warningFor).sort());
});

test('a loader that throws, or a picture that cannot be drawn, still gives every moment an asset', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const loadImage = (src) => {
    if (src === 'bad') throw new Error('boom');
    return Promise.resolve({ naturalWidth: 3000, naturalHeight: 4000 });
  };
  const assets = await loadPhotos(momentsFor(['bad', 'ok', '']), { loadImage });
  assert.deepEqual(warnings, [warningFor('bad')]);
  // Node has no canvas, so these stand in for a browser whose canvas fails: no canvas, but nothing breaks.
  assert.deepEqual(assets.map((a) => [a.isPlaceholder, a.canvas]), [[true, null], [false, null], [true, null]]);
  const { width, height, aspect, src } = assets[1];
  assert.deepEqual({ width, height, aspect, src }, { width: 768, height: 1024, aspect: 0.75, src: 'ok' });
});

// Video moments (a photo field ending in .mp4, .m4v, .webm or .mov).

test('a video moment loads as a video, shaped like the clip, alongside photos', async () => {
  const fakeImage = { naturalWidth: 1200, naturalHeight: 900 };
  const fakeVideo = { videoWidth: 540, videoHeight: 960 };
  const loadedVideos = [];
  const assets = await loadPhotos([
    { index: 0, photo: 'photos/01.jpg' },
    { index: 1, photo: 'photos/02.mp4' },
    { index: 2, photo: '' },
  ], {
    loadImage: async () => fakeImage,
    loadVideo: async (src) => { loadedVideos.push(src); return fakeVideo; },
  });
  assert.deepEqual(loadedVideos, ['photos/02.mp4'], 'only the video goes to the video loader');
  assert.deepEqual(assets.map((a) => a.kind), ['image', 'video', 'image']);
  const video = assets[1];
  assert.equal(video.video, fakeVideo);
  assert.equal(video.src, 'photos/02.mp4');
  assert.equal(video.isPlaceholder, false);
  assert.ok(Math.abs(video.aspect - 540 / 960) < 1e-12);
  assert.equal(assets[0].video, null);
});

test('a video that will not load becomes a placeholder, and the warning names it', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const [asset] = await loadPhotos([{ index: 0, photo: 'photos/broken.mov' }], {
    loadVideo: async () => { throw new Error('no'); },
  });
  assert.equal(asset.isPlaceholder, true);
  assert.equal(asset.kind, 'image');
  assert.ok(warnings.some((w) => w.includes('photos/broken.mov') && /MP4/.test(w)), warnings.join('\n'));
});

// Live Photos: the still loads as a photo, and its motion clip (moment.live) rides along on the same asset.

test('a Live Photo loads its still as the photo and its motion beside it', async () => {
  const fakeImage = { naturalWidth: 1200, naturalHeight: 900 };
  const fakeMotion = { videoWidth: 1440, videoHeight: 1080 };
  const asked = [];
  const [live, plain] = await loadPhotos([
    { index: 0, photo: 'photos/04.jpg', live: 'photos/04.mp4' },
    { index: 1, photo: 'photos/05.jpg', live: '' },
  ], {
    loadImage: async () => fakeImage,
    loadVideo: async (src) => { asked.push(src); return fakeMotion; },
  });
  assert.deepEqual(asked, ['photos/04.mp4']);
  assert.equal(live.kind, 'image');
  assert.equal(live.live, fakeMotion);
  assert.ok(Math.abs(live.aspect - 1200 / 900) < 1e-12, 'shaped like the still');
  assert.equal(plain.live, null);
});

test('a Live Photo whose motion will not load keeps its still, and the warning names the motion', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (message) => warnings.push(message));
  const [asset] = await loadPhotos([{ index: 0, photo: 'photos/04.jpg', live: 'photos/04.mov' }], {
    loadImage: async () => ({ naturalWidth: 800, naturalHeight: 600 }),
    loadVideo: async () => { throw new Error('no'); },
  });
  assert.equal(asset.isPlaceholder, false);
  assert.equal(asset.live, null);
  assert.ok(warnings.some((w) => w.includes('photos/04.mov')), warnings.join('\n'));
});
