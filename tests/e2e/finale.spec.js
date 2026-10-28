import { test, expect } from '@playwright/test';
import { useFixture, appState, waitForPhase, collectConsoleErrors, trackAudio, audioReport } from './helpers.js';
import { FIREWORK_TIMING } from '../../site/src/finale/fireworkTiming.js';

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

// A message long enough (about a minute of writing) that it is still being written when a test looks, in three
// paragraphs with a line break inside the first, like one the author might write.
const LONG_MESSAGE = [
  'Thank you for the best year of my life, for every walk in the rain and every coffee we let go cold.\nI did not know that a year could be so gentle.',
  'You make the small things feel like they were planned for us: the late train home, the smallest pumpkin, the snowman that leaned a little to the left and still stood all night.',
  'Here is to the next one, and the one after that, and all the quiet evenings in between.',
].join('\n\n');
const wordsIn = (text) => text.split(/\s+/).filter(Boolean).length;

test('his message writes itself in ink, a word at a time, signoff after it', async ({ page }) => {
  await useFixture(page, { finale: { message: LONG_MESSAGE } });
  await page.goto('index.html?finale=1&ft=12&ui=0');
  await waitForPhase(page, 'done');
  const message = page.locator('.finale-message');
  await expect(message.locator('.ink-word')).toHaveCount(wordsIn(LONG_MESSAGE));
  await expect(page.locator('.finale-signoff .ink-word')).toHaveCount(2); // "—" and "Sam"
  // The paragraphs and the line break are kept, as <br>s: one for the line, two for each blank line between paragraphs.
  await expect(message.locator('br')).toHaveCount(1 + 2 + 2);
  // The words stay in order, with their spaces, for a screen reader and for copying.
  expect(await message.evaluate((e) => e.textContent.replace(/\s+/g, ' ').trim())).toBe(LONG_MESSAGE.replace(/\s+/g, ' '));
  // The signoff starts after the message has finished.
  const starts = await page.evaluate(() => {
    const start = (word) => parseFloat(word.style.getPropertyValue('--ink-start'));
    const last = [...document.querySelectorAll('.finale-message .ink-word')].pop();
    return { messageLast: start(last) + parseFloat(last.style.getPropertyValue('--ink-dur')), signoff: start(document.querySelector('.finale-signoff .ink-word')) };
  });
  expect(starts.signoff).toBeGreaterThan(starts.messageLast);
  await expect(message).not.toHaveClass(/inked/);
});

test('a tap on the card finishes the writing at once, and nothing else hears it', async ({ page }) => {
  await useFixture(page, { finale: { message: LONG_MESSAGE } });
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  const message = page.locator('.finale-message');
  const signoff = page.locator('.finale-signoff');
  const lastWord = message.locator('.ink-word').last();
  // The last word is still to be written: the sweep is running on it.
  await expect(message).not.toHaveClass(/inked/);
  expect(await lastWord.evaluate((w) => [w.getAnimations().length, getComputedStyle(w).animationName])).toEqual([1, 'ink-write']);
  const scrolled = await page.locator('.finale-card-body').evaluate((b) => b.scrollTop);
  const heard = await page.evaluate(() => {
    window.__heard = 0;
    document.addEventListener('click', () => { window.__heard += 1; });
    return window.__heard;
  });
  await page.locator('.finale-card-body').click({ position: { x: 12, y: 12 } });
  await expect(message).toHaveClass(/inked/);
  await expect(signoff).toHaveClass(/inked/);
  expect(await lastWord.evaluate((w) => [w.getAnimations().length, getComputedStyle(w).animationName, getComputedStyle(w).maskImage || getComputedStyle(w).webkitMaskImage])).toEqual([0, 'none', 'none']);
  expect(await page.evaluate(() => window.__heard)).toBe(heard); // the tap went no further than the card
  expect(await page.locator('.finale-card-body').evaluate((b) => b.scrollTop)).toBe(scrolled);
  // All of it is there, in full.
  await expect(message).toContainText('Here is to the next one');
  await expect(page.getByRole('button', { name: 'Ride again' })).toBeEnabled();
});

test('a button in the card body is its own, and the tap is only kept from others while the writing runs', async ({ page }) => {
  await useFixture(page, { finale: { message: LONG_MESSAGE } });
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  const body = page.locator('.finale-card-body');
  const message = page.locator('.finale-message');
  // What Task 18's voice button will be: a real button inside the body.
  await body.evaluate((b) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'extra-button';
    button.textContent = 'Play';
    b.appendChild(button);
    window.__heard = 0;
    document.addEventListener('click', () => { window.__heard += 1; });
  });
  await page.locator('#extra-button').click();
  await expect(message).not.toHaveClass(/inked/); // its tap is not a tap on the writing
  expect(await page.evaluate(() => window.__heard)).toBe(1); // and went on to the document as any button's would
  await body.click({ position: { x: 12, y: 12 } });
  await expect(message).toHaveClass(/inked/);
  expect(await page.evaluate(() => window.__heard)).toBe(1); // the tap that finished the writing stopped at the card
  await body.click({ position: { x: 12, y: 12 } });
  expect(await page.evaluate(() => window.__heard)).toBe(2); // once it is written, a tap on the card is just a tap
});

test('the writing leaves the card where it is', async ({ page }) => {
  await useFixture(page, { finale: { message: `${LONG_MESSAGE}\n\n${LONG_MESSAGE}` } });
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  const body = page.locator('.finale-card-body');
  // The message is longer than the card, which scrolls; words below the fold write unseen and nothing follows them.
  expect(await body.evaluate((b) => b.scrollHeight > b.clientHeight)).toBe(true);
  await page.waitForTimeout(2500); // well into the writing
  expect(await body.evaluate((b) => b.scrollTop)).toBe(0);
  await body.evaluate((b) => { b.scrollTop = 40; });
  await page.waitForTimeout(1500);
  expect(await body.evaluate((b) => b.scrollTop)).toBe(40);
});

/**
 * Before page.goto: notes the animations on his message, and on each of its words, the moment it is set to fade in
 * (as its card comes up), in `window.__fade`. The fade lasts under a second and is put away a moment after it ends:
 * on a loaded machine that can all be over before a check gets round to looking.
 */
async function noteFade(page) {
  await page.addInitScript(() => {
    new MutationObserver((records, observer) => {
      for (const { target: e } of records) {
        if (!e.classList.contains('finale-message') || !e.classList.contains('ink-fade') || e.classList.contains('inked')) continue;
        const words = [...e.querySelectorAll('.ink-word')];
        window.__fade = { message: e.getAnimations().map((a) => a.animationName), words: words.map((w) => w.getAnimations().length) };
        observer.disconnect();
        return;
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

test('with reduced motion the message fades in instead of being written', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await useFixture(page, { finale: { message: LONG_MESSAGE } });
  await noteFade(page);
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  const message = page.locator('.finale-message');
  await expect(message).toHaveClass(/ink-fade/);
  // It fades in as one, and no word has an animation of its own: that is the sweep.
  await expect.poll(() => page.evaluate(() => window.__fade)).toEqual({ message: ['ink-fade-in'], words: Array(wordsIn(LONG_MESSAGE)).fill(0) });
  // A tap finishes it, if it has not finished by itself (a second after it starts): either way nothing is left running.
  await page.locator('.finale-card-body').click({ position: { x: 12, y: 12 } });
  await expect(message).toHaveClass(/inked/);
  expect(await message.evaluate((e) => e.getAnimations().length)).toBe(0);
});

test('with no message the signoff alone is still written, and a tap finishes it', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await useFixture(page, { finale: { message: '' } });
  await page.goto('index.html?finale=1&ft=12');
  await waitForPhase(page, 'done');
  await expect(page.locator('.finale-message')).toHaveCount(0);
  await expect(page.locator('.finale-signoff .ink-word')).toHaveCount(2);
  await page.locator('.finale-card-body').click({ position: { x: 12, y: 12 } });
  await expect(page.locator('.finale-signoff')).toHaveClass(/inked/);
  expect(errors).toEqual([]);
});

test('the handwriting font is loaded early and has the em dash of the signoff', async ({ page }) => {
  await page.goto('index.html?finale=1&ft=12&ui=0');
  await waitForPhase(page, 'done');
  await expect.poll(() => page.evaluate(() => document.fonts.check('500 20px "Dancing Script"'))).toBe(true);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('Dancing Script') && f.status === 'loaded'))).toBe(true);
  expect(await page.evaluate(() => document.fonts.check('500 20px "Dancing Script"', '— Sam’s “love”…'))).toBe(true);
  await expect(page.locator('.finale-signoff')).toContainText('— Sam');
});

test('their pet trots over with him in the finale', async ({ page }) => {
  await page.goto('index.html?finale=1&ft=7.5&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(7.5);
  expect((await appState(page)).finalePets).toBe(1);
});

test('no pet in the finale with pets: none', async ({ page }) => {
  await useFixture(page, { pets: 'none' });
  await page.goto('index.html?finale=1&ft=7.5&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(7.5);
  expect((await appState(page)).finalePets).toBe(0);
});

test('five doves fly off the station roof as the fireworks start, and are gone six seconds on', async ({ page }) => {
  // Sitting on the roof until the fireworks start (8.5 s), flying a moment after, and gone by 14.5 s.
  await page.goto('index.html?finale=1&ft=8.4&quality=high&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(8.4);
  expect((await appState(page)).finaleDoves).toBe(5);
  await page.goto('index.html?finale=1&ft=9&quality=high&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(9);
  expect((await appState(page)).finaleDoves).toBe(5);
  await page.goto('index.html?finale=1&ft=14.6&quality=high&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(14.6);
  expect((await appState(page)).finaleDoves).toBe(0);
});

test('no doves outside the finale, and fewer on the low tier', async ({ page }) => {
  await page.goto('index.html?at=300&quality=high&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  expect((await appState(page)).finaleDoves).toBe(0);
  await page.goto('index.html?finale=1&ft=9&quality=low&ui=0');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(9);
  expect((await appState(page)).finaleDoves).toBe(2);
});

test('full ride end to end', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'one full ride is enough');
  const errors = collectConsoleErrors(page);
  await trackAudio(page);
  const titles = ['First coffee', 'Rainy walk', 'Beach day', 'Sunset pier', 'Pumpkin patch', 'Movie night', 'First snow', 'Ice skating', 'City lights', 'Our dinner'];
  // Each stop's zone, whose ambience and whose own music are playing there: in winter, the carol.
  const zones = ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'evening', 'evening'];
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  for (const [i, t] of titles.entries()) {
    await expect(page.locator('#stop-card')).toContainText(t);
    await expect.poll(async () => (await appState(page)).ambience).toContain(zones[i]);
    await expect.poll(async () => (await appState(page)).musicPiece).toBe(zones[i]);
    expect((await appState(page)).carol).toBe(zones[i] === 'winter' ? 1 : 0);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await waitForPhase(page, 'done');
  await expect(page.locator('#finale-card')).toContainText('Happy 1 year, Maya');
  // The evening's nocturne plays on through the finale.
  expect((await appState(page)).musicPiece).toBe('evening');
  await expect.poll(async () => (await audioReport(page)).pieces.evening.paused).toBe(false);
  // The fireworks pop over the town (each a puff and a crackle) for as long as the finale plays: at least six sounds
  // over the next two rounds of the bursts, in which every burst blooms twice. That is measured on the finale's own
  // clock, not the wall's: it moves on at most MAX_STEP a frame, so on a loaded machine drawing in software it runs
  // well behind the wall clock. And two rounds, not a fixed few seconds, so that the low tier's two bursts (which the
  // quality may step down to on such a machine) give four pops, eight sounds, however the rounds fall.
  const [popped, from] = await page.evaluate(() => [window.__audio.starts.length, window.__app.state.finaleTime]);
  await expect.poll(async () => (await appState(page)).finaleTime, { timeout: 60_000 }).toBeGreaterThanOrEqual(from + 2 * FIREWORK_TIMING.PERIOD);
  expect((await audioReport(page)).sounds - popped).toBeGreaterThanOrEqual(6);
  // The train's sounds and the ambience kept to real time while the ride ran 50 times too fast: they were heard,
  // but never piled up (it crosses a rail joint every few frames, which would otherwise be dozens of clicks a second,
  // and passes through a zone in a moment).
  const audio = await audioReport(page);
  expect(audio.states).toEqual(['running']);
  expect(audio.sounds).toBeGreaterThan(20);
  expect(audio.busiest).toBeLessThanOrEqual(12);
  expect(audio.mostPieces).toBeLessThanOrEqual(2); // never more than two scenes' pieces at once

  // Ride again: the evening's piece pauses and goes back to its top, and the meadow's plays from its top.
  expect(audio.pieces.spring).toEqual({ paused: true, time: 0 });
  const rodeAgainAt = Date.now();
  await page.getByRole('button', { name: 'Ride again' }).click();
  await waitForPhase(page, 'riding');
  await expect.poll(async () => (await appState(page)).musicPiece).toBe('spring');
  await expect.poll(async () => (await audioReport(page)).pieces.evening).toEqual({ paused: true, time: 0 });
  await expect.poll(async () => {
    const spring = (await audioReport(page)).pieces.spring;
    return !spring.paused && spring.time > 0;
  }).toBe(true);
  expect((await audioReport(page)).pieces.spring.time).toBeLessThanOrEqual((Date.now() - rodeAgainAt) / 1000 + 0.5);
  expect(errors).toEqual([]);
});
