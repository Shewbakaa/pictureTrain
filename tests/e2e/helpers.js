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
 * the train's chugs, clicks, steam and whistle breath, the ambience's noise and the fireworks; the carol and the
 * built-in tune use oscillators only) starts, how many oscillators start (the carol's and the tune's notes, the
 * birds and bells, the whistle), and when each whistle does (its vibrato is the only oscillator below 20 Hz: no
 * other sound in the ride starts one that low). It also keeps every media element ever played (the scenes'
 * recordings are among them from the Begin tap, which unlocks each), and every 50 ms counts the scenes' recordings
 * playing at once. Read it with audioReport(page).
 */
export async function trackAudio(page) {
  await page.addInitScript(() => {
    const contexts = [];
    const starts = [];
    const whistles = [];
    const tones = { count: 0 };
    const media = new Set();
    const pieces = { most: 0 };
    window.__audio = { contexts, starts, whistles, tones, media, pieces };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      media.add(this);
      return play.apply(this, args);
    };
    setInterval(() => {
      let playing = 0;
      for (const m of media) if (!m.paused && m.src.includes('/music/zones/')) playing += 1;
      pieces.most = Math.max(pieces.most, playing);
    }, 50);
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
      tones.count += 1;
      if (this.frequency.value < 20) whistles.push(performance.now());
      return oscillate.apply(this, args);
    };
  });
}

/**
 * What trackAudio saw: `states`, each AudioContext's state; `sounds`, how many noise-based sounds have started;
 * `busiest`, the most that started within any one second; `tones`, how many oscillators have started; `whistles`,
 * how many whistles have blown; `pieces`, each scene's recording that has a file, by zone ({ paused, time }: whether
 * it is paused, and where it is, s); `unloaded`, how many recordings have none yet; and `mostPieces`, the most
 * recordings seen playing at once.
 */
export function audioReport(page) {
  return page.evaluate(() => {
    const { contexts, starts, whistles, tones, media, pieces: seen } = window.__audio;
    let busiest = 0;
    for (let i = 0, j = 0; i < starts.length; i++) {
      while (starts[i] - starts[j] > 1000) j++;
      busiest = Math.max(busiest, i - j + 1);
    }
    const pieces = {};
    let unloaded = 0;
    for (const m of media) {
      const zone = /\/music\/zones\/(\w+)\.mp3$/.exec(m.src);
      if (zone) pieces[zone[1]] = { paused: m.paused, time: m.currentTime };
      else if (!m.src) unloaded += 1;
    }
    return {
      states: contexts.map((c) => c.state), sounds: starts.length, busiest, tones: tones.count, whistles: whistles.length,
      pieces, unloaded, mostPieces: seen.most,
    };
  });
}
