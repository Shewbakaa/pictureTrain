// The immersion features: the screen staying awake, the sound hint and her taps on the world; later tasks add to
// this file.
import { test, expect } from '@playwright/test';
import { useFixture, appState, collectConsoleErrors, waitForPhase } from './helpers.js';
import { LOOK } from '../../site/src/ride/look.js';
import { signLookYaw } from '../../site/src/world/signs.js';

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

// --- Taps (Task 13) ---

/** Where each tappable thing in front of her is on the page now, by name (window.__app.debugTargets). */
async function targetsByName(page) {
  const list = await page.evaluate(() => window.__app.debugTargets());
  return Object.fromEntries(list.map((t) => [t.name, t]));
}

test('a tap on the whistle cord pulls it, a tap on the lantern flares it, and a drag over them does neither', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?at=60&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  expect((await appState(page)).lastTap).toBeNull();
  const { 'whistle-cord': cord, lantern } = await targetsByName(page);
  const { width, height } = page.viewportSize();
  // The cord hangs at the top left of the view, the lantern stands at the bottom right.
  expect(cord.x).toBeGreaterThan(0);
  expect(cord.x).toBeLessThan(width / 2);
  expect(cord.y).toBeGreaterThan(0);
  expect(cord.y).toBeLessThan(height / 2);
  expect(lantern.x).toBeGreaterThan(width / 2);
  expect(lantern.y).toBeGreaterThan(height / 2);

  // A drag from the cord and back to it is her looking round, not a tap (and leaves the view where it was).
  await page.mouse.move(cord.x, cord.y);
  await page.mouse.down();
  await page.mouse.move(cord.x + 80, cord.y, { steps: 4 });
  await page.mouse.move(cord.x, cord.y, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  expect((await appState(page)).lastTap).toBeNull();

  await page.touchscreen.tap(cord.x, cord.y);
  await expect.poll(async () => (await appState(page)).lastTap).toBe('whistle-cord');
  await page.touchscreen.tap(lantern.x, lantern.y);
  await expect.poll(async () => (await appState(page)).lastTap).toBe('lantern');
  expect(errors).toEqual([]);
});

test('a tap on the stop card stays with the card: the lantern behind it does not answer (Review Focus 4)', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  // Slow enough that once she has tapped Continue, the next stop's card is seconds away.
  await page.goto('index.html?speed=5');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  const card = page.locator('#stop-card');
  await expect(card).toContainText('First coffee');
  // At the stop her head turns to the sign. Drag it back ahead, along the strip of view above the card, so the
  // cabin's lantern is behind the card.
  await page.waitForFunction(() => Math.abs(window.__app.state.yaw) > 1.55);
  const { yaw } = await appState(page);
  const box = await card.boundingBox();
  const across = -yaw / LOOK.SENSITIVITY; // dragging right turns her head left (+yaw)
  const middle = page.viewportSize().width / 2;
  await page.mouse.move(middle - across / 2, box.y / 2);
  await page.mouse.down();
  await page.mouse.move(middle + across / 2, box.y / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await appState(page)).yaw)).toBeLessThan(0.05);
  const { lantern } = await targetsByName(page);
  const under = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return { onCard: Boolean(hit && hit.closest('#stop-card')), onButton: Boolean(hit && hit.closest('button')) };
  }, lantern);
  expect(under).toEqual({ onCard: true, onButton: false });

  await page.evaluate(() => {
    window.__canvasTouches = 0;
    document.querySelector('#scene canvas').addEventListener('pointerdown', () => { window.__canvasTouches += 1; });
  });
  await page.touchscreen.tap(lantern.x, lantern.y);
  await page.waitForTimeout(300);
  const s = await appState(page);
  expect(s.lastTap).toBeNull();
  expect(s.phase).toBe('stopped');
  expect(await page.evaluate(() => window.__canvasTouches)).toBe(0);
  await expect(card).toBeVisible();

  // Once the card has gone, the same spot reaches the lantern.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(card).toBeHidden();
  await page.touchscreen.tap(lantern.x, lantern.y);
  await expect.poll(async () => (await appState(page)).lastTap).toBe('lantern');
  expect(errors).toEqual([]);
});

// --- The world answers taps (Task 14) ---

/**
 * Taps a `name` target where it is on the page right now (window.__app.debugTargets): one on the screen that the
 * cabin does not hide, the furthest from the cabin's own cord and lantern, so the tap is not theirs. A moving target
 * (a gull) can slip away between finding it and tapping it, so it tries a few times. Resolves once lastTap is `name`.
 */
async function tapTarget(page, name, tries = 3) {
  const { width, height } = page.viewportSize();
  const find = async () => {
    const all = await page.evaluate(() => window.__app.debugTargets());
    const cabin = all.filter((t) => t.name === 'whistle-cord' || t.name === 'lantern');
    const clear = (t) => Math.min(...cabin.map((c) => Math.hypot(c.x - t.x, c.y - t.y)));
    return all
      .filter((t) => t.name === name && !t.hidden && t.x > 20 && t.x < width - 20 && t.y > 20 && t.y < height - 20)
      .sort((a, b) => clear(b) - clear(a))[0];
  };
  for (let attempt = 1; ; attempt++) {
    // A gull may be out of view for a moment, flying round its loop.
    await expect.poll(find, { message: `a ${name} on the screen to tap`, timeout: 15000 }).toBeTruthy();
    const target = await find();
    await page.touchscreen.tap(target.x, target.y);
    try {
      await expect.poll(async () => (await appState(page)).lastTap, { timeout: 2000 }).toBe(name);
      return;
    } catch (error) {
      if (attempt >= tries) throw error;
      await page.waitForTimeout(1600); // past the cooldown of whatever that tap did reach
    }
  }
}

test('a tap on a snowman reaches it', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?at=640&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await tapTarget(page, 'snowman', 1);
  expect(errors).toEqual([]);
});

test('a tap on a gull reaches it, though it is flying', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?at=290&look=40&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await tapTarget(page, 'gull');
  expect(errors).toEqual([]);
});

test('a tap on the two of them at a stop reaches them', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?at=85&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  // The first stop's couple stands beside the train, by its sign on the right: she turns her head to them.
  const across = signLookYaw('right') / LOOK.SENSITIVITY; // dragging right turns her head left (+yaw)
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2 - across / 2, height * 0.3);
  await page.mouse.down();
  await page.mouse.move(width / 2 + across / 2, height * 0.3, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await appState(page)).yaw).toBeLessThan(-1);
  await tapTarget(page, 'couple', 1);
  expect(errors).toEqual([]);
});
