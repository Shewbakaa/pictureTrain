import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

test('page loads with loading screen and no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html');
  await expect(page.locator('#loading')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__app?.state.phase)).toBe('string');
  expect(errors).toEqual([]);
});

test('browser exposes WebGL2', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(true);
});
