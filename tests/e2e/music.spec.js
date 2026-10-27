import { test, expect } from '@playwright/test';
import { useFixture, appState, trackAudio, audioReport } from './helpers.js';

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

test('generated music plays after Begin, and the Sound button turns all sound off and on', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  expect((await appState(page)).musicSource).toBe('generated');
  // One AudioContext for the music and the train's sounds.
  await expect.poll(() => states(page)).toEqual(['running']);
  await expect(soundButton(page, true)).toBeVisible();

  await soundButton(page, true).click();
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  await expect(soundButton(page, false)).toBeVisible();
  await expect.poll(() => states(page)).toEqual(['suspended']);

  await soundButton(page, false).click();
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect(soundButton(page, true)).toBeVisible();
  await expect.poll(() => states(page)).toEqual(['running']);
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

test('a missing song falls back to the built-in tune', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await useFixture(page, { music: 'music/missing.mp3' });
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('generated');
  await expect.poll(() => warnings.some((w) => w.includes('music/missing.mp3'))).toBe(true);
});

test('a song file is used when present, with the train\'s sounds beside it', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page, { music: 'music/tone.wav' });
  await page.route('**/music/tone.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }));
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('file');
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await expect.poll(() => states(page)).toEqual(['running']);
});

test('backgrounding suspends and restores audio', async ({ page }) => {
  await trackAudio(page);
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(true);
  await expect.poll(() => states(page)).toEqual(['suspended']);
  await setHidden(false);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(false);
  await expect.poll(() => states(page)).toEqual(['running']);
  expect((await appState(page)).music).toBe('playing');
});
