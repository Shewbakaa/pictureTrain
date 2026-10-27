// Video moments: a clip plays in the stop card, muted, and its speaker turns the sound on (and all the ride's other
// sound off for it: the music, the train and the ambience share one AudioContext, which is suspended meanwhile).
// The clips are tiny test cards: H.264 for WebKit (the iPhone project), VP8 for Playwright's Chromium, which has no
// H.264. They are served from tests/fixtures through the same server as the site, which answers range requests as
// Safari needs.
import { test, expect } from '@playwright/test';
import { useFixture, appState, collectConsoleErrors, trackAudio, audioReport } from './helpers.js';

const states = async (page) => (await audioReport(page)).states;

const clip = (browserName) => (browserName === 'webkit' ? '../tests/fixtures/clip.mp4' : '../tests/fixtures/clip.webm');

async function videoFirst(page, photo) {
  const { default: base } = await import('../fixtures/content.fixture.js');
  await useFixture(page, { moments: base.moments.map((m, i) => (i === 0 ? { ...m, photo } : m)) });
}

test('a video moment plays muted in its card, and its speaker turns the sound on until Continue', async ({ page, browserName }) => {
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  await videoFirst(page, clip(browserName));
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();

  const video = page.locator('#stop-card video.stop-video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v) => !v.paused && v.currentTime > 0)).toBe(true);
  expect(await video.evaluate((v) => v.muted && v.loop && v.playsInline)).toBe(true);
  await expect(page.locator('#stop-card')).toContainText('First coffee');

  const soundOn = page.getByRole('button', { name: 'Turn the video sound on' });
  const box = await soundOn.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await soundOn.click();
  await expect(page.getByRole('button', { name: 'Turn the video sound off' })).toHaveAttribute('aria-pressed', 'true');
  expect(await video.evaluate((v) => v.muted)).toBe(false);
  expect((await appState(page)).videoSound).toBe(true);
  await expect.poll(() => states(page)).toEqual(['suspended']); // music, train and ambience all duck for it
  // Nothing starts while it plays aloud: not the tune, not the train, not the meadow's birds or breeze.
  const ducked = await audioReport(page);
  await page.waitForTimeout(3000);
  const later = await audioReport(page);
  expect([later.sounds, later.tones]).toEqual([ducked.sounds, ducked.tones]);
  expect((await appState(page)).ambience).toEqual(['spring']); // its bed waits, faded out with everything else
  const whistled = later.whistles;

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => (await appState(page)).videoSound).toBe(false);
  expect(await page.locator('video.stop-video').evaluate((v) => v.muted)).toBe(true);
  expect((await appState(page)).music).toBe('playing');
  await expect.poll(() => states(page)).toEqual(['running']);
  // The sound comes back in time for the train to whistle as it sets off.
  await expect.poll(async () => (await audioReport(page)).whistles, { timeout: 1500 }).toBe(whistled + 1);
  expect(errors).toEqual([]);
});

test('the next moment after a video is a photo again, and only one clip ever plays', async ({ page, browserName }) => {
  await videoFirst(page, clip(browserName));
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card video.stop-video')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  await expect(page.locator('#stop-card img')).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length)).toBe(0);
});

test('the 2D story shows a video moment with the browser\'s own controls', async ({ page, browserName }) => {
  await videoFirst(page, clip(browserName));
  await page.goto('index.html?fallback=1');
  const video = page.locator('#fallback video');
  await expect(video).toHaveCount(1);
  expect(await video.evaluate((v) => v.controls && v.playsInline && v.muted)).toBe(true);
});

test('a video that will not load becomes a placeholder, and the warning names it', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await videoFirst(page, 'photos/broken.mp4');
  await page.route('**/photos/broken.mp4', (r) => r.fulfill({ contentType: 'video/mp4', body: 'not a video' }));
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card img')).toHaveAttribute('src', /^data:image/);
  expect(warnings.some((w) => w.includes('photos/broken.mp4') && w.includes('MP4'))).toBe(true);
});

// Live Photos: a still with its motion beside it (moment.live).

async function liveFirst(page, browserName) {
  const { default: base } = await import('../fixtures/content.fixture.js');
  await useFixture(page, { moments: base.moments.map((m, i) => (i === 0 ? { ...m, photo: '../tests/fixtures/still.jpg', live: clip(browserName) } : m)) });
}

test('a Live Photo shows its still with a LIVE badge, plays once silently, and plays with sound when tapped', async ({ page, browserName }) => {
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  await liveFirst(page, browserName);
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();

  const live = page.locator('#stop-card .stop-photo-live');
  await expect(live).toBeVisible();
  await expect(live.locator('img')).toBeVisible();
  await expect(live.locator('.live-badge')).toHaveText('LIVE');
  const motion = live.locator('video');
  expect(await motion.evaluate((v) => v.loop)).toBe(false);
  await expect(live).toHaveClass(/is-playing/); // it played as the card came up
  expect(await motion.evaluate((v) => v.muted)).toBe(true);
  await expect(live).not.toHaveClass(/is-playing/, { timeout: 10_000 }); // and settled back to the still

  await page.getByRole('button', { name: 'Play the Live Photo with its sound' }).click();
  await expect(live).toHaveClass(/is-playing/);
  expect(await motion.evaluate((v) => v.muted)).toBe(false);
  await expect.poll(async () => (await appState(page)).videoSound).toBe(true);
  await expect.poll(() => states(page)).toEqual(['suspended']);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(async () => (await appState(page)).videoSound).toBe(false);
  await expect.poll(() => states(page)).toEqual(['running']);
  expect(await motion.evaluate((v) => v.paused && v.muted)).toBe(true);
  expect(errors).toEqual([]);
});

test('the 2D story shows a Live Photo as its still, played with a tap', async ({ page, browserName }) => {
  await liveFirst(page, browserName);
  await page.goto('index.html?fallback=1');
  const live = page.locator('#fallback .stop-photo-live');
  await expect(live.locator('img')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(live).not.toHaveClass(/is-playing/);
  await live.locator('button').click();
  await expect(live).toHaveClass(/is-playing/);
});
