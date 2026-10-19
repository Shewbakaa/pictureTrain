// Boot sequence. It grows task by task: content, then the 3D app (or the 2D fallback), then the intro.
// For now it loads the app-state contract (which sets window.__app), reads content.js and reports
// anything wrong with it in the console, and stays in phase 'loading'.
import './state.js';
import rawContent from '../content.js';
import { normalizeContent } from './content/normalize.js';

const { warnings, errors } = normalizeContent(rawContent);
for (const warning of warnings) console.warn(`[content.js] ${warning}`);
for (const error of errors) console.error(`[content.js] ${error}`);
