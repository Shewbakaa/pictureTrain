// Shared helpers for the Playwright specs.
import fixture from '../fixtures/content.fixture.js';

/**
 * Makes the page run on the shared test content instead of site/content.js. `overrides` replaces
 * whole top-level fields (a shallow merge: pass the full `moments` array, not one moment).
 * Call it before page.goto.
 */
export async function useFixture(page, overrides = {}) {
  const body = `export default ${JSON.stringify({ ...fixture, ...overrides })};`;
  await page.route('**/site/content.js', (route) => route.fulfill({ contentType: 'text/javascript', body }));
}

/**
 * Records every console error and uncaught page error. Returns a live array, so read it after the
 * actions you want to check. Messages matching any pattern in `ignore` are skipped.
 */
export function collectConsoleErrors(page, { ignore = [] } = {}) {
  const errors = [];
  const record = (text) => {
    if (!ignore.some((pattern) => pattern.test(text))) errors.push(text);
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') record(msg.text());
  });
  page.on('pageerror', (err) => record(err.message));
  return errors;
}

/** A snapshot of window.__app.state (the contract in site/src/state.js). */
export function appState(page) {
  return page.evaluate(() => window.__app.state);
}

/** Resolves once the app reports the given phase. */
export async function waitForPhase(page, phase, timeout = 30000) {
  await page.waitForFunction((wanted) => window.__app?.state.phase === wanted, phase, { timeout });
}

/**
 * Before page.goto: keeps the page's AudioContexts and notes when each noise-based sound (an AudioBufferSourceNode:
 * the train's chugs, clicks, steam and whistle breath; the built-in tune uses oscillators only) starts, and when
 * each whistle does (its vibrato is the only oscillator below 20 Hz). Read it with audioReport(page).
 */
export async function trackAudio(page) {
  await page.addInitScript(() => {
    const contexts = [];
    const starts = [];
    const whistles = [];
    window.__audio = { contexts, starts, whistles };
    const Base = window.AudioContext || window.webkitAudioContext;
    if (!Base) return;
    class Tracked extends Base {
      constructor(...args) {
        super(...args);
        contexts.push(this);
      }
    }
    window.AudioContext = Tracked;
    if (window.webkitAudioContext) window.webkitAudioContext = Tracked;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      starts.push(performance.now());
      return start.apply(this, args);
    };
    const oscillate = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      if (this.frequency.value < 20) whistles.push(performance.now());
      return oscillate.apply(this, args);
    };
  });
}

/**
 * What trackAudio saw: `states`, each AudioContext's state; `sounds`, how many noise-based sounds have started;
 * `busiest`, the most that started within any one second; and `whistles`, how many whistles have blown.
 */
export function audioReport(page) {
  return page.evaluate(() => {
    const { contexts, starts, whistles } = window.__audio;
    let busiest = 0;
    for (let i = 0, j = 0; i < starts.length; i++) {
      while (starts[i] - starts[j] > 1000) j++;
      busiest = Math.max(busiest, i - j + 1);
    }
    return { states: contexts.map((c) => c.state), sounds: starts.length, busiest, whistles: whistles.length };
  });
}
