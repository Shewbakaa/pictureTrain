// The immersion features: the screen staying awake, the sound hint, her taps on the world and looking around by moving
// the phone; later tasks add to this file.
import { test, expect } from '@playwright/test';
import { useFixture, appState, collectConsoleErrors, waitForPhase } from './helpers.js';
import { LOOK } from '../../site/src/ride/look.js';
import { signLookYaw } from '../../site/src/world/signs.js';
import { LEAVE_CAP_MS } from '../../site/src/ui/intro.js';

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

// --- Looking around by moving the phone (Task 15) ---

/**
 * Before page.goto: a phone that tells the page how it is held. DeviceOrientationEvent is there (Playwright's Chromium
 * has none, so a bare one stands in), and with a `permission` it has iOS's requestPermission, answering
 * window.__permission (`permission` to start with). window.__hold(alpha, beta, gamma) says how the phone is held; from
 * then on it sends that reading every 50 ms, as a phone's sensor keeps doing. WebKit will not make a
 * DeviceOrientationEvent for a page, so a plain Event carries the angles.
 */
async function stubOrientation(page, { permission } = {}) {
  await page.addInitScript((answer) => {
    if (!('DeviceOrientationEvent' in window)) window.DeviceOrientationEvent = class DeviceOrientationEvent extends Event {};
    if (answer !== null) {
      window.__permission = answer;
      window.DeviceOrientationEvent.requestPermission = async () => window.__permission;
    }
    let held = null;
    window.__hold = (alpha, beta, gamma) => { held = { alpha, beta, gamma }; };
    setInterval(() => {
      if (held) window.dispatchEvent(Object.assign(new Event('deviceorientation'), held));
    }, 50);
  }, permission ?? null);
}

const TIPS = 'Psst… some things like being tapped ✨';
const TIPS_WITH_TILT = `${TIPS} and tap 📱 to look around by moving your phone`;

test('the phone button turns tilt on, and turning the phone turns her view', async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  // iOS asks her first; Android just sends readings.
  await stubOrientation(page, { permission: testInfo.project.name === 'iphone' ? 'granted' : undefined });
  await page.goto('index.html?at=60');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const button = page.getByRole('button', { name: 'Look by moving the phone' });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect((await appState(page)).tilt).toBe('off');
  await page.evaluate(() => window.__hold(0, 90, 0)); // upright in portrait: straight ahead once tilt is on
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await appState(page)).tilt).toBe('on');
  const before = (await appState(page)).yaw;
  expect(Math.abs(before)).toBeLessThan(0.01);

  await page.evaluate(() => window.__hold(30, 90, 0)); // she turns 30 degrees to her left
  await expect.poll(async () => (await appState(page)).yaw - before, { timeout: 1000 }).toBeCloseTo(0.5236, 1);
  await expect.poll(async () => (await appState(page)).yaw - before).toBeCloseTo(0.5236, 2);

  // Off again: the view eases back to straight ahead.
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await appState(page)).tilt).toBe('off');
  await expect.poll(async () => Math.abs((await appState(page)).yaw - before)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test('when the phone says no, or sends nothing, a note says why and the button turns itself off', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await stubOrientation(page, { permission: 'denied' });
  await page.goto('index.html?at=60');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const button = page.getByRole('button', { name: 'Look by moving the phone' });
  const toast = page.locator('#toast');
  await button.click();
  await expect(toast).toHaveText('Moving the phone to look needs motion access. You can still drag to look around.');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect((await appState(page)).tilt).toBe('off');

  // Allowed this time, but no reading ever comes: a second later it gives up.
  await page.evaluate(() => { window.__permission = 'granted'; });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(toast).toHaveText("This phone isn't sharing its motion, so drag to look around.");
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect((await appState(page)).tilt).toBe('off');
  expect(errors).toEqual([]);
});

test('the tips come once she has closed her first card, and leave by themselves', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await stubOrientation(page);
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  const toast = page.locator('#toast');
  await expect(toast).toBeHidden();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(toast).toHaveText(TIPS_WITH_TILT);
  await expect(toast).toBeHidden({ timeout: 10000 });
  // Once a visit: the next card's Continue brings no tips.
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(500);
  await expect(toast).toBeHidden();
  expect(errors).toEqual([]);
});

test('without DeviceOrientationEvent there is no phone button, and the tips leave it out', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.addInitScript(() => { delete window.DeviceOrientationEvent; });
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toContainText('First coffee');
  await expect(page.locator('#music-toggle')).toBeVisible();
  await expect(page.locator('#tilt-toggle')).toBeHidden();
  expect((await appState(page)).tilt).toBe('unavailable');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#toast')).toHaveText(TIPS);
  expect(errors).toEqual([]);
});

test('the phone button stays away in the finale, which directs her view, and comes back for Ride again', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await stubOrientation(page);
  await page.goto('index.html?finale=1');
  await waitForPhase(page, 'done');
  await expect(page.locator('#music-toggle')).toBeVisible();
  await expect(page.locator('#tilt-toggle')).toBeHidden();
  await page.getByRole('button', { name: 'Ride again' }).click();
  await waitForPhase(page, 'riding');
  await expect(page.locator('#tilt-toggle')).toBeVisible();
  expect(errors).toEqual([]);
});

// --- The boarding ticket (Task 16) ---

/**
 * Before she taps: starts noting, in window.__ticket, what the intro card and the ride are like by the time her tap has
 * been handled in full (a listener on the document hears the click last), and when the card first has the class
 * `punched` and when it is hidden. Times are performance.now() ms, -1 until they happen.
 */
async function watchTicket(page) {
  await page.evaluate(() => {
    const card = document.getElementById('intro');
    const seen = (window.__ticket = {
      tapped: -1, handled: -1, punchedInTap: null, hiddenInTap: null, phaseInTap: '',
      punched: -1, hidden: -1, everPunched: false,
    });
    document.addEventListener('click', () => { if (seen.tapped < 0) seen.tapped = performance.now(); }, true);
    document.addEventListener('click', () => {
      if (seen.handled >= 0) return;
      seen.handled = performance.now();
      seen.punchedInTap = card.classList.contains('punched');
      seen.hiddenInTap = card.hidden;
      seen.phaseInTap = window.__app.state.phase;
    });
    new MutationObserver(() => {
      const now = performance.now();
      if (card.classList.contains('punched')) {
        seen.everPunched = true;
        if (seen.punched < 0) seen.punched = now;
      }
      if (card.hidden && seen.hidden < 0) seen.hidden = now;
    }).observe(card, { attributes: true });
  });
}

test('the intro is a boarding ticket: a route, a seat and a stub that says ADMIT ONE, still a dialog named by its title', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html');
  await waitForPhase(page, 'intro');
  const card = page.locator('#intro');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card).toHaveAttribute('aria-labelledby', 'intro-title');
  await expect(page.locator('#intro-title')).toHaveText('For Maya');
  await expect(page.locator('.ticket-route')).toHaveText('From Day 1 · To Day 365');
  await expect(page.locator('.ticket-seat')).toHaveText('Seat: by the window');
  await expect(page.locator('.ticket-stub')).toContainText('ADMIT ONE');
  await expect(page.locator('.ticket-stub .ticket-hole')).toHaveCount(1);
  await expect(card).not.toHaveClass(/punched/);
  // The same button as before, and the hint under it.
  await expect(page.getByRole('button', { name: 'Begin the ride' })).toHaveClass(/intro-begin/);
  await expect(page.locator('.intro-hint')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tapping Begin punches the ticket at once, the ride starts under it, and the ticket then goes', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await waitForPhase(page, 'intro');
  await watchTicket(page);
  await page.locator('.intro-begin').click();
  await expect.poll(() => page.evaluate(() => window.__ticket.hidden), { timeout: 5000 }).toBeGreaterThan(0);
  const seen = await page.evaluate(() => window.__ticket);
  // The punch and the ride are both in the tap itself: neither waits for the ticket to leave, which takes a moment more.
  expect(seen.punchedInTap).toBe(true);
  expect(seen.hiddenInTap).toBe(false);
  expect(seen.phaseInTap).toBe('riding');
  expect(seen.hidden).toBeGreaterThan(seen.punched + 300); // the punch, the tear and the slide take a moment
  expect(LEAVE_CAP_MS).toBeLessThanOrEqual(900); // and it is cleared away within that at the latest (tested below)
  await expect(page.locator('#intro')).toBeHidden();
  expect(errors).toEqual([]);
});

/**
 * Before she taps: holds the ticket's animations called `names` where they stand from the moment it is punched (the
 * observer's callback comes before the first frame, and getAnimations() makes the page start them), and notes in
 * window.__slid whether the slide has ended. However slow the page is, they never move on until the test says.
 */
async function holdTicket(page, names) {
  await page.evaluate((held) => {
    const card = document.getElementById('intro');
    window.__slid = false;
    card.addEventListener('animationend', (event) => { if (event.animationName === 'ticket-away') window.__slid = true; });
    new MutationObserver(() => {
      if (!card.classList.contains('punched')) return;
      for (const animation of document.getAnimations()) if (held.includes(animation.animationName)) animation.pause();
    }).observe(card, { attributes: true, attributeFilter: ['class'] });
  }, names);
}

test('the ticket is cleared away the moment its slide ends, not a moment before', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await waitForPhase(page, 'intro');
  await holdTicket(page, ['ticket-away']);
  // Its timer is held back too, so only the end of the slide can clear it away.
  await page.evaluate((cap) => {
    const set = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => (ms === cap ? 0 : set(fn, ms, ...rest));
  }, LEAVE_CAP_MS);
  await page.locator('.intro-begin').click();
  const card = page.locator('#intro');
  await expect(card).toHaveClass(/punched/);
  await page.waitForTimeout(1500); // far longer than the whole punch takes
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => window.__slid)).toBe(false);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) if (animation.animationName === 'ticket-away') animation.finish();
  });
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => window.__slid)).toBe(true);
  expect(errors).toEqual([]);
});

test('the ticket is cleared away at the latest after its cap, even if its slide never ends', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await waitForPhase(page, 'intro');
  await holdTicket(page, ['ticket-away']);
  await page.locator('.intro-begin').click();
  await expect(page.locator('#intro')).toBeHidden({ timeout: 10_000 });
  expect(await page.evaluate(() => window.__slid)).toBe(false); // it was the cap, not the slide
  expect(errors).toEqual([]);
});

test('with reduced motion the ticket is gone at once and is never punched', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await waitForPhase(page, 'intro');
  await watchTicket(page);
  await page.locator('.intro-begin').click();
  await expect.poll(() => page.evaluate(() => window.__ticket.hidden), { timeout: 5000 }).toBeGreaterThan(0);
  const seen = await page.evaluate(() => window.__ticket);
  expect(seen.hiddenInTap).toBe(true); // gone by the end of the tap itself, with the ride started
  expect(seen.phaseInTap).toBe('riding');
  expect(seen.everPunched).toBe(false);
  expect(errors).toEqual([]);
});

test('the 2D story opens with the same ticket, stub and all, but nothing to tap', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page);
  await page.goto('index.html?fallback=1');
  const ticket = page.locator('.fallback-intro');
  await expect(ticket).toBeVisible();
  await expect(ticket.locator('h1')).toHaveText('For Maya');
  await expect(ticket.locator('.ticket-route')).toHaveText('From Day 1 · To Day 365');
  await expect(ticket.locator('.ticket-seat')).toHaveText('Seat: by the window');
  await expect(ticket.locator('.ticket-stub')).toContainText('ADMIT ONE');
  await expect(ticket.locator('button')).toHaveCount(0);
  await expect(ticket.locator('.intro-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});
