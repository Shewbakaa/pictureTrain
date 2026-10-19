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
