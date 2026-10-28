// The immersion features: the screen staying awake and the sound hint now; later tasks add to this file.
import { test, expect } from '@playwright/test';
import { useFixture, appState, collectConsoleErrors, waitForPhase } from './helpers.js';

/** Before page.goto: a navigator.wakeLock that records every request in window.__wakeLocks and grants it. */
async function stubWakeLock(page) {
  await page.addInitScript(() => {
    window.__wakeLocks = [];
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async (type) => {
          window.__wakeLocks.push(type);
          return new EventTarget(); // a sentinel: it can be listened to for 'release'
        },
      },
    });
  });
}

test('the screen is kept awake once she taps Begin, and the intro suggests headphones', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await stubWakeLock(page);
  await page.goto('index.html?speed=25');
  await waitForPhase(page, 'intro');
  await expect(page.locator('.intro-hint')).toHaveText('Best with sound on and headphones in.');
  await expect(page.locator('.intro-hint svg')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.evaluate(() => window.__wakeLocks)).toEqual([]); // not before the tap
  expect((await appState(page)).wakeLock).toBe('off');
  await page.locator('.intro-begin').click();
  await waitForPhase(page, 'riding');
  await expect.poll(async () => (await appState(page)).wakeLock).toBe('held');
  expect(await page.evaluate(() => window.__wakeLocks)).toEqual(['screen']);
  expect(errors).toEqual([]);
});

test('without the Wake Lock API the ride starts all the same', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }));
  await page.goto('index.html?speed=25');
  await page.locator('.intro-begin').click();
  await waitForPhase(page, 'riding');
  expect((await appState(page)).wakeLock).toBe('none');
  expect(errors).toEqual([]);
});

test("an author's own hint replaces the default line", async ({ page }) => {
  await useFixture(page, { intro: { hint: 'Turn the sound up.' } });
  await page.goto('index.html');
  await expect(page.locator('.intro-hint')).toHaveText('Turn the sound up.');
});

test('"none" hides the sound hint', async ({ page }) => {
  await useFixture(page, { intro: { hint: 'none' } });
  await page.goto('index.html');
  await expect(page.locator('#intro')).toBeVisible();
  await expect(page.locator('.intro-hint')).toHaveCount(0);
});
