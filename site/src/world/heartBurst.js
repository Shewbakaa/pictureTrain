// A little burst of hearts where she taps a balloon cluster (dressing.js, through ride/taps.js TapEffects `burst`):
// HEARTS.COUNT hearts rise HEARTS.RISE metres from the point, spreading a little and swaying as they go, and fade
// away over HEARTS.LIFE seconds.
//
// Every burst shares one THREE.Points of up to `max` hearts, drawn with a heart-shaped sprite (util/canvasText.js
// `drawHeart`, on a little canvas made once when there is a document; in the Node unit tests there is none, and the
// points have no sprite). Each heart has its own pink and its own fade in the alpha of its vertex colour. The live
// hearts are kept at the front of the buffers, so the draw range covers them and nothing else, and the points are not
// drawn at all while none is in the air. A burst when every heart is in the air takes the oldest.
//
// DOM-free at import, so the Node unit tests can import it.

import {
  BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Points, PointsMaterial, SRGBColorSpace,
} from '../three.js';
import { drawHeart } from '../util/canvasText.js';
import { smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * A burst: COUNT hearts, each rising up to RISE metres over LIFE seconds (the slowest LOW of that, so they do not rise in
 * a flat row) while it drifts out up to SPREAD metres from where they burst, swaying SWAY metres from side to side,
 * drawn SIZE metres across.
 */
export const HEARTS = Object.freeze({ COUNT: 12, RISE: 1.5, LOW: 0.72, LIFE: 1.6, SPREAD: 0.8, SWAY: 0.08, SIZE: 0.6 });

/** The hearts' pinks (sRGB), each heart one of them. */
const PINKS = ['#ff7aa2', '#ff5c8a', '#ffb3c6', '#f06292', '#ff8fab'];

/** The same hearts every ride. */
const SEED = 1214;

/** The heart sprite: a white heart on a clear square, tinted by each heart's colour. Null without a document. */
function heartTexture(size = 64) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  drawHeart(g, size / 2, size / 2, size * 0.24, '#ffffff');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The hearts.
 * @param {{ max?: number }} [options]  the most hearts in the air at once
 * @returns {{ points: Points, burst: (position: import('../three.js').Vector3) => void, update: (dt: number) => void }}
 *   Add `points` to the scene. `burst` sends up a burst of hearts from a point in the world, and `update`, called every
 *   frame with the seconds since the last, moves them on.
 */
export function createHeartBurst({ max = 48 } = {}) {
  const size = Math.max(HEARTS.COUNT, Math.floor(max));
  const rng = createRng(SEED);

  // Each heart in the air: when it burst (s, on the hearts' own clock), where from, which way it drifts, how high it
  // rises, its sway's phase and its colour (linear RGB). Index i of every array is the same heart.
  const born = new Float64Array(size); // to the clock's own precision, so a heart just born is not born in the future
  const from = new Float32Array(size * 3);
  const rise = new Float32Array(size);
  const drift = new Float32Array(size * 2);
  const phase = new Float32Array(size);
  const tint = new Float32Array(size * 3);

  const positions = new Float32Array(size * 3);
  const colours = new Float32Array(size * 4);
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage);
  const color = new BufferAttribute(colours, 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setDrawRange(0, 0);

  const points = new Points(geometry, new PointsMaterial({
    map: heartTexture(),
    size: HEARTS.SIZE,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  }));
  points.name = 'heart-burst';
  points.frustumCulled = false; // they go wherever she taps
  points.visible = false;

  let live = 0;
  let time = 0;
  const pink = new Color();

  /** Moves heart `j`'s whole state into slot `i`. */
  function move(j, i) {
    born[i] = born[j];
    rise[i] = rise[j];
    phase[i] = phase[j];
    for (let k = 0; k < 3; k++) {
      from[i * 3 + k] = from[j * 3 + k];
      tint[i * 3 + k] = tint[j * 3 + k];
    }
    drift[i * 2] = drift[j * 2];
    drift[i * 2 + 1] = drift[j * 2 + 1];
  }

  /** Writes where each live heart is now and how strongly it shows. */
  function draw() {
    const { LIFE, SWAY } = HEARTS;
    for (let i = 0; i < live; i++) {
      const u = Math.max(0, (time - born[i]) / LIFE);
      // Up fast and slowing, out a little, swaying; in quickly and fading out over the second half.
      const up = rise[i] * (1 - (1 - u) * (1 - u));
      const out = Math.sqrt(u);
      const sway = SWAY * Math.sin(u * 9 + phase[i]);
      positions[i * 3] = from[i * 3] + drift[i * 2] * out + sway;
      positions[i * 3 + 1] = from[i * 3 + 1] + up;
      positions[i * 3 + 2] = from[i * 3 + 2] + drift[i * 2 + 1] * out;
      colours[i * 4] = tint[i * 3];
      colours[i * 4 + 1] = tint[i * 3 + 1];
      colours[i * 4 + 2] = tint[i * 3 + 2];
      colours[i * 4 + 3] = smoothstep(0, 0.08, u) * (1 - smoothstep(0.5, 1, u));
    }
    geometry.setDrawRange(0, live);
    points.visible = live > 0;
    position.needsUpdate = true;
    color.needsUpdate = true;
  }

  return {
    points,
    burst(at) {
      // Room for the burst: the oldest hearts (at the front) make way if need be.
      const drop = Math.max(0, live + HEARTS.COUNT - size);
      for (let i = drop; i < live; i++) move(i, i - drop);
      live -= drop;
      for (let n = 0; n < HEARTS.COUNT; n++, live++) {
        const i = live;
        born[i] = time;
        from[i * 3] = at.x;
        from[i * 3 + 1] = at.y;
        from[i * 3 + 2] = at.z;
        // Out round the burst, evenly, each at its own distance.
        const angle = ((n + rngRange(rng, -0.3, 0.3)) / HEARTS.COUNT) * Math.PI * 2;
        const reach = HEARTS.SPREAD * rngRange(rng, 0.4, 1);
        rise[i] = HEARTS.RISE * rngRange(rng, HEARTS.LOW, 1);
        drift[i * 2] = Math.cos(angle) * reach;
        drift[i * 2 + 1] = Math.sin(angle) * reach;
        phase[i] = rngRange(rng, 0, Math.PI * 2);
        pink.set(PINKS[n % PINKS.length]);
        tint[i * 3] = pink.r;
        tint[i * 3 + 1] = pink.g;
        tint[i * 3 + 2] = pink.b;
      }
      draw();
    },
    update(dt) {
      time += dt > 0 ? dt : 0;
      // The hearts that have had their time go, and the rest close up at the front.
      let kept = 0;
      for (let i = 0; i < live; i++) {
        if (time - born[i] >= HEARTS.LIFE) continue;
        if (kept !== i) move(i, kept);
        kept++;
      }
      live = kept;
      draw();
    },
  };
}
