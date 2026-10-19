// Boot sequence. It grows task by task: content, then the 3D app (or the 2D fallback), then the intro.
// For now it loads the app-state contract (which sets window.__app), reads content.js and reports anything
// wrong with it in the console, loads the fonts the station boards and placeholder photos are drawn in, loads
// the photos, starts the 3D ride, and swaps the loading screen for it once the first frame is on screen.
import './state.js';
import rawContent from '../content.js';
import { normalizeContent } from './content/normalize.js';
import { parseDebugParams } from './debug.js';
import { startApp } from './app.js';
import { loadPhotos } from './photos/photos.js';

const { content, warnings, errors } = normalizeContent(rawContent);
for (const warning of warnings) console.warn(`[content.js] ${warning}`);
for (const error of errors) console.error(`[content.js] ${error}`);

const debug = parseDebugParams(location.search);

/** How long (ms) to wait for the canvas fonts before drawing the boards and placeholders in fallback fonts instead. */
const FONT_WAIT_MS = 2000;

/**
 * The station boards, the signs' date placards and the placeholder photos are drawn on canvases, which can only
 * use a font the page has already loaded, so their fonts are loaded first: Cormorant Garamond for the words and
 * Nunito for the digits (util/canvasText.js). A slow or failed load gives up after FONT_WAIT_MS.
 */
async function loadCanvasFonts() {
  if (!document.fonts || typeof document.fonts.load !== 'function') return;
  let timer;
  const giveUp = new Promise((resolve) => { timer = setTimeout(resolve, FONT_WAIT_MS); });
  try {
    await Promise.race([
      Promise.all([document.fonts.load('600 48px "Cormorant Garamond"'), document.fonts.load('700 48px Nunito')]),
      giveUp,
    ]);
  } catch {
    // The canvases fall back to Georgia and Arial, or whatever serif and sans-serif there are.
  } finally {
    clearTimeout(timer);
  }
}

async function boot() {
  await loadCanvasFonts();
  const assets = await loadPhotos(content.moments);
  const app = await startApp({ content, debug, assets });
  if (!app) {
    // Task 12 shows the 2D story here instead.
    console.warn('[app] This browser cannot draw WebGL2, so the 3D ride cannot start.');
    return;
  }
  document.getElementById('loading').hidden = true;
  // Temporary until the intro card (Task 11): ride straight away, unless ?at= froze the train somewhere.
  if (debug.at === null) app.begin();
}

boot().catch((error) => console.error('[app] The ride could not start.', error));
