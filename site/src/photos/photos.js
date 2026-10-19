// The photos of the moments, loaded before the ride starts.
//
// Each moment's photo is drawn onto a canvas no bigger than MAX_SIZE on its long side, which is what the photo
// signs (world/signs.js) turn into textures: a 12-megapixel phone photo would cost a phone far too much memory
// as a texture. A moment without a photo, or whose photo cannot be shown (a mistyped name, an iPhone HEIC file
// the browser cannot decode, a load that never finishes), gets a soft placeholder instead: a pastel gradient
// with "Photo N" and a little heart, so the ride still looks finished. A photo that fails is named in a console
// warning, so the author can see which file to fix.
//
// `fitWithin` and `placeholderPalette` are pure. `loadPhotos` needs a browser, and only touches the DOM once it
// is called, so the Node unit tests can import this module.

import { fillDisplayText } from '../util/canvasText.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {{
 *   index: number, canvas: HTMLCanvasElement, width: number, height: number, aspect: number,
 *   src: string, isPlaceholder: boolean,
 * }} PhotoAsset
 *   The photo of moment `index`, drawn on `canvas` (`width` x `height` pixels, never more than MAX_SIZE on its
 *   long side). `aspect` is the photo's own width / height. `src` is the photo's URL as content.js gives it, or
 *   for a placeholder a data: URL of its picture, so a page can show it in an <img> either way.
 */

export const PHOTOS = Object.freeze({
  MAX_SIZE: 1024,          // the longest side of a photo's canvas (px)
  TIMEOUT_MS: 15000,       // a photo still loading after this long is given up on
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

/**
 * Loads every moment's photo, all at once.
 * @param {import('../content/normalize.js').Moment[]} moments
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 *   `onProgress` hears each photo as it finishes (or falls back to its placeholder).
 * @returns {Promise<PhotoAsset[]>}  in the moments' order; a photo that fails never rejects it
 */
export function loadPhotos(moments, { onProgress } = {}) {
  const total = moments.length;
  let done = 0;
  return Promise.all(moments.map(async (moment) => {
    const asset = await loadMomentPhoto(moment);
    done += 1;
    if (onProgress) onProgress(done, total);
    return asset;
  }));
}

/** The moment's photo, or its placeholder when it has none or it cannot be shown. */
async function loadMomentPhoto(moment) {
  if (!moment.photo) return placeholderAsset(moment.index);
  try {
    const image = await loadImage(moment.photo, PHOTOS.TIMEOUT_MS);
    return photoAsset(moment.index, image, moment.photo);
  } catch {
    console.warn(`[photos] Could not load "${moment.photo}" — showing a placeholder. Use JPG or PNG.`);
    return placeholderAsset(moment.index);
  }
}

/** Resolves with the decoded image, or rejects when it fails, decodes to nothing or takes longer than `timeoutMs`. */
function loadImage(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    let timer = 0;
    const settle = (error) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (error) {
        image.src = ''; // stops a download that is still going
        reject(error);
      } else {
        resolve(image);
      }
    };
    timer = setTimeout(() => settle(new Error('timed out')), timeoutMs);
    image.onload = () => settle(image.naturalWidth > 0 && image.naturalHeight > 0 ? null : new Error('no picture'));
    image.onerror = () => settle(new Error('failed to load'));
    image.src = src;
  });
}

/** A canvas of the given size and its 2D context. */
function newCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2D canvas');
  return { canvas, g };
}

/** A loaded photo, drawn at most MAX_SIZE on its long side. Browsers turn phone photos upright as they draw them. */
function photoAsset(index, image, src) {
  const { naturalWidth: w, naturalHeight: h } = image;
  const { width, height } = fitWithin(w, h, PHOTOS.MAX_SIZE);
  const { canvas, g } = newCanvas(width, height);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(image, 0, 0, width, height);
  return { index, canvas, width, height, aspect: w / h, src, isPlaceholder: false };
}

/** The soft placeholder of moment `index`: a portrait pastel gradient with "Photo N" and a small heart. */
function placeholderAsset(index) {
  const { PLACEHOLDER_WIDTH: w, PLACEHOLDER_HEIGHT: h } = PHOTOS;
  const { canvas, g } = newCanvas(w, h);
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

  return { index, canvas, width: w, height: h, aspect: w / h, src: canvas.toDataURL('image/jpeg', 0.92), isPlaceholder: true };
}

/**
 * A small heart centred on (x, y) of a 2D canvas context, `r` across each lobe. The photo signs' date placards
 * use it too.
 */
export function drawHeart(g, x, y, r, colour) {
  g.save();
  g.translate(x, y);
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(0, r * 1.15);
  g.bezierCurveTo(-r * 1.9, -r * 0.1, -r * 0.9, -r * 1.4, 0, -r * 0.45);
  g.bezierCurveTo(r * 0.9, -r * 1.4, r * 1.9, -r * 0.1, 0, r * 1.15);
  g.fill();
  g.restore();
}
