// Ambient particles drifting past the train: pink petals in spring, leaves in autumn, snow in winter and
// fireflies at dusk (zones.js `particles`). Summer has none.
//
// It is one THREE.Points of up to `maxCount` particles living in a box 40 m wide, 18 m tall and 40 m long round
// the camera. Each particle has a fixed spot in the world plus its own motion (falling, swaying, wandering), and
// is drawn wherever that lands inside the box: a particle that drifts or falls out of one side comes back in
// at the other. So the train rolls through particles that stay put in the world, and the box never runs dry.
// Fireflies are the exception: they hover in a low band round her eye height and never wrap up or down. A tap in the
// evening that hits nothing scatters them (`scatterFrom`): those near the point she tapped dart away from it and
// drift back to where they were wandering over a few seconds.
//
// Nothing ever pops in or out. Particles fade out within a few metres of the eye (so none smears across the
// screen) and with distance, which hides the box's sides (all at least 20 m away, past the fade). They also
// fade out over the last EDGE_FADE metres of the top and bottom of the box (or of the fireflies' band), so a
// particle that falls out of the bottom and comes back in at the top is invisible while it does, even when
// she looks up.
//
// Between two zones the effect does not mix two kinds at once: the first fades out to nothing at the middle of
// the blend window, then the second fades in (`particleStyleAt`), and the swap happens while nothing shows.
//
// Nothing falls in the tunnel (tunnel.js): the particles fade out as she goes in and back as she comes out, with how
// far inside she is. They go on moving all the while, so they come back where they would have been.
//
// The motion is worked out on the CPU each frame (a few hundred particles); the shapes (petal, leaf, flake,
// glow) are drawn in the fragment shader, so nothing is recompiled when the kind changes.
//
// DOM-free at import time (`particleStyleAt` is pure), so the Node unit tests can import it.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, NormalBlending, Points, ShaderMaterial,
  Vector2,
} from '../three.js';
import { clamp, smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * @typedef {import('./zones.js').ParticleStyle} ParticleStyle
 * @typedef {import('./environment.js').Env} Env
 */

/** The box the particles live in (m): BOX.X by BOX.Y by BOX.Z, centred on the camera across, from BOX.BELOW under her eye up. */
const BOX = Object.freeze({ X: 40, Y: 18, Z: 40, BELOW: 3 });

/** Fireflies keep low: within this band (m) round her eye height, not up in the sky. */
const FIREFLY_BAND = Object.freeze({ BELOW: 1.7, ABOVE: 3.2 });

/** How far (m) a firefly bobs up and down; its resting height keeps this far inside its band. */
const FIREFLY_BOB = 0.5;

/** Particles fade in and out over this distance (m) from the top and bottom of the box or band. */
const EDGE_FADE = 0.6;

/**
 * How fireflies scatter from a tap: those within REACH (m) of the point are pushed straight away from it, PUSH metres
 * at the point itself and less the further off they were, over OUT seconds, and ease back over BACK seconds. Up and
 * down they go only LIFT of the way, so they keep to their band. A tap while they are still scattered starts from where
 * they are: how far out the last one had them eases back over OUT + BACK as the new push comes in, so none jumps.
 */
const SCATTER = Object.freeze({ REACH: 6, PUSH: 3, OUT: 0.4, BACK: 4, LIFT: 0.5 });

/** How far (0 to 1) the scattered fireflies are pushed out `since` seconds after the tap. */
function scattered(since) {
  if (!(since >= 0) || since >= SCATTER.OUT + SCATTER.BACK) return 0;
  if (since < SCATTER.OUT) return Math.sin((Math.PI / 2) * (since / SCATTER.OUT));
  return 0.5 + 0.5 * Math.cos((Math.PI * (since - SCATTER.OUT)) / SCATTER.BACK);
}

/** How much (0 to 1) of where an earlier scatter had them is left `since` seconds after the next tap. */
function held(since) {
  const time = SCATTER.OUT + SCATTER.BACK;
  if (!(since >= 0) || since >= time) return 0;
  return 0.5 + 0.5 * Math.cos((Math.PI * since) / time);
}

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
 *   update: (dt: number, env: Env, cameraPosition: import('../three.js').Vector3, inside?: number) => void,
 *   scatterFrom: (point: import('../three.js').Vector3, now: number) => void,
 * }}
 *   Add `points` to the scene. `setQuality` draws that share (0 to 1) of the particles: the quality tier's
 *   `particles`. Call `update` every frame with the seconds since the last one, the environment where the
 *   train is, the camera's world position and how far inside the tunnel she is (tunnel.js `tunnelInside`, 0 to 1:
 *   at 1 none show). `scatterFrom` scatters the fireflies near a point in the world at `now` (s, the clock the
 *   seconds given to `update` add up to); it does nothing unless fireflies are showing.
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

  /** What `update` changes every frame; each is uploaded whole (at most a few kilobytes). */
  const moving = [positionAttribute, sizeAttribute, alphaAttribute, spinAttribute, flipAttribute];

  let drawCount = count;
  geometry.setDrawRange(0, drawCount);
  let time = 0;
  let current = null;
  const showing = {};
  // The last scatter: when it was (s), how far (m) each firefly is pushed at its fullest, and how far out (m) an earlier
  // one still had it then.
  const push = new Float32Array(count * 3);
  const hold = new Float32Array(count * 3);
  let scatteredAt = -Infinity;

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

  function update(dt, env, cameraPosition, inside = 0) {
    time += dt;
    const { style } = particleStyleAt(env, showing);
    const opacity = showing.opacity * (1 - clamp(inside, 0, 1));
    points.visible = opacity > 0.001 && KINDS[style.kind] !== undefined;
    if (!points.visible) return;
    if (style !== current) applyStyle(style);
    uniforms.uOpacity.value = opacity;

    const kind = KINDS[style.kind];
    const fireflies = style.kind === 'fireflies';
    // The box's low corner, and how tall the box or band is that particles live in.
    const x0 = cameraPosition.x - BOX.X / 2;
    const z0 = cameraPosition.z - BOX.Z / 2;
    const y0 = cameraPosition.y - (fireflies ? FIREFLY_BAND.BELOW : BOX.BELOW);
    const height = fireflies ? FIREFLY_BAND.BELOW + FIREFLY_BAND.ABOVE : BOX.Y;
    const sizes = sizeAttribute.array;
    const alphas = alphaAttribute.array;
    const spins = spinAttribute.array;
    const flips = flipAttribute.array;
    const pushed = fireflies ? scattered(time - scatteredAt) : 0;
    const kept = fireflies ? held(time - scatteredAt) : 0;
    for (let i = 0; i < drawCount; i++) {
      const a = i * 3;
      const ph = i * 4;
      const p = pace[i];
      let x = anchor[a] * BOX.X;
      let z = anchor[a + 2] * BOX.Z;
      let up; // how far up the box or band (m), 0 to `height`
      if (fireflies) {
        // Wandering slowly in loops, bobbing within the band, and blinking.
        x += style.sway * 1.5 * Math.sin(time * 0.31 * p + phase[ph]);
        z += style.sway * 1.5 * Math.cos(time * 0.27 * p + phase[ph + 2]);
        up = FIREFLY_BOB + anchor[a + 1] * (height - 2 * FIREFLY_BOB) + FIREFLY_BOB * Math.sin(time * 0.53 * p + phase[ph + 1]);
        if (pushed > 0 || kept > 0) {
          x += push[a] * pushed + hold[a] * kept;
          up += push[a + 1] * pushed + hold[a + 1] * kept;
          z += push[a + 2] * pushed + hold[a + 2] * kept;
        }
        const blink = 0.5 + 0.5 * Math.sin(time * 1.7 * p + phase[ph + 3]);
        alphas[i] = 0.15 + 0.85 * blink * blink;
        sizes[i] = style.size * sizeFactor[i] * (0.8 + 0.3 * blink);
        spins[i] = 0;
        flips[i] = 1;
      } else {
        // Falling and swinging from side to side; petals and leaves also turn and tumble as they go. The fall is
        // in the world, so a particle that leaves the bottom of the box comes back in at the top.
        up = wrap(anchor[a + 1] * height - style.fall * p * time - y0, height);
        x += style.sway * Math.sin(time * 0.7 * p + phase[ph]);
        z += style.sway * 0.6 * Math.cos(time * 0.55 * p + phase[ph + 1]);
        alphas[i] = 1;
        sizes[i] = style.size * sizeFactor[i];
        spins[i] = phase[ph + 2] + kind.spin * p * time;
        flips[i] = kind.flip > 0 ? 0.25 + 0.75 * Math.abs(Math.cos(kind.flip * p * time + phase[ph + 3])) : 1;
      }
      // Faded in and out at the top and bottom, where it wraps.
      alphas[i] *= smoothstep(0, EDGE_FADE, up) * smoothstep(height, height - EDGE_FADE, up);
      // Wherever that is in the world, drawn inside the box round the camera.
      positions[a] = x0 + wrap(x - x0, BOX.X);
      positions[a + 1] = y0 + up;
      positions[a + 2] = z0 + wrap(z - z0, BOX.Z);
    }
    for (let k = 0; k < moving.length; k++) moving[k].needsUpdate = true;
  }

  return {
    points,
    setQuality(share) {
      drawCount = Math.ceil(count * clamp(share, 0, 1));
      geometry.setDrawRange(0, drawCount);
    },
    update,
    scatterFrom(point, now) {
      if (!points.visible || current === null || current.kind !== 'fireflies') return;
      // From where each one is drawn now: straight away from the point, the nearest the furthest.
      const { REACH, PUSH, LIFT } = SCATTER;
      // Where the last scatter has them now is where this one starts from.
      const pushed = scattered(now - scatteredAt), kept = held(now - scatteredAt);
      for (let k = 0; k < push.length; k++) hold[k] = push[k] * pushed + hold[k] * kept;
      push.fill(0);
      for (let i = 0; i < drawCount; i++) {
        const a = i * 3;
        const dx = positions[a] - point.x, dy = positions[a + 1] - point.y, dz = positions[a + 2] - point.z;
        const off = Math.hypot(dx, dy, dz);
        if (!(off < REACH)) continue;
        const share = (PUSH * (1 - off / REACH)) / Math.max(off, 1e-3);
        push[a] = dx * share;
        push[a + 1] = dy * share * LIFT;
        push[a + 2] = dz * share;
      }
      scatteredAt = now;
    },
  };
}
