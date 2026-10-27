// The finale's own sounds in the real ride (Chromium): the station bell as the train pulls in at the Day 365 station,
// then her hop, his door, his footsteps, two heartbeats, the bouquet's paper and the doves, each once and in order,
// with the hearts' sparkle and the fireworks; none of it in a burst when the finale is skipped to an instant and held
// there (?ft=); and nothing of it still sounding once she rides again.
//
// ?finale=1 puts the train at the station before any tap, and the Sound button is hidden through the finale, so the
// sound cannot be on as it pulls in there. These ride in from just short of the station instead (?at=, its timeline
// up to the last moment reached) with the sound on, as she does.
import { test, expect } from '@playwright/test';
import { useFixture, appState, waitForPhase, collectConsoleErrors, trackAudio, meterEffects } from './helpers.js';
import fixture from '../fixtures/content.fixture.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { footfalls } from '../../site/src/finale/foleyTiming.js';
import { FINALE_TIMES } from '../../site/src/finale/finaleTimes.js';

/** Where the train sets off from: 20 m short of the Day 365 station, past the last stop. */
const AT = buildLayout(normalizeContent(fixture).content).finaleDistance - 20;

/** From ?at= with the sound on, rides into the Day 365 station; `extra` adds query params. */
async function rideIntoTheFinale(page, extra = '') {
  await page.goto(`index.html?at=${AT}&speed=4${extra}`);
  await page.getByRole('button', { name: 'Sound', exact: true, pressed: false }).click();
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  await page.locator('#pause-toggle').click(); // the train sets off from where ?at= left it
  await waitForPhase(page, 'finale');
}

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the finale\'s sounds are checked in one engine, Chromium');
  await trackAudio(page);
  await useFixture(page);
});

test('pulling in at the Day 365 station: the bell, her hop, his door, his steps, the heartbeats, the paper and the doves, each once, in order', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await rideIntoTheFinale(page);
  await waitForPhase(page, 'done');
  await expect.poll(async () => (await appState(page)).finaleCues, { timeout: 10_000 }).toContain('firework');
  const heard = (await appState(page)).finaleCues;
  const count = (name) => heard.filter((n) => n === name).length;
  for (const name of ['bell', 'hop', 'land', 'dress', 'door', 'shop-bell', 'crinkle', 'sparkle', 'doves']) {
    expect(count(name), name).toBe(1);
  }
  expect(count('heartbeat')).toBe(2);
  const steps = [];
  footfalls(0, FINALE_TIMES.end, () => steps.push(1));
  expect(count('step')).toBe(steps.length);
  expect([...new Set(heard)]).toEqual([
    'bell', 'hop', 'land', 'dress', 'door', 'shop-bell', 'step', 'heartbeat', 'crinkle', 'sparkle', 'doves', 'firework',
  ]);
  // His steps all come between his door and the paper.
  expect(heard.lastIndexOf('step')).toBeLessThan(heard.indexOf('crinkle'));
  expect(heard.indexOf('step')).toBeGreaterThan(heard.indexOf('shop-bell'));
  expect(errors).toEqual([]);
});

test('a finale skipped to an instant and held there (?ft=9.6) plays nothing it skipped over, in a burst or later', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await rideIntoTheFinale(page, '&ft=9.6');
  await waitForPhase(page, 'done');
  await expect.poll(async () => (await appState(page)).finaleTime).toBe(9.6);
  await page.waitForTimeout(1500); // frames go by, the finale held still
  // Only the bell, rung as the train pulled in: no hop, steps, heartbeats, paper, doves, sparkle or fireworks.
  expect((await appState(page)).finaleCues).toEqual(['bell']);
  expect(errors).toEqual([]);
});

test('Ride again during the fireworks leaves nothing of the finale sounding', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await rideIntoTheFinale(page);
  expect(await meterEffects(page)).toBeCloseTo(0.105, 3); // the effects bus is where the mixer makes it
  await waitForPhase(page, 'done');
  // While a firework pops and crackles on the effects bus (the train stands still: nothing else plays there now), she
  // taps Ride again; the blush covers the screen over 0.5 s before the train sets off again with its whistle.
  const levels = await page.evaluate(async () => {
    const waited = performance.now();
    let before = window.__audio.effects();
    while (before <= -60 && performance.now() - waited < 15_000) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      before = window.__audio.effects();
    }
    const tapped = performance.now();
    const heard = window.__app.state.finaleCues.length;
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Ride again')).click();
    const after = [];
    // Until just before the blush's midway, 0.5 s on, where the train sets off again with its whistle.
    while (performance.now() - tapped < 490) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      after.push([performance.now() - tapped, window.__audio.effects()]);
    }
    return { before, after, heard };
  });
  expect(levels.before).toBeGreaterThan(-60);
  // Faded out at once: silent from 0.25 s after the tap, while the crackle would still be dying away.
  const late = levels.after.filter(([ms]) => ms >= 250);
  expect(late.length).toBeGreaterThanOrEqual(2); // a busy machine runs the page's timers late
  for (const [ms, db] of late) expect(db, `${ms.toFixed(0)} ms after the tap`).toBeLessThan(-100);
  // And nothing more of the finale plays, under the blush or once she is riding again.
  await waitForPhase(page, 'riding');
  await page.waitForTimeout(1500);
  expect((await appState(page)).finaleCues.length).toBe(levels.heard);
  expect(errors).toEqual([]);
});
