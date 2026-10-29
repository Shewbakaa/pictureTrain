import { test, expect } from '@playwright/test';
import { useFixture, appState, trackAudio, audioReport, collectConsoleErrors } from './helpers.js';

const wav = () => {
  const n = 8000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
};
const begin = async (page) => { await page.goto('index.html'); await page.getByRole('button', { name: 'Begin the ride' }).click(); };

const states = async (page) => (await audioReport(page)).states;
/** The Sound button: a toggle named "Sound", pressed while the sound is on. */
const soundButton = (page, pressed) => page.getByRole('button', { name: 'Sound', exact: true, pressed });
/** Each scene's recording that has a file, by zone: { paused, time }. */
const pieces = async (page) => (await audioReport(page)).pieces;
/** Resolves once `zone`'s recording is playing and has got going. */
const playing = (page, zone) => expect.poll(async () => {
  const piece = (await pieces(page))[zone];
  return Boolean(piece && !piece.paused && piece.time > 0);
}, { message: `${zone}'s recording plays` }).toBe(true);
/** The fixture's moments, in ride order. */
const TITLES = ['First coffee', 'Rainy walk', 'Beach day', 'Sunset pier', 'Pumpkin patch', 'Movie night', 'First snow', 'Ice skating', 'City lights', 'Our dinner'];
/** From the stop card that is up, rides on with Continue, stop by stop, until the card for `title` is up. */
const rideTo = async (page, title) => {
  const card = page.locator('#stop-card');
  await expect(card).toBeVisible();
  const text = await card.textContent();
  let at = TITLES.findIndex((t) => text.includes(t));
  while (TITLES[at] !== title) {
    await page.getByRole('button', { name: 'Continue' }).click();
    at += 1;
    await expect(card).toContainText(TITLES[at]);
  }
};

test('each scene\'s music plays after Begin, and the Sound button turns all sound off and on', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  expect((await appState(page)).musicSource).toBe('built-in');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');
  await playing(page, 'spring');
  await expect.poll(async () => (await pieces(page)).spring.time).toBeGreaterThan(1);
  // One AudioContext for the music and the train's sounds.
  await expect.poll(() => states(page)).toEqual(['running']);
  await expect(soundButton(page, true)).toBeVisible();

  await soundButton(page, true).click();
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  await expect(soundButton(page, false)).toBeVisible();
  await expect.poll(() => states(page)).toEqual(['suspended']);
  await expect.poll(async () => (await pieces(page)).spring.paused).toBe(true);
  const heldAt = (await pieces(page)).spring.time;

  await soundButton(page, false).click();
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect(soundButton(page, true)).toBeVisible();
  await expect.poll(() => states(page)).toEqual(['running']);
  // The meadow's piece plays on from where it was held (give or take the browser's rounding), not from its top.
  await playing(page, 'spring');
  expect((await pieces(page)).spring.time).toBeGreaterThan(heldAt - 0.25);
});

test('the train whistles as it sets off and chugs along, and is quiet while the sound is off', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await audioReport(page)).whistles).toBe(1);
  await expect.poll(async () => (await audioReport(page)).sounds).toBeGreaterThanOrEqual(2); // the whistle, the steam
  await expect.poll(async () => (await audioReport(page)).sounds, { timeout: 10_000 }).toBeGreaterThanOrEqual(5); // chugs

  await soundButton(page, true).click();
  await expect.poll(() => states(page)).toEqual(['suspended']);
  const quiet = (await audioReport(page)).sounds;
  await page.waitForTimeout(2500); // the train rides on: three chugs and a joint's clicks, with the sound on
  expect((await audioReport(page)).sounds).toBe(quiet);

  await soundButton(page, false).click();
  await expect.poll(async () => (await audioReport(page)).sounds, { timeout: 5000 }).toBeGreaterThan(quiet);
});

test('the meadow\'s ambience comes in with the sound, and the Sound button silences it too', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect.poll(async () => (await appState(page)).ambience).toEqual(['spring']); // the breeze

  await soundButton(page, true).click();
  await expect.poll(() => states(page)).toEqual(['suspended']);
  const quiet = await audioReport(page);
  await page.waitForTimeout(3000); // birds would sing, the breeze gust, the tune and the train go on, with sound
  const after = await audioReport(page);
  expect([after.sounds, after.tones]).toEqual([quiet.sounds, quiet.tones]);

  await soundButton(page, false).click();
  await expect.poll(() => states(page)).toEqual(['running']);
  await playing(page, 'spring'); // the meadow's piece, with its breeze and its birds
  expect((await appState(page)).ambience).toEqual(['spring']);
});

test('a missing song falls back to each scene\'s own music', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await trackAudio(page);
  await useFixture(page, { music: 'music/missing.mp3' });
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('built-in');
  await expect.poll(() => warnings.some((w) => w.includes('music/missing.mp3'))).toBe(true);
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');
  await playing(page, 'spring'); // unlocked by the Begin tap, though her song was to play then
});

test('riding from the meadow to the beach, the music goes from spring\'s piece to summer\'s, two at most at once', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  await useFixture(page);
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');
  await playing(page, 'spring');
  // Only the pieces near the train have been fetched: the meadow's and the beach's (the next scene, 125 m on).
  const start = await audioReport(page);
  expect(Object.keys(start.pieces).sort()).toEqual(['spring', 'summer']);
  expect(start.unloaded).toBe(2);
  expect(start.pieces.summer.paused).toBe(true);

  await rideTo(page, 'Beach day');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('summer');
  await playing(page, 'summer');
  // The meadow's piece has paused and gone back to its top, ready for another ride.
  await expect.poll(async () => (await pieces(page)).spring).toEqual({ paused: true, time: 0 });
  const report = await audioReport(page);
  expect(report.mostPieces).toBeGreaterThanOrEqual(1);
  expect(report.mostPieces).toBeLessThanOrEqual(2);
  expect(report.states).toEqual(['running']);
  expect(errors).toEqual([]);
});

test('a jump along the timeline takes the music with it: the carol in the winter hills, the evening\'s nocturne', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pictureTrain.progress.v1', JSON.stringify({ reachedMax: 9 })));
  await trackAudio(page);
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await playing(page, 'spring');

  await page.locator('#timeline button').nth(6).click();
  await expect(page.locator('#stop-card')).toContainText('First snow');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('winter');
  await expect.poll(async () => (await appState(page)).carol).toBe(1);
  await expect.poll(async () => (await pieces(page)).spring).toEqual({ paused: true, time: 0 });

  await page.locator('#timeline button').nth(8).click();
  await expect(page.locator('#stop-card')).toContainText('City lights');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('evening');
  await playing(page, 'evening');
  expect((await appState(page)).carol).toBe(0);
  expect((await audioReport(page)).mostPieces).toBeLessThanOrEqual(2);
});

test('a scene whose recording is missing plays the built-in tune, and the warning names the file', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await trackAudio(page);
  await useFixture(page);
  await page.route('**/music/zones/summer.mp3', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }));
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');

  await rideTo(page, 'Beach day');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('tune');
  expect(warnings).toContain('[music] Could not play "music/zones/summer.mp3", so the built-in tune plays in this scene instead.');
  const tones = (await audioReport(page)).tones;
  await expect.poll(async () => (await audioReport(page)).tones, { message: 'the tune\'s notes' }).toBeGreaterThan(tones + 10);

  // On into the forest: its own piece again.
  await rideTo(page, 'Pumpkin patch');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('autumn');
  await playing(page, 'autumn');
  expect(warnings.filter((w) => w.includes('music/zones/'))).toHaveLength(1);
});

test('a scene\'s recording the browser holds back for want of a tap plays the tune until a tap on Sound lets it go', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await trackAudio(page);
  // As a phone would if the Begin tap had not unlocked it: the beach's piece is refused until a later tap.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes('/music/zones/summer.mp3') && !window.__tapped) {
        return Promise.reject(new DOMException('held back until a tap', 'NotAllowedError'));
      }
      return play.apply(this, args);
    };
  });
  await useFixture(page);
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await rideTo(page, 'Beach day');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('tune');
  expect(warnings).toContain('[music] The browser held back "music/zones/summer.mp3" until a tap, so the built-in tune plays in this scene for now.');
  expect(warnings.some((w) => w.includes('Could not play'))).toBe(false);

  // Her taps on the Sound button, off and on again: the first lets the beach's piece go.
  await page.evaluate(() => { window.__tapped = true; });
  await soundButton(page, true).click();
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('summer');
  await expect.poll(() => states(page)).toEqual(['suspended']);
  await soundButton(page, false).click();
  await playing(page, 'summer');
  expect((await appState(page)).musicPiece).toBe('summer');
});

test('with the sound off no scene\'s file is fetched; back on, the scene\'s piece is fetched and plays', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await playing(page, 'spring');
  await soundButton(page, true).click();
  await expect.poll(() => states(page)).toEqual(['suspended']);

  await rideTo(page, 'Pumpkin patch'); // past the forest's 250 m mark and into it, with the sound off
  const off = await audioReport(page);
  expect(Object.keys(off.pieces).sort()).toEqual(['spring', 'summer']); // fetched at Begin, with the sound on
  expect(off.unloaded).toBe(2);
  expect((await appState(page)).musicPiece).toBe('autumn'); // the scene still calls for it

  await soundButton(page, false).click();
  await playing(page, 'autumn');
});

test('a song file is used when present, with the train\'s sounds beside it', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page, { music: 'music/tone.wav' });
  await page.route('**/music/tone.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }));
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('file');
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect.poll(() => states(page)).toEqual(['running']);
  expect((await appState(page)).musicPiece).toBe('file');
});

test('her own song plays on through every scene: no scene\'s piece, and no carol, ever comes in', async ({ page }) => {
  const fetched = [];
  page.on('request', (r) => { if (r.url().includes('/music/zones/')) fetched.push(r.url()); });
  await trackAudio(page);
  await useFixture(page, { music: 'music/tone.wav' });
  await page.route('**/music/tone.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }));
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect.poll(async () => (await appState(page)).musicSource).toBe('file');
  const zones = { 'First coffee': 'spring', 'Beach day': 'summer', 'Pumpkin patch': 'autumn', 'First snow': 'winter', 'City lights': 'evening' };
  for (const [title, zone] of Object.entries(zones)) {
    await rideTo(page, title);
    await expect.poll(async () => (await appState(page)).ambience).toContain(zone); // the sound is on, in that scene
    const s = await appState(page);
    expect([s.musicSource, s.music, s.musicPiece, s.carol], title).toEqual(['file', 'playing', 'file', 0]);
  }
  const report = await audioReport(page);
  expect(report.pieces).toEqual({});
  expect(report.mostPieces).toBe(0);
  expect(fetched).toEqual([]);
});

test('backgrounding suspends and restores audio', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  /** Sends the page into the background or back; returns whether each scene's element was paused right after. */
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return [...window.__audio.media].filter((m) => m.src.includes('/music/zones/')).map((m) => m.paused);
  }, hidden);
  await playing(page, 'spring');
  // Every recording is paused there and then, without waiting for a timer (a background page's may not run).
  expect((await setHidden(true)).every(Boolean)).toBe(true);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(true);
  await expect.poll(() => states(page)).toEqual(['suspended']);
  await setHidden(false);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(false);
  await expect.poll(() => states(page)).toEqual(['running']);
  expect((await appState(page)).music).toBe('playing');
  await playing(page, 'spring');
});

/** Sends the page into the background (true) or back (false), as a phone does. */
const background = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, 'hidden', { value: h, configurable: true });
  Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test('the page hidden moments after Sound off: the scene\'s piece pauses there and then, not when the fade\'s timer comes', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await playing(page, 'spring');
  // Sound off, then into the background before its 0.4 s fade is over: a background page's timers may never run.
  const paused = await page.evaluate(() => {
    document.getElementById('music-toggle').click();
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return [...window.__audio.media].filter((m) => m.src.includes('/music/zones/')).map((m) => m.paused);
  });
  expect(paused.length).toBeGreaterThan(0);
  expect(paused.every(Boolean)).toBe(true);
  expect((await appState(page)).music).toBe('off');
});

test('sound first made outside a tap (the Begin tap could not make it) still gives each scene its own piece', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  // The first AudioContext this page asks for is refused, as an odd webview might.
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    let refused = false;
    window.AudioContext = class extends Base {
      constructor(...args) {
        if (!refused) {
          refused = true;
          throw new Error('not now');
        }
        super(...args);
      }
    };
  });
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  // Coming back to the page turns the sound on without a tap, and this time the context can be made.
  await background(page, true);
  await background(page, false);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');
  await playing(page, 'spring');
  expect(errors).toEqual([]);
});
