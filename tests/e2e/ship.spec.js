import { test, expect } from '@playwright/test';
import { useFixture } from './helpers.js';

// The e2e server (playwright.config.js) is the only origin the page may talk to.
const SITE_HOST = '127.0.0.1:4317';

test('page metadata is private and preview-ready', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  // The author is told to edit these three (README sections 2 and 8), so only check that each says something.
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /\S/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /\S/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'og-image.jpg');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f4a37c');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'favicon.svg');
});

test('no request leaves the site origin', async ({ page }) => {
  const foreign = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.host !== SITE_HOST && !u.protocol.startsWith('data')) foreign.push(r.url());
  });
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toBeVisible();
  expect(foreign).toEqual([]);
});

test('og image and favicon exist', async ({ request }) => {
  const og = await request.get('og-image.jpg');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toBe('image/jpeg');
  expect((await request.get('favicon.svg')).status()).toBe(200);
});
