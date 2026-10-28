// What hangs in the evening sky besides the stars (sky.js): a thin crescent moon, low over the town, and a shooting
// star now and again.
//
// The moon is a quad that always faces the camera, with the crescent drawn by its fragment shader (the lit share of
// the disc and a soft glow round it), so it costs one draw call and a few corners. It stays at a fixed place in the
// sky, out ahead and to the left, because it moves with the camera like the clouds (skyDecor.js) and so never comes
// any closer. Neither it nor the streak is fogged: out here the fog would swallow them into the horizon, and the
// sky sphere (sky.js, drawn first, with no depth of its own) is all there is behind them. How strongly the moon
// shows is how much of the evening zone is showing.
//
// A shooting star is one streak across the upper half of her view, in STREAK_SECONDS: a thin quad stretched between
// its tail and its head, with a bright head and a tail that fades. One comes about 40 m before the last station, where
// the train first crosses that point (`shootingStarDue`), and one at the finale, as the wish shows. Each is shot into
// the view the camera has then (`shoot`): in the finale that is a close view of the two of them with only a strip of
// sky over them, and the star crosses that strip.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it.

import { Color, Group, Matrix4, Mesh, PlaneGeometry, Quaternion, ShaderMaterial, Vector3 } from '../three.js';
import { smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';

/**
 * The moon: its `BEARING` (rad from straight ahead, - towards the left), `ELEVATION` (rad above the horizon), its
 * `DISTANCE` (m from the camera) and `RADIUS` (m), and its `PHASE` (the share of its disc that is lit: a thin
 * crescent). `STAR_BEFORE_FINALE`: how far (m) before the Day 365 station the shooting star comes. `STREAK_SECONDS`:
 * how long a shooting star lasts.
 */
export const NIGHT_SKY = Object.freeze({
  MOON: Object.freeze({ BEARING: -0.45, ELEVATION: (14 * Math.PI) / 180, DISTANCE: 300, RADIUS: 7, PHASE: 0.28 }),
  STAR_BEFORE_FINALE: 40,
  STREAK_SECONDS: 0.9,
});

/** The moon's quad reaches this many moon radii from its middle, so that the glow round it has room. */
const MOON_REACH = 2.4;
/** How far (rad) the crescent is turned, so that its lit side is towards the low sun to the left. */
const MOON_TILT = 0.5;
const MOON_COLOUR = '#fff1c9';

/**
 * A shooting star: it runs, `OUT` m from the camera, across the upper half of the view and falling as it goes. It
 * starts a share within START of the way from the middle of the view up to its top edge and ends within END of it, and
 * it crosses ACROSS of the way from the middle out to either side. (Each is a range it picks from.) It keeps at least
 * MIN_ELEVATION (rad) above the horizon, where the haze is. The tail is `TAIL` of the way it has gone behind the head;
 * the streak is `WIDTH` m wide. Each comes the other way round from the last.
 */
const STREAK = Object.freeze({
  OUT: 280,
  START: [0.78, 0.92],
  END: [0.42, 0.58],
  ACROSS: [0.6, 0.9],
  MIN_ELEVATION: (4 * Math.PI) / 180,
  TAIL: 0.32,
  WIDTH: 2.4,
  FADE_IN: 0.08,   // s
  FADE_OUT: 0.65,  // the share of its life when it starts to fade away
});
const STREAK_COLOUR = '#f4f7ff';
const SEED = 77;

/**
 * Whether the train has just come to the shooting star's place: 40 m before the finale, going forwards. True once,
 * for the step that first takes it from before that point to at or past it. A step backwards, or one longer than
 * 24 m (a jump along the timeline, not driving), is never it.
 * @param {number} fromD  where the train was (m along the track)
 * @param {number} toD  where it is
 * @param {number} finaleDistance
 */
export function shootingStarDue(fromD, toD, finaleDistance) {
  const at = finaleDistance - NIGHT_SKY.STAR_BEFORE_FINALE;
  return toD > fromD && toD - fromD <= 24 && fromD < at && at <= toD;
}

const moonVertexShader = /* glsl */ `
uniform float uHalfSize;
varying vec2 vPlace;

void main() {
  vPlace = position.xy;
  // Always square on to the camera: the quad's corners are laid out in view space round its middle.
  vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  centre.xy += position.xy * uHalfSize;
  gl_Position = projectionMatrix * centre;
}
`;

const moonFragmentShader = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
uniform float uPhase;
uniform float uReach;
uniform float uTilt;
varying vec2 vPlace;

void main() {
  // In moon radii from its middle, turned so that the lit side is where we want it.
  vec2 p = vPlace * uReach;
  float c = cos(uTilt), s = sin(uTilt);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float r = length(p);
  float edge = max(fwidth(r), 0.02);

  float disc = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
  // The lit part lies to the left of the terminator, half an ellipse bulging left from the disc's middle by 1 - 2 phase
  // of its radius: a thin crescent when the phase is small, a half at 0.5.
  float terminator = -(1.0 - 2.0 * uPhase) * sqrt(max(1.0 - p.y * p.y, 0.0));
  float lit = disc * (1.0 - smoothstep(terminator - edge, terminator + edge, p.x));
  // The dark side is only just there, and a soft glow spreads round the whole of it.
  float dark = disc * 0.03;
  float glow = 0.3 * pow(max(1.0 - r / uReach, 0.0), 2.5);

  float alpha = clamp(lit + dark + glow, 0.0, 1.0) * uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColour, alpha);
  #include <colorspace_fragment>
}
`;

const streakVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const streakFragmentShader = /* glsl */ `
uniform vec3 uColour;
uniform float uAlpha;
uniform float uLength;
varying vec2 vUv;

void main() {
  float along = vUv.x;                       // 0 at the tail, 1 at the head
  float across = abs(vUv.y - 0.5) * 2.0;     // 0 along the middle, 1 at the edges
  float thin = pow(1.0 - across, 1.5);
  // A tail that thickens to the head, and a bright point at the head itself.
  float tail = pow(along, 1.8) * thin;
  float tip = exp(-pow((1.0 - along) * uLength / 3.0, 2.0)) * (1.0 - across * across);
  float alpha = clamp(tail + tip, 0.0, 1.0) * uAlpha;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColour, alpha);
  #include <colorspace_fragment>
}
`;

/**
 * The view a shooting star is shot into, from the camera: the way it looks, `bearing` (rad from straight down -Z, +
 * towards +X) and `elevation` (rad above level), and how far its view reaches from there, `up` (rad, half its height)
 * and `across` (rad, half its width). Left out, it is a portrait phone's, looking straight ahead and level.
 * @typedef {{ bearing?: number, elevation?: number, up?: number, across?: number }} View
 */
const PORTRAIT_VIEW = Object.freeze({ bearing: 0, elevation: 0, up: (40 * Math.PI) / 180, across: 0.37 });

/**
 * @returns {{
 *   group: Group,
 *   update: (dt: number, cameraPosition: Vector3, evening: number) => void,
 *   shoot: (view?: View) => void,
 * }}
 *   Add `group` to the scene and call `update` every frame with the seconds since the last one, the camera's world
 *   position and how much of the evening zone is showing (0 to 1). `shoot` sends a shooting star across the upper half
 *   of `view`.
 */
export function createNightSky() {
  const group = new Group();
  group.name = 'night-sky';
  const rng = createRng(SEED);
  const { MOON } = NIGHT_SKY;

  // The moon.
  const moonMaterial = new ShaderMaterial({
    uniforms: {
      uColour: { value: new Color(MOON_COLOUR) },
      uOpacity: { value: 0 },
      uPhase: { value: MOON.PHASE },
      uReach: { value: MOON_REACH },
      uTilt: { value: MOON_TILT },
      uHalfSize: { value: MOON.RADIUS * MOON_REACH },
    },
    vertexShader: moonVertexShader,
    fragmentShader: moonFragmentShader,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const moon = new Mesh(new PlaneGeometry(2, 2), moonMaterial);
  moon.name = 'night-moon';
  moon.frustumCulled = false; // it moves with the camera, and its corners are laid out in the shader
  moon.visible = false;
  group.add(moon);
  const moonWay = new Vector3(
    Math.sin(MOON.BEARING) * Math.cos(MOON.ELEVATION),
    Math.sin(MOON.ELEVATION),
    -Math.cos(MOON.BEARING) * Math.cos(MOON.ELEVATION),
  );

  // The shooting star.
  const streakMaterial = new ShaderMaterial({
    uniforms: {
      uColour: { value: new Color(STREAK_COLOUR) },
      uAlpha: { value: 0 },
      uLength: { value: 1 },
    },
    vertexShader: streakVertexShader,
    fragmentShader: streakFragmentShader,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const streak = new Mesh(new PlaneGeometry(1, 1), streakMaterial);
  streak.name = 'night-streak';
  streak.frustumCulled = false;
  streak.visible = false;
  group.add(streak);

  // Where the current streak runs: from (bearing, elevation) `from` to `to`, and how long it has been going.
  let going = false;
  let age = 0;
  let side = 1;
  const from = { bearing: 0, elevation: 0 };
  const to = { bearing: 0, elevation: 0 };

  const head = new Vector3();
  const tail = new Vector3();
  const middle = new Vector3();
  const toCamera = new Vector3();
  const along = new Vector3();
  const up = new Vector3();
  const facing = new Vector3();
  const basis = new Matrix4();
  const turn = new Quaternion();

  /** The point STREAK.OUT m from `camera` on the way `share` (0 to 1) of the way along the current streak. */
  function pointOn(share, camera, out) {
    const bearing = from.bearing + (to.bearing - from.bearing) * share;
    const elevation = from.elevation + (to.elevation - from.elevation) * share;
    const flat = Math.cos(elevation) * STREAK.OUT;
    return out.set(camera.x + Math.sin(bearing) * flat, camera.y + Math.sin(elevation) * STREAK.OUT, camera.z - Math.cos(bearing) * flat);
  }

  function update(dt, cameraPosition, evening) {
    moon.visible = evening > 0.001;
    moonMaterial.uniforms.uOpacity.value = evening;
    moon.position.copy(cameraPosition).addScaledVector(moonWay, MOON.DISTANCE);

    if (going) age += dt;
    if (age >= NIGHT_SKY.STREAK_SECONDS) going = false;
    const share = Math.min(age / NIGHT_SKY.STREAK_SECONDS, 1);
    const alpha = going
      ? evening * smoothstep(0, STREAK.FADE_IN, age) * (1 - smoothstep(STREAK.FADE_OUT, 1, share))
      : 0;
    streak.visible = alpha > 0;
    streakMaterial.uniforms.uAlpha.value = alpha;
    if (!going) return;

    // The head has gone `share` of the way, and the tail follows it TAIL of the way behind.
    pointOn(share, cameraPosition, head);
    pointOn(Math.max(share - STREAK.TAIL, 0), cameraPosition, tail);
    const length = head.distanceTo(tail);
    if (length < 1e-3) return;
    middle.addVectors(head, tail).multiplyScalar(0.5);
    // Laid along the way it goes, its face to the camera.
    along.subVectors(head, tail).divideScalar(length);
    toCamera.subVectors(cameraPosition, middle).normalize();
    up.crossVectors(toCamera, along).normalize();
    facing.crossVectors(along, up);
    streak.position.copy(middle);
    streak.quaternion.copy(turn.setFromRotationMatrix(basis.makeBasis(along, up, facing)));
    streak.scale.set(length, STREAK.WIDTH, 1);
    streakMaterial.uniforms.uLength.value = length;
  }

  function shoot(view = PORTRAIT_VIEW) {
    const { bearing, elevation, up, across } = { ...PORTRAIT_VIEW, ...view };
    // Across the middle of her view, one time from the right and the next from the left, falling as it goes.
    side = -side;
    const reach = across * rngRange(rng, ...STREAK.ACROSS);
    from.bearing = bearing + side * reach;
    to.bearing = bearing - side * reach;
    from.elevation = Math.max(elevation + up * rngRange(rng, ...STREAK.START), STREAK.MIN_ELEVATION);
    to.elevation = Math.max(elevation + up * rngRange(rng, ...STREAK.END), STREAK.MIN_ELEVATION);
    going = true;
    age = 0;
  }

  return { group, update, shoot };
}
