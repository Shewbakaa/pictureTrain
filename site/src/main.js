// Boot sequence. It loads the app-state contract (which sets window.__app), reads content.js and reports anything
// wrong with it in the console, loads the fonts the station boards and placeholder photos are drawn in, loads the
// photos (filling the loading bar as they arrive), starts the 3D ride, and fades the loading screen away once the
// first frame is on screen, showing the intro card (app.js) that she starts the ride from.
//
// Where the 3D ride cannot run (no WebGL2, or a first frame that fails), or ?fallback=1 asks for it, the same
// content and photos are told as the 2D story instead (ui/fallback.js). A content.js the browser cannot even run
// (a typo) leaves the loading screen up with a message saying so, rather than loading forever.
import { appState } from './state.js';
import { normalizeContent } from './content/normalize.js';
import { parseDebugParams } from './debug.js';
import { startApp } from './app.js';
import { loadPhotos } from './photos/photos.js';
import { showFallback } from './ui/fallback.js';
import { hideLoading, setLoadingProgress, showLoadingMessage } from './ui/loading.js';

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

/** The ride cannot start at all: the loading screen stays up and says so instead of loading forever. */
function cannotStart(message) {
  appState.phase = 'error';
  showLoadingMessage(message);
}

/**
 * Starts the 3D ride. Resolves to null, having said why in the console, when it cannot run in this browser: no
 * WebGL2, or the world or its first frame failing.
 */
async function startRide(content, debug, assets) {
  try {
    const app = await startApp({ content, debug, assets });
    if (!app) console.warn('[app] This browser cannot draw WebGL2, so the ride is told in 2D instead.');
    return app;
  } catch (error) {
    console.error('[app] The 3D ride could not start, so it is told in 2D instead.', error);
    return null;
  }
}

async function boot() {
  // Imported here rather than at the top, so a typo in the author's file is caught and explained.
  let rawContent;
  try {
    ({ default: rawContent } = await import('../content.js'));
  } catch (error) {
    const typo = error instanceof SyntaxError || error instanceof ReferenceError;
    // Safari says which line it got confused on; Chrome only names the word.
    const where = typo && Number.isInteger(error.line) && error.line > 0 ? ` (line ${error.line})` : '';
    console.error(typo
      ? `[content.js] has a typo, so the ride cannot start. Look just before what the browser names here${where}; it is often a missing comma, quote or bracket:`
      : '[content.js] could not be loaded, so the ride cannot start:', error);
    cannotStart(`content.js ${typo ? 'has a typo' : 'could not be loaded'} — open the browser console for details`);
    return;
  }

  const { content, warnings, errors } = normalizeContent(rawContent);
  for (const warning of warnings) console.warn(`[content.js] ${warning}`);
  for (const error of errors) console.error(`[content.js] ${error}`);
  const debug = parseDebugParams(location.search);
  document.title = content.intro.title;

  await loadCanvasFonts();
  // The photos fill most of the bar; building the world and drawing its first frame take the rest.
  const assets = await loadPhotos(content.moments, {
    onProgress: (done, total) => setLoadingProgress((0.8 * done) / total),
  });
  setLoadingProgress(0.9);
  const app = debug.fallback ? null : await startRide(content, debug, assets);
  if (!app) showFallback(content, assets);
  setLoadingProgress(1);
  hideLoading();
}

boot().catch((error) => {
  console.error('[app] The ride could not start.', error);
  cannotStart('Something went wrong — open the browser console for details');
});
