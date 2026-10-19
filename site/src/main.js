// Boot sequence. It grows task by task: content, then the 3D app (or the 2D fallback), then the intro.
// For now it loads the app-state contract (which sets window.__app), reads content.js and reports anything
// wrong with it in the console, starts the 3D ride, and swaps the loading screen for it once the first frame
// is on screen.
import './state.js';
import rawContent from '../content.js';
import { normalizeContent } from './content/normalize.js';
import { parseDebugParams } from './debug.js';
import { startApp } from './app.js';

const { content, warnings, errors } = normalizeContent(rawContent);
for (const warning of warnings) console.warn(`[content.js] ${warning}`);
for (const error of errors) console.error(`[content.js] ${error}`);

const debug = parseDebugParams(location.search);

async function boot() {
  const app = await startApp({ content, debug });
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
