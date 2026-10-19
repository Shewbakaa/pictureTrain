// The 3D ride: builds the world, then runs the frame loop that moves the train along the track, turns her head
// where she drags, and keeps the sky, fog and light in step with the scenery the train is passing through.
//
// The world is the sky, the ground, the track, the two stations, the props of every zone, clouds and hot-air
// balloons, the ambient particles of the zone the train is in, a photo sign at every stop with the two of them
// standing beside every other one, and the cabin she rides in.
//
// On top of it sits the ride UI: the intro card, a card at every stop, the timeline, the controls and the progress
// pill, with the furthest moment she has reached remembered across reloads. If the phone takes the GPU away
// mid-ride, a toast offers a fresh start. The music starts with her tap on Begin and has a button of its own.
//
// A later task adds the finale (Task 14).

import { DirectionalLight, Fog, Group, HemisphereLight, Matrix4, Vector3 } from './three.js';
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
import { createPhotoSign, placeCouple, placeSign, signLookYaw } from './world/signs.js';
import { createCouple } from './world/figures.js';
import { createCabin } from './train/cabin.js';
import { createRide } from './ride/rideController.js';
import { attachPointerControls, createLook } from './ride/look.js';
import { loadProgress, saveProgress } from './progress.js';
import { fadeThrough } from './ui/dom.js';
import { hideIntro, showIntro } from './ui/intro.js';
import { hideStopCard, showStopCard } from './ui/stopCard.js';
import { renderTimeline, timelineItems } from './ui/timeline.js';
import { initControls } from './ui/controls.js';
import { showToast } from './ui/toast.js';
import { createMusic } from './audio/music.js';

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

/**
 * Photo signs (and the couples beside them) further than this along the track from the train are not drawn (m).
 * The fog has swallowed them long before (it ends 160 m out at most), and each sign costs four draw calls.
 */
const SIGN_RANGE = 200;

/** How often the ?stats=1 readout refreshes (s). */
const STATS_EVERY = 0.5;

/** How long the blush takes to cover the screen for a jump along the timeline, and again to lift (ms). */
const JUMP_FADE_MS = 350;

/** A frame long enough for the view to finish turning (s): a jump turns her head while the screen is covered. */
const SETTLE_LOOK = 60;

const UP = new Vector3(0, 1, 0);

/**
 * @typedef {{
 *   begin: () => void, continueRide: () => void, jumpTo: (index: number) => void,
 *   togglePause: () => void, rideAgain: () => void,
 * }} App
 */

/**
 * Starts the 3D ride in `#scene`. Resolves once the first frame is on screen, so the loading screen can stay up
 * until then (the first frame compiles the shaders, which can take a moment on a phone). If building the world or
 * drawing that first frame fails, it rejects instead, having taken the canvas away again: the caller tells the
 * story another way rather than lifting the loading screen off an empty canvas.
 * @param {{ content: import('./content/normalize.js').Content, debug: ReturnType<import('./debug.js').parseDebugParams>,
 *           assets?: import('./photos/photos.js').PhotoAsset[] }} options  `assets` are the moments' photos (photos.js)
 * @returns {Promise<App|null>}  null when the browser has no WebGL2
 */
export async function startApp({ content, debug, assets = [] }) {
  const container = document.getElementById('scene');
  const stage = createStage(container, { antialias: true });
  if (!stage) return null;
  // A locked phone or one short of memory can take the GPU away, and the ride stops drawing: offer a fresh start.
  stage.onContextLost(() => {
    showToast('The ride hiccuped.', { action: { label: 'Restart', onClick: () => location.reload() } });
  });
  const listening = new AbortController(); // ends the ride's page listeners if it cannot start
  try {
    return await buildRide({ stage, container, signal: listening.signal, content, debug, assets });
  } catch (error) {
    listening.abort();
    stage.dispose();
    throw error;
  }
}

/**
 * Builds the world and the ride on `stage`, draws the first frame and wires the UI (startApp's work).
 * @param {{ stage: import('./render/stage.js').Stage, container: HTMLElement, signal: AbortSignal,
 *           content: import('./content/normalize.js').Content, debug: ReturnType<import('./debug.js').parseDebugParams>,
 *           assets: import('./photos/photos.js').PhotoAsset[] }} options  `signal` removes the page listeners it adds
 * @returns {Promise<App>}
 */
async function buildRide({ stage, container, signal, content, debug, assets }) {
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

  // A photo sign at every stop, and the two of them beside every other one.
  const signs = new Group();
  signs.name = 'signs';
  /** @type {Array<{ distance: number, group: Group, couple: ReturnType<typeof createCouple>|null }>} */
  const roadside = [];
  for (const stop of layout.stops) {
    const asset = assets.find((a) => a.index === stop.index) || null;
    const sign = createPhotoSign(asset, { date: content.moments[stop.index].date });
    placeSign(sign, path, stop);
    const group = new Group();
    group.add(sign);
    let couple = null;
    if (stop.index % 2 === 1) {
      couple = createCouple(content.characters);
      placeCouple(couple.group, path, stop, sign.userData.photoW);
      group.add(couple.group);
    }
    signs.add(group);
    roadside.push({ distance: stop.distance, group, couple });
  }
  scene.add(signs);
  // The photos go to the GPU now rather than as each sign comes into view, which would stutter the ride.
  signs.traverse((o) => { if (o.material && o.material.map) renderer.initTexture(o.material.map); });

  // Her seat: the cabin rides on the rig, laid out for the screen.
  const cabin = createCabin();
  rig.add(cabin.group);
  cabin.fit(camera);

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
  // The timeline opens every moment reached on an earlier visit too.
  const stops = layout.stops.map((stop) => stop.distance);
  const at = debug.at;
  let { reachedMax } = loadProgress(undefined, { momentCount: stops.length });
  if (at !== null) stops.forEach((distance, index) => { if (distance <= at) reachedMax = Math.max(reachedMax, index); });
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
  const resize = () => {
    stage.resize();
    cabin.fit(camera);
  };
  window.addEventListener('resize', resize, { signal });
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    signal.addEventListener('abort', () => observer.disconnect());
  }
  let lastTime = null;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    look.endDrag();  // a finger lifted while the page was away never sends its release
    lastTime = null; // the first frame back counts as no time at all
  }, { signal });
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
    cabin.update(dt, ride.speed, elapsed);
    for (const spot of roadside) {
      spot.group.visible = Math.abs(spot.distance - d) < SIGN_RANGE;
      if (spot.couple && spot.group.visible) spot.couple.update(elapsed);
    }
    stage.render();

    appState.mode = '3d';
    mirrorState();
    if (stats) updateStats(dt);
  }

  // Three asks for the next frame only after this one returns, so an error escaping a frame (a ride event handler,
  // say) would stop the ride for good. Each frame is guarded instead, and each distinct error is reported once.
  // Except the first: if that fails the ride cannot be drawn here at all, so the start fails with it.
  const reported = new Set();
  let firstFrame = null; // settles the promise below with how the first frame went; null once it has
  const firstFrameDrawn = new Promise((resolve, reject) => { firstFrame = { resolve, reject }; });
  renderer.setAnimationLoop((time) => {
    try {
      frame(time);
      if (firstFrame) firstFrame.resolve();
    } catch (error) {
      if (firstFrame) {
        firstFrame.reject(error);
      } else {
        const message = String((error && error.message) || error);
        if (!reported.has(message)) {
          reported.add(message);
          console.error('[app] A frame went wrong; the ride carries on.', error);
        }
      }
    }
    firstFrame = null;
  });
  await firstFrameDrawn;

  // The ride UI. The layout's stops are the moments in ride order, so a stop's index is its moment's index.
  const total = content.moments.length;
  const timeline = document.getElementById('timeline');
  const controls = initControls({
    onPauseToggle: () => app.togglePause(),
    onMusicToggle: () => music.toggle(),
  });
  // Her song if content.js names one, the built-in tune otherwise. It is held while the page is in the background.
  const music = createMusic({
    src: content.music,
    onChange: () => {
      appState.music = music.state;
      appState.musicSource = music.source;
      appState.audioSuspended = music.suspended;
      controls.setMusic(music.state);
    },
  });
  document.addEventListener('visibilitychange', () => music.setHidden(document.hidden), { signal });
  let jumping = false; // a timeline jump is under way: further jumps wait until it has finished

  function progressText() {
    if (ride.state === 'stopped') return `${ride.stopIndex + 1} of ${total}`;
    if (ride.nextStopIndex >= 0) return `Next stop · ${ride.nextStopIndex + 1} of ${total}`;
    return 'Next stop · Day 365';
  }

  function refreshUi() {
    controls.setProgress(progressText());
    const items = timelineItems(content.moments, { reachedMax: ride.reachedMax, currentIndex: ride.stopIndex });
    renderTimeline(timeline, items, { onJump: (index) => app.jumpTo(index) });
  }

  /** The ride is under way (after Begin, or straight away with ?at= or ?finale=): bring in the controls. */
  function enterRide() {
    appState.phase = ride.state === 'stopped' ? 'stopped' : 'riding';
    controls.setPaused(ride.paused);
    controls.setMusic(appState.music);
    controls.show();
    refreshUi();
  }

  ride.on('arrive', ({ index }) => {
    const stop = layout.stops[index];
    look.setRest(signLookYaw(stop.side));
    showStopCard(content.moments[stop.index], assets.find((a) => a.index === stop.index) || null, {
      total,
      onContinue: () => app.continueRide(),
    });
    saveProgress({ reachedMax: ride.reachedMax });
    appState.phase = 'stopped';
    refreshUi();
  });
  ride.on('depart', () => {
    appState.phase = 'riding';
    refreshUi();
  });
  ride.on('finale', () => {
    appState.phase = 'finale'; // Task 14 takes it from here
  });

  /** @type {App} */
  const app = {
    begin() {
      if (appState.phase !== 'intro') return;
      music.start(); // first, while her tap is still being handled: phones only let sound start from a tap
      hideIntro();
      ride.start();
      enterRide();
    },
    continueRide() {
      if (ride.state !== 'stopped') return;
      hideStopCard();
      // A train paused before (or at) the stop moves on when she taps Continue, rather than sitting frozen (R17).
      ride.setPaused(false);
      controls.setPaused(false);
      look.setRest(0);
      ride.continue();
    },
    jumpTo(index) {
      if (jumping || !(Number.isInteger(index) && index >= 0 && index <= ride.reachedMax)) return;
      jumping = true;
      fadeThrough(JUMP_FADE_MS, () => {
        // Under the cover the train moves to the stop, and her head turns to its sign before the screen clears.
        if (ride.jumpTo(index)) look.update(SETTLE_LOOK);
      })
        .catch((error) => console.error('[app] The jump went wrong.', error))
        .finally(() => { jumping = false; });
    },
    togglePause() {
      ride.setPaused(!ride.paused);
      controls.setPaused(ride.paused);
      // ?at= leaves the train standing where it put it: resuming sets it off from there.
      if (!ride.paused && ride.state === 'idle') ride.start();
    },
    rideAgain() {
      ride.restart();
      ride.start();
    },
  };

  if (debug.hideUi) document.getElementById('ui').hidden = true;
  if (at !== null || debug.finale) {
    // Straight onto the track, no intro: ?at= stays frozen where it is, ?finale= rides (Task 14 takes it to the end).
    if (at === null) ride.start();
    enterRide();
  } else {
    // The train waits at the Day 1 station under the intro card.
    appState.phase = 'intro';
    showIntro(content, { onBegin: () => app.begin() });
    // ?ui=0 hides the intro with the rest of the UI, so there is nothing to tap: the ride begins by itself.
    if (debug.hideUi) app.begin();
  }
  return app;
}

/** Moves `point` along the unit vector `axis` to the nearest whole multiple of `step`. */
function snapToGrid(point, axis, step) {
  const along = point.dot(axis);
  point.addScaledVector(axis, Math.round(along / step) * step - along);
}
