import { test, expect } from '@playwright/test';
import { collectConsoleErrors, appState } from './helpers.js';

test('page loads with loading screen and no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  // The page is parsed (readyState 'interactive') before any module script runs, so this sees the loading
  // screen as it first appears, however quickly the 3D ride then takes over.
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;
      const loading = document.getElementById('loading');
      window.__loadingShownAtStart = Boolean(loading) && !loading.hidden && getComputedStyle(loading).display !== 'none';
    });
  });
  await page.goto('index.html');
  expect(await page.evaluate(() => window.__loadingShownAtStart)).toBe(true);
  expect(await page.evaluate(() => typeof window.__app?.state.phase)).toBe('string');
  // Once the ride's first frame is on screen, the loading screen makes way for it.
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await expect(page.locator('#loading')).toBeHidden();
  expect(errors).toEqual([]);
});

test('browser exposes WebGL2', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(true);
});
