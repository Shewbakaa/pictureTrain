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
  // Continue sits clear of the bottom bar, not just somewhere on screen.
  const clearOfBottomBar = async () => {
    const button = await cont.boundingBox();
    const bar = await page.locator('#bottombar').boundingBox();
    return button.y + button.height <= bar.y;
  };
  await expect(cont).toBeInViewport();
  expect(await clearOfBottomBar()).toBe(true);
  expect(await page.locator('.stop-card-body').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(cont).toBeInViewport();
  await expect.poll(clearOfBottomBar).toBe(true);
  await expect.poll(async () => (await page.locator('#scene canvas').boundingBox()).width).toBe(667);
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
});

test('timeline taps during a jump fade are ignored', async ({ page }) => {
  await page.goto('index.html?speed=25');
  await page.getByRole('button', { name: 'Begin the ride' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Rainy walk');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('#stop-card')).toContainText('Beach day');
  const dots = page.locator('#timeline button');
  await dots.nth(0).click();
  // A second jump while the blush covers the screen, to a dot that is reached and not the current one. Fired on
  // the button itself (as a keyboard would), since a pointer tap would only land on the cover (R32).
  await page.evaluate(() => document.querySelectorAll('#timeline button')[1].click());
  await expect(page.locator('#fade')).toBeHidden(); // every fade has finished
  expect((await appState(page)).stopIndex).toBe(0);
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

// --- Beyond the brief: the 2D story's contents, R11 (a typo in content.js), R25 (a first frame that throws) ---

test('the 2D story tells every moment in order and ends with the wish, message and signoff', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto('index.html?fallback=1');
  const moments = page.locator('.fallback-moment');
  await expect(moments).toHaveCount(10);
  await expect(page.locator('#fallback h1')).toHaveText('For Maya');
  await expect(page.locator('#fallback')).toContainText('A little ride through our first year.');
  await expect(moments.nth(0)).toContainText('Oct 2025');
  await expect(moments.nth(0)).toContainText('First coffee');
  await expect(moments.nth(0)).toContainText('We stayed until the café closed.');
  await expect(moments.nth(9)).toContainText('Our dinner');
  // Every photo is whole: its own shape, inside its card.
  for (const img of await page.locator('.fallback-moment img').all()) {
    await expect(img).toHaveJSProperty('complete', true);
    const shape = await img.evaluate((i) => {
      const r = i.getBoundingClientRect();
      return { drawn: r.width / r.height, own: i.naturalWidth / i.naturalHeight };
    });
    expect(Math.abs(shape.drawn - shape.own)).toBeLessThan(0.05);
  }
  const ending = page.locator('.fallback-finale');
  await expect(ending).toContainText('Happy 1 year, Maya');
  await expect(ending).toContainText('Thank you for the best year of my life.');
  await expect(ending).toContainText('— Sam');
  // It scrolls inside itself; the page never does.
  expect(await page.locator('#fallback').evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
  await page.locator('.fallback-finale').scrollIntoViewIfNeeded();
  await expect(page.locator('.fallback-finale')).toBeInViewport();
  expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  const state = await appState(page);
  expect([state.phase, state.mode]).toEqual(['fallback', 'fallback']);
  await expect(page.locator('#loading')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the 2D story shows a pastel block, never a broken image, for a placeholder without a picture', async ({ page }) => {
  // A browser that will not give a 2D canvas leaves every placeholder with src ''.
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === '2d' ? null : orig.call(this, type, ...rest); };
  });
  await page.goto('index.html?fallback=1');
  await expect(page.locator('.fallback-moment')).toHaveCount(10);
  await expect(page.locator('.fallback-moment .stop-photo-blank')).toHaveCount(10);
  expect(await page.locator('#fallback img').count()).toBe(0);
});

test('Restart on the context-loss toast reloads the page', async ({ page }) => {
  await page.goto('index.html?at=50');
  await expect.poll(async () => (await appState(page)).mode).toBe('3d');
  await page.evaluate(() => document.querySelector('#scene canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  const toast = page.locator('#toast');
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toContainText('The ride hiccuped.');
  await page.evaluate(() => { window.__beforeRestart = true; });
  await toast.getByRole('button', { name: 'Restart' }).click();
  await expect.poll(() => page.evaluate(() => window.__beforeRestart)).toBeUndefined();
  await page.waitForFunction(() => window.__app?.state.mode === '3d');
  await expect(page.locator('#toast')).toBeHidden();
});

test('a typo in content.js shows a friendly message instead of loading forever', async ({ page, browserName }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/site/content.js', (r) => r.fulfill({
    contentType: 'text/javascript',
    body: 'export default {\n  herName: "Maya"\n  yourName: "Sam",\n};\n', // the comma after "Maya" is missing
  }));
  await page.goto('index.html');
  await expect(page.locator('#loading')).toContainText('content.js has a typo — open the browser console for details');
  await expect(page.locator('#loading .loading-bar')).toBeHidden();
  expect(errors.some((e) => e.startsWith('[content.js]'))).toBe(true);
  expect((await appState(page)).phase).toBe('error');
  // Safari's error says where it got confused (the line after the missing comma); Chrome's only names the word.
  const typo = errors.find((e) => e.startsWith('[content.js] has a typo'));
  if (browserName === 'webkit') expect(typo).toContain('names here (line 3)');
  else expect(typo).not.toContain('(line');
});

test('a first frame that throws falls back to the 2D story', async ({ page }) => {
  const errors = collectConsoleErrors(page, { ignore: [/^\[app\] The 3D ride could not start/] });
  await page.addInitScript(() => {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      WebGL2RenderingContext.prototype[name] = () => { throw new Error('no drawing today'); };
    }
    // Notes when the ride's GL context is lost, after any listener the stage added has heard it.
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      const context = orig.call(this, type, ...rest);
      if (type === 'webgl2' && context) this.addEventListener('webglcontextlost', () => setTimeout(() => { window.__contextLost = true; }));
      return context;
    };
  });
  await page.goto('index.html');
  await expect(page.locator('.fallback-moment')).toHaveCount(10);
  await expect(page.locator('#loading')).toBeHidden();
  expect((await appState(page)).mode).toBe('fallback');
  // The 3D attempt is cleared away rather than left running behind the story: the canvas is gone, its GPU context
  // given up, and losing it says nothing over the story.
  expect(await page.locator('#scene canvas').count()).toBe(0);
  await page.waitForFunction(() => window.__contextLost === true);
  await expect(page.locator('#toast')).toBeHidden();
  expect(errors).toEqual([]);
});
