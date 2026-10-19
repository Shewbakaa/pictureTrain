// Boot sequence. It loads the app-state contract (which sets window.__app), reads content.js and reports anything
// wrong with it in the console, loads the fonts the station boards and placeholder photos are drawn in, loads the
// photos (filling the loading bar as they arrive), starts the 3D ride, and fades the loading screen away once the
// first frame is on screen, showing the intro card (app.js) that she starts the ride from.
import './state.js';
import rawContent from '../content.js';
import { normalizeContent } from './content/normalize.js';
import { parseDebugParams } from './debug.js';
import { startApp } from './app.js';
import { loadPhotos } from './photos/photos.js';
import { hideLoading, setLoadingProgress } from './ui/loading.js';

const { content, warnings, errors } = normalizeContent(rawContent);
for (const warning of warnings) console.warn(`[content.js] ${warning}`);
for (const error of errors) console.error(`[content.js] ${error}`);

const debug = parseDebugParams(location.search);
document.title = content.intro.title;

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
  // The photos fill most of the bar; building the world and drawing its first frame take the rest.
  const assets = await loadPhotos(content.moments, {
    onProgress: (done, total) => setLoadingProgress((0.8 * done) / total),
  });
  setLoadingProgress(0.9);
  const app = await startApp({ content, debug, assets });
  if (!app) {
    // Task 12 shows the 2D story here instead.
    console.warn('[app] This browser cannot draw WebGL2, so the 3D ride cannot start.');
    return;
  }
  setLoadingProgress(1);
  hideLoading();
}

boot().catch((error) => console.error('[app] The ride could not start.', error));
