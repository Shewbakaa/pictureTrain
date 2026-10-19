// The 3D ride: builds the world, then runs the frame loop that moves the train along the track, turns her head
// where she drags, and keeps the sky, fog and light in step with the scenery the train is passing through.
//
// The world is the sky, the ground, the track, the two stations, the props of every zone, clouds and hot-air
// balloons, and the ambient particles of the zone the train is in.
//
// Later tasks add to it: the cabin, signs and figures (Task 10), the ride UI (Task 11), resilience (Task 12),
// music (Task 13) and the finale (Task 14).

import { DirectionalLight, Fog, HemisphereLight, Matrix4, Vector3 } from './three.js';
import { appState } from './state.js';
import { createStage } from './render/stage.js';
import { MATERIALS } from './render/materials.js';
import { createQualityGovernor, effectivePixelRatio } from './perf/quality.js';
import { buildLayout, EYE_HEIGHT } from './world/layout.js';
import { createTrackPath, TRACK } from './world/trackPath.js';
import { envAt } from './world/environment.js';
import { createSky } from './world/sky.js';
import { createTerrain } from './world/terrain.js';
import { createTrackMesh } from './world/trackMesh.js';
import { createDressing } from './world/dressing.js';
import { createStation, START_STATION_DISTANCE } from './world/stations.js';
import { createSkyDecor } from './world/skyDecor.js';
import { createAmbientParticles } from './world/particles.js';
import { createRide } from './ride/rideController.js';
import { attachPointerControls, createLook } from './ride/look.js';

/**
 * The sun's shadow (high tier only): a square HALF metres either side of a point AHEAD metres along the track
 * from her seat, drawn into a MAP_SIZE texture. The light sits DISTANCE metres towards the sun from there and
 * sees DEPTH metres deep, plenty for the long shadows of a low evening sun.
 */
const SHADOW = Object.freeze({ HALF: 25, MAP_SIZE: 1024, AHEAD: 12, DISTANCE: 80, DEPTH: 200 });

/**
 * Ambient particles at the high tier (the tier's `particles` share of them are drawn). They fill a box 40 m
 * round her, and a portrait view only sees a few percent of it, so it takes this many for a snowfall to read.
 */
const AMBIENT_PARTICLES = 600;

/** How often the ?stats=1 readout refreshes (s). */
const STATS_EVERY = 0.5;

const UP = new Vector3(0, 1, 0);

/**
 * @typedef {{
 *   begin: () => void, continueRide: () => void, jumpTo: (index: number) => void,
 *   togglePause: () => void, rideAgain: () => void,
 * }} App
 */

/**
 * Starts the 3D ride in `#scene`. Resolves once the first frame is on screen, so the loading screen can stay up
 * until then (the first frame compiles the shaders, which can take a moment on a phone).
 * @param {{ content: import('./content/normalize.js').Content, debug: ReturnType<import('./debug.js').parseDebugParams>,
 *           assets?: object[] }} options  `assets` are the loaded photos (Task 10)
 * @returns {Promise<App|null>}  null when the browser has no WebGL2
 */
export async function startApp({ content, debug, assets = [] }) {
  const container = document.getElementById('scene');
  const stage = createStage(container, { antialias: true });
  if (!stage) return null;
  const { renderer, scene, camera, rig } = stage;

  // The world.
  const layout = buildLayout(content);
  const path = createTrackPath(layout.total, TRACK.SEED, {
    straightRanges: [[0, 120], [layout.finaleDistance - 90, layout.total + 60]],
  });
  const sky = createSky();
  const terrain = createTerrain(path, layout, { seed: TRACK.SEED });
  scene.add(sky.mesh, terrain.mesh, createTrackMesh(path, layout));
  if (terrain.water) scene.add(terrain.water);
  scene.add(
    createStation({ path, distance: START_STATION_DISTANCE, kind: 'start' }),
    createStation({ path, distance: layout.finaleDistance, kind: 'finale' }),
  );
  const dressing = createDressing({ path, layout });
  const skyDecor = createSkyDecor();
  const particles = createAmbientParticles({ maxCount: AMBIENT_PARTICLES });
  scene.add(dressing.group, skyDecor.group, particles.points);

  // Light and fog, set from the environment every frame.
  const hemi = new HemisphereLight();
  const sun = new DirectionalLight();
  sun.shadow.mapSize.set(SHADOW.MAP_SIZE, SHADOW.MAP_SIZE);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW.HALF, right: SHADOW.HALF, top: SHADOW.HALF, bottom: -SHADOW.HALF, near: 1, far: SHADOW.DEPTH,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);
  scene.fog = new Fog(0xffffff, 50, 150);
  const env = envAt(layout, 0);

  // The ride. ?at= puts the train somewhere along the track and freezes it there, for looking at the scenery.
  const stops = layout.stops.map((stop) => stop.distance);
  const at = debug.at;
  let reachedMax = -1;
  if (at !== null) stops.forEach((distance, index) => { if (distance <= at) reachedMax = index; });
  const ride = createRide({
    stops, finaleDistance: layout.finaleDistance, speedScale: debug.speed, startDistance: at ?? 0, reachedMax,
  });
  if (at !== null) ride.setPaused(true);

  // Looking around. ?look= turns her head to start with (degrees, + is left).
  const look = createLook();
  look.setRest((debug.look * Math.PI) / 180);
  look.update(60);
  attachPointerControls(renderer.domElement, look);

  // Quality. Things that thin out on a slow phone register here (Task 9) and hear the new share at every change.
  const governor = createQualityGovernor({ forced: debug.quality });
  /** @type {Array<(density: number) => void>} */
  const onDensity = [];
  /** @type {Array<(particles: number) => void>} */
  const onParticles = [];
  onDensity.push(dressing.setDensity);
  onParticles.push(particles.setQuality);
  function applyTier() {
    const tier = governor.settings();
    stage.setPixelRatio(effectivePixelRatio(tier, window.devicePixelRatio));
    renderer.shadowMap.enabled = tier.shadows;
    sun.castShadow = tier.shadows;
    for (const material of Object.values(MATERIALS)) material.needsUpdate = true;
    for (const fn of onDensity) fn(tier.density);
    for (const fn of onParticles) fn(tier.particles);
  }
  applyTier();

  // The page around the canvas.
  const resize = () => stage.resize();
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(container);
  let lastTime = null;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    look.endDrag();  // a finger lifted while the page was away never sends its release
    lastTime = null; // the first frame back counts as no time at all
  });
  const stats = debug.stats ? document.getElementById('stats') : null;
  if (stats) stats.hidden = false;
  let statsTime = 0;
  let statsFrames = 0;
  let elapsed = 0; // seconds of frames drawn, for things that sway and bob

  // Per-frame scratch.
  const side = new Vector3();
  const back = new Vector3();
  const basis = new Matrix4();
  const eye = new Vector3();
  const focus = new Vector3();
  const lightRight = new Vector3();
  const lightUp = new Vector3();
  const shadowTexel = (2 * SHADOW.HALF) / SHADOW.MAP_SIZE;

  /** Her seat at `d`: EYE_HEIGHT above the track, facing along it. */
  function placeRig(d) {
    path.frameAt(d, 0, EYE_HEIGHT, rig.position);
    path.sideAt(d, side);
    path.tangentAt(d, back).negate();
    rig.quaternion.setFromRotationMatrix(basis.makeBasis(side, UP, back));
  }

  /**
   * The sun shines along env.sunDir onto a point a little ahead of her seat, which is where its shadow is drawn.
   * That point moves in whole shadow-map texels across the light, so shadow edges don't crawl as the train rolls.
   */
  function placeSun(d) {
    path.frameAt(d + SHADOW.AHEAD, 0, 0, focus);
    lightRight.crossVectors(UP, env.sunDir).normalize();
    lightUp.crossVectors(env.sunDir, lightRight);
    snapToGrid(focus, lightRight, shadowTexel);
    snapToGrid(focus, lightUp, shadowTexel);
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(env.sunDir, SHADOW.DISTANCE);
  }

  function applyEnvironment() {
    scene.fog.color.copy(env.fogColor);
    scene.fog.near = env.fogNear;
    scene.fog.far = env.fogFar;
    hemi.color.copy(env.hemiSky);
    hemi.groundColor.copy(env.hemiGround);
    hemi.intensity = env.hemiIntensity;
    sun.color.copy(env.sunColor);
    sun.intensity = env.sunIntensity;
  }

  function mirrorState() {
    appState.distance = ride.distance;
    appState.speed = ride.speed;
    appState.stopIndex = ride.stopIndex;
    appState.nextStopIndex = ride.nextStopIndex;
    appState.reachedMax = ride.reachedMax;
    appState.paused = ride.paused;
    appState.yaw = look.yaw;
    appState.quality = governor.tier;
    const { drawCalls, triangles } = stage.info();
    appState.drawCalls = drawCalls;
    appState.triangles = triangles;
  }

  function updateStats(dt) {
    statsTime += dt;
    statsFrames += 1;
    if (statsTime < STATS_EVERY) return;
    const fps = Math.round(statsFrames / statsTime);
    stats.textContent = `${fps} fps · ${appState.drawCalls} calls · ${(appState.triangles / 1000).toFixed(1)}k tris · ${governor.tier}`;
    statsTime = 0;
    statsFrames = 0;
  }

  function frame(time) {
    const dt = lastTime === null ? 0 : Math.max(0, (time - lastTime) / 1000);
    lastTime = time;
    elapsed += dt;
    ride.update(dt);
    look.update(dt);
    if (governor.sample(dt)) applyTier();

    const d = ride.distance;
    placeRig(d);
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    envAt(layout, d, env);
    applyEnvironment();
    placeSun(d);
    camera.getWorldPosition(eye);
    sky.update(env, eye);
    skyDecor.update(dt, eye, env);
    particles.update(dt, env, eye);
    dressing.update(dt, elapsed);
    stage.render();

    appState.mode = '3d';
    mirrorState();
    if (stats) updateStats(dt);
  }

  // Three asks for the next frame only after this one returns, so an error escaping a frame (a ride event handler,
  // say) would stop the ride for good. Each frame is guarded instead, and each distinct error is reported once.
  const reported = new Set();
  let firstFrameDrawn;
  const firstFrame = new Promise((resolve) => { firstFrameDrawn = resolve; });
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
    } catch (error) {
      const message = String((error && error.message) || error);
      if (!reported.has(message)) {
        reported.add(message);
        console.error('[app] A frame went wrong; the ride carries on.', error);
      }
    } finally {
      firstFrameDrawn(); // after the first frame this does nothing
    }
  });
  await firstFrame;

  return {
    begin() {
      ride.start();
    },
    continueRide() {
      ride.continue();
    },
    jumpTo(index) {
      ride.jumpTo(index);
    },
    togglePause() {
      ride.setPaused(!ride.paused);
    },
    rideAgain() {
      ride.restart();
      ride.start();
    },
  };
}

/** Moves `point` along the unit vector `axis` to the nearest whole multiple of `step`. */
function snapToGrid(point, axis, step) {
  const along = point.dot(axis);
  point.addScaledVector(axis, Math.round(along / step) * step - along);
}
