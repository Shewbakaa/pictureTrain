// Ambient particles drifting past the train: pink petals in spring, leaves in autumn, snow in winter and
// fireflies at dusk (zones.js `particles`). Summer has none.
//
// It is one THREE.Points of up to `maxCount` particles living in a box 40 m wide, 18 m tall and 40 m long round
// the camera. Each particle has a fixed spot in the world plus its own motion (falling, swaying, wandering), and
// is drawn wherever that lands inside the box: a particle that drifts or falls out of one side comes back in
// at the other. So the train rolls through particles that stay put in the world, and the box never runs dry.
// Particles fade out within a few metres of the eye and towards the edge of the box, so none ever pops.
//
// Between two zones the effect does not mix two kinds at once: the first fades out to nothing at the middle of
// the blend window, then the second fades in (`particleStyleAt`), and the swap happens while nothing shows.
//
// The motion is worked out on the CPU each frame (a few hundred particles); the shapes (petal, leaf, flake,
// glow) are drawn in the fragment shader, so nothing is recompiled when the kind changes.
//
// DOM-free at import time (`particleStyleAt` is pure), so the Node unit tests can import it.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial,
  Vector2,
} from '../three.js';
import { clamp } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {import('./zones.js').ParticleStyle} ParticleStyle
 * @typedef {import('./environment.js').Env} Env
 */

/** The box the particles live in (m): BOX.X by BOX.Y by BOX.Z, centred on the camera across, from BOX.BELOW under her eye up. */
const BOX = Object.freeze({ X: 40, Y: 18, Z: 40, BELOW: 3 });

/** Fireflies keep low: within this band (m) round her eye height, not up in the sky. */
const FIREFLY_BAND = Object.freeze({ BELOW: 1.7, ABOVE: 3.2 });

/**
 * How each kind is drawn and moves. `shape` picks the fragment shader's shape. Each particle's colour lies
 * between the style's colour and `tint`, up to `vary` of the way (a snowflake's edge is its tint, so it shows
 * against a white sky). `spin` is how fast (rad/s) they turn in the picture and `flip` how fast they tumble
 * (their width flickers as they turn over).
 */
const KINDS = Object.freeze({
  petals: { shape: 0, tint: '#ffffff', vary: 0.45, spin: 1.2, flip: 2.2 },
  leaves: { shape: 1, tint: '#f2c14e', vary: 1, spin: 1.8, flip: 2.8 },
  snow: { shape: 2, tint: '#aebfe0', vary: 0, spin: 0, flip: 0 },
  fireflies: { shape: 3, tint: '#fff8e0', vary: 0.3, spin: 0, flip: 0 },
});

/** The same particles every run. */
const SEED = 4242;

/** Largest a particle may be drawn, in device pixels (a petal brushing past her nose). */
const MAX_POINT_SIZE = 96;

/**
 * The particle style showing at a point of the ride, and how strongly. Outside a blend window this is the
 * zone's own style at its `density`. Across a window the first zone's style fades out over the first half and
 * the second zone's fades in over the second half, so two kinds never show at once. Kind 'none' never shows.
 * @param {Pick<Env, 'particlesA'|'particlesB'|'particlesT'>} env
 * @param {{ style?: ParticleStyle, opacity?: number }} [out]  an object to fill in (per-frame code), else a new one
 * @returns {{ style: ParticleStyle, opacity: number }}
 */
export function particleStyleAt(env, out = {}) {
  const t = env.particlesT;
  const first = t < 0.5;
  const style = first ? env.particlesA : env.particlesB;
  const fade = first ? 1 - 2 * t : 2 * t - 1;
  out.style = style;
  out.opacity = style.kind === 'none' ? 0 : fade * style.density;
  return out;
}

const vertexShader = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aSpin;
attribute float aFlip;
attribute float aShade;

uniform float uHalfHeight;
uniform float uMaxSize;

varying float vAlpha;
varying float vSpin;
varying float vFlip;
varying float vShade;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = max(-mvPosition.z, 0.01);
  float dist = length(mvPosition.xyz);
  // Gone right by her eye (so nothing smears across the screen) and towards the edge of the box (so nothing pops).
  vAlpha = aAlpha * smoothstep(1.8, 3.6, dist) * (1.0 - smoothstep(13.0, 19.0, dist));
  vSpin = aSpin;
  vFlip = aFlip;
  vShade = aShade;
  gl_PointSize = min(aSize * projectionMatrix[1][1] * uHalfHeight / depth, uMaxSize);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uTint;
uniform float uVary;
uniform float uOpacity;
uniform int uShape;

varying float vAlpha;
varying float vSpin;
varying float vFlip;
varying float vShade;

void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec3 colour = mix(uColor, uTint, vShade * uVary);
  float alpha;
  if (uShape == 0) {
    // A petal: a soft oval, narrowing as it tumbles, a little paler at its heart.
    vec2 q = vec2(p.x / max(vFlip, 0.12), p.y);
    float d = length(vec2(q.x / 0.46, q.y / 0.3));
    alpha = 1.0 - smoothstep(0.8, 1.0, d);
    colour = mix(colour, uTint, 0.25 * (1.0 - d));
  } else if (uShape == 1) {
    // A leaf: pointed at both ends, with a darker midrib.
    vec2 q = vec2(p.x, p.y / max(vFlip, 0.12));
    float halfWidth = 0.24 * max(1.0 - pow(q.x / 0.48, 2.0), 0.0);
    alpha = 1.0 - smoothstep(halfWidth * 0.75, halfWidth, abs(q.y));
    colour *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.03, abs(q.y)));
  } else if (uShape == 2) {
    // A snowflake: a soft round dot, white in the middle and cool grey-blue at its edge.
    float r = length(p);
    alpha = 1.0 - smoothstep(0.25, 0.5, r);
    colour = mix(uColor, uTint, smoothstep(0.0, 0.5, r));
  } else {
    // A firefly: a bright core in a soft halo, added to what is behind it as light.
    float r = length(p) * 2.0;
    alpha = exp(-r * r * 9.0) + 0.45 * (1.0 - smoothstep(0.0, 1.0, r));
    colour = mix(colour, vec3(1.0), 0.5 * exp(-r * r * 30.0));
  }
  alpha *= vAlpha * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(colour, alpha);
  #include <colorspace_fragment>
}
`;

/** `value` wrapped into [0, size). */
const wrap = (value, size) => ((value % size) + size) % size;

/**
 * @param {{ maxCount?: number }} [options]
 * @returns {{
 *   points: Points,
 *   setQuality: (share: number) => void,
 *   update: (dt: number, env: Env, cameraPosition: import('../three.js').Vector3) => void,
 * }}
 *   Add `points` to the scene. `setQuality` draws that share (0 to 1) of the particles: the quality tier's
 *   `particles`. Call `update` every frame with the seconds since the last one, the environment where the
 *   train is and the camera's world position.
 */
export function createAmbientParticles({ maxCount = 260 } = {}) {
  const count = Math.max(1, Math.floor(maxCount));
  const rng = createRng(SEED);

  // Each particle's fixed character: where in the world it starts (as a share of the box), its phases, how fast
  // it falls and sways relative to the style, its size and its shade between the style colour and the tint.
  const anchor = new Float32Array(count * 3);
  const phase = new Float32Array(count * 4);
  const pace = new Float32Array(count);
  const sizeFactor = new Float32Array(count);
  const shade = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    anchor[i * 3] = rng();
    anchor[i * 3 + 1] = rng();
    anchor[i * 3 + 2] = rng();
    for (let k = 0; k < 4; k++) phase[i * 4 + k] = rng() * Math.PI * 2;
    pace[i] = rngRange(rng, 0.7, 1.3);
    sizeFactor[i] = rngRange(rng, 0.7, 1.3);
    shade[i] = rng();
  }

  const positions = new Float32Array(count * 3);
  const geometry = new BufferGeometry();
  const attribute = (name, array, size) => {
    const a = new BufferAttribute(array, size).setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, a);
    return a;
  };
  const positionAttribute = attribute('position', positions, 3);
  const sizeAttribute = attribute('aSize', new Float32Array(count), 1);
  const alphaAttribute = attribute('aAlpha', new Float32Array(count), 1);
  const spinAttribute = attribute('aSpin', new Float32Array(count), 1);
  const flipAttribute = attribute('aFlip', new Float32Array(count), 1);
  geometry.setAttribute('aShade', new BufferAttribute(shade, 1));

  const uniforms = {
    uColor: { value: new Color() },
    uTint: { value: new Color() },
    uVary: { value: 0 },
    uOpacity: { value: 0 },
    uShape: { value: 0 },
    uHalfHeight: { value: 400 },
    uMaxSize: { value: MAX_POINT_SIZE },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const points = new Points(geometry, material);
  points.name = 'ambient-particles';
  points.frustumCulled = false; // the particles go wherever the camera goes
  points.visible = false;
  // Point sizes are in pixels, so the shader needs the height of what is being drawn.
  const bufferSize = new Vector2();
  points.onBeforeRender = (renderer) => {
    uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(bufferSize).y / 2;
  };

  let drawCount = count;
  geometry.setDrawRange(0, drawCount);
  let time = 0;
  let current = null;
  const showing = {};

  /** Sets the colours, the shape and the blending for a new style (while it shows at opacity 0). */
  function applyStyle(style) {
    current = style;
    const kind = KINDS[style.kind];
    uniforms.uColor.value.set(style.color);
    uniforms.uTint.value.set(kind.tint);
    uniforms.uVary.value = kind.vary;
    uniforms.uShape.value = kind.shape;
    material.blending = style.additive ? AdditiveBlending : NormalBlending;
  }

  function update(dt, env, cameraPosition) {
    time += dt;
    const { style, opacity } = particleStyleAt(env, showing);
    points.visible = opacity > 0.001 && KINDS[style.kind] !== undefined;
    if (!points.visible) return;
    if (style !== current) applyStyle(style);
    uniforms.uOpacity.value = opacity;

    const kind = KINDS[style.kind];
    const fireflies = style.kind === 'fireflies';
    // The box's low corner, and how tall the band is that particles live in.
    const x0 = cameraPosition.x - BOX.X / 2;
    const z0 = cameraPosition.z - BOX.Z / 2;
    const y0 = cameraPosition.y - (fireflies ? FIREFLY_BAND.BELOW : BOX.BELOW);
    const height = fireflies ? FIREFLY_BAND.BELOW + FIREFLY_BAND.ABOVE : BOX.Y;
    const sizes = sizeAttribute.array;
    const alphas = alphaAttribute.array;
    const spins = spinAttribute.array;
    const flips = flipAttribute.array;
    for (let i = 0; i < drawCount; i++) {
      const a = i * 3;
      const ph = i * 4;
      const p = pace[i];
      let x = anchor[a] * BOX.X;
      let y = anchor[a + 1] * height;
      let z = anchor[a + 2] * BOX.Z;
      if (fireflies) {
        // Wandering slowly in loops, and blinking.
        x += style.sway * 1.5 * Math.sin(time * 0.31 * p + phase[ph]);
        y += 0.5 * Math.sin(time * 0.53 * p + phase[ph + 1]);
        z += style.sway * 1.5 * Math.cos(time * 0.27 * p + phase[ph + 2]);
        const blink = 0.5 + 0.5 * Math.sin(time * 1.7 * p + phase[ph + 3]);
        alphas[i] = 0.15 + 0.85 * blink * blink;
        sizes[i] = style.size * sizeFactor[i] * (0.8 + 0.3 * blink);
        spins[i] = 0;
        flips[i] = 1;
      } else {
        // Falling and swinging from side to side; petals and leaves also turn and tumble as they go.
        y -= style.fall * p * time;
        x += style.sway * Math.sin(time * 0.7 * p + phase[ph]);
        z += style.sway * 0.6 * Math.cos(time * 0.55 * p + phase[ph + 1]);
        alphas[i] = 1;
        sizes[i] = style.size * sizeFactor[i];
        spins[i] = phase[ph + 2] + kind.spin * p * time;
        flips[i] = kind.flip > 0 ? 0.25 + 0.75 * Math.abs(Math.cos(kind.flip * p * time + phase[ph + 3])) : 1;
      }
      // Wherever that is in the world, drawn inside the box round the camera.
      positions[a] = x0 + wrap(x - x0, BOX.X);
      positions[a + 1] = y0 + wrap(y - y0, height);
      positions[a + 2] = z0 + wrap(z - z0, BOX.Z);
    }
    for (const attr of [positionAttribute, sizeAttribute, alphaAttribute, spinAttribute, flipAttribute]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, drawCount * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  return {
    points,
    setQuality(share) {
      drawCount = Math.ceil(count * clamp(share, 0, 1));
      geometry.setDrawRange(0, drawCount);
    },
    update,
  };
}
