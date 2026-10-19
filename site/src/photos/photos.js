// The photos of the moments, loaded before the ride starts.
//
// Each moment's photo is drawn onto a canvas no bigger than MAX_SIZE on its long side, which is what the photo
// signs (world/signs.js) turn into textures: a 12-megapixel phone photo would cost a phone far too much memory
// as a texture. A moment without a photo, or whose photo cannot be shown (a mistyped name, an iPhone HEIC file
// the browser cannot decode, a load that never finishes), gets a soft placeholder instead: a pastel gradient
// with "Photo N" and a little heart, so the ride still looks finished. A photo that fails is named in a console
// warning, so the author can see which file to fix.
//
// Photos load a few at a time (CONCURRENCY), so each has the connection to itself rather than a share of it, and
// each gets TIMEOUT_MS from when its own request starts. However many hang, the loading as a whole gives up after
// TOTAL_MS, so the loading screen never waits longer than that.
//
// `fitWithin` and `placeholderPalette` are pure. `loadPhotos` needs a browser, and only touches the DOM once it
// is called, so the Node unit tests can import this module.

import { drawHeart, fillDisplayText } from '../util/canvasText.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {{
 *   index: number, canvas: HTMLCanvasElement, width: number, height: number, aspect: number,
 *   src: string, isPlaceholder: boolean,
 * }} PhotoAsset
 *   The photo of moment `index`, drawn on `canvas` (`width` x `height` pixels, never more than MAX_SIZE on its
 *   long side). `aspect` is the photo's own width / height. `src` is the photo's URL as content.js gives it, or
 *   for a placeholder a data: URL of its picture, so a page can show it in an <img> either way. In the rare
 *   browser that will not give a 2D canvas, `canvas` is null (the sign shows plain paper) and a placeholder's
 *   `src` is ''.
 */

export const PHOTOS = Object.freeze({
  MAX_SIZE: 1024,          // the longest side of a photo's canvas (px)
  CONCURRENCY: 3,          // photos loading at once
  TIMEOUT_MS: 15000,       // a photo still loading this long after its request started is given up on
  TOTAL_MS: 45000,         // and any photo not loaded this long after the loading started
  PLACEHOLDER_WIDTH: 800,  // the placeholders are portrait, 4:5
  PLACEHOLDER_HEIGHT: 1000,
});

/** The placeholders' colours: a gradient from `from` to `to`, and `ink` for the writing. Soft and varied. */
const PALETTES = Object.freeze([
  Object.freeze({ from: '#f9c6d3', to: '#fde3c8', ink: '#a3506a' }), // blush to peach
  Object.freeze({ from: '#d9cbf5', to: '#c5e3fb', ink: '#5b5094' }), // lavender to sky
  Object.freeze({ from: '#c3ecd8', to: '#fbf0c4', ink: '#3c7a61' }), // mint to butter
  Object.freeze({ from: '#ffd5b8', to: '#f7b7c0', ink: '#a04f42' }), // apricot to rose
  Object.freeze({ from: '#bde2f6', to: '#e6d0f4', ink: '#486a95' }), // powder blue to lilac
  Object.freeze({ from: '#fff0b9', to: '#f9c7dc', ink: '#9a5a48' }), // lemon to pink
]);

/**
 * The size of a `w` x `h` picture scaled down to fit `max` on its long side, keeping its shape. Never scales up,
 * and never goes below a pixel. A size that is not a pair of positive finite numbers gives a `max` square.
 * @returns {{ width: number, height: number }}
 */
export function fitWithin(w, h, max) {
  if (!(w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h))) return { width: max, height: max };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The placeholder colours for moment `index` (0-based). They cycle, so neighbouring moments always differ.
 * @param {number} index
 * @returns {{ from: string, to: string, ink: string }}  '#rrggbb'
 */
export function placeholderPalette(index) {
  const n = PALETTES.length;
  const i = Number.isFinite(index) ? ((Math.floor(index) % n) + n) % n : 0;
  return PALETTES[i];
}

/** @typedef {CanvasImageSource & { naturalWidth: number, naturalHeight: number }} LoadedImage  a decoded photo */

/**
 * Loads every moment's photo, CONCURRENCY at a time, in the moments' order.
 * @param {import('../content/normalize.js').Moment[]} moments
 * @param {{ onProgress?: (done: number, total: number) => void,
 *           loadImage?: (src: string, signal: AbortSignal) => Promise<LoadedImage> }} [options]
 *   `onProgress` hears each moment as its photo finishes (or falls back to its placeholder). `loadImage` fetches
 *   and decodes one photo, giving up when `signal` aborts; the default loads it into an <img> (tests pass their own).
 * @returns {Promise<PhotoAsset[]>}  in the moments' order; never rejects for a photo that fails
 */
export async function loadPhotos(moments, { onProgress, loadImage = loadImageElement } = {}) {
  const total = moments.length;
  const assets = new Array(total);
  const loading = new Set(); // the AbortControllers of the requests in flight
  let expired = false;
  const cap = setTimeout(() => {
    expired = true;
    for (const request of loading) request.abort();
  }, PHOTOS.TOTAL_MS);

  /** One moment's asset: its photo if it loads in time, its placeholder otherwise. */
  async function assetFor(moment) {
    if (!moment.photo) return placeholderAsset(moment.index);
    if (!expired) {
      const request = new AbortController();
      const timer = setTimeout(() => request.abort(), PHOTOS.TIMEOUT_MS);
      loading.add(request);
      try {
        const gaveUp = new Promise((_, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('gave up')), { once: true });
        });
        const image = await Promise.race([new Promise((resolve) => resolve(loadImage(moment.photo, request.signal))), gaveUp]);
        return photoAsset(moment.index, image, moment.photo);
      } catch {
        // Falls through to the placeholder.
      } finally {
        clearTimeout(timer);
        loading.delete(request);
      }
    }
    console.warn(`[photos] Could not load "${moment.photo}" — showing a placeholder. Use JPG or PNG.`);
    return placeholderAsset(moment.index);
  }

  let next = 0;
  let done = 0;
  async function worker() {
    while (next < total) {
      const i = next++;
      assets[i] = await assetFor(moments[i]);
      done += 1;
      if (onProgress) onProgress(done, total);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PHOTOS.CONCURRENCY, total) }, worker));
  } finally {
    clearTimeout(cap);
  }
  return assets;
}

/**
 * Loads `src` into an <img> and decodes it off the main thread where the browser can. Rejects when it fails,
 * decodes to nothing, or `signal` aborts (which also stops the download).
 */
function loadImageElement(src, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    const stop = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    function onAbort() {
      stop();
      image.src = ''; // stops a download that is still going
      reject(new Error('gave up'));
    }
    signal.addEventListener('abort', onAbort);
    image.onload = () => {
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
        stop();
        reject(new Error('no picture'));
        return;
      }
      // Decoded now, drawing it onto its canvas will not stall a frame. If decode() fails, drawImage decodes it.
      const decoded = typeof image.decode === 'function' ? image.decode().catch(() => {}) : Promise.resolve();
      decoded.then(() => {
        stop();
        resolve(image);
      });
    };
    image.onerror = () => {
      stop();
      reject(new Error('failed to load'));
    };
    image.src = src;
  });
}

/** A canvas of the given size and its 2D context, or null where there is none (Node, or a browser out of memory). */
function newCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  return g ? { canvas, g } : null;
}

/** A loaded photo, drawn at most MAX_SIZE on its long side. Browsers turn phone photos upright as they draw them. */
function photoAsset(index, image, src) {
  const { naturalWidth: w, naturalHeight: h } = image;
  const { width, height } = fitWithin(w, h, PHOTOS.MAX_SIZE);
  const made = newCanvas(width, height);
  if (made) {
    made.g.imageSmoothingEnabled = true;
    made.g.imageSmoothingQuality = 'high';
    made.g.drawImage(image, 0, 0, width, height);
  }
  return { index, canvas: made ? made.canvas : null, width, height, aspect: w / h, src, isPlaceholder: false };
}

/** The soft placeholder of moment `index`: a portrait pastel gradient with "Photo N" and a small heart. */
function placeholderAsset(index) {
  const { PLACEHOLDER_WIDTH: w, PLACEHOLDER_HEIGHT: h } = PHOTOS;
  const plain = { index, canvas: null, width: w, height: h, aspect: w / h, src: '', isPlaceholder: true };
  const made = newCanvas(w, h);
  if (!made) return plain;
  try {
    drawPlaceholder(made.g, w, h, index);
    return { ...plain, canvas: made.canvas, src: made.canvas.toDataURL('image/jpeg', 0.92) };
  } catch {
    return plain;
  }
}

/** Paints placeholder `index` onto `g`, `w` x `h`. */
function drawPlaceholder(g, w, h, index) {
  const { from, to, ink } = placeholderPalette(index);

  const wash = g.createLinearGradient(0, 0, w * 0.6, h);
  wash.addColorStop(0, from);
  wash.addColorStop(1, to);
  g.fillStyle = wash;
  g.fillRect(0, 0, w, h);

  // Soft light from the top left, and a few blurry dots of light, the same for the same moment every time.
  const light = g.createRadialGradient(w * 0.28, h * 0.2, 0, w * 0.28, h * 0.2, w * 0.9);
  light.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
  light.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = light;
  g.fillRect(0, 0, w, h);
  const rng = createRng(index * 7919 + 101);
  for (let i = 0; i < 9; i++) {
    const x = rngRange(rng, 0.05, 0.95) * w;
    const y = rngRange(rng, 0.05, 0.95) * h;
    const r = rngRange(rng, 0.04, 0.13) * w;
    const dot = g.createRadialGradient(x, y, 0, x, y, r);
    dot.addColorStop(0, `rgba(255, 255, 255, ${rngRange(rng, 0.18, 0.4).toFixed(2)})`);
    dot.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = dot;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // A thin rule inset from the edge, like a mount.
  g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  g.lineWidth = 5;
  g.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12);

  // "Photo N" in the display font, as the station boards are written (main.js loads it before the photos).
  g.fillStyle = ink;
  fillDisplayText(g, `Photo ${index + 1}`, w / 2, h * 0.47, Math.round(w * 0.15));
  drawHeart(g, w / 2, h * 0.58, w * 0.03, ink);
}
