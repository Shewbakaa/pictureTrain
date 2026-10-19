// Boot sequence. It grows task by task: content, then the 3D app (or the 2D fallback), then the intro.
// For now it only loads the app-state contract (which sets window.__app) and stays in phase 'loading'.
import './state.js';
