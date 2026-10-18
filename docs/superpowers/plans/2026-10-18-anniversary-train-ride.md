# Anniversary Train Ride Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, phone-first website where she rides a cute low-poly 3D train through five seasonal zones, stops at 10 photo moments, and ends at an evening station where a girl figure steps off, a boy figure hands her flowers, and the author's 1-year message appears.

**Architecture:** Plain ES modules served as static files; Three.js r170 vendored and re-exported from one file. Pure logic modules (content normalization, track layout, ride state machine, look controls, zone blending, scatter, quality governor, music composition, finale timeline) are unit-tested in Node. Rendering modules build a procedural world (instanced, vertex-coloured low-poly props) and a DOM overlay UI. `app.js` orchestrates; Playwright e2e tests (WebKit iPhone + Chromium Android) cover the real page served from a sub-path.

**Tech Stack:** Three.js 0.170.0 (vendored), vanilla JS ES modules, HTML/CSS, Web Audio API, Node 25 `node:test`, Playwright 1.49.1, fonts vendored from @fontsource 5.3.0.

**Spec:** `docs/superpowers/specs/2026-10-18-anniversary-train-ride-design.md`

## Global Constraints

- Phone first, portrait: iPhone Safari, Android Chrome, in-app webviews (Instagram, WhatsApp). Touch controls. Safe-area insets. Landscape and desktop only need to "work fine".
- Device baseline: iOS 15+ Safari and Android Chrome from the last ~4 years, WebGL2. Without WebGL2 → 2D fallback page (Task 12). Site code stays within the Safari 15.0 feature set: no `Array.prototype.at`, `structuredClone`, `Object.hasOwn`; CSS `dvh` only after a `vh` fallback.
- Modules under `src/util/`, `src/content/`, `src/world/`, `src/ride/`, `src/perf/`, `src/train/`, `src/photos/`, `src/finale/` and `src/audio/compose.js` must not touch `window` or `document` at import time (Node unit tests import them). They may touch the DOM inside functions.
- Static files only, all under `site/`. Every URL in site code is relative, so the site works under a sub-path (`user.github.io/repo/`). E2E serves the repo root and opens `/site/index.html` to prove this.
- Three.js 0.170.0 vendored at `site/vendor/three.module.min.js`. No CDN, no bundler, no import map, no bare specifiers. Site modules import Three only through `site/src/three.js`.
- No runtime requests to any third-party host (fonts vendored to `site/fonts/`).
- Performance budget in any view at tier `high`: ≤ 100 draw calls, ≤ 250,000 triangles. Pixel ratio ≤ 2. No post-processing. No dynamic point/spot lights. World generated procedurally in code; no model files.
- Quality tiers start at `medium` and step automatically (Task 8).
- All author-supplied text is inserted with `textContent` (never `innerHTML`).
- Tap targets ≥ 44×44 CSS px. Body text ≥ 15px.
- Colours are written as sRGB hex and always pass through `THREE.Color` (ColorManagement on), so vertex colours are linear.
- Deterministic world: track seed 7, scatter seed = zone position index + 1.
- No getforevermore code or assets. No visible "made with" branding anywhere.
- Music: generated with Web Audio unless `content.music` names a file. No third-party audio files.
- Debug query params (harmless in production, parsed in `site/src/debug.js`): `speed`, `at`, `look`, `quality`, `fallback`, `finale`, `ft`, `stats`, `ui`.
- Commit after every task (conventional commit messages, ending with the attribution line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

## Review Focus

Things she will hit that no spec line spells out:

1. **Real phone photos.** HEIC or otherwise undecodable files, a mistyped filename, 12 MP images, panoramas (4:1) and tall screenshots (1:2.2). Expected: undecodable or missing → soft placeholder plus a console warning naming the file; huge → downscaled; extreme aspect → card shows the whole photo undistorted, sign crops to cover. Tests: Task 10 (`coverUv`, `fitWithin`), Task 12 (broken file, extreme aspect e2e).
2. **Small screens and rotation.** iPhone SE (375×667), turning to landscape mid-ride, a 2,000-character caption. Expected: card and Continue always reachable without page scroll, caption scrolls inside the card, canvas follows the viewport. Tests: Task 12.
3. **In-app browser without WebGL2, or a lost GPU context** (phone locks, memory pressure). Expected: no WebGL2 → 2D fallback with every moment and the final message; context lost → toast with a Restart button. Tests: Task 12.
4. **Rapid or mistimed taps.** Double-tapping Continue, tapping Begin twice, tapping the timeline during a jump fade, pausing while stopped. Expected: never skips a stop, never gets stuck. Tests: Task 4 (`continue` no-op), Task 11 (double Continue, Begin twice), Task 12 (timeline during fade).
5. **Backgrounding mid-ride** (switching apps, locking the phone). Expected: on return the train has not teleported past a stop, music resumes in the state she left it. Tests: Task 4 (frame clamp), Task 13 (visibility e2e).

## File Structure

```
package.json, playwright.config.js, .gitignore, README.md
.claude/launch.json                 preview config for the Claude app
.github/workflows/pages.yml         GitHub Pages deploy of site/
scripts/vendor.mjs                  copies three + fonts into site/
scripts/shot.mjs                    screenshot helper for visual checks
scripts/og-image.mjs                link-preview image generator
tests/unit/*.test.js                node:test
tests/e2e/*.spec.js, helpers.js     Playwright
tests/fixtures/content.fixture.js   realistic content for e2e
site/
  index.html, styles.css, content.js, favicon.svg, og-image.jpg
  photos/  music/  fonts/  vendor/
  src/
    main.js            boot: content → fallback or 3D app; loading; intro
    app.js             orchestrator: stage, world, ride, UI, music, finale
    state.js           window.__app.state contract
    debug.js           query params
    three.js           re-export of vendored Three
    progress.js        localStorage progress (reachedMax)
    util/rng.js, util/math.js, util/geo.js
    content/normalize.js
    world/layout.js, trackPath.js, zones.js, environment.js, props.js,
          scatter.js, sky.js, skyDecor.js, terrain.js, trackMesh.js,
          dressing.js, stations.js, particles.js, signs.js, figures.js
    ride/rideController.js, ride/look.js
    perf/quality.js
    render/stage.js
    train/cabin.js, train/exterior.js
    photos/photos.js
    ui/dom.js, loading.js, intro.js, stopCard.js, timeline.js,
       controls.js, fallback.js, toast.js, finaleCard.js
    audio/compose.js, audio/music.js
    finale/timeline.js, finale/finale.js
```

---

### Task 1: Scaffold, vendoring, test harness

**Files:**
- Create: `.gitignore`, `package.json`, `playwright.config.js`, `.claude/launch.json`, `scripts/vendor.mjs`, `scripts/shot.mjs`
- Create: `site/index.html`, `site/styles.css`, `site/src/main.js`, `site/src/state.js`, `site/src/debug.js`, `site/src/three.js`, `site/src/util/rng.js`, `site/src/util/math.js`
- Create (by `npm run vendor`): `site/vendor/three.module.min.js`, `site/vendor/THREE_LICENSE.txt`, `site/fonts/*.woff2`
- Test: `tests/unit/util.test.js`, `tests/unit/debug.test.js`, `tests/e2e/helpers.js`, `tests/e2e/smoke.spec.js`

**Interfaces:**
- Produces:
  - `createRng(seed: number): () => number` (mulberry32, [0,1)), `rngRange(rng, min, max): number`, `rngPick(rng, array): any`
  - `clamp(v, min, max)`, `lerp(a, b, t)`, `invLerp(a, b, v)`, `smoothstep(e0, e1, x)`, `easeInOutCubic(t)`, `easeOutCubic(t)`, `damp(current, target, rate, dt)` = `current + (target - current) * (1 - Math.exp(-rate * dt))`
  - `parseDebugParams(search: string): DebugParams` where `DebugParams = { speed: number /*1..50*/, at: number|null, look: number /*degrees, + = left*/, quality: 'low'|'medium'|'high'|null, fallback: boolean, finale: boolean, ft: number|null, stats: boolean, hideUi: boolean /* ui=0 */ }`
  - `site/src/state.js`: `export const appState` with exactly these fields and defaults: `{ phase: 'loading', mode: null, distance: 0, speed: 0, stopIndex: -1, nextStopIndex: -1, reachedMax: -1, paused: false, yaw: 0, quality: null, drawCalls: 0, triangles: 0, music: 'off', musicSource: null, audioSuspended: false, finaleTime: null, view: 'cabin' }`. Phases: `'loading'|'intro'|'riding'|'stopped'|'finale'|'done'|'fallback'|'error'`; mode `'3d'|'fallback'|null`. It sets `window.__app = { get state() { return { ...appState }; } }`. Other modules mutate `appState` directly.
  - `site/src/three.js`: `export * from '../vendor/three.module.min.js';`
  - DOM ids in `index.html` (all later UI tasks fill these): `#scene` (canvas container), `#ui` (overlay root) containing `#loading` (with `#loading-progress`), `#intro`, `#stop-card`, `#finale-card`, `#topbar` (with `#progress-pill`, `#music-toggle`), `#bottombar` (with `#pause-toggle`, `nav#timeline`), `#fade`, `#fallback`, `#toast`, `#stats`. Everything except `#loading` starts `hidden`.
  - e2e helpers: `collectConsoleErrors(page, { ignore?: RegExp[] }): string[]` (live array, records `console` errors and `pageerror`), `appState(page): Promise<AppState>`, `waitForPhase(page, phase, timeout = 30000)`
  - `scripts/shot.mjs`: `node scripts/shot.mjs <name> "<query>" [--size 390x844] [--wait 2500]` → starts `python3 -m http.server 4174` at repo root, opens `/site/index.html?<query>` in Chromium (DPR 3, touch), waits for `__app.state.mode` then `--wait` ms, writes `artifacts/shots/<name>.png`.

- [ ] **Step 1: Init repo and package**

```bash
git init -b main
```

`.gitignore`: `node_modules/`, `test-results/`, `playwright-report/`, `artifacts/`, `.DS_Store`.

`package.json`: `"private": true`, `"type": "module"`, scripts `vendor` → `node scripts/vendor.mjs`, `test` → `node --test tests/unit/`, `test:e2e` → `playwright test`, `serve` → `python3 -m http.server 8080 --directory site`, `shot` → `node scripts/shot.mjs`, `og-image` → `node scripts/og-image.mjs`. devDependencies (exact): `three@0.170.0`, `@playwright/test@1.49.1`, `@fontsource/cormorant-garamond@5.3.0`, `@fontsource/nunito@5.3.0`.

`.claude/launch.json`: one configuration `{ "name": "site", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "8080", "--directory", "site"], "port": 8080 }`.

- [ ] **Step 2: Install**

Run: `npm install && npx playwright install chromium webkit`
Expected: exits 0.

- [ ] **Step 3: Write `scripts/vendor.mjs` and run it**

It copies `node_modules/three/build/three.module.min.js` → `site/vendor/three.module.min.js`, `node_modules/three/LICENSE` → `site/vendor/THREE_LICENSE.txt`, and these from `node_modules/@fontsource/*/files/` → `site/fonts/`: `cormorant-garamond-latin-600-normal.woff2`, `cormorant-garamond-latin-500-italic.woff2`, `nunito-latin-400-normal.woff2`, `nunito-latin-700-normal.woff2`.

Run: `npm run vendor && ls site/vendor site/fonts`
Expected: the 2 vendor files and the 4 font files are listed.

- [ ] **Step 4: Write the failing unit tests**

```js
// tests/unit/util.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, rngRange, rngPick } from '../../site/src/util/rng.js';
import { clamp, lerp, invLerp, smoothstep, easeInOutCubic, damp } from '../../site/src/util/math.js';

test('createRng is deterministic and in [0,1)', () => {
  const a = createRng(42), b = createRng(42);
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, createRng(43)));
});

test('rngRange and rngPick stay in bounds', () => {
  const r = createRng(1);
  for (let i = 0; i < 500; i++) {
    const v = rngRange(r, -2, 3);
    assert.ok(v >= -2 && v < 3);
    assert.ok(['a', 'b', 'c'].includes(rngPick(r, ['a', 'b', 'c'])));
  }
});

test('math helpers', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(lerp(0, 10, 0.25), 2.5);
  assert.equal(invLerp(10, 20, 15), 0.5);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.ok(easeInOutCubic(0.25) < 0.25);
  assert.ok(Math.abs(damp(0, 10, 2, 1) - 10 * (1 - Math.exp(-2))) < 1e-9);
});
```

```js
// tests/unit/debug.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDebugParams } from '../../site/src/debug.js';

test('defaults', () => {
  assert.deepEqual(parseDebugParams(''), {
    speed: 1, at: null, look: 0, quality: null, fallback: false,
    finale: false, ft: null, stats: false, hideUi: false,
  });
});

test('parses and clamps', () => {
  const p = parseDebugParams('?speed=100&at=300&look=45&quality=high&fallback=1&finale=1&ft=7.5&stats=1&ui=0');
  assert.equal(p.speed, 50);
  assert.equal(p.at, 300);
  assert.equal(p.look, 45);
  assert.equal(p.quality, 'high');
  assert.equal(p.fallback, true);
  assert.equal(p.finale, true);
  assert.equal(p.ft, 7.5);
  assert.equal(p.stats, true);
  assert.equal(p.hideUi, true);
});

test('rejects junk', () => {
  const p = parseDebugParams('?speed=abc&at=-5&quality=ultra&ft=x&look=nope');
  assert.equal(p.speed, 1);
  assert.equal(p.at, null);
  assert.equal(p.quality, null);
  assert.equal(p.ft, null);
  assert.equal(p.look, 0);
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npm test`
Expected: FAIL, cannot find module `site/src/util/rng.js`.

- [ ] **Step 6: Implement `rng.js`, `math.js`, `debug.js`, `three.js`, `state.js`**

Signatures as in Interfaces. `speed` clamps to [1, 50]; `at` must be a finite number ≥ 0; `ft` finite ≥ 0.

- [ ] **Step 7: Run unit tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Write `playwright.config.js`, helpers and the failing smoke test**

```js
// playwright.config.js
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:4173/site/' },
  webServer: { command: 'python3 -m http.server 4173 --bind 127.0.0.1', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'], launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } } },
  ],
});
```

```js
// tests/e2e/smoke.spec.js
import { test, expect } from '@playwright/test';
import { collectConsoleErrors } from './helpers.js';

test('page loads with loading screen and no console errors', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html');
  await expect(page.locator('#loading')).toBeVisible();
  expect(await page.evaluate(() => typeof window.__app?.state.phase)).toBe('string');
  expect(errors).toEqual([]);
});

test('browser exposes WebGL2', async ({ page }) => {
  await page.goto('index.html');
  expect(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'))).toBe(true);
});
```

Run: `npx playwright test tests/e2e/smoke.spec.js`
Expected: FAIL (404 for `index.html`).

- [ ] **Step 9: Write `index.html`, `styles.css`, `main.js`**

`index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="robots" content="noindex, nofollow">`, `<title>For you</title>`, `<link rel="stylesheet" href="styles.css">`, the DOM ids listed in Interfaces, `<script type="module" src="src/main.js"></script>`. The loading screen's CSS lives in an inline `<style>` in `<head>` so it paints before any JS or stylesheet arrives (spec anti-goal: long blank loading). Design: a soft dusk-pink background, a small CSS-only train that chugs in place with two floating hearts, the text `Getting the train ready…`, and a thin rounded progress bar (`#loading-progress` width = %). It honours `prefers-reduced-motion`.

`styles.css`: `@font-face` for the 4 vendored fonts (`font-display: swap`); tokens on `:root`: `--cream #fffaf3`, `--ink #3d2b2b`, `--muted #8a6f6a`, `--rose #e0607e`, `--rose-2 #f08da5`, `--gold #d9a441`, `--radius 22px`; display font `'Cormorant Garamond'`, UI font `'Nunito'`. `html, body` fill `100vh` then `100dvh`, `overscroll-behavior: none`, `margin: 0`, no page scroll. `#scene canvas { touch-action: none; display: block }`. `#ui { pointer-events: none }`, and `#ui .card, #ui button, #ui nav, #ui #fallback { pointer-events: auto }`. Overlay padding uses `env(safe-area-inset-*)`.

`main.js` for now: imports `state.js` and leaves `phase: 'loading'`.

- [ ] **Step 10: Run smoke e2e**

Run: `npx playwright test tests/e2e/smoke.spec.js`
Expected: PASS on `iphone` and `android`.
**Decision rule:** if only `browser exposes WebGL2` fails on `iphone` (headless WebKit without WebGL2), add `test.skip(({ browserName }) => browserName === 'webkit', 'no WebGL2 in headless WebKit')` to every later spec that needs `mode === '3d'`. Keep WebKit for UI-only and fallback specs. Write a line in README "Testing" saying so.

- [ ] **Step 11: Write `scripts/shot.mjs` and check it**

Run: `npm run shot -- smoke "" && ls artifacts/shots/smoke.png`
Expected: file exists. Open it (Read tool) and confirm the loading screen is visible.

- [ ] **Step 12: Commit**

```bash
git add -A && git commit -m "chore: scaffold static site, vendoring and test harness"
```

---

### Task 2: Content config and normalization

**Files:**
- Create: `site/content.js`, `site/src/content/normalize.js`, `site/photos/.gitkeep`, `site/music/.gitkeep`, `tests/fixtures/content.fixture.js`
- Modify: `site/src/main.js`, `tests/e2e/helpers.js`
- Test: `tests/unit/normalize.test.js`, `tests/e2e/content.spec.js`

**Interfaces:**
- Produces:
  - `ZONE_IDS = ['spring', 'summer', 'autumn', 'winter', 'evening']`
  - `normalizeContent(raw: unknown): { content: Content, warnings: string[], errors: string[] }`
  - `Content = { herName, yourName, intro: { eyebrow, title, note, button }, finale: { eyebrow, wish, message, signoff }, zones: ZoneId[], moments: Moment[], characters: { her: Look, you: Look }, music: string }`
  - `Moment = { index: number, photo: string, date: string, title: string, caption: string, zone: ZoneId }`, `Look = { skin, hair, outfit }` (hex strings)
  - e2e helper `useFixture(page, overrides = {})`: routes `**/site/content.js` to `export default ${JSON.stringify({ ...fixture, ...overrides })};`

Rules (each has a test):

| Input | Result |
|---|---|
| not an object | defaults; error `content.js did not export an object` |
| empty `intro.title` / `finale.wish` / `finale.signoff` | `For ${herName}` / `Happy 1 year, ${herName}` / `— ${yourName}` |
| empty `intro.button` / `intro.eyebrow` / `finale.eyebrow` | `Begin the ride` / `Our first year` / `One year of us` |
| unknown zone id | dropped, warning quoting it |
| duplicate zone | dropped, warning |
| `evening` not last / missing | moved / appended last, warning |
| moment zone missing or not in `zones` | previous moment's zone (first moment: `zones[0]`), warning naming `Moment N` (1-based) |
| moment zone earlier than previous moment's zone | **error** containing `Moment N` and `zone order`; coerced to previous zone |
| colour not `/^#[0-9a-f]{6}$/i` | default colour, warning |
| text field a number | `String(value)`; other non-strings → default; all trimmed |
| missing moment `title` / `date` / `caption` / `photo` | `Moment ${i+1}` / `''` / `''` / `''` |
| `music` not a string | `''`, warning |
| more than 10 moments | all kept (no cap) |

Default looks: her `{ skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' }`, you `{ skin: '#e8b994', hair: '#2a1a10', outfit: '#5b7fc4' }`.

`site/content.js` ships bracketed placeholders, clearly marked for replacement, with a comment above every field explaining it: `herName: '[Her name]'`, `yourName: '[Your name]'`, `intro.note: '[A short note to her before the ride starts]'`, `finale.message: '[Your 1-year message to her]'`, 10 moments with `title: '[Moment N title]'`, `date: '[Date]'`, `caption: '[What made this moment special]'`, `photo: ''`, zones 2 each in default order, `music: ''`.

Fixture (`tests/fixtures/content.fixture.js`): herName `Maya`, yourName `Sam`, intro note `A little ride through our first year.`, finale message `Thank you for the best year of my life.`, moment titles in order: `First coffee`, `Rainy walk`, `Beach day`, `Sunset pier`, `Pumpkin patch`, `Movie night`, `First snow`, `Ice skating`, `City lights`, `Our dinner`; dates `Oct 2025` through `Sep 2026`; default zones; `photo: ''`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/normalize.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContent, ZONE_IDS } from '../../site/src/content/normalize.js';
import shipped from '../../site/content.js';

test('shipped content.js normalizes with no errors', () => {
  const { content, errors } = normalizeContent(shipped);
  assert.deepEqual(errors, []);
  assert.deepEqual(content.zones, ZONE_IDS);
  assert.deepEqual(content.moments.map((m) => m.zone),
    ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter', 'evening', 'evening']);
  assert.deepEqual(content.moments.map((m) => m.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('non-object input gives defaults and an error', () => {
  const { content, errors } = normalizeContent(undefined);
  assert.match(errors[0], /did not export an object/);
  assert.deepEqual(content.moments, []);
  assert.deepEqual(content.zones, ZONE_IDS);
});

test('derived defaults from names', () => {
  const { content } = normalizeContent({ herName: 'Maya', yourName: 'Sam' });
  assert.equal(content.intro.title, 'For Maya');
  assert.equal(content.finale.wish, 'Happy 1 year, Maya');
  assert.equal(content.finale.signoff, '— Sam');
  assert.equal(content.intro.button, 'Begin the ride');
});

test('zones: unknown dropped, duplicates removed, evening forced last', () => {
  const { content, warnings } = normalizeContent({ zones: ['autumn', 'moon', 'evening', 'winter', 'autumn'] });
  assert.deepEqual(content.zones, ['autumn', 'winter', 'evening']);
  assert.ok(warnings.some((w) => w.includes('"moon"')));
});

test('zones: evening appended when missing', () => {
  assert.deepEqual(normalizeContent({ zones: ['spring', 'summer'] }).content.zones, ['spring', 'summer', 'evening']);
});

test('moment without zone inherits the previous one', () => {
  const { content, warnings } = normalizeContent({ moments: [{ zone: 'summer' }, {}] });
  assert.equal(content.moments[1].zone, 'summer');
  assert.ok(warnings.some((w) => w.includes('Moment 2')));
});

test('first moment without zone takes the first zone', () => {
  assert.equal(normalizeContent({ zones: ['winter', 'evening'], moments: [{}] }).content.moments[0].zone, 'winter');
});

test('moment zone not in zones list is treated as missing', () => {
  const { content } = normalizeContent({ zones: ['autumn', 'evening'], moments: [{ zone: 'spring' }] });
  assert.equal(content.moments[0].zone, 'autumn');
});

test('out-of-order zone is an error and is coerced', () => {
  const { content, errors } = normalizeContent({ moments: [{ zone: 'summer' }, { zone: 'spring' }] });
  assert.ok(errors.some((e) => e.includes('Moment 2') && e.includes('zone order')));
  assert.equal(content.moments[1].zone, 'summer');
});

test('invalid colours fall back with a warning', () => {
  const { content, warnings } = normalizeContent({ characters: { her: { hair: 'red' } } });
  assert.equal(content.characters.her.hair, '#3b2416');
  assert.ok(warnings.length > 0);
});

test('text coercion and trimming', () => {
  const { content } = normalizeContent({ herName: '  Maya ', moments: [{ title: 42, caption: null }] });
  assert.equal(content.herName, 'Maya');
  assert.equal(content.moments[0].title, '42');
  assert.equal(content.moments[0].caption, '');
});

test('no cap on number of moments', () => {
  const moments = Array.from({ length: 14 }, () => ({ zone: 'spring' }));
  assert.equal(normalizeContent({ moments }).content.moments.length, 14);
});

test('music must be a string', () => {
  const { content, warnings } = normalizeContent({ music: 5 });
  assert.equal(content.music, '');
  assert.ok(warnings.length > 0);
});
```

```js
// tests/e2e/content.spec.js
import { test, expect } from '@playwright/test';
import { useFixture } from './helpers.js';

test('content problems are reported in the console', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await useFixture(page, { zones: ['moon', 'spring', 'summer', 'autumn', 'winter', 'evening'] });
  await page.goto('index.html');
  await expect.poll(() => warnings.some((w) => w.startsWith('[content.js]') && w.includes('"moon"'))).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/content.spec.js`
Expected: FAIL, module not found / no warning.

- [ ] **Step 3: Implement `normalize.js`, `content.js`, fixture, `useFixture`; in `main.js` import `../content.js`, normalize, and log each warning with `console.warn('[content.js] ' + w)` and each error with `console.error('[content.js] ' + e)`**

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test tests/e2e/content.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: content config with validation and placeholders"
```

---

### Task 3: Track layout and track path

**Files:**
- Create: `site/src/world/layout.js`, `site/src/world/trackPath.js`
- Test: `tests/unit/layout.test.js`, `tests/unit/trackPath.test.js`

**Interfaces:**
- Consumes: `Content` (Task 2), `createRng` (Task 1)
- Produces:
  - `LAYOUT = { LEAD_IN: 30, ZONE_BASE: 40, MOMENT_SPACING: 70, FINALE_EXTRA: 60, FINALE_BACK: 30, RUNOUT: 40, BLEND: 30 }`
  - `EYE_HEIGHT = 2.05`: her eye height above the rails in the seat. Used by the camera rig (Task 8) and the finale (Task 14).
  - `buildLayout(content): Layout`, `Layout = { zones: ZoneSeg[], stops: Stop[], finaleDistance: number, total: number }`, `ZoneSeg = { id, start, end, momentIndices: number[] }`, `Stop = { index, distance, zone, side: 'right'|'left' }`
  - `zoneAt(layout, d): { current: ZoneSeg, blend: { a: ZoneId, b: ZoneId, t: number } }`
  - `TRACK = { SEG: 60, MAX_TURN: 0.14, HEADING_LIMIT: 1.0, SEED: 7 }`
  - `createTrackPath(length, seed = TRACK.SEED, { straightRanges = [[0, 120]] } = {}): TrackPath`
  - `TrackPath = { length, curve, pointAt(d, out?), tangentAt(d, out?), sideAt(d, out?), frameAt(d, right, up, out?) }`: all return `THREE.Vector3`; tangent and side are unit and horizontal; `side` points to the right when facing along the tangent; `frameAt = pointAt + side*right + (0,1,0)*up`. For `d < 0` or `d > length`, positions extrapolate linearly along the end tangent.
  - `minCurvatureRadius(path, step = 2): number`

Layout rules: zone length = `ZONE_BASE + MOMENT_SPACING * n`, plus `LEAD_IN` for the first zone and `FINALE_EXTRA` for the last (`evening`). The first zone starts at 0. Moment k of a zone sits at `zoneStart + (first zone ? LEAD_IN : 0) + ZONE_BASE/2 + MOMENT_SPACING * (k + 0.5)`. `side` alternates by global index: even → `'right'`, odd → `'left'`. `finaleDistance = lastZone.end - FINALE_BACK`, `total = lastZone.end + RUNOUT`. Blend window is the open interval `(boundary - BLEND/2, boundary + BLEND/2)` with `t = smoothstep` across it; outside it, `{ a: current, b: current, t: 0 }`. `d` before 0 / past the end → first / last zone.

Path generation: control point 0 sits at `(0, 0, SEG)` (behind the origin), then points every `SEG` metres starting at the origin with heading 0 = −Z (`x += -sin(h) * SEG`, `z += -cos(h) * SEG`). Per point `dh = rngRange(-MAX_TURN, MAX_TURN)`, forced to 0 when the point's distance `i*SEG` lies within `[a - SEG, b + SEG]` of any straight range. If `|h + dh| > HEADING_LIMIT`, use `-dh`. Generate until the polyline reaches `length + 120`. Use `CatmullRomCurve3(points, false, 'centripetal')` with `arcLengthDivisions = ceil(curveLength / 2)`. Distance `d` maps to `u = (SEG + d) / curveLength`. (Feasibility checked while planning: seed 7 gives a minimum radius of about 230 m.)

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/layout.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, zoneAt } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import shipped from '../../site/content.js';

const content = normalizeContent(shipped).content;
const withMoments = (moments) => normalizeContent({ moments }).content;

test('default layout distances', () => {
  const L = buildLayout(content);
  assert.deepEqual(L.zones.map((z) => [z.id, z.start, z.end]),
    [['spring', 0, 210], ['summer', 210, 390], ['autumn', 390, 570], ['winter', 570, 750], ['evening', 750, 990]]);
  assert.deepEqual(L.stops.map((s) => s.distance), [85, 155, 265, 335, 445, 515, 625, 695, 805, 875]);
  assert.deepEqual(L.stops.map((s) => s.side), ['right', 'left', 'right', 'left', 'right', 'left', 'right', 'left', 'right', 'left']);
  assert.equal(L.finaleDistance, 960);
  assert.equal(L.total, 1030);
});

test('a zone without moments is a short scenic stretch', () => {
  const L = buildLayout(withMoments([{ zone: 'spring' }, { zone: 'evening' }]));
  assert.deepEqual(L.zones.map((z) => [z.start, z.end]), [[0, 140], [140, 180], [180, 220], [220, 260], [260, 430]]);
  assert.deepEqual(L.stops.map((s) => s.distance), [85, 315]);
  assert.equal(L.finaleDistance, 400);
  assert.equal(L.total, 470);
});

test('zero moments goes straight to the finale', () => {
  const L = buildLayout(withMoments([]));
  assert.deepEqual(L.stops, []);
  assert.equal(L.zones.at(-1).end, 290);
  assert.equal(L.finaleDistance, 260);
});

test('zoneAt blends across a boundary', () => {
  const L = buildLayout(content);
  assert.deepEqual(zoneAt(L, 100).blend, { a: 'spring', b: 'spring', t: 0 });
  const mid = zoneAt(L, 210).blend;
  assert.equal(mid.a, 'spring');
  assert.equal(mid.b, 'summer');
  assert.ok(Math.abs(mid.t - 0.5) < 1e-9);
  assert.deepEqual(zoneAt(L, 195).blend, { a: 'spring', b: 'spring', t: 0 });
  assert.deepEqual(zoneAt(L, 225).blend, { a: 'summer', b: 'summer', t: 0 });
  assert.ok(zoneAt(L, 224).blend.t > 0.9);
  assert.equal(zoneAt(L, -5).current.id, 'spring');
  assert.equal(zoneAt(L, 5000).current.id, 'evening');
});
```

```js
// tests/unit/trackPath.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrackPath, minCurvatureRadius } from '../../site/src/world/trackPath.js';

const path = createTrackPath(1030, 7, { straightRanges: [[0, 120], [870, 1100]] });
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test('starts at the origin heading -Z with +X on the right', () => {
  assert.ok(path.pointAt(0).length() < 1e-6);
  assert.ok(near(path.tangentAt(0).z, -1));
  assert.ok(near(path.sideAt(0).x, 1));
  assert.ok(near(path.tangentAt(60).z, -1), 'straight start');
});

test('distance is arc length', () => {
  for (const d of [10, 300, 700, 1000]) {
    assert.ok(near(path.pointAt(d).distanceTo(path.pointAt(d + 1)), 1, 0.02));
  }
});

test('tangent and side are unit and horizontal', () => {
  for (const d of [0, 250, 640, 1029]) {
    const t = path.tangentAt(d), s = path.sideAt(d);
    assert.ok(near(t.length(), 1) && near(s.length(), 1) && near(t.y, 0) && near(s.y, 0));
    assert.ok(near(t.dot(s), 0));
  }
});

test('gentle curves: minimum radius at least 150 m', () => {
  assert.ok(minCurvatureRadius(path) >= 150);
});

test('it does curve', () => {
  let maxDev = 0;
  for (let d = 0; d <= 1030; d += 5) maxDev = Math.max(maxDev, Math.abs(Math.atan2(-path.tangentAt(d).x, -path.tangentAt(d).z)));
  assert.ok(maxDev >= 0.15);
});

test('never comes back near itself', () => {
  const pts = [];
  for (let d = 0; d <= 1030; d += 5) pts.push(path.pointAt(d));
  for (let i = 0; i < pts.length; i++) for (let j = i + 40; j < pts.length; j++) {
    assert.ok(pts[i].distanceTo(pts[j]) >= 185);
  }
});

test('straight ranges are straight', () => {
  const t0 = path.tangentAt(880);
  for (let d = 880; d <= 1030; d += 10) assert.ok(path.tangentAt(d).dot(t0) > 0.9999);
});

test('extrapolates past both ends', () => {
  assert.ok(path.pointAt(-10).distanceTo({ x: 0, y: 0, z: 10 }) < 1e-3);
  const end = path.pointAt(1030), t = path.tangentAt(1030);
  assert.ok(path.pointAt(1040).distanceTo(end.clone().addScaledVector(t, 10)) < 1e-3);
});

test('frameAt offsets', () => {
  const f = path.frameAt(100, 2, 1);
  const e = path.pointAt(100).addScaledVector(path.sideAt(100), 2);
  e.y += 1;
  assert.ok(f.distanceTo(e) < 1e-6);
});

test('deterministic per seed', () => {
  assert.ok(createTrackPath(1030, 7).pointAt(500).distanceTo(createTrackPath(1030, 7).pointAt(500)) < 1e-9);
  assert.ok(createTrackPath(1030, 8).pointAt(500).distanceTo(createTrackPath(1030, 7).pointAt(500)) > 0.5);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `layout.js` and `trackPath.js`**

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS. If the minimum-radius test fails, lower `MAX_TURN` to 0.12 (planning check: worst seed ≥ 177 m at SEG 60) and rerun.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: zone layout and curvy track path"
```

---

### Task 4: Ride controller

**Files:**
- Create: `site/src/ride/rideController.js`
- Test: `tests/unit/ride.test.js`

**Interfaces:**
- Produces:
  - `RIDE = { CRUISE: 6.5, ACCEL: 1.0, BRAKE: 1.2, MAX_DT: 0.1, ARRIVE_EPS: 0.05, PAUSE_EASE: 0.5 }`
  - `createRide({ stops: number[], finaleDistance, speedScale = 1, startDistance = 0, reachedMax = -1 }): Ride`
  - `Ride` read-only getters: `state: 'idle'|'moving'|'stopped'|'finale'`, `distance`, `speed`, `stopIndex` (−1 unless stopped), `nextStopIndex` (stop the train will stop at next; −1 if only the finale is ahead), `reachedMax`, `paused`
  - methods: `start()` (idle → moving), `continue()` (stopped → moving; otherwise no-op), `setPaused(bool)`, `jumpTo(i): boolean`, `restart()` (distance 0, `idle`, keeps `reachedMax`), `update(dt)`, `on(event, fn): unsubscribe` for events `'arrive'` `{ index, jumped }`, `'depart'` `{ index }`, `'finale'` `{}`

Motion per update: `dt = min(dt, MAX_DT) * speedScale`; target = `stops[nextStopIndex]` or `finaleDistance`; `rem = target - distance`; `v = min(v + ACCEL*dt, CRUISE, sqrt(2*BRAKE*rem))`; `distance += v * pauseFactor * dt`; if `target - distance <= ARRIVE_EPS` → snap to target, `v = 0`, then arrive. `pauseFactor` ramps linearly toward 0 or 1 over `PAUSE_EASE` seconds. On arrive: `state = 'stopped'`, `stopIndex = i`, `nextStopIndex = i+1` (or −1), `reachedMax = max(reachedMax, i)`, then emit. State is updated before events fire, so calling `continue()` inside a handler works. `jumpTo(i)` succeeds only when `0 <= i <= reachedMax` (from any state, including `finale`): sets distance, `stopped`, emits `arrive { index: i, jumped: true }`. A start inside the track picks the first stop with `distance > startDistance + ARRIVE_EPS`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/ride.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRide, RIDE } from '../../site/src/ride/rideController.js';

const stops = [85, 155, 265];
const finaleDistance = 400;
const run = (r, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) r.update(dt); };
const runUntil = (r, pred, max = 200000) => { for (let i = 0; i < max && !pred(); i++) r.update(1 / 60); assert.ok(pred(), 'condition not reached'); };
const stoppedAt = (i) => { const r = createRide({ stops, finaleDistance }); r.start(); for (let k = 0; k <= i; k++) { if (k > 0) r.continue(); runUntil(r, () => r.state === 'stopped' && r.stopIndex === k); } return r; };

test('idle until started', () => {
  const r = createRide({ stops, finaleDistance });
  run(r, 2);
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
});

test('accelerates to cruise', () => {
  const r = createRide({ stops, finaleDistance });
  r.start();
  run(r, 8);
  assert.equal(r.speed, RIDE.CRUISE);
});

test('stops exactly at a stop and emits arrive once', () => {
  const r = createRide({ stops, finaleDistance });
  const events = [];
  r.on('arrive', (e) => events.push(e));
  r.start();
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.distance, 85);
  assert.equal(r.speed, 0);
  assert.equal(r.stopIndex, 0);
  assert.equal(r.reachedMax, 0);
  run(r, 5);
  assert.equal(r.distance, 85);
  assert.deepEqual(events, [{ index: 0, jumped: false }]);
});

test('continue departs once; repeated continue is a no-op', () => {
  const r = stoppedAt(0);
  const departs = [];
  r.on('depart', (e) => departs.push(e));
  r.continue(); r.continue(); run(r, 1); r.continue();
  assert.deepEqual(departs, [{ index: 0 }]);
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
});

test('long frames are clamped', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 8);
  const d0 = r.distance;
  r.update(5);
  assert.ok(r.distance - d0 <= RIDE.CRUISE * RIDE.MAX_DT + 1e-9);
});

test('time warp never overshoots and reaches the finale', () => {
  const r = createRide({ stops, finaleDistance, speedScale: 50 });
  const seen = [];
  let finales = 0;
  r.on('arrive', () => { seen.push(r.distance); r.continue(); });
  r.on('finale', () => finales++);
  r.start();
  for (let i = 0; i < 5000 && r.state !== 'finale'; i++) {
    r.update(1 / 60);
    const target = r.nextStopIndex >= 0 ? stops[r.nextStopIndex] : finaleDistance;
    assert.ok(r.distance <= target + 1e-9);
  }
  assert.deepEqual(seen, stops);
  assert.equal(r.state, 'finale');
  assert.equal(r.distance, finaleDistance);
  assert.equal(finales, 1);
});

test('zero stops goes straight to the finale', () => {
  const r = createRide({ stops: [], finaleDistance: 100, speedScale: 20 });
  r.start();
  runUntil(r, () => r.state === 'finale');
  assert.equal(r.distance, 100);
});

test('jumpTo only reaches stops already reached', () => {
  const r = stoppedAt(1);
  const events = [];
  r.on('arrive', (e) => events.push(e));
  assert.equal(r.jumpTo(2), false);
  assert.equal(r.jumpTo(0), true);
  assert.equal(r.distance, 85);
  assert.equal(r.state, 'stopped');
  assert.equal(r.nextStopIndex, 1);
  assert.deepEqual(events, [{ index: 0, jumped: true }]);
});

test('jumpTo works from the finale', () => {
  const r = createRide({ stops, finaleDistance, speedScale: 50 });
  r.on('arrive', () => r.continue());
  r.start();
  runUntil(r, () => r.state === 'finale');
  assert.equal(r.jumpTo(2), true);
  assert.equal(r.state, 'stopped');
});

test('pause eases to a halt and resumes', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 3);
  r.setPaused(true); run(r, RIDE.PAUSE_EASE + 0.05);
  const d = r.distance;
  run(r, 2);
  assert.equal(r.distance, d);
  r.setPaused(false); run(r, 2);
  assert.ok(r.distance > d);
});

test('restart keeps reachedMax', () => {
  const r = stoppedAt(1);
  r.restart();
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
  assert.equal(r.reachedMax, 1);
});

test('starting mid-track picks the next stop ahead', () => {
  const r = createRide({ stops, finaleDistance, startDistance: 100, reachedMax: 0 });
  assert.equal(r.distance, 100);
  assert.equal(r.nextStopIndex, 1);
  assert.equal(createRide({ stops, finaleDistance, startDistance: 85 }).nextStopIndex, 1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `rideController.js`**

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ride state machine with exact stops, pause and jumps"
```

---

### Task 5: Look-around controls and field of view

**Files:**
- Create: `site/src/ride/look.js`
- Test: `tests/unit/look.test.js`

**Interfaces:**
- Consumes: `clamp`, `damp` (Task 1)
- Produces:
  - `LOOK = { SENSITIVITY: 0.0055, YAW_LIMIT: 1.75, PITCH_MIN: -0.45, PITCH_MAX: 0.6, RETURN_DELAY: 1.2, RETURN_RATE: 2.0, HFOV: 78, VFOV_MIN: 50, VFOV_MAX: 80 }`
  - `createLook(): Look` with `yaw`, `pitch`, `dragging`, `beginDrag()`, `drag(dxPx, dyPx)`, `endDrag()`, `setRest(yaw, pitch = 0)`, `update(dt)`. Grab-the-world semantics: `yaw += dx * SENSITIVITY` (positive yaw turns left), `pitch += dy * SENSITIVITY` (drag down looks up). The return to rest uses `damp` at `RETURN_RATE`, only after `RETURN_DELAY` seconds without dragging. A `setRest` change while idle eases straight away.
  - `fovForAspect(aspect): number`: vertical fov in degrees that gives horizontal `HFOV`, clamped to `[VFOV_MIN, VFOV_MAX]`
  - `attachPointerControls(element, look): () => void`: pointer events on the canvas, primary pointer only, `setPointerCapture`, returns detach

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/look.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLook, fovForAspect, LOOK } from '../../site/src/ride/look.js';

const settle = (l, s) => { for (let t = 0; t < s; t += 1 / 60) l.update(1 / 60); };

test('drag turns the view (grab the world)', () => {
  const l = createLook();
  l.beginDrag(); l.drag(100, 0);
  assert.ok(Math.abs(l.yaw - 100 * LOOK.SENSITIVITY) < 1e-9);
  l.drag(0, 50);
  assert.ok(l.pitch > 0);
});

test('clamps yaw and pitch', () => {
  const l = createLook();
  l.beginDrag(); l.drag(1e6, 1e6);
  assert.equal(l.yaw, LOOK.YAW_LIMIT);
  assert.equal(l.pitch, LOOK.PITCH_MAX);
  l.drag(-1e7, -1e7);
  assert.equal(l.yaw, -LOOK.YAW_LIMIT);
  assert.equal(l.pitch, LOOK.PITCH_MIN);
});

test('eases back to rest only after the delay', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0); l.endDrag();
  const y = l.yaw;
  settle(l, LOOK.RETURN_DELAY * 0.9);
  assert.equal(l.yaw, y);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw) < 0.01);
});

test('no return while dragging', () => {
  const l = createLook();
  l.beginDrag(); l.drag(200, 0);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 200 * LOOK.SENSITIVITY) < 1e-9);
});

test('setRest retargets', () => {
  const l = createLook();
  l.setRest(0.75);
  settle(l, 5);
  assert.ok(Math.abs(l.yaw - 0.75) < 0.01);
});

test('fovForAspect', () => {
  assert.equal(fovForAspect(390 / 844), 80);
  assert.equal(fovForAspect(16 / 9), 50);
  assert.ok(Math.abs(fovForAspect(1) - 78) < 0.1);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `look.js`**

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: drag-to-look controller and aspect-aware fov"
```

---

### Task 6: Zone definitions and environment blending

**Files:**
- Create: `site/src/world/zones.js`, `site/src/world/environment.js`
- Test: `tests/unit/environment.test.js`

**Interfaces:**
- Consumes: `ZONE_IDS` (Task 2), `buildLayout`, `zoneAt`, `LAYOUT` (Task 3)
- Produces:
  - `ZONES: Record<ZoneId, ZoneDef>`; `ZoneDef = { id, sky: { top, horizon }, fog: { color, near, far }, sun: { color, intensity, dir: [x,y,z] }, hemi: { sky, ground, intensity }, ground: { near, far, path }, water: boolean, particles: ParticleStyle, props: PropRule[] }`
  - `ParticleStyle = { kind: 'petals'|'leaves'|'snow'|'fireflies'|'none', color, size, fall, sway, density, additive }`
  - `PropRule = { type: PropType, perMeter: number /* per side */, minOffset, maxOffset, scale: [min, max] }`
  - `envAt(layout, d, out?): Env` (reuses `out` when given); `Env = { skyTop, skyHorizon, fogColor, sunColor, hemiSky, hemiGround, groundNear, groundFar, path /* THREE.Color, linear lerp */, fogNear, fogFar, sunIntensity, hemiIntensity, sunDir /* Vector3 */, water /* 0..1 */, particlesA, particlesB, particlesT, zoneA, zoneB, t }`

Starting palette (the builder may tune it; the tests only check structure, distinctness and blending):

| zone | sky top / horizon | fog (near–far) | ground near / far / path | particles | props (type perMeter offsets) |
|---|---|---|---|---|---|
| spring | #8ec9f0 / #dff1fb | #dff1fb 60–150 | #8fd16a / #6fb552 / #e8d9b0 | petals #f6b8cc | tree_round .06 8–60, bush .05 5–30, flower_patch .12 4–20, grass_tuft .2 3.6–25, rock .02 5–40, balloon_cluster .006 6–14 |
| summer | #6ec3f4 / #f3f6e8 | #eef4e6 60–160 | #f1dfae / #e7cf93 / #f3e6c4, water | none | palm .04 7–40, grass_tuft .08 3.6–18, rock .02 5–30, umbrella .01 8–14, beach_ball .01 4.5–12 |
| autumn | #a9cfe6 / #f6dcb8 | #f3dcc0 55–145 | #c9a046 / #a8843a / #d9c7a0 | leaves #e07b39 | tree_autumn .07 7–60, bush_autumn .05 5–30, pumpkin .03 4–14, hay_bale .01 6–20, grass_tuft .08 3.6–20, rock .02 5–30 |
| winter | #b9d3ea / #f2f6fb | #eef3f9 50–130 | #f4f7fb / #e3ebf3 / #d8dde6 | snow #ffffff | pine_snowy .08 7–60, rock_snowy .03 5–30, snowman .006 6–14, fence .01 4.5–6 |
| evening | #3d3b7a / #f4a37c | #e9a08a 50–140 | #5d8a55 / #4c7449 / #c9b9a0 | fireflies #ffe9a8 additive | house .03 10–35, lamp_post .03 4–6, tree_round .03 12–60, bench .01 4.5–7, fence .02 4.5–6, flower_patch .05 4–15 |

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/environment.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../../site/src/world/zones.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent, ZONE_IDS } from '../../site/src/content/normalize.js';
import shipped from '../../site/content.js';
import * as THREE from '../../site/src/three.js';

const L = buildLayout(normalizeContent(shipped).content);
const HEX = /^#[0-9a-f]{6}$/i;

test('every zone has a complete definition', () => {
  for (const id of ZONE_IDS) {
    const z = ZONES[id];
    for (const hex of [z.sky.top, z.sky.horizon, z.fog.color, z.sun.color, z.hemi.sky, z.hemi.ground, z.ground.near, z.ground.far, z.ground.path, z.particles.color]) assert.match(hex, HEX);
    assert.equal(z.sun.dir.length, 3);
    assert.equal(typeof z.water, 'boolean');
    assert.ok(z.props.length > 0);
    assert.ok(z.fog.far > z.fog.near);
  }
});

test('zones look distinct', () => {
  for (const a of ZONE_IDS) for (const b of ZONE_IDS) if (a < b) {
    const ca = new THREE.Color(ZONES[a].ground.near), cb = new THREE.Color(ZONES[b].ground.near);
    assert.ok(Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b) > 0.1, `${a} vs ${b}`);
  }
});

test('inside a zone the env equals that zone', () => {
  const e = envAt(L, 100);
  assert.equal(e.skyTop.getHexString(), ZONES.spring.sky.top.slice(1));
  assert.equal(e.zoneA, 'spring');
  assert.equal(e.t, 0);
  assert.equal(e.water, 0);
});

test('at a boundary the env is halfway', () => {
  const e = envAt(L, 210);
  const a = new THREE.Color(ZONES.spring.sky.top), b = new THREE.Color(ZONES.summer.sky.top);
  assert.ok(Math.abs(e.skyTop.r - (a.r + b.r) / 2) < 1e-6);
  assert.ok(Math.abs(e.fogNear - (ZONES.spring.fog.near + ZONES.summer.fog.near) / 2) < 1e-6);
  assert.ok(Math.abs(e.water - 0.5) < 1e-6);
});

test('reordered zones blend in config order', () => {
  const L2 = buildLayout(normalizeContent({ zones: ['autumn', 'spring', 'evening'], moments: [{ zone: 'autumn' }, { zone: 'spring' }] }).content);
  const e = envAt(L2, L2.zones[0].end);
  assert.equal(e.zoneA, 'autumn');
  assert.equal(e.zoneB, 'spring');
});

test('reuses the out object', () => {
  const out = envAt(L, 100);
  assert.equal(envAt(L, 300, out), out);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `zones.js` (palette above) and `environment.js`**

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: seasonal zone palettes and smooth environment blending"
```

---

### Task 7: Geometry toolkit, low-poly props, scatter

**Files:**
- Create: `site/src/util/geo.js`, `site/src/world/props.js`, `site/src/world/scatter.js`
- Test: `tests/unit/geo.test.js`, `tests/unit/props.test.js`, `tests/unit/scatter.test.js`

**Interfaces:**
- Consumes: Three via `site/src/three.js`; `createRng`, `rngRange` (Task 1); `TrackPath` (Task 3); `PropRule`, `ZONES` (Task 6)
- Produces:
  - `part(geometry, colorHex, { position?, rotation?, scale? } = {}): Part`
  - `mergeParts(parts: Part[]): THREE.BufferGeometry`: non-indexed; `position`, flat `normal`, linear `color` attributes; bounding box and sphere computed
  - `triangleCount(geometry): number`, `jitterColor(hex, rng, amount = 0.06): THREE.Color`
  - `PROP_TYPES` (21 types: `tree_round, tree_autumn, pine, pine_snowy, palm, bush, bush_autumn, rock, rock_snowy, flower_patch, grass_tuft, balloon_cluster, beach_ball, umbrella, pumpkin, hay_bale, snowman, house, lamp_post, bench, fence`), `PROP_VARIANTS = { tree_autumn: 3, house: 3, flower_patch: 2, balloon_cluster: 2 }` (others 1)
  - `createPropGeometry(type, variant = 0): { body: BufferGeometry, glow: BufferGeometry|null }`: origin at the ground centre, +Y up, metres. `glow` holds unlit bits (lamp bulbs, lit house windows); non-null for `lamp_post` and `house`.
  - `SCATTER = { CORRIDOR: 3.2, WATER_EDGE: 14 }`
  - `scatterZone({ path, zone: ZoneSeg, rules: PropRule[], seed, avoid: { distance, right, radius }[], water: boolean }): Placement[]`
  - `Placement = { type, variant, x, y: 0, z, rotY, scale, priority /* [0,1) */, d, offset }`

Scatter rules: for each rule and each side, `count = round(perMeter * (zone.end - zone.start))`. Sample `d` uniformly in `[zone.start - BLEND/2, zone.end + BLEND/2]`; keep a sample with probability = `smoothstep` taper to 0 over the half-blend outside the segment. Sample offset in `[minOffset, maxOffset]` with the side's sign; position = `path.frameAt(d, offset, 0)`. Reject a sample if it is within `CORRIDOR` of any path point within ±40 m of `d`, within an avoid spot's radius (spot position = `path.frameAt(distance, right, 0)`), or (water zones) has `offset < -WATER_EDGE`. Variant = `floor(rng * PROP_VARIANTS[type])`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/geo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { part, mergeParts, triangleCount } from '../../site/src/util/geo.js';

test('mergeParts merges positions, flat normals and colours', () => {
  const coneCount = new THREE.ConeGeometry(0.5, 1, 5).toNonIndexed().attributes.position.count;
  const g = mergeParts([
    part(new THREE.BoxGeometry(1, 1, 1), '#ff0000'),
    part(new THREE.ConeGeometry(0.5, 1, 5), '#00ff00', { position: [0, 2, 0] }),
  ]);
  assert.equal(g.index, null);
  assert.equal(g.attributes.position.count, 36 + coneCount);
  assert.ok(Math.abs(g.attributes.color.getX(0) - new THREE.Color('#ff0000').r) < 1e-6);
  assert.ok(Math.abs(g.attributes.color.getY(36) - new THREE.Color('#00ff00').g) < 1e-6);
  assert.ok(Math.abs(g.boundingBox.max.y - 2.5) < 1e-6);
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-4);
});

test('triangleCount', () => {
  assert.equal(triangleCount(new THREE.BoxGeometry().toNonIndexed()), 12);
  assert.equal(triangleCount(new THREE.BoxGeometry()), 12);
});
```

```js
// tests/unit/props.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROP_TYPES, PROP_VARIANTS, createPropGeometry } from '../../site/src/world/props.js';
import { triangleCount } from '../../site/src/util/geo.js';

const HEIGHT = {
  tree_round: [3, 7], tree_autumn: [3, 7], pine: [4, 9], pine_snowy: [4, 9], palm: [4, 8],
  bush: [0.5, 1.6], bush_autumn: [0.5, 1.6], rock: [0.3, 1.5], rock_snowy: [0.3, 1.5],
  flower_patch: [0.1, 0.6], grass_tuft: [0.15, 0.8], balloon_cluster: [2, 5], beach_ball: [0.3, 0.8],
  umbrella: [1.8, 3], pumpkin: [0.3, 0.9], hay_bale: [0.6, 1.4], snowman: [1.2, 2.2], house: [3, 7],
  lamp_post: [2.5, 4.5], bench: [0.6, 1.2], fence: [0.6, 1.4],
};

test('all 21 prop types are listed', () => assert.equal(PROP_TYPES.length, 21));

for (const type of PROP_TYPES) for (let v = 0; v < (PROP_VARIANTS[type] ?? 1); v++) {
  test(`${type}#${v} is a grounded, coloured, low-poly prop`, () => {
    const { body, glow } = createPropGeometry(type, v);
    assert.ok(body.attributes.color);
    body.computeBoundingBox();
    assert.ok(Math.abs(body.boundingBox.min.y) <= 0.05, 'sits on the ground');
    const h = body.boundingBox.max.y;
    assert.ok(h >= HEIGHT[type][0] && h <= HEIGHT[type][1], `height ${h}`);
    assert.ok(triangleCount(body) <= (type === 'house' ? 900 : 600));
    if (glow) assert.ok(glow.attributes.color);
  });
}

test('lamps and houses have glow parts', () => {
  assert.ok(createPropGeometry('lamp_post').glow);
  assert.ok(createPropGeometry('house').glow);
});
```

```js
// tests/unit/scatter.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scatterZone, SCATTER } from '../../site/src/world/scatter.js';
import { createTrackPath } from '../../site/src/world/trackPath.js';
import { buildLayout, LAYOUT } from '../../site/src/world/layout.js';
import { ZONES } from '../../site/src/world/zones.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import shipped from '../../site/content.js';

const L = buildLayout(normalizeContent(shipped).content);
const path = createTrackPath(L.total, 7, { straightRanges: [[0, 120], [L.finaleDistance - 90, L.total + 60]] });
const avoid = L.stops.map((s) => ({ distance: s.distance + 3.5, right: s.side === 'right' ? 3.4 : -3.4, radius: 5 }));
const scatter = (i) => scatterZone({ path, zone: L.zones[i], rules: ZONES[L.zones[i].id].props, seed: i + 1, avoid, water: ZONES[L.zones[i].id].water });

test('deterministic', () => assert.deepEqual(scatter(0), scatter(0)));

test('keeps the track corridor clear', () => {
  const samples = [];
  for (let d = -20; d <= L.total + 20; d += 1) samples.push(path.pointAt(d));
  for (const p of scatter(0)) {
    const min = Math.min(...samples.map((s) => Math.hypot(s.x - p.x, s.z - p.z)));
    assert.ok(min >= SCATTER.CORRIDOR - 0.05, `too close: ${min}`);
  }
});

test('keeps sign spots clear', () => {
  for (const p of scatter(0)) for (const a of avoid) {
    const s = path.frameAt(a.distance, a.right, 0);
    assert.ok(Math.hypot(s.x - p.x, s.z - p.z) >= a.radius);
  }
});

test('stays within the zone plus half the blend window', () => {
  const z = L.zones[1];
  for (const p of scatter(1)) assert.ok(p.d >= z.start - LAYOUT.BLEND / 2 && p.d <= z.end + LAYOUT.BLEND / 2);
});

test('density roughly matches the rules', () => {
  const z = L.zones[0];
  const expected = ZONES.spring.props.reduce((n, r) => n + 2 * Math.round(r.perMeter * (z.end - z.start)), 0);
  assert.ok(scatter(0).length >= expected * 0.6);
});

test('priorities are in [0,1)', () => {
  for (const p of scatter(2)) assert.ok(p.priority >= 0 && p.priority < 1);
});

test('the water side stays clear in water zones', () => {
  for (const p of scatter(1)) assert.ok(p.offset >= -SCATTER.WATER_EDGE);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `geo.js`, `props.js`, `scatter.js`**

Props are chunky and cute, built from `Box/Cone/Cylinder/Icosahedron/Dodecahedron/Sphere` with low segment counts, each part one flat colour, plus slight `jitterColor` per foliage clump (fixed seed per type and variant). Lamp bulbs and house windows go in `glow`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: low-poly prop library and deterministic scatter"
```

---

### Task 8: Rendering core: stage, quality tiers, sky, terrain, track, main loop

**Files:**
- Create: `site/src/perf/quality.js`, `site/src/render/stage.js`, `site/src/world/sky.js`, `site/src/world/terrain.js`, `site/src/world/trackMesh.js`, `site/src/app.js`
- Modify: `site/src/main.js`
- Test: `tests/unit/quality.test.js`, `tests/unit/terrain.test.js`, `tests/e2e/render.spec.js`

**Interfaces:**
- Consumes: Tasks 1–6 (`appState`, `parseDebugParams`, `buildLayout`, `createTrackPath`, `createRide`, `createLook`, `attachPointerControls`, `fovForAspect`, `envAt`)
- Produces:
  - `TIERS = { low: { pixelRatio: 1, density: 0.45, shadows: false, particles: 0.35 }, medium: { pixelRatio: 1.5, density: 0.75, shadows: false, particles: 0.7 }, high: { pixelRatio: 2, density: 1, shadows: true, particles: 1 } }`
  - `createQualityGovernor({ initial = 'medium', forced = null, warmup = 1.5, window = 2.0, slowMs = 24, fastMs = 13, maxChanges = 3 } = {}): { tier, sample(dtSeconds): TierName|null, settings() }`. It ignores `warmup`, then averages each `window`: slow → step down; fast → step up only if it has never stepped down; at most `maxChanges`; `forced` never changes.
  - `effectivePixelRatio(tierSettings, deviceRatio) = min(tier.pixelRatio, deviceRatio)`
  - `createStage(container, { antialias }): Stage | null`. Returns null when `canvas.getContext('webgl2')` fails. Otherwise it builds `WebGLRenderer({ canvas, context })`. `Stage = { renderer, scene, camera, rig, setPixelRatio(r), resize(), render(), info(): { drawCalls, triangles }, onContextLost(fn) }`. The camera is a child of `rig` at the local origin. The renderer uses sRGB output, `NoToneMapping`, `PCFShadowMap`, camera `near 0.1`, `far 400`. `onContextLost` calls `preventDefault` and then `fn`.
  - The rig sits at `path.frameAt(d, 0, EYE_HEIGHT)` (`EYE_HEIGHT` from `layout.js`), facing the tangent.
  - `createSky(): { mesh, update(env, cameraPosition) }`: gradient sphere r=350, `fog: false`, follows the camera
  - `TERRAIN = { FLAT: 6, HALF_WIDTH: 90, WATER_LEVEL: -0.35, ROW_STEP: 4 }`; `terrainHeight(d, offset, { water }): number` (pure); `createTerrain(path, layout, { seed }): { mesh, water: THREE.Mesh|null }`, a ribbon from `d = -80` to `total + 80`, offsets ±`HALF_WIDTH`, non-indexed flat facets, vertex colours from `envAt(...).groundNear/groundFar` by |offset| plus jitter. The water ribbon on the left side covers water zones and their blend window.
  - `createTrackMesh(path, layout): THREE.Group`: path strip 4.4 m wide (vertex colour = `env.path` by d), two rails at ±0.75 m (#9aa3ad), sleepers as one `InstancedMesh` every 0.9 m (#7a5236)
  - `startApp({ content, debug, assets = [] }): Promise<App | null>` (null when `createStage` returns null; Task 12 routes that to the 2D fallback); `App = { begin(), continueRide(), jumpTo(i), togglePause(), rideAgain() }`. Later tasks fill these in; this task implements `begin()` as `ride.start()`.
  - `appState` fields set every frame by the app: `distance, speed, stopIndex, nextStopIndex, reachedMax, paused, yaw, quality, drawCalls, triangles`; `mode` becomes `'3d'` once the first frame renders.

Scene: hemisphere light plus directional sun from `env`. The sun shadow (tier `high` only, 1024 map, ortho ±25) follows the rig. Fog = `THREE.Fog(env.fogColor, near, far)`. Shared materials: one `MeshLambertMaterial({ vertexColors: true })` for all solid geometry and one `MeshBasicMaterial({ vertexColors: true })` for glow. On a tier change: `stage.setPixelRatio(effectivePixelRatio(...))`, toggle `renderer.shadowMap.enabled` and set `needsUpdate = true` on the shared materials, and call registered density/particle callbacks (`app` keeps arrays `onDensity`, `onParticles`, used by Task 9). `?stats=1` shows `#stats` with `fps · calls · tris · tier`, updated twice a second. `?at=N` creates the ride at `startDistance: N` (reachedMax = index of last stop ≤ N) and freezes it paused. `?look=deg` sets the initial yaw. `?quality=` forces the tier. Temporary until Task 11: `main.js` calls `app.begin()` right after start unless `at` is set.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/quality.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor, TIERS, effectivePixelRatio } from '../../site/src/perf/quality.js';

const feed = (g, ms, seconds) => { let changed = null; for (let t = 0; t < seconds; t += ms / 1000) { const c = g.sample(ms / 1000); if (c) changed = c; } return changed; };

test('starts at medium', () => assert.equal(createQualityGovernor().tier, 'medium'));

test('a slow device steps down after warmup plus one window', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 40, 1.4), null);
  assert.equal(feed(g, 40, 2.2), 'low');
});

test('a fast device steps up once', () => {
  const g = createQualityGovernor();
  assert.equal(feed(g, 8, 4), 'high');
  assert.equal(feed(g, 8, 10), null);
  assert.equal(g.tier, 'high');
});

test('never steps back up after a step down', () => {
  const g = createQualityGovernor();
  feed(g, 40, 4);
  feed(g, 8, 10);
  assert.equal(g.tier, 'low');
});

test('a forced tier never changes', () => {
  const g = createQualityGovernor({ forced: 'high' });
  feed(g, 60, 10);
  assert.equal(g.tier, 'high');
});

test('effectivePixelRatio caps by the device', () => {
  assert.equal(effectivePixelRatio(TIERS.high, 3), 2);
  assert.equal(effectivePixelRatio(TIERS.medium, 1), 1);
});
```

```js
// tests/unit/terrain.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainHeight, TERRAIN } from '../../site/src/world/terrain.js';

test('flat track bed', () => {
  for (let o = -5.9; o <= 5.9; o += 0.5) assert.equal(terrainHeight(300, o, { water: 0 }), 0);
});

test('rises into hills away from the track', () => {
  assert.ok(terrainHeight(300, 60, { water: 0 }) > 1);
  assert.ok(terrainHeight(300, -60, { water: 0 }) > 1);
});

test('water zones dip below the water on the left only', () => {
  assert.ok(terrainHeight(300, -30, { water: 1 }) < TERRAIN.WATER_LEVEL);
  assert.ok(terrainHeight(300, 30, { water: 1 }) >= 0);
});

test('continuous', () => {
  for (let o = -90; o < 90; o += 0.1) assert.ok(Math.abs(terrainHeight(500, o, { water: 0.5 }) - terrainHeight(500, o + 0.1, { water: 0.5 })) < 0.5);
});
```

```js
// tests/e2e/render.spec.js
import { test, expect } from '@playwright/test';
import { collectConsoleErrors, appState } from './helpers.js';

test('3D mode renders and the train moves', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html?speed=10');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const d0 = (await appState(page)).distance;
  await page.waitForTimeout(2000);
  const s = await appState(page);
  expect(s.distance).toBeGreaterThan(d0 + 5);
  expect(s.drawCalls).toBeGreaterThan(0);
  expect(s.drawCalls).toBeLessThanOrEqual(100);
  expect(errors).toEqual([]);
});

test('stats overlay', async ({ page }) => {
  await page.goto('index.html?stats=1&at=50');
  await expect(page.locator('#stats')).toContainText('fps');
});

test('dragging looks around', async ({ page }) => {
  await page.goto('index.html?at=50&ui=0');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  const box = await page.locator('#scene canvas').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 250, box.y + 400, { steps: 5 });
  expect((await appState(page)).yaw).toBeGreaterThan(0.3);
  await page.mouse.up();
});

test('canvas fills the viewport and follows resize', async ({ page }) => {
  await page.goto('index.html?at=50');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await page.locator('#scene canvas').boundingBox()).width).toBe(844);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/render.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement `quality.js`, `stage.js`, `sky.js`, `terrain.js`, `trackMesh.js`, `app.js`; wire `main.js`**

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test tests/e2e/render.spec.js`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run: `npm run shot -- track-start "at=10&ui=0" && npm run shot -- track-curve "at=400&ui=0"`
Open both PNGs and confirm: the sky is a gradient; rails and sleepers lead into the distance and visibly curve in `track-curve`; hills rise on both sides; fog melts the horizon (no hard terrain edge or void); `track-curve` has the autumn ground colour.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: render core with sky, terrain, track and adaptive quality"
```

---

### Task 9: Zone dressing: props, stations, sky decor, ambient particles

**Files:**
- Create: `site/src/world/dressing.js`, `site/src/world/stations.js`, `site/src/world/skyDecor.js`, `site/src/world/particles.js`
- Modify: `site/src/app.js`
- Test: `tests/unit/particles.test.js`, `tests/e2e/budget.spec.js`

**Interfaces:**
- Consumes: `scatterZone`, `createPropGeometry` (Task 7); `ZONES`, `envAt` (Task 6); `app` density/particle callback arrays and shared materials (Task 8)
- Produces:
  - `createDressing({ path, layout, seed }): { group, setDensity(f), update(dt, time) }`. There is one `InstancedMesh` per (zone, type, variant) body, plus a glow `InstancedMesh` where present. Instances are sorted by `priority`, so `setDensity(f)` sets `mesh.count = ceil(total * f)`. Each mesh gets `computeBoundingSphere()`. Balloons bob in `update`. Avoid spots are the signs (`stop.distance + 3.5`, ±3.4 m, r 5), the start station (d 8, +4 m, r 12) and the finale station (`finaleDistance`, +5 m, r 16).
  - `createStation({ path, distance, kind: 'start'|'finale' }): THREE.Group`. The platform is on the right (offset 2.4–6.0, top y 0.6, length 16 m centred on `distance`; the start platform spans d 0–16), with canopy, posts and a name board drawn on a CanvasTexture in Cormorant Garamond: `Day 1` (start) / `Day 365` (finale). The finale adds a small station house (door at `frameAt(finaleDistance + 7.5, 7.0, 0.6)`) and string lights (instanced small glow spheres) between lamp posts. `STATION = { PLATFORM_TOP: 0.6, PLATFORM_NEAR: 2.4, PLATFORM_FAR: 6.0 }`.
  - `createSkyDecor(): { group, update(dt, cameraPosition) }`: 8 low-poly clouds and 2 hot-air balloons on a ring at radius 160–220 around the camera's xz, drifting slowly
  - `particleStyleAt(env): { style: ParticleStyle, opacity }` (pure): `t < 0.5` → style A at opacity `(1 - 2t) * A.density`; otherwise style B at `(2t - 1) * B.density`; kind `none` → opacity 0
  - `createAmbientParticles({ maxCount = 260 }): { points, setQuality(f), update(dt, env, cameraPosition) }`: one `THREE.Points` in a 40×18×40 box around the camera, recycled. Motion per kind: petals and leaves fall, sway and tumble (size flicker); snow falls about 1 m/s; fireflies drift and twinkle with additive blending.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/particles.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { particleStyleAt } from '../../site/src/world/particles.js';
import { ZONES } from '../../site/src/world/zones.js';

const env = (a, b, t) => ({ particlesA: ZONES[a].particles, particlesB: ZONES[b].particles, particlesT: t });

test('inside a zone uses its style at full density', () => {
  const r = particleStyleAt(env('winter', 'winter', 0));
  assert.equal(r.style.kind, 'snow');
  assert.equal(r.opacity, ZONES.winter.particles.density);
});

test('crossfades through zero between styles', () => {
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.25)).style.kind, 'petals');
  assert.ok(Math.abs(particleStyleAt(env('spring', 'autumn', 0.25)).opacity - 0.5 * ZONES.spring.particles.density) < 1e-9);
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.5)).opacity, 0);
  assert.equal(particleStyleAt(env('spring', 'autumn', 0.75)).style.kind, 'leaves');
});

test('kind none is invisible', () => {
  assert.equal(particleStyleAt(env('summer', 'summer', 0)).opacity, 0);
});
```

```js
// tests/e2e/budget.spec.js
import { test, expect } from '@playwright/test';
import { appState } from './helpers.js';

for (const at of [40, 150, 300, 480, 660, 820, 960]) {
  test(`performance budget at ${at} m`, async ({ page }) => {
    await page.goto(`index.html?at=${at}&quality=high&ui=0`);
    await expect.poll(async () => (await appState(page)).mode).toBe('3d');
    await page.waitForTimeout(500);
    const s = await appState(page);
    expect(s.drawCalls).toBeLessThanOrEqual(100);
    expect(s.triangles).toBeLessThanOrEqual(250_000);
  });
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/budget.spec.js`
Expected: unit FAIL; budget may pass on an empty world, so only the unit failure is required here.

- [ ] **Step 3: Implement `dressing.js`, `stations.js`, `skyDecor.js`, `particles.js` and wire them into `app.js`**

Particles and dressing register with `onParticles` / `onDensity`. Station boards draw text on a canvas, so `main.js` now awaits `document.fonts.load('600 48px "Cormorant Garamond"')` (giving up after 2 s) before `startApp`.

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test tests/e2e/budget.spec.js`
Expected: PASS. If a budget point fails, reduce the offending rule's `perMeter` or merge parts. Do not raise the budget.

- [ ] **Step 5: Visual check**

Run: `for z in "spring 120" "summer 300" "autumn 480" "winter 660" "evening 840" "blend 210" "start 4" "finale 940"; do set -- $z; npm run shot -- zone-$1 "at=$2&ui=0&quality=high"; done`
Open each PNG and confirm: each zone is unmistakable (spring flowers and balloons; summer sand, palms, sea on the left; autumn orange trees and pumpkins; winter snow and snowy pines with falling snow; evening dusk sky, houses and glowing lamps). `zone-blend` mixes both zones' colours and props with no seam. `zone-start` shows the `Day 1` platform on the right. `zone-finale` shows the `Day 365` platform, station house and string lights. Clouds and hot-air balloons are in the sky. Nothing stands on the rails.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: dress five seasonal zones with props, stations and particles"
```

---

### Task 10: Train cabin, photos, signs and couple figures

**Files:**
- Create: `site/src/train/cabin.js`, `site/src/photos/photos.js`, `site/src/world/signs.js`, `site/src/world/figures.js`
- Modify: `site/src/app.js`, `site/src/main.js` (load photos before `startApp`)
- Test: `tests/unit/cabin.test.js`, `tests/unit/photos.test.js`, `tests/unit/signs.test.js`, `tests/unit/figures.test.js`

**Interfaces:**
- Consumes: `stage.rig`, `stage.camera` (Task 8); `part`, `mergeParts`, `triangleCount` (Task 7); `Layout.stops`, `TrackPath.frameAt` (Task 3); `Content.characters` (Task 2)
- Produces:
  - `cabinAnchors(vfovDeg, aspect): { dashboard: { z, topY }, flowers: { x, y, z }, lantern: { x, y, z }, pillars: { x }, bunting: { y, z, halfWidth } }` (pure). It uses the visible half-width `halfW(z) = tan(vfov/2) * aspect * |z|`: flowers at `x = -0.75 * halfW`, lantern at `+0.78 * halfW`, pillars at `±1.02 * halfW` (`z = -1.4`); dashboard front `z = -0.9` with `topY = -0.62 * tan(vfov/2) * 0.9`, so it fills the same share of the screen in portrait and landscape.
  - `createCabin(): { group, fit(camera), update(dt, speed, time), setVisible(v) }`. The group is a child of `stage.rig`, so it stays still while she looks around. It has: wooden dashboard (#c98b52, trim #a86b3c, red lower panel #d8574a), two gold-rimmed gauges, a potted pink flower bunch, a lantern with a glow bulb, side pillars, a roof edge, and bunting across the top that sways. No textures. Bob amplitude 0.015 m scaled by speed.
  - `fitWithin(w, h, max): { width, height }` (never upscales; invalid dims → `{ width: max, height: max }`)
  - `placeholderPalette(index): { from, to, ink }` (≥ 5 palettes, cycles)
  - `loadPhotos(moments, { onProgress }): Promise<PhotoAsset[]>`; `PhotoAsset = { index, canvas /* ≤1024 */, width, height, aspect, src /* original URL or placeholder dataURL */, isPlaceholder }`. `photo: ''` → placeholder (portrait 4:5 gradient, `Photo N`, a small heart). Load error or 15 s timeout → placeholder plus `console.warn('[photos] Could not load "<path>" — showing a placeholder. Use JPG or PNG.')`.
  - `signDimensions(aspect): { photoW, photoH }`: `photoH = 1.6`, `photoW = clamp(aspect, 0.6, 1.8) * 1.6`
  - `coverUv(imageAspect, frameAspect): { repeat: [x, y], offset: [x, y] }`: centre "cover" crop
  - `signLookYaw(side): number`: `'left'` → `0.75`, `'right'` → `-0.75`
  - `createPhotoSign(asset, { date }): THREE.Group`: two wooden posts, a cream frame, the photo plane (`MeshBasicMaterial`, sRGB `CanvasTexture`, `toneMapped: false`, cover-cropped), a date placard drawn on canvas, and a small heart on top
  - `placeSign(sign, path, stop)`: at `stop.distance + 3.5`, lateral ±3.4 on `stop.side`, turned 35° toward the approaching train
  - `createFigure({ skin, hair, outfit, style: 'her'|'him' }): { group, parts: { hips, head, leftLeg, rightLeg, leftArm, rightArm, rightHand }, setPose(pose) }`, height 1.0–1.3 m, chunky. `her` has a dress and longer hair, `him` short hair.
  - `walkPose(phase, amount = 1): { leftLeg, rightLeg, leftArm, rightArm, bob }`, `IDLE_POSE`
  - `createCouple(characters): { group, update(time) }`: her and him side by side, holding hands, idle bob. Placed beside signs at odd stop indices, 1.4 m further from the track than the sign.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/cabin.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { cabinAnchors, createCabin } from '../../site/src/train/cabin.js';
import { triangleCount } from '../../site/src/util/geo.js';

for (const [fov, aspect] of [[80, 390 / 844], [50, 16 / 9], [78, 1]]) {
  test(`cabin decorations stay on screen at aspect ${aspect.toFixed(2)}`, () => {
    const a = cabinAnchors(fov, aspect);
    const halfW = (z) => Math.tan(THREE.MathUtils.degToRad(fov) / 2) * aspect * Math.abs(z);
    assert.ok(a.flowers.x < 0 && -a.flowers.x <= halfW(a.flowers.z) * 0.9 && -a.flowers.x >= halfW(a.flowers.z) * 0.5);
    assert.ok(a.lantern.x > 0 && a.lantern.x <= halfW(a.lantern.z) * 0.9 && a.lantern.x >= halfW(a.lantern.z) * 0.5);
    const bottom = -Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.abs(a.dashboard.z);
    assert.ok(a.dashboard.topY < 0 && a.dashboard.topY > bottom, 'dashboard top is on screen');
  });
}

test('cabin triangle budget', () => {
  const c = createCabin();
  let tris = 0;
  c.group.traverse((o) => { if (o.isMesh) tris += triangleCount(o.geometry) * (o.isInstancedMesh ? o.count : 1); });
  assert.ok(tris <= 6000, `${tris} triangles`);
});
```

```js
// tests/unit/photos.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, placeholderPalette } from '../../site/src/photos/photos.js';

test('fitWithin keeps aspect and never upscales', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1024), { width: 1024, height: 768 });
  assert.deepEqual(fitWithin(3024, 4032, 1024), { width: 768, height: 1024 });
  assert.deepEqual(fitWithin(800, 600, 1024), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(0, NaN, 1024), { width: 1024, height: 1024 });
});

test('placeholder palettes are deterministic and varied', () => {
  assert.deepEqual(placeholderPalette(3), placeholderPalette(3));
  assert.ok(new Set([0, 1, 2, 3, 4].map((i) => placeholderPalette(i).from)).size >= 5);
});
```

```js
// tests/unit/signs.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { signDimensions, coverUv, signLookYaw } from '../../site/src/world/signs.js';

test('sign size clamps extreme photos', () => {
  assert.deepEqual(signDimensions(1), { photoW: 1.6, photoH: 1.6 });
  assert.ok(Math.abs(signDimensions(4).photoW - 2.88) < 1e-9);
  assert.ok(Math.abs(signDimensions(0.3).photoW - 0.96) < 1e-9);
});

test('cover crop centres the photo', () => {
  const wide = coverUv(4, 1.8);
  assert.ok(Math.abs(wide.repeat[0] - 0.45) < 1e-9 && wide.repeat[1] === 1);
  assert.ok(Math.abs(wide.offset[0] - 0.275) < 1e-9 && wide.offset[1] === 0);
  const tall = coverUv(0.3, 0.6);
  assert.ok(tall.repeat[0] === 1 && Math.abs(tall.repeat[1] - 0.5) < 1e-9);
  assert.deepEqual(coverUv(1.5, 1.5), { repeat: [1, 1], offset: [0, 0] });
});

test('look toward the sign side', () => {
  assert.equal(signLookYaw('left'), 0.75);
  assert.equal(signLookYaw('right'), -0.75);
});
```

```js
// tests/unit/figures.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { createFigure, walkPose, createCouple } from '../../site/src/world/figures.js';
import { triangleCount } from '../../site/src/util/geo.js';

const look = { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' };

for (const style of ['her', 'him']) test(`${style} figure is chunky, small and cheap`, () => {
  const f = createFigure({ ...look, style });
  const box = new THREE.Box3().setFromObject(f.group);
  const h = box.max.y - box.min.y;
  assert.ok(h >= 1.0 && h <= 1.3, `height ${h}`);
  let tris = 0;
  f.group.traverse((o) => { if (o.isMesh) tris += triangleCount(o.geometry); });
  assert.ok(tris <= 1500);
  for (const k of ['hips', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'rightHand']) assert.ok(f.parts[k], k);
});

test('walk pose swings legs opposite and stays gentle', () => {
  for (const ph of [0, 0.7, Math.PI / 2, 2.5]) {
    const p = walkPose(ph);
    assert.ok(Math.abs(p.leftLeg + p.rightLeg) < 1e-9);
    assert.ok(Math.abs(p.leftLeg) <= 0.6 && Math.abs(p.leftArm) <= 0.6);
    assert.ok(p.bob >= 0);
  }
});

test('couple has two figures', () => {
  const c = createCouple({ her: look, you: { ...look, outfit: '#5b7fc4' } });
  let figures = 0;
  c.group.traverse((o) => { if (o.userData.figure) figures++; });
  assert.equal(figures, 2);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement `cabin.js`, `photos.js`, `signs.js`, `figures.js`**

Wire into `app.js`: the cabin is a child of the rig, `cabin.fit(camera)` runs on resize, a sign per stop, couples at odd stops. In `main.js`: `loadPhotos(content.moments, { onProgress })` then `startApp({ content, debug, assets })`. Figures set `group.userData.figure = true` on their root.

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test tests/e2e/render.spec.js tests/e2e/budget.spec.js`
Expected: PASS (budget still holds with cabin, signs and couples).

- [ ] **Step 5: Visual check**

Run: `npm run shot -- cabin-portrait "at=40&ui=0" && npm run shot -- cabin-landscape "at=40&ui=0" --size 844x390 && npm run shot -- sign-0 "at=85&look=-43&ui=0" && npm run shot -- sign-1 "at=155&look=43&ui=0"`
Confirm: the dashboard runs along the bottom, flowers sit bottom-left, the lantern bottom-right, bunting along the top, pillars at the edges, and the track stays visible through the middle in both orientations (the cabin covers no more than about 35% of the screen). The sign shows the `Photo 1` placeholder upright with a date placard and faces the viewer. `sign-1` shows the couple beside the sign. Nothing clips into terrain.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: cosy train cabin, photo signs and little couple figures"
```

---

### Task 11: Ride UI: loading, intro, stop cards, timeline, controls, progress

**Files:**
- Create: `site/src/ui/dom.js`, `site/src/ui/loading.js`, `site/src/ui/intro.js`, `site/src/ui/stopCard.js`, `site/src/ui/timeline.js`, `site/src/ui/controls.js`, `site/src/progress.js`
- Modify: `site/src/main.js` (remove the temporary auto-begin), `site/src/app.js`, `site/styles.css`
- Test: `tests/unit/timeline.test.js`, `tests/unit/progress.test.js`, `tests/e2e/ride.spec.js`

**Interfaces:**
- Consumes: `App`, `appState`, `Ride` events (Tasks 4, 8); `signLookYaw` (Task 10); `PhotoAsset` (Task 10)
- Produces:
  - `el(tag, attrs = {}, children = []): HTMLElement`: text children become text nodes (never `innerHTML`)
  - `fadeThrough(ms, midway: () => void): Promise<void>`: `#fade` fades in (soft blush colour), runs `midway`, fades out
  - `setLoadingProgress(fraction)`, `hideLoading()`
  - `showIntro(content, { onBegin })`, `hideIntro()`. Shows eyebrow, title (display font), a little squiggle divider, the note and the Begin button. The button disables itself on first tap.
  - `showStopCard(moment, asset, { total, onContinue })`, `hideStopCard()`. A bottom sheet `#stop-card`: date eyebrow, `.stop-title`, `<img>` (`asset.src`, `object-fit: contain`, max-height 38dvh), `.stop-caption` inside a scrollable `.stop-card-body`, footer `Moment i+1 of n` plus a `Continue` button that disables after the first tap.
  - `timelineItems(moments, { reachedMax, currentIndex }): { index, date, title, state: 'locked'|'reached'|'current', label }[]`. Label: locked → `Moment N (not reached yet)`; otherwise `${date} — ${title}`, or just `title` when the date is empty.
  - `renderTimeline(container, items, { onJump })`: one `<button>` per item, at least 44×44; locked → `aria-disabled="true"`, inert; `nav#timeline` scrolls horizontally and keeps the current dot in view
  - `initControls({ onPauseToggle, onMusicToggle }): { setPaused(bool), setMusic(state), setProgress(text), show(), hide() }`
  - `loadProgress(storage = globalThis.localStorage, { momentCount } = {}): { reachedMax }` and `saveProgress({ reachedMax }, storage = globalThis.localStorage)`, key `pictureTrain.progress.v1`, every access in try/catch, `reachedMax` clamped to `momentCount - 1`

App wiring: `main.js` passes `onProgress: (done, total) => setLoadingProgress(0.8 * done / total)` to `loadPhotos`, sets 0.9 before `startApp`, 1.0 after it, then `hideLoading()`. `?at` and `?finale` skip the intro. After loading → `phase 'intro'`, the train sits at the start, `showIntro`. Begin → `hideIntro`, `ride.start()`, controls and timeline show. On arrive → `look.setRest(signLookYaw(stop.side))`, `showStopCard`, timeline update, `saveProgress`, `phase 'stopped'`. Continue → `hideStopCard`, `ride.continue()`, `look.setRest(0)`. Timeline jump → ignored while a jump is in flight; otherwise `fadeThrough(350, () => ride.jumpTo(i))`. Progress pill: riding → `Next stop · ${n} of ${total}`; stopped → `${i+1} of ${total}`; final leg → `Next stop · Day 365`. `document.title = intro.title`. With `ui=0`, `#ui` gets `hidden`. Initial `reachedMax` comes from `loadProgress`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/timeline.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineItems } from '../../site/src/ui/timeline.js';

const moments = Array.from({ length: 4 }, (_, i) => ({ index: i, date: `D${i}`, title: `T${i}` }));

test('locks unreached moments and marks the current one', () => {
  const items = timelineItems(moments, { reachedMax: 1, currentIndex: 1 });
  assert.deepEqual(items.map((i) => i.state), ['reached', 'current', 'locked', 'locked']);
  assert.equal(items[2].label, 'Moment 3 (not reached yet)');
  assert.equal(items[0].label, 'D0 — T0');
});

test('no current while riding', () => {
  assert.deepEqual(timelineItems(moments, { reachedMax: 0, currentIndex: -1 }).map((i) => i.state), ['reached', 'locked', 'locked', 'locked']);
});

test('date-less label falls back to the title', () => {
  assert.equal(timelineItems([{ index: 0, date: '', title: 'T0' }], { reachedMax: 0, currentIndex: -1 })[0].label, 'T0');
});
```

```js
// tests/unit/progress.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress } from '../../site/src/progress.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('round-trips', () => {
  const s = mem();
  saveProgress({ reachedMax: 3 }, s);
  assert.deepEqual(loadProgress(s), { reachedMax: 3 });
});

test('defaults when empty, corrupt or throwing', () => {
  assert.deepEqual(loadProgress(mem()), { reachedMax: -1 });
  const bad = mem(); bad.setItem('pictureTrain.progress.v1', '{oops');
  assert.deepEqual(loadProgress(bad), { reachedMax: -1 });
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadProgress(throwing), { reachedMax: -1 });
  assert.doesNotThrow(() => saveProgress({ reachedMax: 1 }, throwing));
});

test('clamps to the number of moments', () => {
  const s = mem();
  saveProgress({ reachedMax: 5 }, s);
  assert.deepEqual(loadProgress(s, { momentCount: 2 }), { reachedMax: 1 });
});
```

```js
// tests/e2e/ride.spec.js
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/ride.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement the UI modules, `progress.js`, styling and app wiring**

Card style: cream `--cream` card, rounded `--radius`, soft shadow, title in Cormorant Garamond 600, UI in Nunito. Primary buttons use a rose gradient (`--rose` → `--rose-2`), white text, pill shape. Sheets slide up over 280 ms, respecting `prefers-reduced-motion`. The top bar sits under the safe-area inset; the bottom bar sits above it.

- [ ] **Step 4: Run tests**

Before running: in `tests/e2e/render.spec.js`, the first test (`3D mode renders and the train moves`) relied on Task 8's temporary auto-begin. Add `await page.getByRole('button', { name: 'Begin the ride' }).click();` right after its `goto`. The other earlier specs use `?at=` or don't need the ride, so they stay as they are.

Run: `npm test && npx playwright test`
Expected: PASS (whole e2e suite).

- [ ] **Step 5: Visual check**

Run: `npm run shot -- intro "" && npm run shot -- card "speed=25" --wait 9000`
(`shot.mjs` gains a `--click "Begin the ride"` option, pressed once after load; add it here and pass it for `card`.) Confirm the intro card is centred over the scene at the `Day 1` station, legible and charming. The stop card covers the bottom of the screen with the photo sign visible above it (the view auto-turned toward the sign), and the timeline dots sit at the bottom.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: intro, stop cards, timeline and ride controls"
```

---

### Task 12: Resilience: 2D fallback, context loss, photo and screen edge cases

**Files:**
- Create: `site/src/ui/fallback.js`, `site/src/ui/toast.js`
- Modify: `site/src/main.js`, `site/src/app.js`, `site/styles.css`
- Test: `tests/e2e/resilience.spec.js`

**Interfaces:**
- Consumes: `createStage` returning null, `stage.onContextLost` (Task 8); `loadPhotos` (Task 10); UI modules (Task 11)
- Produces:
  - `showFallback(content, assets)`: fills `#fallback` with a scrollable story: intro title and note, one `.fallback-moment` per moment (img, date, title, caption), then the wish, message and signoff. Sets `appState.phase = 'fallback'`, `mode = 'fallback'`. Used when `debug.fallback` or `createStage` returns null. `main.js` order: normalize → `loadPhotos` → fonts → if `debug.fallback` show fallback, else `startApp`, which resolves to `null` when `createStage` returns null, and then main shows the fallback. Both paths share the same assets.
  - `showToast(text, { action?: { label, onClick } })`: `#toast`, `role="status"`
  - Context lost → `showToast('The ride hiccuped.', { action: { label: 'Restart', onClick: () => location.reload() } })`

- [ ] **Step 1: Write the failing tests**

```js
// tests/e2e/resilience.spec.js
import { test, expect } from '@playwright/test';
import { useFixture, appState, collectConsoleErrors } from './helpers.js';

test.beforeEach(async ({ page }) => { await useFixture(page); });

const pngDataUrl = (page, w, h) => page.evaluate(([w, h]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#c66'; g.fillRect(0, 0, w, h);
  return c.toDataURL('image/png');
}, [w, h]);

test('no WebGL2 shows the 2D fallback story', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : orig.call(this, type, ...rest); };
  });
  await page.goto('index.html');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('.fallback-moment')).toHaveCount(10);
  await expect(page.locator('#fallback')).toContainText('Happy 1 year, Maya');
  expect((await appState(page)).mode).toBe('fallback');
});

test('?fallback=1 forces the 2D story', async ({ page }) => {
  await page.goto('index.html?fallback=1');
  await expect(page.locator('.fallback-moment')).toHaveCount(10);
});

test('context loss offers a restart', async ({ page }) => {
  await page.goto('index.html?at=50');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await page.evaluate(() => document.querySelector('#scene canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect(page.locator('#toast')).toContainText('Restart');
});

test('a broken photo becomes a placeholder with a helpful warning', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  const { default: base } = await import('../fixtures/content.fixture.js');
  await useFixture(page, { moments: base.moments.map((m, i) => (i === 0 ? { ...m, photo: 'photos/broken.jpg' } : m)) });
  await page.route('**/photos/broken.jpg', (r) => r.fulfill({ contentType: 'image/jpeg', body: 'not an image' }));
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card img')).toHaveAttribute('src', /^data:image/);
  expect(warnings.some((w) => w.includes('photos/broken.jpg'))).toBe(true);
});

for (const [name, w, h] of [['panorama', 1600, 400], ['tall screenshot', 400, 880]]) {
  test(`${name} photo is shown whole and undistorted`, async ({ page }) => {
    await page.goto('about:blank');
    const body = Buffer.from((await pngDataUrl(page, w, h)).split(',')[1], 'base64');
    const { default: base } = await import('../fixtures/content.fixture.js');
    await useFixture(page, { moments: base.moments.map((m, i) => (i === 0 ? { ...m, photo: 'photos/test.png' } : m)) });
    await page.route('**/photos/test.png', (r) => r.fulfill({ contentType: 'image/png', body }));
    await page.goto('index.html?speed=25');
    await page.getByRole('button', { name: 'Begin the ride' }).click();
    const img = page.locator('#stop-card img');
    await expect(img).toBeVisible();
    const ratio = await img.evaluate((i) => { const r = i.getBoundingClientRect(); const s = Math.min(r.width / i.naturalWidth, r.height / i.naturalHeight); return (i.naturalWidth * s) / (i.naturalHeight * s); });
    expect(Math.abs(ratio - w / h)).toBeLessThan(0.05);
    const card = await page.locator('#stop-card').boundingBox();
    const box = await img.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(card.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
  });
}

test('small screen, long caption and rotation keep Continue reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const { default: base } = await import('../fixtures/content.fixture.js');
  await useFixture(page, { moments: base.moments.map((m, i) => (i === 0 ? { ...m, caption: 'So happy. '.repeat(200) } : m)) });
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  const cont = page.getByRole('button', { name: 'Continue' });
  await expect(cont).toBeInViewport();
  expect(await page.locator('.stop-card-body').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(cont).toBeInViewport();
  await expect.poll(async () => (await page.locator('#scene canvas').boundingBox()).width).toBe(667);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
});

test('timeline taps during a jump fade are ignored', async ({ page }) => {
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  const dots = page.locator('#timeline button');
  await dots.nth(0).click();
  await dots.nth(1).click({ force: true });
  await expect.poll(async () => (await appState(page)).stopIndex).toBe(0);
  await expect(page.locator('#stop-card')).toContainText('First coffee');
});

test('many moments: the timeline scrolls and keeps the current dot visible', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const { default: base } = await import('../fixtures/content.fixture.js');
  const moments = Array.from({ length: 14 }, (_, i) => ({ ...base.moments[i % 10], title: `M${i + 1}`, zone: base.moments[Math.floor((i / 14) * 10)].zone }));
  await useFixture(page, { moments });
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#timeline button')).toHaveCount(14);
  expect(await page.locator('#timeline').evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  for (let i = 1; i <= 13; i++) {
    await expect(page.locator('#stop-card .stop-title')).toHaveText(`M${i}`);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.locator('#stop-card .stop-title')).toHaveText('M14');
  await expect(page.locator('#timeline button[aria-current="step"]')).toBeInViewport();
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx playwright test tests/e2e/resilience.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement `fallback.js`, `toast.js`, the context-loss wiring, the timeline `aria-current="step"` and scroll-into-view, the jump guard in `app.js`, and layout CSS**

Layout CSS: the card sets `max-height: calc(100dvh - top bar - bottom bar - safe areas - 16px)`; `.stop-card-body` has `overflow-y: auto` so the footer stays put. In landscape the card is a centred sheet up to 560 px wide.

- [ ] **Step 4: Run tests**

Run: `npx playwright test`
Expected: PASS.

- [ ] **Step 5: Visual check**

Run: `npm run shot -- fallback "fallback=1" && npm run shot -- se-card "speed=25" --size 375x667 --click "Begin the ride" --wait 9000`
Confirm the fallback reads like a warm little scrapbook (not an error page). On the SE-sized card, the photo, title, caption start and Continue are all visible.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 2D fallback, context-loss recovery and edge-case hardening"
```

---

### Task 13: Music

**Files:**
- Create: `site/src/audio/compose.js`, `site/src/audio/music.js`
- Modify: `site/src/app.js`, `site/src/ui/controls.js`
- Test: `tests/unit/compose.test.js`, `tests/e2e/music.spec.js`

**Interfaces:**
- Consumes: `createRng` (Task 1); `initControls().setMusic` (Task 11); `content.music` (Task 2)
- Produces:
  - `MUSIC = { BPM: 68, BARS: 16, PROGRESSION_ROOTS: [53, 50, 46, 48] /* F3 Dm3 B♭2 C3, I–vi–IV–V */, SCALE_PCS: [5, 7, 9, 10, 0, 2, 4] }`
  - `composeLoop({ seed = 11 } = {}): { lengthSec, notes: { t, midi, dur, vel, voice: 'bell'|'pad'|'bass' }[] }`. Pads: the bar's triad, sustained. Bass: the root (octave 2) as half notes. Bell melody on an 8th-note grid with rests, 70% chord tones / 30% scale tones, MIDI 65–89.
  - `midiToFreq(m) = 440 * 2 ** ((m - 69) / 12)`
  - `createMusic({ src }): { state: 'off'|'playing'|'blocked', source: 'generated'|'file', start(): Promise<void>, toggle(), setHidden(bool) }`. `start()` must be called inside the Begin tap handler: it sets `navigator.audioSession.type = 'playback'` when available, then creates and resumes the `AudioContext` (or calls `Audio.play()` for files) within the gesture.

Generated sound: master gain 0.16 → `DynamicsCompressor` → destination, fading in over 3 s. Bell: sine at f plus sine at 2.002f (gain 0.25), attack 5 ms, exponential decay over 1.6 s, through a 3.2 kHz lowpass and a feedback delay (0.38 s, feedback 0.28, wet 0.22). Pad: three detuned triangles (±6 cents) through a 900 Hz lowpass, attack 1.2 s, release 1.5 s, gain 0.05. Bass: sine, gain 0.08. Scheduler: `setInterval` 50 ms with 0.25 s lookahead, looping. File mode: `new Audio(src)`, `loop = true`, `volume = 0.55`. If it errors → `console.warn('[music] Could not play "<src>" — using the built-in tune.')` and switch to generated. If resume/play is rejected → state `'blocked'`, and the music toggle retries. `toggle` fades over 0.4 s. `setHidden(true)` suspends the context or pauses the element; `false` restores the previous state. App mirrors `music`, `musicSource`, `audioSuspended` into `appState` and calls `setHidden(document.hidden)` on `visibilitychange`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/compose.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeLoop, MUSIC, midiToFreq } from '../../site/src/audio/compose.js';

const loop = composeLoop();
const barLen = (4 * 60) / MUSIC.BPM;

test('loop length', () => assert.ok(Math.abs(loop.lengthSec - MUSIC.BARS * barLen) < 1e-9));

test('melody stays in F major and range', () => {
  for (const n of loop.notes.filter((n) => n.voice === 'bell')) {
    assert.ok(MUSIC.SCALE_PCS.includes(n.midi % 12));
    assert.ok(n.midi >= 65 && n.midi <= 89);
  }
});

test('pads follow the progression every bar', () => {
  for (let b = 0; b < MUSIC.BARS; b++) {
    const pads = loop.notes.filter((n) => n.voice === 'pad' && Math.abs(n.t - b * barLen) < 1e-6);
    assert.ok(pads.some((n) => n.midi % 12 === MUSIC.PROGRESSION_ROOTS[b % 4] % 12), `bar ${b}`);
  }
});

test('sorted, inside the loop, sane velocities', () => {
  for (let i = 1; i < loop.notes.length; i++) assert.ok(loop.notes[i].t >= loop.notes[i - 1].t);
  for (const n of loop.notes) assert.ok(n.t >= 0 && n.t < loop.lengthSec && n.vel > 0 && n.vel <= 1 && n.dur > 0);
});

test('gentle density', () => {
  for (let b = 0; b < MUSIC.BARS; b++) {
    const k = loop.notes.filter((n) => n.voice === 'bell' && n.t >= b * barLen && n.t < (b + 1) * barLen).length;
    assert.ok(k >= 2 && k <= 8, `bar ${b} has ${k} bell notes`);
  }
});

test('deterministic per seed', () => {
  assert.deepEqual(composeLoop({ seed: 3 }), composeLoop({ seed: 3 }));
  assert.notDeepEqual(composeLoop({ seed: 3 }).notes, composeLoop({ seed: 4 }).notes);
});

test('midiToFreq', () => assert.equal(midiToFreq(69), 440));
```

```js
// tests/e2e/music.spec.js
import { test, expect } from '@playwright/test';
import { useFixture, appState } from './helpers.js';

const wav = () => {
  const n = 8000, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return b;
};
const begin = async (page) => { await page.goto('index.html'); await page.getByRole('button', { name: 'Begin the ride' }).click(); };

test('generated music plays after Begin and toggles', async ({ page }) => {
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  expect((await appState(page)).musicSource).toBe('generated');
  await page.locator('#music-toggle').click();
  await expect.poll(async () => (await appState(page)).music).toBe('off');
  await page.locator('#music-toggle').click();
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
});

test('a missing song falls back to the built-in tune', async ({ page }) => {
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await useFixture(page, { music: 'music/missing.mp3' });
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('generated');
  await expect.poll(() => warnings.some((w) => w.includes('music/missing.mp3'))).toBe(true);
});

test('a song file is used when present', async ({ page }) => {
  await useFixture(page, { music: 'music/tone.wav' });
  await page.route('**/music/tone.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: wav() }));
  await begin(page);
  await expect.poll(async () => (await appState(page)).musicSource).toBe('file');
});

test('backgrounding suspends and restores audio', async ({ page }) => {
  await useFixture(page);
  await begin(page);
  await expect.poll(async () => (await appState(page)).music).toBe('playing');
  const setHidden = (hidden) => page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(true);
  await setHidden(false);
  await expect.poll(async () => (await appState(page)).audioSuspended).toBe(false);
  expect((await appState(page)).music).toBe('playing');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/music.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement `compose.js` and `music.js`; wire them into Begin, the controls and visibility**

`app.begin()` must call `music.start()` synchronously, before any `await`, so iOS still counts it as part of the tap. Decision rule: if headless WebKit keeps reporting `'blocked'` even after the click, skip `music.spec.js` on WebKit with a one-line reason and note it in the README "Testing" line. The real-phone check in Task 15 covers iOS audio.

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test`
Expected: PASS. (`collectConsoleErrors` in other specs is unaffected because fixture music is `''`.)

- [ ] **Step 5: Listen check**

Run: `npm run serve`, open `http://localhost:8080` in a desktop browser and tap Begin. Listen for 60 s. It should be quiet, warm and loop without a click or gap at the loop seam. Nothing harsh or loud.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: soft generated music-box soundtrack with song override"
```

---

### Task 14: Finale

**Files:**
- Create: `site/src/finale/timeline.js`, `site/src/finale/finale.js`, `site/src/train/exterior.js`, `site/src/ui/finaleCard.js`
- Modify: `site/src/app.js`
- Test: `tests/unit/finaleTimeline.test.js`, `tests/unit/finale.test.js`, `tests/e2e/finale.spec.js`

**Interfaces:**
- Consumes: `createFigure`, `walkPose` (Task 10); `STATION` (Task 9); `createCabin` (Task 10); `EYE_HEIGHT`, `stage`, shared materials (Task 8); `fadeThrough` and controls (Task 11); `Ride` `finale` event and `jumpTo` (Task 4)
- Produces:
  - `createTimeline(tracks, events = []): { duration, sample(t, out = {}), events(prevT, t): string[] }`. `Track = { key, keys: { t, v: number|number[], ease?: 'linear'|'in'|'out'|'inOut' }[] }`. It holds the first/last value outside the range, interpolates per component using the destination key's ease, and `events` returns names with `prevT < e.t <= t`.
  - `FINALE_TIMES = { cameraDone: 2.6, herStepStart: 2.6, herStepEnd: 4.2, himWalkStart: 4.0, himWalkEnd: 7.0, handoffStart: 7.0, handoffEnd: 8.0, hearts: 8.0, fireworks: 8.5, card: 9.5, end: 12 }`
  - `finaleTracks(path, finaleDistance): Track[]` (pure). Positions use `frameAt(fd + along, right, up)`:
    - camera: seat `(0, 0, EYE_HEIGHT)` → at `cameraDone` `(-4.5, 9.5, 3.4)`, looking at `(0.8, 3.4, 1.1)` → push-in to `(-2.5, 7.8, 2.9)` by `card`
    - her: `(0.4, 1.0, 0.9)` → hop mid `(0.4, 2.2, 1.2)` → end `(0.4, 3.4, 0.6)`
    - him: `(7.5, 7.0, 0.6)` → end `(1.2, 3.6, 0.6)`
    - bouquet: until `handoffStart` it uses the same keys and eases as `him`, offset by his hand `(-0.3 along, -0.25 right, +0.65 up)`; then it moves to her hands `(0.6, 3.45, 1.15)` by `handoffEnd`
  - `createTrainExterior(): THREE.Group`: a cute locomotive ahead (local −Z 1.5..6) and an open carriage around the seat (local z −1.2..2.5), in the cabin's colours, with the door on the right. Origin = `frameAt(d, 0, 0)`, aligned to the tangent.
  - `createFinale({ stage, path, layout, content, cabin, exterior }): { active, time, begin(), update(dt): string[], skipTo(t), freeze(bool), reset() }`. `begin` hides the cabin, shows the exterior, reparents the camera to the scene, shows the figures and sets time 0. The app calls it inside `fadeThrough(400, () => finale.begin())` so the swap is hidden; `finale.js` itself never touches the DOM. `update` drives tracks and walk poses, hearts (10 small extruded hearts rising and fading), fireworks (additive `Points` bursts above the town, 4 bursts (2 on `low`), staggered 0.8 s, looping) and confetti (`InstancedMesh` of 120 quads (50 on `low`)). It returns fired events: `'hearts'`, `'fireworks'`, `'card'`. `reset` restores the cabin view, puts the camera back on the rig, hides the exterior and figures, and stops the effects.
  - `showFinaleCard(content, { onRideAgain })`, `hideFinaleCard()`: eyebrow, wish (display font, large), message (`white-space: pre-line`), signoff, `Ride again` button
  - App: ride `finale` → `phase 'finale'`, hide the stop card, controls and timeline, `view 'finale'`, `fadeThrough(400, () => finale.begin())`. Event `card` → `showFinaleCard`, show the timeline (all reached), `phase 'done'`. `rideAgain()` → `fadeThrough(500, () => { finale.reset(); ride.restart(); ride.start(); hideFinaleCard(); })`. Timeline jump from `done` → `finale.reset()` first. `?finale=1` → ride starts at `finaleDistance` with `reachedMax = last`, skips the intro. `?ft=s` → `finale.skipTo(s)` and `freeze(true)`. `appState.finaleTime` mirrors `finale.time`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/finaleTimeline.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline } from '../../site/src/finale/timeline.js';

const tl = createTimeline(
  [{ key: 'x', keys: [{ t: 1, v: 0 }, { t: 3, v: 10 }] }, { key: 'p', keys: [{ t: 0, v: [0, 0] }, { t: 2, v: [2, 4], ease: 'inOut' }] }],
  [{ name: 'a', t: 1 }, { name: 'b', t: 2.5 }],
);

test('holds outside the key range', () => {
  assert.equal(tl.sample(0).x, 0);
  assert.equal(tl.sample(9).x, 10);
});

test('linear interpolation', () => assert.equal(tl.sample(2).x, 5));

test('arrays and easing', () => {
  assert.deepEqual(tl.sample(1).p, [1, 2]);
  assert.ok(tl.sample(0.5).p[0] < 0.5);
});

test('duration is the last key or event', () => assert.equal(tl.duration, 3));

test('events fire once across contiguous intervals', () => {
  const fired = [];
  let prev = 0;
  for (let t = 0.1; t <= 3.01; t += 0.1) { fired.push(...tl.events(prev, t)); prev = t; }
  assert.deepEqual(fired, ['a', 'b']);
});
```

```js
// tests/unit/finale.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { FINALE_TIMES, finaleTracks } from '../../site/src/finale/finale.js';
import { createTimeline } from '../../site/src/finale/timeline.js';
import { createTrackPath } from '../../site/src/world/trackPath.js';
import { STATION } from '../../site/src/world/stations.js';
import * as THREE from '../../site/src/three.js';

const T = FINALE_TIMES;
const path = createTrackPath(1030, 7, { straightRanges: [[0, 120], [870, 1100]] });
const tl = createTimeline(finaleTracks(path, 960));
const v = (a) => new THREE.Vector3(...a);

test('choreography order', () => {
  assert.ok(T.cameraDone <= T.herStepStart && T.herStepEnd <= T.himWalkEnd && T.himWalkEnd <= T.handoffStart);
  assert.ok(T.handoffStart < T.handoffEnd && T.handoffEnd <= T.card && T.card < T.end);
});

test('she ends up standing on the platform', () => {
  const her = v(tl.sample(T.end).her);
  const right = her.clone().sub(path.pointAt(960.4)).dot(path.sideAt(960.4));
  assert.ok(right >= STATION.PLATFORM_NEAR && right <= STATION.PLATFORM_FAR);
  assert.ok(Math.abs(her.y - STATION.PLATFORM_TOP) < 0.05);
});

test('he walks up close to her', () => {
  assert.ok(v(tl.sample(T.end).him).distanceTo(v(tl.sample(T.end).her)) <= 1.0);
  assert.ok(v(tl.sample(0).him).distanceTo(v(tl.sample(0).her)) > 5);
});

test('the bouquet travels from him to her', () => {
  const s0 = tl.sample(T.handoffStart), s1 = tl.sample(T.handoffEnd);
  assert.ok(v(s1.bouquet).distanceTo(v(s1.her)) < 1.0);
  assert.ok(v(s0.bouquet).distanceTo(v(s0.him)) < 1.0);
});

test('camera starts at the seat and pulls out to see both', () => {
  assert.ok(v(tl.sample(0).camera).distanceTo(path.frameAt(960, 0, 2.05)) < 1e-6);
  const cam = v(tl.sample(T.card).camera);
  assert.ok(cam.distanceTo(v(tl.sample(T.card).her)) > 5);
});
```

```js
// tests/e2e/finale.spec.js
import { test, expect } from '@playwright/test';
import { useFixture, appState, waitForPhase } from './helpers.js';

test.beforeEach(async ({ page }) => { await useFixture(page); });

test('finale ends on the message card', async ({ page }) => {
  await page.goto('index.html?finale=1');
  await waitForPhase(page, 'done');
  const card = page.locator('#finale-card');
  await expect(card).toContainText('Happy 1 year, Maya');
  await expect(card).toContainText('Thank you for the best year of my life.');
  await expect(card).toContainText('— Sam');
  expect((await appState(page)).view).toBe('finale');
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

test('full ride end to end', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'one full ride is enough');
  const titles = ['First coffee', 'Rainy walk', 'Beach day', 'Sunset pier', 'Pumpkin patch', 'Movie night', 'First snow', 'Ice skating', 'City lights', 'Our dinner'];
  await page.goto('index.html?speed=50');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  for (const t of titles) {
    await expect(page.locator('#stop-card')).toContainText(t);
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await waitForPhase(page, 'done');
  await expect(page.locator('#finale-card')).toContainText('Happy 1 year, Maya');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test && npx playwright test tests/e2e/finale.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement `timeline.js`, `finale.js`, `exterior.js`, `finaleCard.js`; wire `app.js`**

- [ ] **Step 4: Run tests**

Run: `npm test && npx playwright test`
Expected: PASS.

- [ ] **Step 5: Visual check of the choreography**

Run: `for s in 1.5 3.4 5.5 7.6 9.6; do npm run shot -- finale-$s "finale=1&ft=$s&ui=0"; done && npm run shot -- finale-card "finale=1&ft=10"`
Confirm, in order: (1.5) the camera is mid-way out of the seat and the train exterior is visible at the `Day 365` platform; (3.4) the girl is hopping down from the carriage door; (5.5) the boy is walking from the station house holding a bouquet; (7.6) the bouquet is passing between them and they face each other; (9.6) hearts are rising and fireworks are over the town. `finale-card` shows the message card legibly over the scene with the timeline below.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: finale at the Day 365 station with flowers and the 1-year message"
```

---

### Task 15: Ship it: README, deploy, link preview, final verification

**Files:**
- Create: `README.md`, `.github/workflows/pages.yml`, `scripts/og-image.mjs`, `site/favicon.svg`, `site/og-image.jpg` (generated)
- Modify: `site/index.html`
- Test: `tests/e2e/ship.spec.js`

**Interfaces:**
- Consumes: everything above
- Produces: deployable `site/`, docs for the author

`index.html` head adds: `<meta name="description" content="A little ride through our first year">`, `og:title` (`For [Her name]`, which the README tells the author to edit), `og:description` (same text as description), `og:image` (`og-image.jpg`), `og:type` website, `twitter:card` `summary_large_image`, `theme-color` `#f4a37c`, `<link rel="icon" href="favicon.svg">` (a simple rose heart).

`scripts/og-image.mjs`: serves the repo root like `shot.mjs`, opens `/site/index.html` in Chromium at 1200×630 (DPR 1), waits for the intro card, and writes `site/og-image.jpg` (JPEG quality 85).

`.github/workflows/pages.yml`: on push to `main` and `workflow_dispatch`; permissions `pages: write`, `id-token: write`; steps `actions/checkout@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` with `path: site`, `actions/deploy-pages@v4`.

README sections (plain, friendly, for the author):
1. **What this is**: one paragraph.
2. **Make it yours**: edit `site/content.js` (every field explained there), then edit `<title>` and `og:title` in `site/index.html`.
3. **Add photos**: put them in `site/photos/` and set `photo: 'photos/01.jpg'`. Shrink and convert iPhone HEIC first with `mkdir -p site/photos && sips -s format jpeg -s formatOptions 82 -Z 1600 ~/Desktop/our-photos/* --out site/photos/`. If a photo shows as a placeholder, the console says which file.
4. **Add your song**: put an mp3 at `site/music/our-song.mp3` and set `music: 'music/our-song.mp3'`.
5. **Preview**: `npm run serve` → `http://localhost:8080`. Double-clicking `index.html` will not work (browsers block local photos in 3D).
6. **Try it on a phone first**: `python3 -m http.server 8080 --directory site --bind 0.0.0.0`, find the Mac's IP with `ipconfig getifaddr en0`, open `http://<ip>:8080` on a phone on the same Wi-Fi. Checklist: smooth ride, readable cards, music after Begin, finale plays, and try it from inside the app you'll send it with.
7. **Share it**: Option A, Netlify Drop (drag the `site` folder onto app.netlify.com/drop), which keeps the source private. Option B, GitHub Pages via the included workflow (Settings → Pages → Source: GitHub Actions); on a free plan the repo must be public, so the photos are public in the repo. Either way, anyone with the link can open it; search engines are asked not to index it (`noindex`).
8. **Link preview**: after editing, run `npm run og-image`. After deploying, change `og:image` to the full URL (e.g. `https://you.github.io/repo/og-image.jpg`) so iMessage and WhatsApp show the picture.
9. **For tinkering**: the debug URL params, `npm test`, `npm run test:e2e`, and the WebKit note from Task 1 if it applied.

- [ ] **Step 1: Write the failing test**

```js
// tests/e2e/ship.spec.js
import { test, expect } from '@playwright/test';
import { useFixture } from './helpers.js';

test('page metadata is private and preview-ready', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'og-image.jpg');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', 'favicon.svg');
});

test('no request leaves the site origin', async ({ page }) => {
  const foreign = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1:4173'].includes(u.host) && !u.protocol.startsWith('data')) foreign.push(r.url()); });
  await useFixture(page);
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await expect(page.locator('#stop-card')).toBeVisible();
  expect(foreign).toEqual([]);
});

test('og image and favicon exist', async ({ request }) => {
  expect((await request.get('og-image.jpg')).status()).toBe(200);
  expect((await request.get('favicon.svg')).status()).toBe(200);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/e2e/ship.spec.js`
Expected: FAIL.

- [ ] **Step 3: Implement the head tags, `favicon.svg`, `og-image.mjs`, workflow and README; run `npm run og-image`**

- [ ] **Step 4: Full verification**

Run: `npm test && npx playwright test`
Expected: every unit test and every e2e spec PASS on both projects (except documented WebKit skips).
Open `artifacts/shots/` from Tasks 8–14 again, regenerated with `npm run shot` for one point per zone, and confirm nothing regressed visually.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: README, Pages deploy, link preview and final checks"
```

- [ ] **Step 6: Hand-off note to the author**

Tell the author what still needs them: real photos, text and song in `content.js`; a test on a real phone (README §6); choosing Netlify or GitHub Pages. Nothing has been pushed or deployed.
