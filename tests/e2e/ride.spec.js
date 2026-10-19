import { test, expect } from '@playwright/test';
import { useFixture, appState, waitForPhase, collectConsoleErrors } from './helpers.js';

test.beforeEach(async ({ page }) => { await useFixture(page); });

const begin = async (page, q = 'speed=25') => {
  await page.goto(`index.html?${q}`);
  await expect(page.locator('#intro')).toBeVisible();
  await page.getByRole('button', { name: 'Begin the ride' }).click();
};

test('intro → begin → riding', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html?speed=25');
  await expect(page.locator('#intro')).toContainText('For Maya');
  await expect(page).toHaveTitle('For Maya');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#intro')).toBeHidden();
  await waitForPhase(page, 'riding');
  await expect(page.locator('#bottombar')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Begin tapped twice starts once', async ({ page }) => {
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).dblclick();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  expect((await appState(page)).stopIndex).toBe(0);
});

test('stops, shows the card, continues to the next', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await expect(page.locator('#stop-card')).toContainText('Oct 2025');
  expect((await appState(page)).phase).toBe('stopped');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toBeHidden();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
});

test('double Continue only advances one stop', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await page.getByRole('button', { name: 'Continue' }).dblclick();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  expect((await appState(page)).stopIndex).toBe(1);
});

test('timeline locks the future and jumps to the past', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  const dots = page.locator('#timeline button');
  await expect(dots).toHaveCount(10);
  await expect(dots.nth(5)).toHaveAttribute('aria-disabled', 'true');
  await dots.nth(5).click({ force: true });
  expect((await appState(page)).stopIndex).toBe(1);
  await dots.nth(0).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await expect.poll(async () => (await appState(page)).stopIndex).toBe(0);
});

test('progress survives a reload', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  await page.reload();
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#timeline button').nth(1)).not.toHaveAttribute('aria-disabled', 'true');
});

test('pause stops the train', async ({ page }) => {
  await begin(page, 'speed=2');
  await waitForPhase(page, 'riding');
  await page.locator('#pause-toggle').click();
  await page.waitForTimeout(800);
  const d = (await appState(page)).distance;
  await page.waitForTimeout(1000);
  expect(Math.abs((await appState(page)).distance - d)).toBeLessThan(0.01);
  await page.locator('#pause-toggle').click();
  await expect.poll(async () => (await appState(page)).distance).toBeGreaterThan(d + 0.5);
});

test('tap targets are at least 44px', async ({ page }) => {
  await begin(page);
  await expect(page.locator('#stop-card')).toBeVisible();
  for (const b of await page.locator('#ui button:visible').all()) {
    const box = await b.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('author text is never parsed as HTML', async ({ page }) => {
  const { default: base } = await import('../fixtures/content.fixture.js');
  const moments = base.moments.map((m, i) => (i === 0 ? { ...m, title: '<img src=x onerror="window.__xss=1">' } : m));
  await useFixture(page, { moments });
  await begin(page);
  await expect(page.locator('#stop-card .stop-title')).toHaveText('<img src=x onerror="window.__xss=1">');
  expect(await page.locator('#stop-card .stop-title img').count()).toBe(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('a returning visitor still stops at Moment 1 first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pictureTrain.progress.v1', JSON.stringify({ reachedMax: 3 })));
  await begin(page);
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  const state = await appState(page);
  expect([state.stopIndex, state.reachedMax]).toEqual([0, 3]);
  // The moments reached on the earlier visit stay open on the timeline.
  await expect(page.locator('#timeline button').nth(3)).not.toHaveAttribute('aria-disabled', 'true');
});

test('?ui=0 begins the ride by itself, as the hidden intro cannot be tapped', async ({ page }) => {
  await page.goto('index.html?ui=0&speed=25');
  await expect.poll(async () => (await appState(page)).stopIndex).toBe(0);
  await expect(page.locator('#ui')).toBeHidden();
});

test('a string under an on* name never becomes an inline handler', async ({ page }) => {
  await page.goto('index.html');
  const result = await page.evaluate(async () => {
    const { el } = await import('./src/ui/dom.js');
    const button = el('button', { onclick: 'window.__inline = 1', ONMOUSEOVER: 'window.__inline = 2', title: 'kept' });
    document.body.appendChild(button);
    button.click();
    button.dispatchEvent(new MouseEvent('mouseover'));
    button.remove();
    return { inline: window.__inline, onclick: button.getAttribute('onclick'), title: button.getAttribute('title') };
  });
  expect(result).toEqual({ inline: undefined, onclick: null, title: 'kept' });
});
