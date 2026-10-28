// Chimney smoke: soft grey puffs that leave the chimneys of the houses and the station house, rise, drift a little
// with the breeze and fade out, a cosy curl over every roof she passes.
//
// It is one THREE.Points of up to `maxPuffs` puffs, shared by all the chimneys. Each chimney within RANGE of the
// camera lets go of a puff every EVERY seconds, each at its own moment so that they do not puff in step; a puff
// rises RISE m/s, drifts DRIFT m/s towards +X (the breeze), curls a little from side to side, grows from SIZE[0] to
// SIZE[1] m across and fades out over its LIFE seconds. A puff is faint at first and comes in over FADE_IN, so none
// ever pops into view at the chimney's mouth.
//
// The pool is the cost: every puff is a vertex, but only the chimneys nearest the camera send out as many puffs as the
// pool holds (a chimney keeps about LIFE / EVERY puffs up), so on a slow phone, where the quality tier shrinks the
// pool, the nearest few chimneys keep their smoke and the far ones go without, never a ragged lot of all of them.
// A chimney whose house the quality tier has thinned away (dressing.js `rank`) sends out nothing either: smoke over
// an empty roof would be a ghost. Puffs are drawn as soft round sprites and mixed into the fog like everything else,
// so a far one fades into the haze with the house under it; they are not drawn as light (it is smoke, not fire).
//
// The motion is worked out on the CPU, a few hundred numbers a frame, like the ambient particles' (particles.js);
// nothing is allocated in a frame.
//
// DOM-free at import time (nothing is drawn until a renderer gets the Points), so the Node unit tests can import it.

import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector2,
} from '../three.js';
import { clamp, smoothstep } from '../util/math.js';
import { createRng } from '../util/rng.js';

/**
 * @typedef {import('./dressing.js').Chimney} Chimney
 */

/**
 * How the smoke behaves. RANGE: only chimneys this close to the camera (m) send out any. EVERY: seconds between one
 * chimney's puffs. RISE and DRIFT: how fast a puff rises, and drifts towards +X (m/s). SIZE: how wide a puff is as it
 * leaves the chimney and as it goes out (m). LIFE: how long it lasts (s).
 */
export const SMOKE = Object.freeze({
  RANGE: 120,
  EVERY: 0.8,
  RISE: 0.6,
  DRIFT: 0.3,
  SIZE: Object.freeze([0.4, 1.6]),
  LIFE: 6,
});

/**
 * How a puff looks. ALPHA: how opaque it is at its densest. FADE_IN: it comes in over this long (s). FADE_OUT: it
 * starts to thin this far into its life (a share of it), and has gone at the end. CURL: how far (m) it has swung from
 * side to side by the end of its life, along X and Z, at CURL_RATE rad/s.
 *
 * COLOUR: a puff's colour as it leaves the chimney (YOUNG) and as it goes out (OLD), denser and darker at first and
 * thinning towards the haze. Smoke has to show against whatever is behind it, and the sky behind it is very different:
 * the pale winter sky is bright, so the smoke is a grey-blue darker than it (DARK); the dusk sky is mauve and peach,
 * not so bright, so the smoke is a pale lilac-grey lighter than it (LIGHT). Which it is follows how bright the zone's
 * fog (its horizon colour) is, from DUSK_BELOW (the dusk's) to DAY_ABOVE (winter's), so it eases across a boundary.
 * Neither is ever white.
 */
const LOOK = Object.freeze({
  ALPHA: 0.95, FADE_IN: 0.5, FADE_OUT: 0.3, CURL: [0.25, 0.2], CURL_RATE: 1.1,
  COLOUR: Object.freeze({
    DARK: Object.freeze({ YOUNG: '#7f89a3', OLD: '#aab2c6' }),
    LIGHT: Object.freeze({ YOUNG: '#e0d4df', OLD: '#efe9f1' }),
    DUSK_BELOW: 0.35, DAY_ABOVE: 0.85,
  }),
});

/** The same smoke every run. */
const SEED = 3141;

/** A chimney keeps about this many puffs up at a time, so the pool can keep that many times fewer chimneys in smoke. */
const PUFFS_PER_CHIMNEY = Math.ceil(SMOKE.LIFE / SMOKE.EVERY);

/** A frame longer than this (s) shows no more of the smoke than this: after a stall, none of the old puffs are left. */
const LONGEST_STEP = SMOKE.LIFE + SMOKE.EVERY;

/** The biggest a puff may be drawn, in device pixels (one blowing past her window). */
const MAX_POINT_SIZE = 140;

const vertexShader = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aLife;

uniform float uHalfHeight;
uniform float uMaxSize;

varying float vAlpha;
varying float vLife;

#include <fog_pars_vertex>

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mvPosition.z, 0.01);
  // Gone right by her eye, so no puff smears across the screen.
  vAlpha = aAlpha * smoothstep(1.5, 3.5, length(mvPosition.xyz));
  vLife = aLife;
  gl_PointSize = min(aSize * projectionMatrix[1][1] * uHalfHeight / depth, uMaxSize);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uYoungDark;
uniform vec3 uOldDark;
uniform vec3 uYoungLight;
uniform vec3 uOldLight;
uniform vec2 uBrightRange;

varying float vAlpha;
varying float vLife;

#include <fog_pars_fragment>

void main() {
  // A soft round puff: solid at the middle, fading out over the outer part of the sprite to nothing at its edge.
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = (1.0 - smoothstep(0.3, 1.0, r)) * vAlpha;
  #ifdef USE_FOG
    alpha *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  if (alpha < 0.005) discard;
  // Darker than a bright sky, lighter than a dim one: the brightness of the fog is the brightness of the horizon.
  float day = 1.0;
  #ifdef USE_FOG
    day = smoothstep(uBrightRange.x, uBrightRange.y, dot(fogColor, vec3(0.2126, 0.7152, 0.0722)));
  #endif
  vec3 young = mix(uYoungLight, uYoungDark, day);
  vec3 old = mix(uOldLight, uOldDark, day);
  gl_FragColor = vec4(mix(young, old, vLife), alpha);
  #include <colorspace_fragment>
}
`;

/**
 * @param {Chimney[]} chimneys  the world position of the top of each chimney; a chimney's `rank` (dressing.js; 0 if it
 *   has none) is the density above which its house is drawn
 * @param {{ maxPuffs?: number }} [options]
 * @returns {{
 *   points: Points,
 *   setQuality: (share: number) => void,
 *   setDensity: (share: number) => void,
 *   update: (dt: number, cameraPosition: import('../three.js').Vector3) => void,
 * }}
 *   Add `points` to the scene. `setQuality` is the quality tier's `particles` share (0 to 1) of the `maxPuffs`.
 *   `setDensity` is the tier's `density`: the smoke of a house it has thinned away stops. Call `update` every frame
 *   with the seconds since the last one and the camera's world position.
 */
export function createSmoke(chimneys, { maxPuffs = 160 } = {}) {
  const count = Math.max(1, Math.floor(maxPuffs));
  const rng = createRng(SEED);
  const n = chimneys.length;

  // The chimneys: where each stands, the density its house needs, and when it next lets go of a puff.
  const at = new Float32Array(n * 3);
  const rank = new Float32Array(n);
  const wait = new Float32Array(n); // s until its next puff
  const warm = new Uint8Array(n);   // it was sending out smoke last frame, so it is running to its own rhythm
  const reach = new Float32Array(n); // squared distance to the camera this frame, or Infinity if it sends out none
  chimneys.forEach((c, i) => {
    c.toArray(at, i * 3);
    rank[i] = c.rank ?? 0;
  });

  // The puffs: how old each is (negative: not there), where it started and its own curl.
  const age = new Float32Array(count).fill(-1);
  const origin = new Float32Array(count * 3);
  const phase = new Float32Array(count);

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const alphas = new Float32Array(count);
  const lives = new Float32Array(count);
  const geometry = new BufferGeometry();
  const attribute = (name, array, size) => {
    const a = new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, a);
    return a;
  };
  const moving = [
    attribute('position', positions, 3), attribute('aSize', sizes, 1), attribute('aAlpha', alphas, 1), attribute('aLife', lives, 1),
  ];

  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, {
      uYoungDark: { value: new Color(LOOK.COLOUR.DARK.YOUNG) },
      uOldDark: { value: new Color(LOOK.COLOUR.DARK.OLD) },
      uYoungLight: { value: new Color(LOOK.COLOUR.LIGHT.YOUNG) },
      uOldLight: { value: new Color(LOOK.COLOUR.LIGHT.OLD) },
      uBrightRange: { value: new Vector2(LOOK.COLOUR.DUSK_BELOW, LOOK.COLOUR.DAY_ABOVE) },
      uHalfHeight: { value: 400 },
      uMaxSize: { value: MAX_POINT_SIZE },
    }]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const points = new Points(geometry, material);
  points.name = 'chimney-smoke';
  points.frustumCulled = false; // the puffs are up and down the whole ride, and the camera is somewhere in it
  points.visible = false;
  // Point sizes are in pixels, so the shader needs the height of what is being drawn.
  const bufferSize = new Vector2();
  points.onBeforeRender = (renderer) => {
    material.uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(bufferSize).y / 2;
  };

  let capacity = count; // puffs the quality tier allows: the first `capacity` of the pool
  let density = 1;      // the share of the props drawn
  geometry.setDrawRange(0, capacity);

  /** Lets go of a puff from chimney `i`, `old` seconds old already; false if the pool is full. */
  function spawn(i, old) {
    if (old >= SMOKE.LIFE) return true; // it has gone out already, in the stall it was born in
    for (let j = 0; j < capacity; j++) {
      if (age[j] >= 0) continue;
      age[j] = old;
      origin[j * 3] = at[i * 3];
      origin[j * 3 + 1] = at[i * 3 + 1];
      origin[j * 3 + 2] = at[i * 3 + 2];
      phase[j] = rng() * Math.PI * 2;
      return true;
    }
    return false;
  }

  function update(dt, cameraPosition) {
    const step = Math.min(Math.max(dt, 0), LONGEST_STEP);

    // The puffs already up get older, and go out at the end of their lives.
    for (let j = 0; j < count; j++) {
      if (age[j] < 0) continue;
      age[j] += step;
      if (age[j] >= SMOKE.LIFE) age[j] = -1;
    }

    // The chimneys that send out smoke: within range, with their house drawn, the nearest as many as the pool holds.
    const emitters = Math.floor(capacity / PUFFS_PER_CHIMNEY);
    for (let i = 0; i < n; i++) {
      const dx = at[i * 3] - cameraPosition.x, dy = at[i * 3 + 1] - cameraPosition.y, dz = at[i * 3 + 2] - cameraPosition.z;
      const sq = dx * dx + dy * dy + dz * dz;
      reach[i] = sq <= SMOKE.RANGE * SMOKE.RANGE && rank[i] < density ? sq : Infinity;
    }
    for (let i = 0; i < n; i++) {
      let nearer = 0;
      if (reach[i] !== Infinity) {
        for (let k = 0; k < n; k++) if (reach[k] < reach[i] || (reach[k] === reach[i] && k < i)) nearer += 1;
      }
      if (reach[i] === Infinity || nearer >= emitters) {
        warm[i] = 0;
        continue;
      }
      if (!warm[i]) {
        // Starting up: at a moment of its own, so that chimneys that wake together do not puff together.
        warm[i] = 1;
        wait[i] = rng() * SMOKE.EVERY;
      }
      wait[i] -= step;
      while (wait[i] <= 0) {
        if (!spawn(i, -wait[i])) {
          wait[i] = 0; // no room: try again next frame, rather than saving up a burst
          break;
        }
        wait[i] += SMOKE.EVERY;
      }
    }

    // Where each puff is, how big and how strong.
    let live = 0;
    const [from, to] = SMOKE.SIZE;
    for (let j = 0; j < capacity; j++) {
      if (age[j] < 0) {
        alphas[j] = 0;
        continue;
      }
      live += 1;
      const a = age[j];
      const life = a / SMOKE.LIFE;
      const turn = a * LOOK.CURL_RATE + phase[j];
      positions[j * 3] = origin[j * 3] + SMOKE.DRIFT * a + LOOK.CURL[0] * life * Math.sin(turn);
      positions[j * 3 + 1] = origin[j * 3 + 1] + SMOKE.RISE * a;
      positions[j * 3 + 2] = origin[j * 3 + 2] + LOOK.CURL[1] * life * Math.cos(turn * 0.8);
      sizes[j] = from + (to - from) * life;
      lives[j] = life;
      alphas[j] = LOOK.ALPHA * smoothstep(0, LOOK.FADE_IN, a) * (1 - smoothstep(LOOK.FADE_OUT, 1, life));
    }
    points.visible = live > 0;
    if (points.visible) for (let k = 0; k < moving.length; k++) moving[k].needsUpdate = true;
  }

  return {
    points,
    setQuality(share) {
      capacity = Math.ceil(count * clamp(share, 0, 1));
      geometry.setDrawRange(0, capacity);
      // The puffs the pool no longer holds go out.
      for (let j = capacity; j < count; j++) {
        age[j] = -1;
        alphas[j] = 0;
      }
    },
    setDensity(share) {
      density = clamp(share, 0, 1);
    },
    update,
  };
}
