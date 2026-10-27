import { test, expect } from '@playwright/test';
import { useFixture, appState, waitForPhase, collectConsoleErrors, trackAudio, audioReport } from './helpers.js';

test.beforeEach(async ({ page }) => { await useFixture(page); });

test('finale ends on the message card', async ({ page }) => {
  await page.goto('index.html?finale=1');
  await waitForPhase(page, 'done');
  const card = page.locator('#finale-card');
  await expect(card).toContainText('Happy 1 year, Maya');
  await expect(card).toContainText('Thank you for the best year of my life.');
  await expect(card).toContainText('— Sam');
  expect((await appState(page)).view).toBe('finale');
  // The music plays on under the card, so its button is there to switch it off; there is nothing left to pause.
  await expect(page.locator('#music-toggle')).toBeVisible();
  await expect(page.locator('#pause-toggle')).toBeHidden();
  await expect(page.locator('#progress-pill')).toBeHidden();
});

test('Ride again goes back to the start', async ({ page }) => {
  await page.goto('index.html?finale=1');
  await waitForPhase(page, 'done');
  await page.getByRole('button', { name: 'Ride again' }).click();
  await expect(page.locator('#finale-card')).toBeHidden();
  await waitForPhase(page, 'riding');
  const s = await appState(page);
  expect(s.distance).toBeLessThan(30);
  expect(s.view).toBe('cabin');
  await expect(page.locator('#pause-toggle')).toBeVisible();
  await expect(page.locator('#music-toggle')).toBeVisible();
  await expect(page.locator('#progress-pill')).toBeVisible();
});

test('jumping from the finale to a moment', async ({ page }) => {
  await page.goto('index.html?finale=1');
  await waitForPhase(page, 'done');
  await page.locator('#timeline button').nth(3).click();
  await expect(page.locator('#stop-card')).toContainText('Sunset pier');
  const s = await appState(page);
  expect(s.stopIndex).toBe(3);
  expect(s.view).toBe('cabin');
});

test('full ride end to end', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'one full ride is enough');
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  const titles = ['First coffee', 'Rainy walk', 'Beach day', 'Sunset pier', 'Pumpkin patch', 'Movie night', 'First snow', 'Ice skating', 'City lights', 'Our dinner'];
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  for (const t of titles) {
    await expect(page.locator('#stop-card')).toContainText(t);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await waitForPhase(page, 'done');
  await expect(page.locator('#finale-card')).toContainText('Happy 1 year, Maya');
  // The train's sounds kept to real time while the ride ran 50 times too fast: they were heard, but never piled up
  // (it crosses a rail joint every few frames, which would otherwise be dozens of clicks a second).
  const audio = await audioReport(page);
  expect(audio.states).toEqual(['running']);
  expect(audio.sounds).toBeGreaterThan(20);
  expect(audio.busiest).toBeLessThanOrEqual(12);
  expect(errors).toEqual([]);
});
