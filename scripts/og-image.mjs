// Makes the picture that chat apps show next to the link (the "link preview"): site/og-image.jpg, 1200x630.
//
//   npm run og-image
//
// Run it after you have filled in site/content.js, so the picture shows her name and your note. It serves the
// repo root on http://127.0.0.1:4175, opens /site/index.html in a 1200x630 Chromium (device pixel ratio 1),
// waits for the 3D ride to be up with the intro card on top of it, and saves what it sees as a JPEG
// (quality 85). The first time on a new computer, run `npx playwright install chromium` once.
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { root, withPage } from './lib/serve.mjs';

const PORT = 4175;
const WIDTH = 1200;
const HEIGHT = 630;
const INTRO_TIMEOUT_MS = 30_000;
/** After the intro card is up, a moment for the loading screen to finish fading and the card to settle (ms). */
const SETTLE_MS = 1500;
const outFile = join(root, 'site', 'og-image.jpg');

try {
  await withPage({ port: PORT, viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 }, async (page) => {
    try {
      await page.locator('#intro').waitFor({ state: 'visible', timeout: INTRO_TIMEOUT_MS });
      await page.locator('#loading').waitFor({ state: 'hidden', timeout: INTRO_TIMEOUT_MS });
    } catch {
      throw new Error(`The intro card did not appear within ${INTRO_TIMEOUT_MS / 1000} s, so there is nothing to photograph. Open the site (npm run serve) and check the browser console.`);
    }
    if ((await page.evaluate(() => window.__app.state.mode)) !== '3d') {
      throw new Error('The ride is showing its 2D fallback in this browser, not the 3D scene, so the picture would look wrong. Try again.');
    }
    await page.waitForTimeout(SETTLE_MS);

    await mkdir(dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile, type: 'jpeg', quality: 85 });
    console.log(`wrote ${relative(root, outFile)}`);
  });
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
