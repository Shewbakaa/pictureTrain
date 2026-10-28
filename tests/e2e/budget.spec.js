import { test, expect } from '@playwright/test';
import { appState } from './helpers.js';

for (const at of [40, 150, 300, 480, 570, 660, 820, 960]) {
  test(`performance budget at ${at} m`, async ({ page }) => {
    await page.goto(`index.html?at=${at}&quality=high&ui=0`);
    await expect.poll(async () => (await appState(page)).mode).toBe('3d');
    await page.waitForTimeout(500);
    const s = await appState(page);
    expect(s.drawCalls).toBeLessThanOrEqual(100);
    expect(s.triangles).toBeLessThanOrEqual(250_000);
  });
}

test('performance budget in the finale, with the hearts, fireworks and confetti', async ({ page }) => {
  await page.goto('index.html?finale=1&ft=9.6&quality=high&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(9.6);
  await page.waitForTimeout(500);
  const s = await appState(page);
  expect(s.view).toBe('finale');
  expect(s.drawCalls).toBeLessThanOrEqual(100);
  expect(s.triangles).toBeLessThanOrEqual(250_000);
});
