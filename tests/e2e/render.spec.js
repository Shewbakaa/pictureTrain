import { test, expect } from '@playwright/test';
import { collectConsoleErrors, appState, useFixture } from './helpers.js';

test('3D mode renders and the train moves', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html?speed=10');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const d0 = (await appState(page)).distance;
  await page.waitForTimeout(2000);
  const s = await appState(page);
  expect(s.distance).toBeGreaterThan(d0 + 5);
  expect(s.drawCalls).toBeGreaterThan(0);
  expect(s.drawCalls).toBeLessThanOrEqual(100);
  expect(errors).toEqual([]);
});

test('stats overlay', async ({ page }) => {
  await page.goto('index.html?stats=1&at=50');
  await expect(page.locator('#stats')).toContainText('fps');
});

test('dragging looks around', async ({ page }) => {
  await page.goto('index.html?at=50&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const box = await page.locator('#scene canvas').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 400, { steps: 5 });
  // appState mirrors the look once per frame, so wait for a frame to report the drag (R19).
  await expect.poll(async () => (await appState(page)).yaw).toBeGreaterThan(0.3);
  await page.mouse.up();
});

test('canvas fills the viewport and follows resize', async ({ page }) => {
  await page.goto('index.html?at=50');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await page.locator('#scene canvas').boundingBox()).width).toBe(844);
});

// Beyond the brief: the debug params the app owns, on the shared fixture (stops at 85, 155, 265, ... m).
test('?at freezes the train there, ?look turns her head, ?quality forces the tier, ?stats reads out', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?at=200&look=30&quality=high&stats=1&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await expect(page.locator('#stats')).toHaveText(/^\d+ fps · \d+ calls · \d+\.\dk tris · high$/);
  const s = await appState(page);
  expect(s.distance).toBe(200);
  expect(s.speed).toBe(0);
  expect(s.paused).toBe(true);
  expect(s.reachedMax).toBe(1);
  expect(s.nextStopIndex).toBe(2);
  expect(s.yaw).toBeCloseTo((30 * Math.PI) / 180, 6);
  expect(s.quality).toBe('high');
  await expect(page.locator('#loading')).toBeHidden();
  expect(errors).toEqual([]);
});
