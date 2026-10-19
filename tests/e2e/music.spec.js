import { test, expect } from '@playwright/test';
import { useFixture, appState } from './helpers.js';

const wav = () => {
  const n = 8000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
};
const begin = async (page) => { await page.goto('index.html'); await page.getByRole('button', { name: 'Begin the ride' }).click(); };

test('generated music plays after Begin and toggles', async ({ page }) => {
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  expect((await appState(page)).musicSource).toBe('generated');
  await page.locator('#music-toggle').click();
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  await page.locator('#music-toggle').click();
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
});

test('a missing song falls back to the built-in tune', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await useFixture(page, { music: 'music/missing.mp3' });
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('generated');
  await expect.poll(() => warnings.some((w) => w.includes('music/missing.mp3'))).toBe(true);
});

test('a song file is used when present', async ({ page }) => {
  await useFixture(page, { music: 'music/tone.wav' });
  await page.route('**/music/tone.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }));
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('file');
});

test('backgrounding suspends and restores audio', async ({ page }) => {
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
  await setHidden(false);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(false);
  expect((await appState(page)).music).toBe('playing');
});
