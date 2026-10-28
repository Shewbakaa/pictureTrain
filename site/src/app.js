// The 3D ride: builds the world, then runs the frame loop that moves the train along the track, turns her head
// where she drags, and keeps the sky, fog and light in step with the scenery the train is passing through.
//
// The world is the sky, the ground, the track, the two stations, the props of every zone, clouds and hot-air
// balloons, the ambient particles of the zone the train is in, a photo sign at every stop with the two of them
// standing beside every other one, and the cabin she rides in. At dusk the sky fills with stars and a crescent moon
// comes up, a shooting star crosses it 40 m before the last station and again as the finale's wish shows, and smoke
// curls from the chimneys of the houses and of the station house. The track runs through a hill into winter, and the
// world's light dims while she is in the tunnel, the world's sounds go muffled and the train's sounds echo. Birds go
// with the sounds: a flock of songbirds crosses the spring sky, gulls loop over the summer sea (one flaps and banks as
// a gull calls) and robins on the winter fences flutter off as the train comes.
//
// On top of it sits the ride UI: the intro card, a card at every stop, the timeline, the controls and the progress
// pill, with the furthest moment she has reached remembered across reloads. If the phone takes the GPU away
// mid-ride, a toast offers a fresh start. The sound starts with her tap on Begin: the music, the train's own sounds
// (whistle, steam, chugs and the rail joints' clickety-clack), which follow the ride, and each zone's ambience
// (birds, waves, leaves, wind, crickets...), which follows the scenery. The music follows the scenery too: each
// scene has a piece of its own (Chopin, and a carol in the winter hills), unless her own song plays throughout.
// A card rustles as it comes up. At the Day 365 station a bell rings as the train pulls in, and the finale has its own
// little sounds (her hop down, his door and footsteps, heartbeats, the bouquet's paper, doves), its hearts' sparkle
// and its fireworks, all hushed again as she rides again or jumps back. One Sound button turns it all on and off.
// Her tap on Begin also asks the phone to keep its screen on for the whole ride (ui/wakeLock.js).
// Her seat moves with the train: a gentle rock, a drop as each bogie strikes a rail joint, a tip as it pulls away or
// brakes (ride/trainMotion.js), all of it left out if her phone asks for less motion.
//
// At the Day 365 station the ride ends in the finale (finale/finale.js): under a blush fade her seat gives way to
// the train seen from outside, the two of them meet on the platform, and his message comes up on a card with the
// timeline below it. "Ride again" takes her back to the start; a moment on the timeline takes her back there.
// The music plays on throughout.

import { DirectionalLight, Fog, Group, HemisphereLight, Matrix4, Vector3 } from './three.js';
import { appState } from './state.js';
import { clamp } from './util/math.js';
import { createStage } from './render/stage.js';
import { MATERIALS } from './render/materials.js';
import { createQualityGovernor, effectivePixelRatio } from './perf/quality.js';
import { buildLayout, EYE_HEIGHT } from './world/layout.js';
import { createTrackPath, TRACK } from './world/trackPath.js';
import { envAt } from './world/environment.js';
import { createSky } from './world/sky.js';
import { createNightSky, shootingStarDue } from './world/nightSky.js';
import { createSmoke } from './world/smoke.js';
import { createTerrain } from './world/terrain.js';
import { followWave, SEA_MATERIAL, updateSea } from './world/seaWaves.js';
import { createTrackMesh } from './world/trackMesh.js';
import { createTunnel, tunnelInside, tunnelSpan } from './world/tunnel.js';
import { createDressing } from './world/dressing.js';
import { SWAY_LOW_MATERIAL, SWAY_MATERIAL, updateWind, windStrength } from './world/wind.js';
import { createStation, START_STATION_DISTANCE } from './world/stations.js';
import { createSkyDecor } from './world/skyDecor.js';
import { BIRD_MATERIAL, createBirds } from './world/birds.js';
import { createAmbientParticles } from './world/particles.js';
import { createPhotoSign, placeCouple, placeSign, SIGN, signLookYaw, signTurn, turnSign } from './world/signs.js';
import { createCouple } from './world/figures.js';
import { createCabin } from './train/cabin.js';
import { createTrainExterior } from './train/exterior.js';
import { createFinale } from './finale/finale.js';
import { FINALE_FADE } from './finale/finaleTimes.js';
import { createRide } from './ride/rideController.js';
import { attachPointerControls, createLook } from './ride/look.js';
import { createTrainMotion } from './ride/trainMotion.js';
import { loadProgress, saveProgress } from './progress.js';
import { fadeThrough, prefersReducedMotion } from './ui/dom.js';
import { hideIntro, showIntro } from './ui/intro.js';
import { keepAwake } from './ui/wakeLock.js';
import { hideStopCard, showStopCard } from './ui/stopCard.js';
import { hideFinaleCard, showFinaleCard } from './ui/finaleCard.js';
import { renderTimeline, timelineItems } from './ui/timeline.js';
import { initControls } from './ui/controls.js';
import { showToast } from './ui/toast.js';
import { createMusic } from './audio/music.js';
import { zonesToLoad } from './audio/zoneMusic.js';
import { createSfx } from './audio/sfx.js';
import { zoneWeights } from './audio/ambienceTiming.js';
import { createAmbience } from './audio/ambience.js';
import { createCues } from './audio/cueSounds.js';
import { createVideoDirector, videoToPlay } from './photos/videos.js';

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
/** Smallest change in a sign's turn (rad) worth re-aiming it for. */
const SIGN_TURN_EPSILON = 1e-4;

/**
 * How much of the daylight (the sky's and the sun's) is shut out deep in the tunnel, where only its lamps glow: enough
 * that the track bed reads dark, while the cabin round her stays dim but readable.
 */
const TUNNEL_DIM = 0.75;

/** How often the ?stats=1 readout refreshes (s). */
const STATS_EVERY = 0.5;

/** How long the blush takes to cover the screen for a jump along the timeline, and again to lift (ms). */
const JUMP_FADE_MS = 350;

/** A frame long enough for the view to finish turning (s): a jump turns her head while the screen is covered. */
const SETTLE_LOOK = 60;

/**
 * The blush that hides the swap from her seat to the finale (finaleTimes.js, which the finale's sounds are timed by),
 * and the one back to the start for "Ride again" (ms per half).
 */
const FINALE_FADE_MS = FINALE_FADE * 1000;
const RIDE_AGAIN_FADE_MS = 500;

const UP = new Vector3(0, 1, 0);

/**
 * @typedef {{
 *   begin: () => void, continueRide: () => void, jumpTo: (index: number) => void,
 *   togglePause: () => void, rideAgain: () => void,
 * }} App
 */

/**
 * Starts the 3D ride in `#scene`. Resolves once the first frame is on screen, so the loading screen can stay up
 * until then (every shader is compiled just before it, which can take a moment on a phone). If building the world or
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
  const span = tunnelSpan(layout); // the hill is the ground's (terrain.js); the tunnel through it is its own
  const tunnel = createTunnel(path, span);
  scene.add(sky.mesh, terrain.mesh, createTrackMesh(path, layout), tunnel.group);
  if (terrain.water) scene.add(terrain.water);
  const finaleStation = createStation({ path, distance: layout.finaleDistance, kind: 'finale' });
  scene.add(createStation({ path, distance: START_STATION_DISTANCE, kind: 'start' }), finaleStation);
  const dressing = createDressing({ path, layout });
  const skyDecor = createSkyDecor();
  const nightSky = createNightSky();
  const particles = createAmbientParticles({ maxCount: AMBIENT_PARTICLES });
  // Smoke from every house's chimney, and from the station house's.
  const smoke = createSmoke([...dressing.spots.chimneys, finaleStation.userData.chimney]);
  // Songbirds, gulls and robins, the robins on the fences and snowmen.
  const birds = createBirds({ path, perches: dressing.spots.perches });
  scene.add(dressing.group, skyDecor.group, nightSky.group, particles.points, smoke.points, birds.group);

  // A photo sign at every stop, and the two of them beside every other one.
  const signs = new Group();
  signs.name = 'signs';
  /** @type {Array<{ distance: number, group: Group, sign: Group, couple: ReturnType<typeof createCouple>|null }>} */
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
    roadside.push({ distance: stop.distance, group, sign, couple });
  }
  scene.add(signs);
  // The photos go to the GPU now rather than as each sign comes into view, which would stutter the ride.
  signs.traverse((o) => { if (o.material && o.material.map) renderer.initTexture(o.material.map); });

  // Her seat: the cabin rides on the rig, laid out for the screen.
  const cabin = createCabin();
  rig.add(cabin.group);
  cabin.fit(camera);

  // The finale at the Day 365 station, with the train seen from outside. It waits, hidden, until the ride ends.
  const finale = createFinale({ stage, path, layout, content, cabin, exterior: createTrainExterior() });

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

  // The ride. ?at= puts the train somewhere along the track and freezes it there, for looking at the scenery;
  // ?finale=1 puts it at the end, with every moment reached, so the finale plays straight away.
  // The timeline opens every moment reached on an earlier visit too.
  const stops = layout.stops.map((stop) => stop.distance);
  const at = debug.at;
  const toFinale = debug.finale && at === null;
  let { reachedMax } = loadProgress(undefined, { momentCount: stops.length });
  if (at !== null) stops.forEach((distance, index) => { if (distance <= at) reachedMax = Math.max(reachedMax, index); });
  if (toFinale) reachedMax = stops.length - 1;
  const ride = createRide({
    stops,
    finaleDistance: layout.finaleDistance,
    speedScale: debug.speed,
    startDistance: at ?? (toFinale ? layout.finaleDistance : 0),
    reachedMax,
  });
  if (at !== null) ride.setPaused(true);
  let prevD = ride.distance; // where the train was a frame ago, for the shooting star

  // Looking around. ?look= turns her head to start with (degrees, + is left).
  const look = createLook();
  look.setRest((debug.look * Math.PI) / 180);
  look.update(60);
  attachPointerControls(renderer.domElement, look);

  // The train moving under her. Her phone's wish for less motion is read once, as the ride is built.
  const motion = createTrainMotion();
  const reducedMotion = prefersReducedMotion();

  // Video moments: one clip plays at a time, the one at the stop or the nearest coming up (photos/videos.js).
  // Her tap on its speaker in the stop card turns its sound on, and the music fades out for it (wired below).
  const clips = layout.stops.map((stop) => {
    const asset = assets.find((a) => a.index === stop.index);
    return asset && asset.kind === 'video' && asset.video ? asset.video : null;
  });
  let onVideoSound = () => {};
  const director = createVideoDirector(clips, { onChange: () => onVideoSound() });
  const clipWhere = { stops: layout.stops.map((stop) => stop.distance), isVideo: clips.map(Boolean), distance: 0, stoppedIndex: -1 };
  document.addEventListener('visibilitychange', () => director.setHidden(document.hidden), { signal });

  // Quality. Things that thin out on a slow phone register here (Task 9) and hear the new share at every change.
  const governor = createQualityGovernor({ forced: debug.quality });
  /** @type {Array<(density: number) => void>} */
  const onDensity = [];
  /** @type {Array<(particles: number) => void>} */
  const onParticles = [];
  onDensity.push(dressing.setDensity, smoke.setDensity, birds.setDensity); // the smoke and the robins go with their prop
  onParticles.push(particles.setQuality, smoke.setQuality, birds.setQuality);
  function applyTier() {
    const tier = governor.settings();
    stage.setPixelRatio(effectivePixelRatio(tier, window.devicePixelRatio));
    renderer.shadowMap.enabled = tier.shadows;
    sun.castShadow = tier.shadows;
    for (const material of Object.values(MATERIALS)) material.needsUpdate = true;
    SEA_MATERIAL.needsUpdate = true;
    SWAY_MATERIAL.needsUpdate = true;
    SWAY_LOW_MATERIAL.needsUpdate = true;
    BIRD_MATERIAL.needsUpdate = true;
    for (const fn of onDensity) fn(tier.density);
    for (const fn of onParticles) fn(tier.particles);
    finale.setQuality(governor.tier);
  }
  applyTier();

  // Every shader the ride and the finale will need is compiled now, under the loading screen, hidden things
  // included: compiled the first time each came into view, they would stall the ride for a moment, often just as
  // the train pulls in at a stop. They are compiled for the starting tier, so a later step up to shadows compiles
  // its own variants then (a phone that fast takes it in its stride).
  renderer.compile(scene, camera);

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
  let seaWave = 0; // the waves come in at the beach (seaWaves.js followWave), in time with the ones she hears

  // Per-frame scratch.
  const side = new Vector3();
  const back = new Vector3();
  const basis = new Matrix4();
  const eye = new Vector3();
  const focus = new Vector3();
  const lightRight = new Vector3();
  const lightUp = new Vector3();
  const sight = new Vector3();
  const zoneShare = {};
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
    appState.tunnel = tunnelInside(span, ride.distance);
    if (ambience) {
      appState.ambience = ambience.beds;
      appState.carol = music.carol;
      appState.musicPiece = music.piece;
      appState.finaleCues = cues.heard;
    }
    appState.finaleTime = finale.active ? finale.time : null;
    if (wakeLock) appState.wakeLock = wakeLock.state;
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

  /** Hears the finale's events ('hearts', 'fireworks', 'card'); the ride UI sets it once it is up. */
  let onFinaleEvent = () => {};

  /**
   * The train's sounds (audio/sfx.js), the zones' ambience (audio/ambience.js) and the cues (audio/cueSounds.js),
   * made with the music once the ride UI is up.
   */
  let sfx = null;
  let ambience = null;
  let cues = null;
  /** The zones whose music should be loading, worked out every frame (zoneMusic.js zonesToLoad). */
  const musicNear = {};
  /** The hold on the screen, asked for at Begin (ui/wakeLock.js); null before. */
  let wakeLock = null;

  /** A shooting star across the upper half of the camera's view. */
  function shootStar() {
    camera.getWorldDirection(sight);
    const up = (camera.fov * Math.PI) / 360;
    nightSky.shoot({
      bearing: Math.atan2(sight.x, -sight.z),
      elevation: Math.asin(clamp(sight.y, -1, 1)),
      up,
      across: Math.atan(Math.tan(up) * camera.aspect),
    });
  }

  /** Metres from `d` to where the moving train stops next (a stop or the finale); Infinity when it is not moving. */
  function toStop(d) {
    if (ride.state !== 'moving') return Infinity;
    return (ride.nextStopIndex >= 0 ? stops[ride.nextStopIndex] : layout.finaleDistance) - d;
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
    if (finale.active) {
      // The finale moves the camera itself.
      for (const name of finale.update(dt)) onFinaleEvent(name);
      if (cues) cues.finale(finale.time, finale.bursts); // its own sounds, the sparkle and the fireworks, on its clock
    } else {
      camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
      // The shooting star comes where the train first reaches its place, 40 m before the Day 365 station.
      if (shootingStarDue(prevD, d, layout.finaleDistance)) {
        shootStar();
        if (sfx) sfx.play('shimmer');
      }
      prevD = d;
      if (reducedMotion) {
        camera.position.y = 0;
      } else {
        // placeRig has just set her seat afresh, so the train's motion lays itself on it without building up.
        motion.update(dt, ride.speed, d);
        rig.rotateZ(motion.roll);
        rig.rotateX(motion.pitch);
        rig.translateY(motion.lift);
        camera.position.y = motion.headLag;
      }
    }
    envAt(layout, d, env);
    const inside = tunnelInside(span, d);
    env.hemiIntensity *= 1 - TUNNEL_DIM * inside;
    env.sunIntensity *= 1 - TUNNEL_DIM * inside;
    applyEnvironment();
    tunnel.update(d);
    placeSun(d);
    camera.getWorldPosition(eye);
    sky.update(env, eye, elapsed);
    nightSky.update(dt, eye, zoneWeights(env, zoneShare).evening);
    skyDecor.update(dt, eye, env);
    particles.update(dt, env, eye, inside); // nothing falls in the tunnel
    smoke.update(dt, eye);
    birds.update(dt, env, eye, d);
    dressing.update(dt, elapsed);
    updateWind(elapsed, windStrength(env));
    cabin.update(dt, ride.speed, elapsed);
    if (terrain.water) {
      seaWave = followWave(seaWave, dt, sfx ? ambience.seaWave() : NaN);
      updateSea(elapsed, seaWave, d);
    }
    if (sfx) {
      sfx.update(ride.speed, d, dt, toStop(d), inside);
      ambience.update(env, look.yaw, dt, d);
      music.setZones(ambience.weights, zonesToLoad(layout.zones, d, musicNear)); // each scene's own music
    }
    for (const spot of roadside) {
      spot.group.visible = Math.abs(spot.distance - d) < SIGN_RANGE;
      if (!spot.group.visible) continue;
      // Each sign keeps turning toward her as she comes, and is square-on when she stops beside it.
      const turn = signTurn(spot.distance + SIGN.AHEAD - d);
      if (Math.abs(turn - spot.sign.userData.turn) > SIGN_TURN_EPSILON) turnSign(spot.sign, turn);
      if (spot.couple) spot.couple.update(elapsed);
    }
    clipWhere.distance = d;
    clipWhere.stoppedIndex = ride.state === 'stopped' ? ride.stopIndex : -1;
    director.play(videoToPlay(clipWhere));
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
  // Her song if content.js names one, each scene's own music otherwise, and the train's sounds beside it. All of it
  // is held while the page is in the background, and fades out while a video or Live Photo plays with its sound.
  const music = createMusic({
    src: content.music,
    onChange: () => {
      appState.music = music.state;
      appState.musicSource = music.source;
      appState.audioSuspended = music.suspended;
      controls.setMusic(music.state);
    },
  });
  sfx = createSfx(music);
  sfx.setTunnel(span);
  ambience = createAmbience(sfx);
  ambience.onEvent((name) => { if (name === 'gull') birds.gullCall(); }); // the gull she hears is one she can see
  cues = createCues(sfx);
  document.addEventListener('visibilitychange', () => music.setHidden(document.hidden), { signal });
  onVideoSound = () => {
    appState.videoSound = director.sound;
    music.setDucked(director.sound);
  };
  let jumping = false; // a timeline jump (or "Ride again") is under way: further ones wait until it has finished

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

  /**
   * The ride is under way (after Begin, straight away with ?at= or ?finale=, or again after the finale): she is in
   * her seat, and the controls come in with the progress pill and the timeline up to date.
   */
  function enterRide() {
    appState.phase = ride.state === 'stopped' ? 'stopped' : 'riding';
    appState.view = 'cabin';
    controls.setPaused(ride.paused);
    controls.setMusic(appState.music);
    controls.show();
    refreshUi();
  }

  /** From the finale back to her seat (under a fade): the cabin, the camera on her seat, no card. */
  function leaveFinale() {
    finale.reset();
    motion.reset(); // it stood still through the finale, and "Ride again" starts the train from the Day 1 station
    cabin.fit(camera);
    hideFinaleCard();
    appState.view = 'cabin';
  }

  // The finale's card comes up over the fireworks, with the timeline below it to go back to any moment. (Its sounds,
  // the hearts' sparkle among them, keep to its clock: cues.finale in the frame loop.)
  onFinaleEvent = (name) => {
    if (name !== 'card' || !finale.active) return;
    // The wish shows: another shooting star, and its shimmer on the finale's own bus, which Ride again hushes at once.
    shootStar();
    cues.wish();
    appState.phase = 'done';
    showFinaleCard(content, { onRideAgain: () => app.rideAgain() });
    const items = timelineItems(content.moments, { reachedMax: ride.reachedMax, currentIndex: -1 });
    renderTimeline(timeline, items, { onJump: (index) => app.jumpTo(index) });
    controls.showTimeline();
  };

  ride.on('arrive', ({ index, jumped }) => {
    // The train sighs as it stands at the stop; a jump puts it there silently, under the blush.
    if (!jumped) sfx.arrive();
    const stop = layout.stops[index];
    look.setRest(signLookYaw(stop.side));
    // A video moment's clip starts again from the top as the card comes up (it may have been playing on the way in).
    director.play(clips[index] ? index : -1);
    director.restart();
    cues.card(); // a quiet rustle as the card slides up
    showStopCard(content.moments[stop.index], assets.find((a) => a.index === stop.index) || null, {
      total,
      onContinue: () => app.continueRide(),
      onSound: (on) => {
        director.setSound(on);
        return director.sound;
      },
      // A Live Photo she taps plays with its sound: all sound fades out for it and comes back when it ends.
      onLiveSound: (on) => {
        appState.videoSound = on;
        music.setDucked(on);
      },
    });
    saveProgress({ reachedMax: ride.reachedMax });
    appState.phase = 'stopped';
    refreshUi();
    mirrorState(); // at once, not at the next frame, so the state agrees with the card that has just come up
  });
  ride.on('depart', () => {
    // A clip's sound goes off first: that brings the rest of the sound back, and the whistle waits for it.
    director.setSound(false);
    sfx.depart();
    appState.phase = 'riding';
    refreshUi();
  });
  ride.on('finale', () => {
    // The train has pulled in at the Day 365 station: under a blush, her seat gives way to the scene outside.
    sfx.finale();
    cues.arrival(); // the station bell rings, and the finale's own sounds are ready
    appState.phase = 'finale';
    appState.view = 'finale';
    director.play(-1);
    hideStopCard();
    controls.hide();
    look.endDrag();
    fadeThrough(FINALE_FADE_MS, () => {
      finale.begin();
      // ?ft= shows one instant of the finale, held still.
      if (debug.ft !== null) {
        finale.skipTo(debug.ft);
        finale.freeze(true);
      }
    }).catch((error) => console.error('[app] The finale could not start.', error));
  });

  /** @type {App} */
  const app = {
    begin() {
      if (appState.phase !== 'intro') return;
      music.start(); // first, while her tap is still being handled: phones only let sound start from a tap
      wakeLock = keepAwake(); // the screen stays on for the ride, and the hold is asked for again whenever the page returns
      hideIntro();
      ride.start();
      sfx.depart(); // the whistle waits the moment it takes the browser to let the sound run
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
      if (jumping || appState.phase === 'finale') return;
      if (!(Number.isInteger(index) && index >= 0 && index <= ride.reachedMax)) return;
      jumping = true;
      const fromFinale = appState.phase === 'done';
      if (fromFinale) cues.silence(); // the fireworks and the rest of the finale hush as the blush comes over
      fadeThrough(JUMP_FADE_MS, () => {
        // The train reached the end while the screen was covered: the finale goes on instead.
        if (appState.phase === 'finale') return;
        if (fromFinale) {
          leaveFinale();
          controls.show();
        }
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
      if (jumping || appState.phase !== 'done') return;
      jumping = true;
      cues.silence(); // the fireworks and the rest of the finale hush as the blush comes over
      fadeThrough(RIDE_AGAIN_FADE_MS, () => {
        // Back to the Day 1 station under the cover, in her seat, looking ahead, and off again (R31).
        leaveFinale();
        ride.restart();
        ride.setPaused(false);
        ride.start();
        sfx.depart();
        look.setRest(0);
        look.update(SETTLE_LOOK);
        enterRide();
      })
        .catch((error) => console.error('[app] Riding again went wrong.', error))
        .finally(() => { jumping = false; });
    },
  };

  if (debug.hideUi) document.getElementById('ui').hidden = true;
  if (at !== null || debug.finale) {
    // Straight onto the track, no intro: ?at= stays frozen where it is, ?finale= pulls in at the end at once.
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
