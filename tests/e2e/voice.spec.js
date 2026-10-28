// His voice note at the finale (content.js finale.voice, audio/voiceNote.js): it is unlocked by her tap on Begin, plays
// by itself as his message writes itself on the last card if her sound is on, and everything else fades out under it
// and comes back after. A round button on the card plays it again. The note is a short sine, made here as a WAV.
//
// Her tap on Begin has to be a real one, on the same page as the finale: the unlock does not outlive a navigation. So
// every moment is marked as reached on an earlier visit, and after Begin the timeline takes her to the last one, from
// where the train runs on to the Day 365 station at ?speed=50.
import { test, expect } from '@playwright/test';
import fixture from '../fixtures/content.fixture.js';
import { useFixture, appState, waitForPhase, collectConsoleErrors, trackAudio, audioReport } from './helpers.js';

/** A WAV file: 16-bit PCM, mono, 8 kHz, `seconds` of a soft 440 Hz sine. */
function wav(seconds) {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), 44 + i * 2);
  return b;
}

/**
 * The fixture with his voice note, served as a WAV `seconds` long: 1.5 s, or longer where a test has to catch it
 * while it plays.
 */
async function withVoice(page, seconds = 1.5) {
  const body = wav(seconds);
  await page.route('**/site/voice/test.wav', (route) => route.fulfill({ contentType: 'audio/wav', body }));
  await useFixture(page, { finale: { ...fixture.finale, voice: 'voice/test.wav' } });
}

/** Before page.goto: every moment was reached on an earlier visit (progress.js), so the timeline opens them all. */
const reachedAll = (page) => page.addInitScript(() => {
  localStorage.setItem('pictureTrain.progress.v1', JSON.stringify({ reachedMax: 9 }));
});

/** Loads the ride, fast, and taps Begin: the tap that unlocks his voice note. */
async function begin(page) {
  await reachedAll(page);
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect.poll(async () => (await appState(page)).phase).toMatch(/riding|stopped/);
}

/** From the ride: by the timeline to the last moment, then on to the finale, until its card is up. */
async function rideToFinale(page) {
  await page.locator('#timeline button').last().click();
  await expect(page.locator('#stop-card')).toContainText('Our dinner');
  await page.getByRole('button', { name: 'Continue' }).click();
  await waitForPhase(page, 'done');
}

const voiceState = async (page) => (await appState(page)).voice;
const states = async (page) => (await audioReport(page)).states;
/** The ride's AudioContext, looked at often: the 1.5 s note leaves only a second or so to see it suspended. */
const often = { intervals: [50] };
/** His voice note's element (trackAudio keeps every media element played): { paused, time }. */
const voiceElement = (page) => page.evaluate(() => {
  const m = [...window.__audio.media].find((e) => e.src.includes('/voice/test.wav'));
  return m ? { paused: m.paused, time: m.currentTime } : null;
});

test('his voice note plays as his message is written, everything else fading out under it and back after', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  await withVoice(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  expect(await voiceState(page)).toBe('idle');
  await rideToFinale(page);

  const button = page.locator('#finale-card .voice-note');
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect(button).toHaveAttribute('aria-label', 'Pause my voice note');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // The music, the fireworks and the rest of the ride's sound fade out for him: their AudioContext rests meanwhile.
  await expect.poll(() => states(page), often).toEqual(['suspended']);

  await expect.poll(() => voiceState(page)).toBe('ended');
  await expect(button).toHaveAttribute('aria-label', 'Play my voice note');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(Number(await button.locator('.voice-note-ring').getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 1); // the ring is full
  await expect.poll(() => states(page)).toEqual(['running']);
  const s = await appState(page);
  expect([s.music, s.audioSuspended]).toEqual(['playing', false]);

  // A tap plays it again from its start.
  const box = await button.boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await button.click();
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect.poll(() => voiceState(page)).toBe('ended');
  expect(errors).toEqual([]);
});

test('with the Sound button off it waits for her tap on its button, and leaves the sound off', async ({ page }) => {
  await trackAudio(page);
  await withVoice(page);
  await begin(page);
  const sound = page.getByRole('button', { name: 'Sound', exact: true, pressed: true });
  await sound.click();
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  await rideToFinale(page);

  const button = page.getByRole('button', { name: 'Play my voice note' });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(2000); // well past when it would have started
  expect(await voiceState(page)).toBe('idle');
  expect(await voiceElement(page)).toEqual({ paused: true, time: 0 });

  await button.click();
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect(page.getByRole('button', { name: 'Pause my voice note' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => voiceState(page)).toBe('ended');
  expect((await appState(page)).music).toBe('off'); // her tap played his voice, not the ride's sound
});

test('Ride again while it plays stops it, and the sound comes back', async ({ page }) => {
  await trackAudio(page);
  await withVoice(page, 8);
  await begin(page);
  await rideToFinale(page);
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect.poll(() => states(page)).toEqual(['suspended']);

  await page.getByRole('button', { name: 'Ride again' }).click();
  await expect.poll(() => voiceState(page)).toBe('idle');
  expect(await voiceElement(page)).toEqual({ paused: true, time: 0 }); // back at its start
  await waitForPhase(page, 'riding');
  await expect.poll(() => states(page)).toEqual(['running']);
  const s = await appState(page);
  expect([s.music, s.audioSuspended]).toEqual(['playing', false]);
});

test('a jump from the finale to a moment stops it too, and the sound comes back', async ({ page }) => {
  await trackAudio(page);
  await withVoice(page, 8);
  await begin(page);
  await rideToFinale(page);
  await expect.poll(() => voiceState(page)).toBe('playing');

  await page.locator('#timeline button').nth(3).click();
  await expect(page.locator('#stop-card')).toContainText('Sunset pier');
  expect(await voiceState(page)).toBe('idle');
  expect(await voiceElement(page)).toEqual({ paused: true, time: 0 });
  await expect.poll(() => states(page)).toEqual(['running']);
  expect((await appState(page)).music).toBe('playing');
});

test('the page going into the background pauses it, and the sound comes back with the page', async ({ page }) => {
  await trackAudio(page);
  await withVoice(page, 8);
  await begin(page);
  await rideToFinale(page);
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect.poll(() => states(page)).toEqual(['suspended']);

  /** Sends the page into the background (true) or back (false), as a phone does. */
  const background = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await background(true);
  expect(await voiceState(page)).toBe('paused'); // there and then
  const where = await voiceElement(page);
  expect(where.paused).toBe(true);
  expect(where.time).toBeGreaterThan(0);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(true);

  await background(false);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(false);
  await expect.poll(() => states(page)).toEqual(['running']); // the ride's sound is back, no longer under his voice
  expect((await appState(page)).music).toBe('playing');
  expect(await voiceState(page)).toBe('paused'); // and he waits for her tap
  const button = page.getByRole('button', { name: 'Play my voice note' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect.poll(() => voiceState(page)).toBe('playing');
  expect((await voiceElement(page)).time).toBeGreaterThanOrEqual(where.time); // on from where it was
});

test('with no voice note there is no button', async ({ page }) => {
  await useFixture(page);
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  await expect(page.getByRole('button', { name: 'Ride again' })).toBeVisible();
  await expect(page.locator('.voice-note')).toHaveCount(0);
  expect(await voiceState(page)).toBe('none');
});

test('a voice note that cannot be played: a friendly warning naming it, and no button', async ({ page }) => {
  const errors = collectConsoleErrors(page, { ignore: [/404/, /Failed to load resource/] });
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.route('**/site/voice/test.wav', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }));
  await useFixture(page, { finale: { ...fixture.finale, voice: 'voice/test.wav' } });
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  await expect.poll(() => voiceState(page)).toBe('failed');
  await expect(page.locator('.voice-note')).toBeHidden();
  expect(warnings).toContain('[content.js] finale.voice: "voice/test.wav" could not be played, so there is no voice note.');
  await expect(page.getByRole('button', { name: 'Ride again' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the 2D story has the same button, which plays it on her tap', async ({ page }) => {
  await withVoice(page);
  await page.goto('index.html?fallback=1');
  await waitForPhase(page, 'fallback');
  const button = page.locator('#fallback .voice-note');
  await expect(button).toHaveAttribute('aria-label', 'Play my voice note');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(1000);
  expect(await voiceState(page)).toBe('idle'); // nothing plays by itself here
  await button.click();
  await expect.poll(() => voiceState(page)).toBe('playing');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => voiceState(page)).toBe('ended');
});
