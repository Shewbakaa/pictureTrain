import { test, expect } from '@playwright/test';
import { useFixture } from './helpers.js';

test('content problems are reported in the console', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await useFixture(page, { zones: ['moon', 'spring', 'summer', 'autumn', 'winter', 'evening'] });
  await page.goto('index.html');
  await expect.poll(() => warnings.some((w) => w.startsWith('[content.js]') && w.includes('"moon"'))).toBe(true);
});

test('errors in the content are reported as console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await useFixture(page, { moments: [{ zone: 'summer' }, { zone: 'spring' }] });
  await page.goto('index.html');
  await expect.poll(() => errors.some((e) => e.startsWith('[content.js]') && e.includes('Moment 2') && e.includes('zone order'))).toBe(true);
});

test('the shared fixture boots with no content warnings or errors', async ({ page }) => {
  const reported = [];
  page.on('console', (m) => { if (m.text().startsWith('[content.js]')) reported.push(m.text()); });
  await useFixture(page);
  await page.goto('index.html');
  await page.waitForFunction(() => window.__app);
  // The page really is running on the fixture, not on the shipped placeholders.
  expect(await page.evaluate(async () => (await import('./content.js')).default.herName)).toBe('Maya');
  expect(reported).toEqual([]);
});
