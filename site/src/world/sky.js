// The sky: a big sphere round the camera, painted from the horizon colour up to the zenith colour of the zone.
//
// The sphere moves with the camera, so the sky never comes any closer. It is not fogged: each zone's horizon
// colour is also its fog colour (zones.js), so the far ground melts into it. Below the horizon it stays the
// horizon colour all the way down, so wherever the ground runs out the gap reads as haze, not a void.
//
// The colours are linear (from environment.js) and the shader converts them for the screen. A touch of
// dithering keeps the long, soft gradient from banding on 8-bit screens.
//
// At dusk the stars come out in the same shader, so they cost no draw call of their own and, painted on the sky
// itself, never come any closer. The sky is cut into small cells, round after round of them up from the horizon,
// each round with as many cells as fit round it, so that a cell is about as wide as it is tall wherever it is; a
// cell has a star in it or not by chance, and where it stands in the cell, how big and how bright it is and how it
// twinkles all come from the cell's own hash. There are none in the haze near the horizon, and they are denser
// towards the zenith. How many show is the evening zone's weight (audio/ambienceTiming.js zoneWeights), so they
// fade in across the way into the evening, as the sky darkens.
//
// DOM-free (only Three's classes are used), so it can be imported anywhere.

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from '../three.js';
import { zoneWeights } from '../audio/ambienceTiming.js';

export const SKY = Object.freeze({
  RADIUS: 350,   // m; inside the camera's far plane (400 m)
  SOFTNESS: 0.35, // gradient exponent: below 1 the zenith colour takes over quickly above the horizon
});

/**
 * The star field. `MIN_UP`: no star lower than this (the sine of its elevation, 0 at the horizon and 1 at the zenith:
 * 0.12 is about 7 degrees up), and they come in over the next FADE_UP of it. `CELL`: how wide (rad) a cell is, about 2
 * degrees. `CHANCE`: how likely a cell is to hold a star at the zenith, and `HORIZON_SHARE` the share of that
 * chance it has at MIN_UP, rising to the whole of it at FULL_UP. `RADIUS`: a star's size (rad) at its smallest and
 * biggest, about a fifth of a degree at the most. `TWINKLE`: how far (0 to 1) a star dims at the bottom of its
 * twinkle, and the slowest and fastest (rad/s) of them: one dims over three to twelve seconds.
 */
export const STARS = Object.freeze({
  MIN_UP: 0.12,
  FADE_UP: 0.25,
  FULL_UP: 0.95,
  CELL: 0.04,
  CHANCE: 0.3,
  HORIZON_SHARE: 0.3,
  RADIUS: Object.freeze([0.0022, 0.0042]),
  TWINKLE: Object.freeze({ DEPTH: 0.3, SLOWEST: 0.5, FASTEST: 2 }),
});

/** A number as GLSL wants it: always with a decimal point. */
const glsl = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

const vertexShader = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>

uniform vec3 topColor;
uniform vec3 horizonColor;
uniform float softness;
uniform float stars;
uniform float starTime;
varying vec3 vDirection;

const float STAR_MIN_UP = ${glsl(STARS.MIN_UP)};
const float STAR_FADE_UP = ${glsl(STARS.FADE_UP)};
const float STAR_FULL_UP = ${glsl(STARS.FULL_UP)};
const float STAR_CELL = ${glsl(STARS.CELL)};
const float STAR_CHANCE = ${glsl(STARS.CHANCE)};
const float STAR_HORIZON_SHARE = ${glsl(STARS.HORIZON_SHARE)};
const vec2 STAR_RADIUS = vec2(${glsl(STARS.RADIUS[0])}, ${glsl(STARS.RADIUS[1])});
const float STAR_TWINKLE = ${glsl(STARS.TWINKLE.DEPTH)};
const vec2 STAR_TWINKLE_RATE = vec2(${glsl(STARS.TWINKLE.SLOWEST)}, ${glsl(STARS.TWINKLE.FASTEST)});

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// How brightly a star shines in this direction (0 to 1): the star of the cell it falls in, if the cell has one.
float starLight(vec3 dir, float up) {
  float elevation = asin(clamp(dir.y, -1.0, 1.0));
  float band = floor(elevation / STAR_CELL);
  float cells = max(floor(PI2 * cos((band + 0.5) * STAR_CELL) / STAR_CELL), 1.0);
  float turn = (atan(dir.z, dir.x) / PI2 + 0.5) * cells;
  vec2 cell = vec2(floor(turn), band);

  float chance = STAR_CHANCE * mix(STAR_HORIZON_SHARE, 1.0, smoothstep(STAR_MIN_UP, STAR_FULL_UP, up));
  if (hash21(cell) > chance) return 0.0;

  // Where the star stands in its cell: well inside, so that no star ever spills over into the next one.
  vec2 place = 0.2 + 0.6 * vec2(hash21(cell + 3.7), hash21(cell + 11.3));
  vec2 within = vec2(fract(turn), fract(elevation / STAR_CELL));
  vec2 away = (within - place) * vec2(PI2 * cos(elevation) / cells, STAR_CELL); // radians
  float size = hash21(cell + 29.1);
  float radius = mix(STAR_RADIUS.x, STAR_RADIUS.y, size * size);
  float shine = 1.0 - smoothstep(0.0, radius, length(away));

  float rate = mix(STAR_TWINKLE_RATE.x, STAR_TWINKLE_RATE.y, hash21(cell + 47.9));
  float twinkle = 1.0 - STAR_TWINKLE * (0.5 + 0.5 * sin(starTime * rate + PI2 * hash21(cell + 61.3)));
  float bright = 0.45 + 0.55 * size;
  return shine * shine * bright * twinkle * smoothstep(STAR_MIN_UP, STAR_MIN_UP + STAR_FADE_UP, up);
}

void main() {
  vec3 dir = normalize(vDirection);
  float up = max(dir.y, 0.0);
  vec3 colour = mix(horizonColor, topColor, pow(up, softness));
  if (stars > 0.0 && up > STAR_MIN_UP) {
    colour = mix(colour, vec3(1.0, 0.96, 0.88), clamp(starLight(dir, up) * stars, 0.0, 1.0));
  }
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

/**
 * @returns {{
 *   mesh: Mesh,
 *   update: (env: import('./environment.js').Env, cameraPosition: import('../three.js').Vector3, time?: number) => void,
 * }}
 *   Call `update` every frame with the environment where the train is, the camera's world position and the seconds
 *   since the start (what the stars twinkle by; they stand still without it).
 */
export function createSky() {
  const uniforms = {
    topColor: { value: new Color() },
    horizonColor: { value: new Color() },
    softness: { value: SKY.SOFTNESS },
    stars: { value: 0 },
    starTime: { value: 0 },
  };
  const weights = {};
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
    dithering: true,
  });
  const mesh = new Mesh(new SphereGeometry(SKY.RADIUS, 32, 16), material);
  mesh.name = 'sky';
  mesh.renderOrder = -1;       // first, so everything else draws over it
  mesh.frustumCulled = false;  // it is always around the camera

  function update(env, cameraPosition, time = 0) {
    uniforms.topColor.value.copy(env.skyTop);
    uniforms.horizonColor.value.copy(env.skyHorizon);
    uniforms.stars.value = zoneWeights(env, weights).evening;
    uniforms.starTime.value = time;
    mesh.position.copy(cameraPosition);
  }

  return { mesh, update };
}
