# Immersion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the anniversary train ride feel physical, alive and personal. This plan builds the 13 approved
features:
- the screen stays awake;
- a sound hint on the first screen;
- the train rocks and bumps;
- creatures;
- wind;
- a night sky and chimney smoke;
- a tunnel into winter;
- his voice note at the finale;
- the message written by hand;
- a boarding ticket;
- hidden taps;
- tilt to look;
- the two of them, with pets, at every stop.

**Architecture:** Each feature lives in its own small module. Pure, DOM-free logic (timing, paths, sizing,
pose angles) sits apart from its Three.js or DOM shell, so the Node unit tests can import it. `app.js` only
wires the modules together. Shader effects patch three.js's own Lambert shaders through `onBeforeCompile`, as
`world/seaWaves.js` already does. New sounds are synthesized one-shots registered with `sfx.define` within the
40-node budget.

**Tech Stack:**
- Three.js r170 (vendored, through `site/src/three.js`) and Web Audio.
- Plain ES modules with no bundler.
- Node `node:test` unit tests and Playwright e2e tests (iphone/WebKit and android/Chromium projects).
- `@fontsource` fonts, vendored by `scripts/vendor.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-27-immersion-design.md` (approved 2026-10-27). Read it with this plan:
the spec says what and why, this plan says where and with which names.

## Global Constraints

**Platform and structure**
- Safari 15 is the feature floor. Newer APIs (`navigator.wakeLock`, `DeviceOrientationEvent.requestPermission`,
  `Intl.Segmenter`, CSS `mask`) are feature-detected, and the page works without them.
- Static ES modules with relative URLs. No new runtime dependency. The one new dev dependency is
  `@fontsource/dancing-script` at exactly `5.3.0`, which the author approved.
- Pure modules stay DOM-free at import, so `node --test` can import them.
- Everything is built in code: low-poly geometry, vertex colours, no textures or models. Colours are '#rrggbb'
  sRGB hex.

**Performance**
- `tests/e2e/budget.spec.js` must hold everywhere on the high tier: at most 100 draw calls and 250 000
  triangles. The tunnel's 570 m is added to its list.
- Quality tiers (`perf/quality.js` TIERS) thin the new things. Creatures follow the `particles` share; smoke
  follows `particles`; cottages follow `density`.

**Sound**
- The 40-node budget (`NODE_BUDGET`, `audio/sfx.js`) holds at peak. New one-shots go through
  `sfx.define`/`sfx.play` and are governed by the Sound button.
- Levels: ticket punch about −24 dBFS peak; tap sounds about −24 dBFS peak; shooting-star shimmer about −30 dBFS
  peak; tunnel echo about −10 dB under the dry train sound.

**Content and accessibility**
- New content fields are optional, defaulted and validated with `[content.js]` warnings, as in
  `content/normalize.js`:
  - `intro.hint` ('' gives the default line, 'none' hides it);
  - `finale.voice` ('' means none);
  - `moments[i].pose` (default 'holding-hands');
  - `pets` (default 'random').
- `prefers-reduced-motion: reduce` turns off the train motion (#3), the ticket punch and the handwriting
  (they fade instead). Scenery motion stays.
- Every new control is a real `<button>` with an accessible name. Toggles use `aria-pressed`.

**Tests and commits**
- Every task ends with `npm test` all green, and the e2e specs it touches green on both Playwright projects.
- Commit messages are Conventional Commits, as in the repo's history, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Prefix shell commands with `rtk` (CLAUDE.md).

## Review Focus

1. **The author reorders or drops zones.** Winter first, winter missing, or no summer. The tunnel moves to the
   boundary nearest the ride's middle, or is left out. Creatures appear only where their zone is. Nothing throws.
   Tests: Task 6 (`tunnelSpan` with reordered and missing zones) and Task 8 (birds with a layout without summer).
2. **A timeline jump or "Ride again" lands mid-effect.** That means mid-tunnel, mid-voice-note or mid-reaction.
   The jump is no bump or lurch. The voice stops and the sound comes back. The echo is released. Tests: Task 3
   (a jump resets the motion), Task 7 (the echo releases on a jump) and Task 18 (Ride again stops the voice).
3. **The page goes into the background mid-ride.** The wake lock is asked for again on return. The voice note
   pauses rather than playing in the background. Tilt events stop. Tests: Task 2 (re-request on visible), Task 18
   (the voice pauses on hidden) and Task 15 (tilt pauses on hidden).
4. **A drag that comes back to where it started.** It is not a tap: the furthest point counts, not the net move.
   A tap on a card or a button never reaches the world. Tests: Task 13 (`isTap` with a round-trip path, and the
   e2e check that a tap on the stop card is not a world tap).
5. **She turns the phone to landscape while tilt is on.** The view stays level and "straight ahead" stays ahead.
   Test: Task 15 (`deviceLook` with `screenAngle` 90 and 270).

---

## Task 0: Branch and paperwork (controller, not a subagent)

- [ ] **Step 1:** `rtk git checkout -b feature/immersion` from `main`. Main has the uncommitted snap-back change:
  `site/src/ride/look.js` RETURN_DELAY 4, plus `tests/unit/look.test.js` and `tests/e2e/render.spec.js`.
- [ ] **Step 2:** Commit the snap-back change: `fix: the view waits 4 s before it eases back ahead`.
- [ ] **Step 3:** Commit the spec and this plan: `docs: immersion design and build plan`.

---

### Task 1: Content fields

**Files:**
- Modify: `site/src/content/normalize.js` (`readMoments`, `normalizeContent` and the `Content` typedef)
- Modify: `site/content.js` (documentation comments only; the new fields are optional and left out of the moment
  blocks, documented like `live`)
- Modify: `README.md` (new sections "Voice note", "Poses and pets" and "The sound hint")
- Modify: `tests/fixtures/content.fixture.js` (no new fields; the defaults must hold)
- Test: `tests/unit/normalize.test.js`

**Interfaces:**
- Produces, on `Content`:
  - `content.intro.hint: string`, which is the default line, or '' when hidden;
  - `content.finale.voice: string`, a site path or '';
  - `content.moments[i].pose: Pose`;
  - `content.pets: 'random'|'dog'|'cat'|'none'`.
- Produces `POSES` (frozen array) and the `Pose` type: `'holding-hands'|'waving'|'hug'|'sitting'|'dancing'|
  'pointing'|'none'`, exported from `normalize.js` so `world/poses.js` imports the list from one place.
- Produces `DEFAULT_HINT = 'Best with sound on and headphones in.'`.

- [ ] **Step 1: Write the failing tests** in `tests/unit/normalize.test.js`:

```js
test('the sound hint: a default line, your own, or none', () => {
  assert.equal(normalizeContent({}).content.intro.hint, 'Best with sound on and headphones in.');
  assert.equal(normalizeContent({ intro: { hint: 'Headphones!' } }).content.intro.hint, 'Headphones!');
  assert.equal(normalizeContent({ intro: { hint: 'none' } }).content.intro.hint, '');
});
test('the voice note is an audio file in the site folder, or nothing', () => {
  const read = (voice) => normalizeContent({ finale: { voice } });
  assert.equal(read('').content.finale.voice, '');
  assert.equal(read('voice/message.m4a').content.finale.voice, 'voice/message.m4a');
  assert.equal(read('/voice/a.mp3').content.finale.voice, 'voice/a.mp3');
  const notAudio = read('voice/message.jpg');
  assert.equal(notAudio.content.finale.voice, '');
  assert.match(notAudio.warnings.join('\n'), /finale\.voice/);
});
test('each moment has a pose, holding hands unless it says otherwise', () => {
  const { content, warnings } = normalizeContent({ zones: ['spring', 'evening'], moments: [
    { zone: 'spring' }, { zone: 'spring', pose: 'hug' }, { zone: 'evening', pose: 'cartwheel' },
  ] });
  assert.deepEqual(content.moments.map((m) => m.pose), ['holding-hands', 'hug', 'holding-hands']);
  assert.match(warnings.join('\n'), /Moment 3 pose/);
});
test('pets: random unless dog, cat or none', () => {
  assert.equal(normalizeContent({}).content.pets, 'random');
  assert.equal(normalizeContent({ pets: 'cat' }).content.pets, 'cat');
  assert.equal(normalizeContent({ pets: 'hamster' }).content.pets, 'random');
});
```

- [ ] **Step 2:** Run `rtk node --test tests/unit/normalize.test.js`. Expected: the 4 new tests FAIL.
- [ ] **Step 3: Implement the fields in `normalize.js`.**
  - Audio extensions: `.m4a .mp3 .aac .wav`, case-insensitive.
  - Voice warning: `finale.voice: "<path>" is not an audio file (.m4a, .mp3, .aac or .wav), so there is no voice
    note.`
  - Pose warning: `Moment N pose: "<x>" is not one of holding-hands, waving, hug, sitting, dancing, pointing or
    none, so they hold hands.`
  - Pets warning: name the four values.
  - Document each field in `site/content.js`, in the voice of the existing comments.
  - The `finale.voice` comment says: export a Voice Memo from an iPhone with Share → Save to Files (`.m4a`), put
    it in `site/voice/`, and write `'voice/<name>.m4a'`.
- [ ] **Step 4:** Run `rtk npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: content fields for the hint, his voice note, poses and pets`.

---

### Task 2: The screen stays awake, and the sound hint

**Files:**
- Create: `site/src/ui/wakeLock.js`
- Modify: `site/src/app.js` (`app.begin`), `site/src/ui/intro.js` (`showIntro`), `site/styles.css` (`#intro`),
  `site/src/state.js` (adds `wakeLock`)
- Test: `tests/unit/wakeLock.test.js`, `tests/e2e/immersion.spec.js` (new; later tasks add to it)

**Interfaces:**
- Produces `keepAwake({ nav = navigator, doc = document } = {}) → { readonly state: 'held'|'none'|'refused'|'off' }`:
  - It requests `nav.wakeLock.request('screen')` at once, which must be inside the Begin tap.
  - It requests again on every `visibilitychange` to visible.
  - Without `nav.wakeLock`, `state` is 'none'. A rejected request gives 'refused'.
- `appState.wakeLock` mirrors `state`.

- [ ] **Step 1: Write the failing tests.**

```js
test('asks for the screen at once, and again whenever the page comes back', async () => {
  const asked = [];
  const doc = fakeDocument(); // { hidden, addEventListener, fire(type) }
  const nav = { wakeLock: { request: async (type) => { asked.push(type); return { addEventListener() {} }; } } };
  const lock = keepAwake({ nav, doc });
  await tick();
  assert.deepEqual(asked, ['screen']);
  assert.equal(lock.state, 'held');
  doc.hidden = true; doc.fire('visibilitychange'); await tick();
  doc.hidden = false; doc.fire('visibilitychange'); await tick();
  assert.deepEqual(asked, ['screen', 'screen']);
});
test('no Wake Lock API: nothing happens', () => assert.equal(keepAwake({ nav: {}, doc: fakeDocument() }).state, 'none'));
test('a refused request is not an error', async () => {
  const lock = keepAwake({ nav: { wakeLock: { request: () => Promise.reject(new Error('battery')) } }, doc: fakeDocument() });
  await tick();
  assert.equal(lock.state, 'refused');
});
```

  E2E in `tests/e2e/immersion.spec.js`:
  - Use `page.addInitScript` to stub `navigator.wakeLock.request` and record its calls.
  - Load with `useFixture`, tap `.intro-begin`, and expect one 'screen' request. `appState.wakeLock` is 'held'.
  - The intro shows `.intro-hint` with "Best with sound on and headphones in.".
  - With `useFixture(page, { intro: { hint: 'none' } })`, `.intro-hint` has count 0.

- [ ] **Step 2:** Run both. Expected: FAIL.
- [ ] **Step 3:** Implement `keepAwake`. `app.begin()` calls it right after `music.start()`.
  - `showIntro` adds `p.intro-hint` under the Begin button when `content.intro.hint` is set: an inline-SVG
    headphones icon (`aria-hidden`), then the text.
  - Style it small, in the muted ink colour.
- [ ] **Step 4:** Run `rtk npm test` and `rtk npx playwright test tests/e2e/immersion.spec.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: the screen stays awake for the ride, and the intro suggests headphones`.

---

### Task 3: The train moves under her

**Files:**
- Create: `site/src/ride/trainMotion.js`
- Modify: `site/src/app.js` (the frame, after `placeRig(d)` and only when `!finale.active`; `leaveFinale`)
- Test: `tests/unit/trainMotion.test.js`

**Interfaces:**
- Consumes `jointCrossed(from, to)`, `bogieDelay(speed)` and `TRAIN` from `audio/sfxTiming.js`, and
  `RIDE.CRUISE` (6.5 m/s).
- Produces `TRAIN_MOTION`, frozen:

  | Constant | Value |
  |---|---|
  | `ROLL` | 0.0061 rad (0.35°) |
  | `ROLL_RATE` | 0.5 Hz |
  | `WANDER` | 0.3 of ROLL at 0.13 Hz |
  | `BUMP` | 0.004 m |
  | `BUMP_HZ` | 9 |
  | `BUMP_DAMPING` | 0.35 |
  | `PITCH` | 0.0087 rad (0.5°) at full acceleration |
  | `PITCH_HZ` | 1.6 |
  | `PITCH_DAMPING` | 0.45 |
  | `HEAD_LAG` | 0.3 |

- Produces `createTrainMotion() → { update(dt, speed, distance): void, reset(): void, readonly roll, readonly
  pitch, readonly lift, readonly headLag }`:
  - `roll` and `pitch` are in rad. `pitch > 0` tilts the view up: she tips back as the train pulls away.
  - `lift` is in m and is ≤ 0 during a bump.
  - `headLag` is the camera's own y offset in m, so the dashboard jolts a hair.
- In the frame, when `!finale.active && !reducedMotion`:
  `rig.rotateZ(motion.roll); rig.rotateX(motion.pitch); rig.translateY(motion.lift); camera.position.y = motion.headLag;`
- Otherwise `camera.position.y = 0`. Reduced motion is `prefersReducedMotion()` from `ui/dom.js`, read once.

- [ ] **Step 1: Write the failing tests.**

```js
test('still at a standstill', () => {
  const m = createTrainMotion();
  for (let i = 0; i < 120; i++) m.update(1 / 60, 0, 100);
  assert.equal(m.roll, 0); assert.equal(m.lift, 0); assert.equal(m.pitch, 0);
});
test('rocks gently at cruise, never past ROLL', () => { /* 20 s at 6.5 m/s: max |roll| ≤ ROLL·1.3 and > ROLL·0.5 */ });
test('two dips for each rail joint, one per bogie', () => {
  // ride from 10 m over the joint at 12 m at cruise; count the minima of lift below -BUMP/4 within 0.6 s: 2
});
test('pulling away tips her back, braking tips her forward, then it settles', () => {
  // speed ramps 0→6.5 over 3 s: max pitch > 0; then 6.5→0 over 2 s: min pitch < 0; then 5 s still: |pitch| < 1e-4
});
test('a jump along the track is no bump and no lurch', () => {
  const m = createTrainMotion();
  m.update(1 / 60, 6.5, 100); m.update(1 / 60, 0, 445); // a 345 m jump, speed straight to 0
  for (let i = 0; i < 30; i++) m.update(1 / 60, 0, 445);
  assert.ok(Math.abs(m.pitch) < 1e-6 && m.lift === 0);
});
```

- [ ] **Step 2:** Run `rtk node --test tests/unit/trainMotion.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Bumps are a damped spring kicked by each bogie. The second kick is queued `bogieDelay(speed)` later.
  - Acceleration is measured from `speed` and fed to a second damped spring.
  - A frame whose distance moves backwards, or more than `TRAIN.MAX_HOP`, calls `reset()`.
  - `leaveFinale` and `rideAgain` also call `motion.reset()`.
- [ ] **Step 4:** Run `rtk npm test`. Then `rtk npx playwright test tests/e2e/render.spec.js tests/e2e/ride.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: the train rocks and bumps over the rail joints under her`.

---

### Task 4: Wind in the foliage

**Files:**
- Create: `site/src/world/wind.js`
- Modify: `site/src/world/dressing.js` (the swaying types use `SWAY_MATERIAL`), `site/src/app.js` (applyTier
  marks `SWAY_MATERIAL.needsUpdate`; the frame calls `updateWind(elapsed, windStrength(env))`)
- Test: `tests/unit/wind.test.js`

**Interfaces:**
- Produces `SWAYING_TYPES` (Set): tree_round, tree_autumn, pine, pine_snowy, palm, bush, bush_autumn,
  flower_patch, grass_tuft.
- Produces `WIND`, frozen:
  - `STRENGTH: { spring: 0.6, summer: 1, autumn: 1.2, winter: 0.2, evening: 0.3 }`;
  - `BEND: 0.06` (m of sway at REF_HEIGHT and strength 1);
  - `REF_HEIGHT: 4` (m);
  - `RATE: 1.3` rad/s;
  - `GUST: { EVERY: 23, LENGTH: 40, SPEED: 9 }`. Gusts roll along -Z at SPEED m/s, LENGTH m long, one every
    EVERY m on average.
- Produces `windStrength(env) → number`: blended by `env.zoneA`, `env.zoneB` and `env.t`, like
  `particleStyleAt`.
- Produces `swayAt(height, time, x, z, strength) → { x, z }`: the JS mirror of the shader.
  - The weight is `(max(height, 0) / REF_HEIGHT)²`, capped at 1.6.
  - The phase comes from the instance's world x, z.
- Produces `SWAY_MATERIAL`: a `MeshLambertMaterial({ vertexColors: true })`, name 'sway'.
  - `onBeforeCompile` adds uniforms `uWindTime` and `uWindStrength`.
  - It reads the instance's translation from `instanceMatrix[3]` and offsets `transformed.xz` by the `swayAt`
    formula, using local `position.y` as the height.
  - `customProgramCacheKey` is 'sway'.
- Produces `updateWind(time, strength)`.

- [ ] **Step 1: Write the failing tests.**
  - The base never moves: `swayAt(0, t, x, z, 1)` is {0, 0} for many t.
  - The canopy moves most: |sway| at 4 m is greater than at 1 m.
  - Neighbours differ: the same t at x and x + 3 gives different sway.
  - Winter is barely moving: `windStrength` of an env fully in winter is 0.2. Blended halfway between summer and
    winter, it is 0.6.
  - The shader patch matches the pattern in `seaWaves.test.js`: run `onBeforeCompile` on
    `ShaderLib.lambert`. Then assert the vertex shader contains `uWindStrength` and `#include <begin_vertex>`
    followed by the sway, and that the cache key is 'sway'.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** In `createDressing`, a mesh whose `type` is in `SWAYING_TYPES` is made with
  `SWAY_MATERIAL`. The shadow depth material may stay unpatched.
- [ ] **Step 4:** Run `rtk npm test` and `rtk npx playwright test tests/e2e/budget.spec.js`. Expected: PASS.
  Check it by eye: `?at=300&ui=0` (summer palms) and `?at=100&ui=0` (spring) at phone size.
- [ ] **Step 5:** Commit: `feat: trees, grass and flowers sway in the breeze`.

---

### Task 5: Stars, the moon, shooting stars and chimney smoke

**Files:**
- Modify: `site/src/world/sky.js` (stars in the fragment shader)
- Create: `site/src/world/nightSky.js` (the moon and shooting stars) and `site/src/world/smoke.js`
- Modify: `site/src/world/props.js`:
  - a new type `cottage_snowy`, a house with a white snow cap on its roof;
  - `chimneyTop(type, variant) → [x, y, z] | null`.
- Modify: `site/src/world/zones.js` (winter gains `propRule('cottage_snowy', 0.006, 25, 45)`)
- Modify: `site/src/world/dressing.js` (returns `spots.chimneys: Vector3[]`)
- Modify: `site/src/world/stations.js` (the finale station's group gets `userData.chimney`, its chimney top in
  world space, when it has a house)
- Modify: `site/src/app.js`
- Create: `site/src/audio/tapSounds.js`, registered in `createSfx` (created here with 'shimmer'; Tasks 13, 14 and
  16 add to it)
- Test: `tests/unit/nightSky.test.js`, `tests/unit/smoke.test.js`, `tests/unit/props.test.js`,
  `tests/unit/sky.test.js`

**Interfaces:**
- `createSky().update(env, cameraPosition, time = 0)` gains:
  - uniform `stars` = `zoneWeights(env).evening` (`audio/ambienceTiming.js`);
  - uniform `starTime`.
  - The stars are hashed cells on the view direction. There are none below `up < 0.12`, they are denser towards
    the zenith, and they twinkle slowly.
- Produces `NIGHT_SKY`, frozen:

  | Constant | Value |
  |---|---|
  | `MOON` | bearing −0.45 rad (ahead-left), elevation 14°, distance 300 m, radius 7 m, crescent phase 0.28 |
  | `STAR_BEFORE_FINALE` | 40 m |
  | `STREAK_SECONDS` | 0.9 |

- Produces `shootingStarDue(fromD, toD, finaleDistance) → boolean`: true once when the train first crosses
  `finaleDistance − STAR_BEFORE_FINALE` going forwards. A jump (backwards, or more than 24 m) never triggers it.
- Produces `createNightSky() → { group, update(dt, cameraPosition, evening), shoot(): void }`.
  - The moon is a camera-facing quad with a crescent drawn by its shader. It is not fogged, and its opacity is
    `evening`.
  - `shoot()` starts one streak ahead of the camera, in the upper half of the view.
- Produces `createSmoke(chimneys: Vector3[], { maxPuffs = 160 }) → { points, setQuality(share), update(dt,
  cameraPosition) }`.
  - Only chimneys within 120 m emit, one puff every 0.8 s each.
  - A puff rises 0.6 m/s, drifts 0.3 m/s towards +X, grows from 0.4 to 1.6 m, and fades out over 6 s.
  - Soft round sprites, not additive.
- Sounds: `tapSounds.js` exports `createTapSounds(kit) → { shimmer(at) }`, defined as `sfx.define('shimmer',
  { gap: 2, play })`.
- In the app:
  - the frame calls `sky.update(env, eye, elapsed)`;
  - on `shootingStarDue(prevD, d, layout.finaleDistance)`, call `nightSky.shoot()` and `sfx.play('shimmer')`;
  - on the finale's 'card' event, do the same again.

- [ ] **Step 1: Write the failing tests.**
  - `shootingStarDue(900, 921, 960)` is true. `(921, 925, 960)` is false. `(400, 921, 960)` is false (a jump).
  - `(921, 900, 960)` is false.
  - `chimneyTop('house', v)` returns a point above the roof for every variant: y > the wall height.
  - `chimneyTop('rock', 0)` is null.
  - `createPropGeometry('cottage_snowy')` has white (#f4f7fb-ish) vertices high on the roof.
  - Smoke: `createSmoke([new Vector3(0, 5, 0)])`. After 3 s of updates with the camera at the origin, some puffs
    are above y = 5 and none above 5 + 0.6·6 + 0.1. With the camera 200 m away, no new puffs.
  - Sky: the fragment shader includes `uniform float stars`. `update` with an all-evening env gives
    `uniforms.stars.value === 1`, and a spring env gives 0.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The app adds `nightSky.group` and `smoke.points`.
  - The smoke's chimneys are `[...dressing.spots.chimneys, finaleStation.userData.chimney]`.
  - `onParticles.push(smoke.setQuality)`.
  - Tune the shimmer to −30 dBFS peak, measured the way `tests/e2e/audioLevels.spec.js` does.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/budget.spec.js tests/e2e/audioLevels.spec.js`.
  Expected: PASS. Check by eye: `?at=900&look=20&ui=0` (stars and moon) and `?at=640&ui=0` (winter cottages and
  smoke).
- [ ] **Step 5:** Commit: `feat: stars, a crescent moon and shooting stars at dusk, and chimney smoke`.

---

### Task 6: The tunnel into winter — the place and the world

**Files:**
- Create: `site/src/world/tunnel.js`
- Modify: `site/src/world/terrain.js`:
  - `terrainHeight(d, offset, { water, tunnel })`, where `tunnel` is the span or null;
  - `createTerrain` passes `tunnelSpan(layout)`.
- Modify: `site/src/world/dressing.js` (no props with `d` inside `[from − 10, to + 10]`)
- Modify: `site/src/app.js` (adds the tunnel; the frame scales `env.hemiIntensity` and `env.sunIntensity` by
  `1 − 0.6·inside` after `envAt`)
- Modify: `site/src/state.js` (adds `tunnel`: how far inside, 0–1)
- Modify: `tests/e2e/budget.spec.js` (adds 570 m)
- Test: `tests/unit/tunnel.test.js`, `tests/unit/terrain.test.js`

**Interfaces:**
- Produces `TUNNEL`, frozen:

  | Constant | Value |
  |---|---|
  | `MAX_LENGTH` | 60 |
  | `STOP_CLEAR` | 25 |
  | `HALF_WIDTH` | 3.2 (inside) |
  | `HEIGHT` | 4.6 (inside, above the rails' ground) |
  | `WALL` | 1.2 (thickness) |
  | `EASE` | 8 (m of portal over which `inside` eases 0→1) |
  | `LAMP_EVERY` | 7 |
  | `MOUND` | 7.5 (m of hill above the rails' ground over the tunnel) |

- Produces `tunnelSpan(layout) → { from, to, boundary } | null`.
  - The boundary is the start of the winter zone when winter is not first.
  - Otherwise it is the boundary nearest `layout.total / 2`, never the last boundary (the one into evening).
  - The span is centred on the boundary and at most MAX_LENGTH long. It keeps STOP_CLEAR m clear of every stop
    and must cover `boundary ± LAYOUT.BLEND / 2`. Otherwise it is null.
- Produces `tunnelInside(span, d) → 0..1`: `smoothstep(from, from + EASE, d) · (1 − smoothstep(to − EASE, to,
  d))`, and 0 for a null span.
- Produces `createTunnel(path, span) → { group, update(d) }`:
  - A shell swept along `path` (walls and an arched roof, unlit with baked dark stone vertex colours inside).
  - Stone portal arches at both ends, on `MATERIALS.solid`.
  - Warm lamps every LAMP_EVERY m on `MATERIALS.glow` with halos.
  - An additive white exit-glow quad over the far portal opening, fading in over the last 25 m inside.
  - `group` is empty for a null span.
- `terrainHeight` with a span: past FLAT, the ground rises to MOUND over the span, easing over 12 m before
  `from` and after `to`, so the hill meets the portals. Within FLAT it is still exactly 0.

- [ ] **Step 1: Write the failing tests.**

```js
const layoutOf = (zones, perZone = 2) => buildLayout(normalizeContent({ zones, moments: zones.flatMap((z) =>
  Array.from({ length: z === 'evening' ? 2 : perZone }, () => ({ zone: z }))) }).content);
test('default ride: into winter at 570 m, 540–600', () => {
  assert.deepEqual(tunnelSpan(layoutOf(['spring', 'summer', 'autumn', 'winter', 'evening'])), { from: 540, to: 600, boundary: 570 });
});
test('winter first: the boundary nearest the middle, never into evening', () => {
  const layout = layoutOf(['winter', 'spring', 'summer', 'autumn', 'evening']);
  const span = tunnelSpan(layout);
  const ends = layout.zones.slice(0, -2).map((z) => z.end);
  assert.ok(ends.includes(span.boundary));
  assert.notEqual(span.boundary, layout.zones.at(-2).end);
});
test('no winter: still a tunnel; only spring and evening: none', () => {
  assert.ok(tunnelSpan(layoutOf(['spring', 'summer', 'evening'])));
  assert.equal(tunnelSpan(layoutOf(['spring', 'evening'])), null);
});
test('the span stays clear of every stop and covers the blend window', () => { /* for several layouts */ });
test('inside: 0 outside, 1 in the middle, eased at the portals', () => { /* 539→0, 570→1, 544 in (0,1) */ });
```

  `terrain.test.js`:
  - With the default span, `terrainHeight(570, 0, { tunnel })` is 0 and `terrainHeight(570, 10, { tunnel })` is
    ≥ 6.
  - `terrainHeight(400, 10, { tunnel })` equals `terrainHeight(400, 10)`.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Sweep the shell's cross-sections along the curved path. You may export `sweep` from `trackMesh.js`, or
    write a small sweep in `tunnel.js`.
  - `appState.tunnel` is `tunnelInside(span, d)`.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/budget.spec.js tests/e2e/ride.spec.js`.
  Expected: PASS. Check by eye at `?at=520`, `?at=560` and `?at=596` with `&ui=0`: the portal in the hillside,
  the lamps going by, the light at the end.
- [ ] **Step 5:** Commit: `feat: a tunnel through a hill hides the change into winter`.

---

### Task 7: The tunnel's sound

**Files:**
- Modify: `site/src/audio/mixer.js` (a `train` bus into effects; a low-pass `BiquadFilter` between the
  ambience bus and the master, at 20 kHz by default)
- Modify: `site/src/audio/sfx.js` (`Kit.buses.train`; `createKit` exposes `mixer.setMuffle`)
- Modify: `site/src/audio/trainSounds.js` (`out = kit.buses.train`)
- Create: `site/src/audio/tunnelEcho.js`
- Modify: `site/src/audio/sfx.js` `update(...)` (takes `inside` as a 5th argument)
- Modify: `site/src/app.js`
- Test: `tests/unit/tunnelEcho.test.js`, `tests/unit/sfx.test.js`, `tests/e2e/audioLevels.spec.js`

**Interfaces:**
- `createMixer(ctx)` also returns:
  - `train: GainNode`, gain 1, into `effects`;
  - `setMuffle(amount: 0..1)`, which ramps the ambience low-pass from 20 000 Hz down to 700 Hz at 1, with a
    0.15 s time constant.
- Produces `ECHO`, frozen:

  | Constant | Value |
  |---|---|
  | `DELAY` | 0.11 s |
  | `FEEDBACK` | 0.38 |
  | `TONE` | 2400 Hz (low-pass in the loop) |
  | `SEND` | 0.32, so the wet path is about −10 dB under dry |
  | `NODES` | 4 |
  | `NEAR` | 40 m |

- Produces `createTunnelEcho(kit) → { update(inside: number, near: boolean): void, release(): void, readonly
  held: boolean }`.
  - The chain (send gain → delay ⇄ feedback gain → low-pass → effects) is built with `kit.hold(ECHO.NODES)` when
    `near` becomes true and there is room. If there isn't, no echo.
  - It is released (disconnected, `kit.release`) when `near` is false.
  - The send's gain follows `inside`.
- `sfx.update(speed, distance, seconds, toStop, inside = 0)`:
  - Drives the echo, with `near` meaning within `ECHO.NEAR` m of the span.
  - Calls `mixer.setMuffle(inside)`.
  - Plays 'whistle' once when the moving train crosses `from − 15` going forwards.
  - The app passes `tunnelInside(span, d)` and knows the span. `sfx.setTunnel(span)` is called once after the
    sfx is created.

- [ ] **Step 1: Write the failing tests.**
  - Use the kit stub pattern from `tests/unit/sfx.test.js`.
  - The echo holds 4 nodes near the tunnel and gives them back away from it.
  - With a kit at 38 of 40 it holds nothing, and `held` is false.
  - A jump (inside to far away in one update) releases it.
  - `sfx.setTunnel({ from: 540, to: 600 })`, then moving updates from 520 to 530 at 6.5 m/s, plays 'whistle'
    once. Doing it again after a jump back before 525 plays it again.
  - E2E in `audioLevels.spec.js`, following its OfflineAudioContext pattern: the train sound measured at 570 m
    has an echo tail. Its energy 120–300 ms after a click is ≥ 6 dB above the same window at 400 m. Peak nodes
    are still ≤ 40.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/audioLevels.spec.js tests/e2e/ambienceLevels.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: the train echoes in the tunnel and the outside goes muffled`.

---

### Task 8: Birds — flocks, gulls and robins

**Files:**
- Create: `site/src/world/birds.js`
- Modify: `site/src/audio/ambience.js` (`onEvent`)
- Modify: `site/src/world/dressing.js` (`spots.perches`: fence tops and snowman heads in world space)
- Modify: `site/src/app.js`
- Test: `tests/unit/birds.test.js`, `tests/unit/ambience.test.js`

**Interfaces:**
- Produces `birdGeometry(kind: 'songbird'|'gull'|'robin'|'dove') → BufferGeometry`, made of merged parts with a
  float attribute `wing`:
  - 0 on the body;
  - ±(0..1) on the left and right wing, growing towards the tip.
- Produces `BIRD_MATERIAL`, a `MeshLambertMaterial({ vertexColors: true })` patched in `onBeforeCompile`:
  - uniform `uBirdTime`;
  - instanced attribute `aFlap` (vec3: phase, rate in Hz, amount 0–1);
  - wing vertices rotate about the body's long axis (z) by `amount · 0.9 · sin(2π·rate·t + phase) · |wing|`, with
    the sign by side;
  - cache key 'birds'.
- Produces `BIRDS`, frozen:

  | Constant | Value |
  |---|---|
  | `FLOCK` | 6 birds, crossing every 14–30 s at 40–70 m up and 60–120 m ahead, 9 m/s |
  | `GULLS` | 4 gulls looping at 14–35 m over the sea side (left), loop radius 12–25 m, glide speed 6 m/s, flapping 20 % of the time |
  | `ROBINS` | 3 robins, perched within 2–60 m ahead of the camera, flying off when the train is within 9 m |

- Produces these pure functions:
  - `flockPlace(flock, time, out: Vector3) → boolean`: false between crossings.
  - `gullPlace(gull, time, out)`.
  - `gullBank(sinceCall: number) → number`: a bank angle in rad. It is 0 before the call, peaks at 0.6 around
    0.4 s, and settles by 2 s.
  - `robinLeave(distanceToTrain: number) → 0..1`: how far through its take-off a robin is.
- Produces `createBirds({ layout, path, perches }) → { group, update(dt, env, cameraPosition, d), setQuality(share),
  gullCall(), targets: Tappable[] }`.
  - It is one `InstancedMesh` per kind on `BIRD_MATERIAL`, with `frustumCulled = false`.
  - Each kind shows by zone weight (`zoneWeights(env)`): flocks in spring at full rate and in autumn at half
    rate, gulls in summer, robins in winter.
  - `targets` is empty until Task 14 fills it.
- Ambience: `createAmbience(sfx).onEvent(fn: (name: string) => void)` hears each event as it plays. The app calls
  `birds.gullCall()` on 'gull'. With sound off, the gulls bank on their own random clock.

- [ ] **Step 1: Write the failing tests.**
  - `birdGeometry('gull')` has a `wing` attribute with values in [−1, 1]. The body's vertices are 0. Both signs
    are present.
  - Shader patch: the vertex shader contains `aFlap` and `uBirdTime`, and the cache key is 'birds'.
  - `gullBank(-1) === 0`, `gullBank(0.4) > 0.5` and `|gullBank(3)| < 0.01`.
  - A flock crosses: over 60 s, `flockPlace` is true for at least one stretch, and its x moves across from one
    side to the other.
  - `robinLeave(20) === 0`, `robinLeave(9) > 0` and `robinLeave(0) === 1`.
  - Zones: `createBirds` on a layout without summer shows no gulls anywhere; their instance count is 0 at every
    `d`. (Review Focus 1.)
  - Ambience: a test using its existing stubs sees `onEvent` hear 'gull' when the gull clock fires.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `onParticles.push(birds.setQuality)`.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/budget.spec.js`. Expected: PASS.
  Check by eye: `?at=280&look=40&ui=0` (gulls) and `?at=120&look=0&ui=0` (a flock passing within 30 s).
- [ ] **Step 5:** Commit: `feat: songbirds, gulls and robins to go with the sounds`.

---

### Task 9: Butterflies and deer

**Files:**
- Create: `site/src/world/butterflies.js` and `site/src/world/deer.js`
- Modify: `site/src/app.js`
- Test: `tests/unit/butterflies.test.js`, `tests/unit/deer.test.js`

**Interfaces:**
- Butterflies reuse `BIRD_MATERIAL`, with a butterfly geometry from `birdGeometry`'s parts approach and its own
  `wing` attribute.
  - Produces `createButterflies({ maxCount = 14 }) → { mesh, update(dt, env, cameraPosition), setQuality(share) }`.
  - They live in a 30 × 4 × 30 m box round the camera, 0.3–1.6 m above the ground, wrapping like
    `particles.js`.
  - They show by the spring weight. None come nearer than 2.5 m to the eye.
  - None come within 2 m of a photo sign's spot (`avoidSpots(layout)`, sign entries only), so none flutter in
    front of a photo.
  - Colours: '#fdfdf7', '#f9e27a' and '#a9c8f0'. Flapping at 6–9 Hz with wandering paths.
- Produces `DEER = { SPOTS: [0.3, 0.7], OFFSET: [14, 18], HEAD_UP: 0.55 }`:
  - SPOTS are shares of the autumn zone's length;
  - the sides alternate, the first on the right;
  - HEAD_UP is in rad.
- Produces `deerHeadLift(along: number) → 0..1`: the head comes up as the train comes within 35 m, and is fully
  up by 12 m.
- Produces `createDeer({ layout, path }) → { group, update(dt, d, time), targets: Tappable[] }`.
  - Each deer is two meshes: the body, and the head with neck on a pivot. Both on `MATERIALS.solid`.
  - It stands on `terrainHeight`.
  - There is no deer when the ride has no autumn.

- [ ] **Step 1: Write the failing tests.**
  - `deerHeadLift(80) === 0`, `deerHeadLift(12) === 1`, and it is monotonic in between.
  - `createDeer` on the default layout makes 2 deer inside the autumn zone, standing on the ground (y within
    0.05 m of `terrainHeight`). Without autumn, it makes 0.
  - Butterflies, over 10 s of updates in a full-spring env: none within 2.5 m of the camera, and none within 2 m
    of a sign spot. All are between 0.3 and 1.6 m above the ground plane y = 0, with the camera at y = 2.05. In
    a winter env, `mesh.count === 0`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `onParticles.push(butterflies.setQuality)`.
- [ ] **Step 4:** Run `rtk npm test` and `rtk npx playwright test tests/e2e/budget.spec.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: butterflies over the meadow and deer at the forest edge`.

---

### Task 10: The two of them at every stop, posed

**Files:**
- Modify: `site/src/world/figures.js`. `Pose` gains optional fields, all in rad:
  - `leftArmOut`, `rightArmOut` (raised sideways, added to `ARM_SPREAD`);
  - `headTurn` (yaw);
  - `sit` (hips 0 to 1: lowered by 0.2 m, legs forward 1.4 rad).
- Create: `site/src/world/poses.js` and `site/src/world/stopCouple.js`
- Modify: `site/src/world/signs.js`: `placeCouple(couple, path, stop, photoW, halfWidth = COUPLE_HALF_WIDTH)`
- Modify: `site/src/app.js`:
  - every stop whose pose is not 'none' gets `createStopCouple`;
  - their visibility range is `COUPLE_RANGE = 120` m;
  - the comment at the top of app.js is updated.
- Test: `tests/unit/poses.test.js`, `tests/unit/figures.test.js`, `tests/unit/signs.test.js`

**Interfaces:**
- Consumes `POSES` from `content/normalize.js`.
- Produces `coupleLayout(pose) → { her: { x, z, turn }, him: { x, z, turn }, bench: boolean, halfWidth: number }`.
  `x` and `z` are in m in the couple's frame (facing +Z). `turn` is a yaw in rad.
  - holding-hands is today's layout: ±0.26 apart, facing +Z.
  - hug: 0.16 apart, facing each other (±π/2).
  - sitting: on a bench (the `bench` prop) 0.3 m behind.
  - dancing: facing each other, 0.3 apart.
  - pointing: her turned 0.6 rad towards the sign's side.
  - waving: side by side.
- Produces `posesAt(pose, time) → { her: Pose, him: Pose, spin: number }`: pure, with idle loops.
  - Everyone breathes with a bob of 0.012 m every 1.8 s.
  - holding-hands keeps today's gentle swing.
  - waving raises one arm out (2.5 rad) and waves it ±0.35 rad at 1.4 Hz.
  - hug puts both arms forward at 1.2 rad and leans the heads together.
  - dancing turns the couple slowly (`spin` 0.5 rad/s), with a sway.
  - pointing raises her near arm forward at 1.3 rad, with his head turned towards the sign.
- Produces `wavedAt(sinceTap) → 0..1`: the tap reaction for Task 14. The pair wave for 2 s. A couple already
  waving instead has him spin her once.
- Produces `createStopCouple(characters, pose, pet = null) → { group, update(time), react(now), halfWidth }`.
  - It uses `createFigure` twice, plus the bench mesh if needed.
  - `pet` is filled in Task 11; null for now.

- [ ] **Step 1: Write the failing tests.**
  - For every pose in `POSES` except 'none', `posesAt(pose, t)` gives finite numbers for every field over 10 s.
  - waving: `max(rightArmOut) > 2.2`.
  - sitting: `sit === 1`.
  - hug: `coupleLayout('hug').her.turn` is −π/2 and `him.turn` is π/2 (facing each other).
  - `coupleLayout('sitting').bench === true`, and its `halfWidth` ≥ the bench's half-length.
  - Figures: `setPose({ ...IDLE_POSE, leftArmOut: 1 })` sets `parts.leftArm.rotation.z` to `ARM_SPREAD + 1`.
    Leaving the field out keeps today's behaviour.
  - Signs: `placeCouple` with a larger `halfWidth` stands the couple further ahead, so the sign is still never
    hidden. This extends the existing check in `signs.test.js`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/budget.spec.js tests/e2e/ride.spec.js`.
  Expected: PASS. Check by eye: a fixture with all six poses at `?at=<each stop>&ui=0`.
- [ ] **Step 5:** Commit: `feat: the two of them stand at every stop, posed for the moment`.

---

### Task 11: Dogs and cats

**Files:**
- Create: `site/src/world/pets.js`
- Modify: `site/src/world/stopCouple.js` (the pet sits at their feet, 0.45 m in front, between them)
- Modify: `site/src/finale/finale.js` (one pet trots out of the station house beside him, 0.5 m to his right
  and 0.3 m behind, matching his walk, then sits at their feet)
- Modify: `site/src/app.js`, `site/src/state.js` (`finalePets`)
- Test: `tests/unit/pets.test.js`, `tests/e2e/finale.spec.js`

**Interfaces:**
- Produces `PET_COATS`, frozen:
  - `dog`: `[['#c8924f', '#f3e3c8'], ['#3a302b', '#f1ece4'], ['#f2e6d0', '#d9b88f'], ['#8a5a3b', '#e8cfa8']]`
  - `cat`: `[['#f0a35e', '#fff3e2'], ['#2f2c33', '#ffffff'], ['#9a9aa3', '#e9e9ee'], ['#efe7da', '#c9a27e']]`
  - Each pair is the coat and its markings.
- Produces `petFor(index: number, setting: 'random'|'dog'|'cat'|'none', seed = 365) → { kind: 'dog'|'cat', coat:
  [string, string] } | null`.
  - It is seeded, so the same index always gives the same pet.
  - 'random' mixes the kinds. Index −1 is the finale's.
- Produces `createPet({ kind, coat }) → { group, update(time), react(now) }`.
  - Low-poly, about 0.35 m tall: body, head and ears (pointed for a cat, floppy for a dog), legs, and a tail on
    its own pivot.
  - Idle: a tail wag (a dog's fast, a cat's slow swish) and a head turn every 3–6 s.
  - `react` is a happy hop (and a spin for a dog).
  - It is two meshes: the body, and the tail.

- [ ] **Step 1: Write the failing tests.**
  - `petFor(3, 'random')` deep-equals `petFor(3, 'random')`.
  - Over indices 0–9, 'random' gives at least 2 dogs and 2 cats.
  - `petFor(0, 'none') === null`.
  - `petFor(5, 'cat').kind === 'cat'`.
  - Every coat is a pair of '#rrggbb'.
  - `createPet` builds a group about 0.3–0.45 m tall (its bounding box), with at most 2 meshes.
  - E2E `finale.spec.js`: at `?finale=1&ft=7.5&ui=0` with the fixture, the finale scene has one object named
    `pet-*`. With `useFixture(page, { pets: 'none' })` it has none. Expose the count as
    `appState.finalePets`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The stop couples get `petFor(stop.index, content.pets)`.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/finale.spec.js tests/e2e/budget.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: a little dog or cat at every stop and at the finale`.

---

### Task 12: Doves at the finale

**Files:**
- Modify: `site/src/world/birds.js` (`createDoves`)
- Modify: `site/src/finale/finale.js`, `site/src/app.js`, `site/src/state.js` (`finaleDoves`: how many doves are
  showing)
- Test: `tests/unit/birds.test.js`, `tests/e2e/finale.spec.js`

**Interfaces:**
- Produces `dovesAt(t: number, i: number, out: Vector3) → { visible: boolean, flap: number }`. It is pure, in
  the finale station's frame `[along, right, up]` (`finale.js` describes it).
  - Before `FINALE_TIMES.fireworks`, they sit on the station house's roof ridge.
  - At `fireworks` (the same time as `FOLEY_CUES` 'doves') they burst up and out.
  - They circle away over 6 s and are gone (`visible` false) by `fireworks + 6`.
- Produces `createDoves(count = 5) → { mesh, update(t) }`, one `InstancedMesh` on `BIRD_MATERIAL`.
- `finale.js` adds the doves' mesh, positioned in the station frame, and updates it from its own clock, so
  `skipTo` shows any moment.

- [ ] **Step 1: Write the failing tests.**
  - `dovesAt(FINALE_TIMES.fireworks - 0.1, 0, v)` is visible on the roof (up ≥ the house roof height).
  - At `fireworks + 1` it is higher and moving away.
  - At `fireworks + 6.5` it is not visible.
  - The take-off time equals the 'doves' cue time in `FOLEY_CUES`.
  - E2E: at `?finale=1&ft=9&ui=0`, `appState.finaleDoves` is 5 visible doves.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/finale.spec.js tests/e2e/budget.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: doves fly off the station roof as the fireworks start`.

---

### Task 13: Taps — finding what she tapped, the whistle cord and the lantern

**Files:**
- Create: `site/src/ride/taps.js`
- Modify: `site/src/ride/look.js`: `attachPointerControls(element, look, { onTap } = {})`. A release within
  `TAP.SLOP` px of the furthest point travelled, measured from the down point, and within `TAP.TIME` ms calls
  `onTap(clientX, clientY)`. The drag is unchanged.
- Modify: `site/src/train/cabin.js`:
  - a whistle cord hanging from the roof at the top left (a new `cabinAnchors(...).cord`), as its own small mesh
    on a pivot;
  - `pullCord(now)` and `flareLantern(now)` animations, run in `update`;
  - `targets: Tappable[]` for the cord and the lantern.
- Modify: `site/src/audio/tapSounds.js` (adds `lantern`: a soft warm whoosh)
- Modify: `site/src/app.js` (wires `onTap` → `pickTarget` → `target.react(elapsed)`, with the cooldown)
- Modify: `site/src/state.js` (adds `lastTap`: the name of the last target hit, or null)
- Test: `tests/unit/taps.test.js`, `tests/unit/look.test.js`, `tests/e2e/immersion.spec.js`

**Interfaces:**
- Produces `TAP = { SLOP: 10, TIME: 350, MIN_ANGLE: 0.06, COOLDOWN: 1.5 }`. SLOP is in px, TIME in ms,
  MIN_ANGLE in rad, COOLDOWN in s.
- Produces the `Tappable` type:
  `{ name: string, position: (out: Vector3) => Vector3|null, radius: number, react: (now: number, fx: TapEffects)
  => void }`. `position` returns null when the target is not showing.
- Produces the `TapEffects` type: `{ play(name: string): void, burst(at: Vector3): void }`.
  - The app makes it once: `play` is `(name) => sfx && sfx.play(name)`.
  - `burst` is a no-op until Task 14 hands it `heartBurst.burst`.
  - So the world modules animate and ask for effects, but never import the sound or the hearts.
- Produces `isTap(path: Array<{x, y, t}>) → boolean`. It is false if any point is more than SLOP from the first,
  or if the last t − first t > TIME.
- Produces `pickTarget(origin: Vector3, direction: Vector3, targets: Tappable[]) → Tappable|null`.
  - A target is hit if its distance from the ray ≤ `radius`, or its angle off the ray ≤ `MIN_ANGLE`.
  - Only targets in front count, and the nearest along the ray wins.
- Produces `createTapRouter({ camera, sources: Array<() => Tappable[]>, fx: TapEffects, fallback?: (ray: Ray) =>
  void }) → { tap(clientX, clientY, now): string|null }`.
  - It turns the screen point into a ray with `Raycaster.setFromCamera`.
  - It applies COOLDOWN per target name.
  - `fallback` gets taps that hit nothing (fireflies, Task 14).
- The cord's react tugs it down 4 cm and back over 0.5 s and calls `fx.play('whistle')`. The lantern's react
  flares the halo ×1.8 for 1.2 s and calls `fx.play('lantern')`.

- [ ] **Step 1: Write the failing tests.**

```js
test('a drag that comes back to where it began is not a tap', () => {
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 60, y: 0, t: 120 }, { x: 0, y: 0, t: 240 }]), false);
});
test('a short still touch is a tap; a long press is not', () => {
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 4, y: 3, t: 90 }]), true);
  assert.equal(isTap([{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 600 }]), false);
});
test('the nearest target on the ray wins; behind her never', () => { /* two targets on -Z at 5 and 20 m → the 5 m one; one at +Z → null */ });
test('far targets are hit within MIN_ANGLE even when tiny', () => { /* radius 0.1 at 180 m, ray 0.05 rad off → hit */ });
test('the cooldown keeps a mashed tap to one reaction', () => { /* router.tap twice within 1.5 s → react called once */ });
```

  `look.test.js`: `attachPointerControls` with a fake element calls `onTap` for a still touch, and not for a
  drag.

  E2E:
  - At `?at=60&ui=0`, tapping the cord's screen position sets `appState.lastTap` to 'whistle-cord'. Expose the
    cord's projected screen position as `window.__app.debugTargets()` (debug only).
  - With the stop card up, a tap on the card leaves `lastTap` null. (Review Focus 4.)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test` and `rtk npx playwright test tests/e2e/immersion.spec.js tests/e2e/render.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: taps reach the world; a whistle cord and the lantern answer them`.

---

### Task 14: The world answers taps

**Files:**
- Modify:
  - `site/src/world/skyDecor.js` (balloon targets; a burner flame mesh that glows on react, and a 3 m bob up);
  - `site/src/world/dressing.js` (balloon-cluster and snowman targets; the snowman reacts with its arm and hat);
  - `site/src/world/props.js` (the snowman's right arm and hat become separate geometries: `createPropGeometry`
    returns `parts: { arm, hat }` for `snowman`, each with its pivot at the origin and placed by a returned
    offset);
  - `site/src/world/particles.js` (`scatterFrom(point: Vector3, now)`: fireflies within 6 m are pushed out up to
    3 m and ease back over 4 s);
  - `site/src/world/birds.js` (gull targets, which squawk via `fx.play('gull')` and flap away 25 m, then glide
    back over 8 s);
  - `site/src/world/deer.js` (react: it looks up, flicks its ears, bounds off 20 m in 1.5 s and hides until the
    train is 200 m past);
  - `site/src/world/stopCouple.js` (react, from Task 10's `wavedAt`).
- Create: `site/src/world/heartBurst.js`
- Modify: `site/src/audio/tapSounds.js` (adds `pop`, `jingle` and `rustle`)
- Modify: `site/src/app.js` (the router's sources and fallback)
- Test: `tests/unit/heartBurst.test.js`, `tests/unit/particles.test.js`, `tests/unit/props.test.js`,
  `tests/e2e/immersion.spec.js`

**Interfaces:**
- Produces `createHeartBurst({ max = 48 }) → { points, burst(position: Vector3, now), update(dt) }`. It is one
  shared `Points` drawing heart-shaped sprites (`util/canvasText.js` `drawHeart` makes the texture). Each burst
  is 12 hearts rising 1.5 m and fading over 1.6 s.
- The app hands `heartBurst.burst` to the router's `fx.burst`. Every react below plays its sound through
  `fx.play`.
- A balloon cluster's react calls `fx.burst(top)` and `fx.play('pop')`, with a 0.3 m hop over 0.6 s. (The
  cluster stays whole: the hearts come out of its top. This is a builder's simplification of the spec's "one
  balloon pops".)
- The snowman's react waves its arm 3 times over 1.5 s, hops its hat 10 cm, and plays 'jingle'.
- The sky balloon's react plays 'burner' (the existing sound) and glows its flame for 1.2 s.
- A gull's react plays 'gull'. A deer's react plays 'rustle'. A couple's react plays nothing; a pet's plays
  nothing either.
- In the evening zone, the fallback router calls `particles.scatterFrom(point 6 m along the ray)` and plays no
  sound.

- [ ] **Step 1: Write the failing tests.**
  - `heartBurst`: after `burst`, 12 points are live. After 1.7 s of updates, 0 are.
  - `particles.scatterFrom`: a firefly 2 m from the point is pushed further away within 0.5 s and back within
    0.3 m of its old path after 4.5 s.
  - Props: `createPropGeometry('snowman')` has `parts.arm` and `parts.hat`. Its body plus arm plus hat triangle
    count equals the old merged count, ±2.
  - E2E: using the debug-target positions:
    - at `?at=640&ui=0`, tapping a snowman sets `lastTap` 'snowman';
    - at `?at=290&look=40&ui=0`, tapping a gull gives 'gull';
    - at `?at=85&ui=0`, the stop couple gives 'couple'.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/immersion.spec.js tests/e2e/budget.spec.js tests/e2e/audioLevels.spec.js`.
  Expected: PASS. Peak nodes stay ≤ 40 with every tap sound fired at once.
- [ ] **Step 5:** Commit: `feat: balloons, the snowman, gulls, deer, fireflies and the couples answer her taps`.

---

### Task 15: Look around by moving the phone

**Files:**
- Create: `site/src/ride/tilt.js`
- Modify:
  - `site/index.html` (`#tilt-toggle` in `#topbar`, before `#music-toggle`);
  - `site/src/ui/controls.js` (`initControls({ onPauseToggle, onMusicToggle, onTiltToggle })`;
    `setTilt(state: 'off'|'on'|'unavailable')`; the button is hidden when 'unavailable');
  - `site/styles.css`;
  - `site/src/app.js`;
  - `site/src/state.js` (`tilt`).
- Create: the tip toast, after the first stop's card is closed, once per page load:
  `showToast('Psst… some things like being tapped ✨ and tap 📱 to look around by moving your phone')`. Without
  tilt the text ends at "✨".
- Test: `tests/unit/tilt.test.js`, `tests/e2e/immersion.spec.js`

**Interfaces:**
- Produces `deviceLook(alpha, beta, gamma, screenAngle) → { yaw, pitch }`. Angles in degrees in, rad out.
  - It uses three.js's DeviceOrientationControls maths: the Euler is `(beta, alpha, −gamma, 'YXZ')`, then −π/2
    about X, then −screenAngle about Z.
  - Its yaw is wrapped to ±π.
- Produces `createTilt({ win = window }) → { readonly available, readonly state: 'off'|'on', enable():
  Promise<'on'|'denied'|'silent'>, disable(), update(dt), readonly yaw, readonly pitch }`.
  - `available` is whether `'DeviceOrientationEvent' in win`.
  - `enable` calls `DeviceOrientationEvent.requestPermission()` when that exists (in the tap). It takes the first
    reading as straight ahead. With no event within 1000 ms it gives 'silent' and turns off.
  - The app shows a toast for each failure:
    - for 'denied': "Moving the phone to look needs motion access. You can still drag to look around.";
    - for 'silent': "This phone isn't sharing its motion, so drag to look around.".
    - Either way the button goes back to off.
  - `yaw` and `pitch` are relative to straight ahead, smoothed with `damp(…, 12, dt)`, and clamped to `LOOK`'s
    limits.
  - It pauses on `visibilitychange` to hidden, and takes a fresh straight ahead on return.
- In the frame: `camera.rotation.set(clamp(look.pitch + tilt.pitch, LOOK.PITCH_MIN, LOOK.PITCH_MAX),
  clamp(look.yaw + tilt.yaw, −LOOK.YAW_LIMIT, LOOK.YAW_LIMIT), 0, 'YXZ')`. This is not applied in the finale.

- [ ] **Step 1: Write the failing tests.**
  - Phone upright, portrait, facing ahead: `deviceLook(0, 90, 0, 0)` is pitch ≈ 0 and yaw ≈ 0.
  - Turning left 30°: `deviceLook(30, 90, 0, 0).yaw ≈ +0.5236`.
  - Tilting the top back 20°: `deviceLook(0, 110, 0, 0).pitch ≈ +0.349`.
  - Landscape: `deviceLook(0, 0, -90, 90)` and `deviceLook(0, 0, 90, 270)` both have pitch ≈ 0, and their yaw
    differs from portrait's straight ahead by < 1e-6. (Review Focus 5.)
  - `createTilt` with a fake window: 'denied' when `requestPermission` resolves 'denied'; 'silent' after
    1000 ms with no events; and readings clamped to `LOOK.YAW_LIMIT`.
  - E2E: on the iphone project, stub `DeviceOrientationEvent.requestPermission` to resolve 'granted', then
    dispatch events.
    - Tapping `#tilt-toggle` sets `aria-pressed="true"`, and `appState.tilt` is 'on'.
    - A 30° turn moves `appState.yaw` by about 0.52 within 1 s.
    - The toast appears after the first card's Continue.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `appState.yaw` mirrors the combined yaw.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/immersion.spec.js tests/e2e/render.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: look around by moving the phone`.

---

### Task 16: The boarding ticket

**Files:**
- Modify:
  - `site/src/ui/intro.js` (`showIntro` builds the ticket; `hideIntro()` returns a Promise that resolves after
    the punch and slide-away, at most 900 ms, or at once under reduced motion);
  - `site/styles.css` (`#intro` becomes `.ticket`: a paper colour, a soft CSS paper grain made with gradients, a
    perforated stub edge made with radial-gradient dots, "ADMIT ONE" on the stub, and `.punched` animations);
  - `site/src/ui/fallback.js` (the fallback's intro header gets the ticket look, without the button or the
    hint);
  - `site/src/audio/tapSounds.js` (`punch`: a crisp paper click, about −24 dBFS peak);
  - `site/src/app.js` (in `begin`, `sfx.play('punch')` right after `music.start()`).
- Test: `tests/e2e/immersion.spec.js`, `tests/e2e/smoke.spec.js`, `tests/e2e/audioLevels.spec.js`

**Interfaces:**
- The ticket reads, top to bottom:
  - the eyebrow;
  - the title (`#intro-title`);
  - the squiggle;
  - the note;
  - a line `.ticket-route`: "From Day 1 · To Day 365";
  - a line `.ticket-seat`: "Seat: by the window";
  - the Begin button (`.intro-begin`, unchanged class and name);
  - the hint (Task 2).
- On the stub: `.ticket-stub` with "ADMIT ONE" and a `.ticket-hole`, a heart-shaped mask shown when punched.
- `#intro` keeps `role="dialog"` and `aria-labelledby`.

- [ ] **Step 1: Write the failing e2e tests.**
  - `.ticket-route` reads "From Day 1 · To Day 365".
  - After tapping `.intro-begin`, `#intro` gets the class `punched` at once, and `#intro` is hidden within
    1000 ms. `appState.phase` is 'riding' within 200 ms of the tap.
  - With `page.emulateMedia({ reducedMotion: 'reduce' })`, `#intro` is hidden within 100 ms and never gets
    `.punched`.
  - The existing intro checks in `smoke.spec.js` still pass, updated only where the markup moved.
  - Audio levels: 'punch' peaks within −24 ± 3 dBFS.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The ride starts in the same tap as today. Only the card's leaving is animated.
- [ ] **Step 4:** Run `rtk npx playwright test tests/e2e/immersion.spec.js tests/e2e/smoke.spec.js tests/e2e/audioLevels.spec.js tests/e2e/resilience.spec.js`
  and `rtk npm test`. Expected: PASS. Check by eye at 375 × 812 and in landscape.
- [ ] **Step 5:** Commit: `feat: the first screen is a boarding ticket, punched as she boards`.

---

### Task 17: The message writes itself, in Dancing Script

**Files:**
- Modify: `package.json` (`"@fontsource/dancing-script": "5.3.0"` in devDependencies) and `package-lock.json`
  (`rtk npm install`, which the author approved)
- Modify: `scripts/vendor.mjs`: `FONTS` gets `['dancing-script', 'dancing-script-latin-500-normal.woff2']`. Run
  `rtk npm run vendor`, which adds `site/fonts/dancing-script-latin-500-normal.woff2` and
  `site/fonts/LICENSE-dancing-script.txt`.
- Create: `site/src/ui/handwriting.js`
- Modify: `site/src/ui/finaleCard.js` (`.finale-message` and `.finale-signoff` are written in ink; a tap on
  `.finale-card-body` finishes the writing)
- Modify: `site/src/ui/fallback.js` (the fallback's message is written when it scrolls into view, using
  IntersectionObserver where present and at once otherwise)
- Modify: `site/styles.css` (an `@font-face` for 'Dancing Script' weight 500; `.finale-message` and
  `.finale-signoff` use `'Dancing Script', 'Cormorant Garamond', serif` at about 1.25× their current size; the
  ink mask with `-webkit-mask-*` too)
- Modify: `tests/e2e/ship.spec.js` (the new font and license ship)
- Test: `tests/unit/handwriting.test.js`, `tests/e2e/finale.spec.js`

**Interfaces:**
- Produces `INK`, frozen, in seconds:

  | Constant | Value |
  |---|---|
  | `PER_CHAR` | 0.055 |
  | `MIN_WORD` | 0.12 |
  | `WORD_GAP` | 0.06 |
  | `COMMA` | 0.2 |
  | `SENTENCE` | 0.35 |
  | `LINE` | 0.45 |
  | `PARAGRAPH` | 0.9 |

- Produces `inkPlan(text: string, startAt = 0) → { words: Array<{ text: string, start: number, duration: number,
  breakAfter: 'none'|'line'|'paragraph' }>, end: number }`.
  - Words are split on spaces. `\n` ends a line, and `\n\n` ends a paragraph.
  - A word's characters are counted by grapheme (`Intl.Segmenter` when present, `Array.from` otherwise), so an
    emoji counts as 1.
  - The pause after a word comes from its last character: `,;:` take COMMA, `.!?…` take SENTENCE.
- Produces `writeInk(el: HTMLElement, text: string, { startAt = 0, reduced = false }) → { finish(): void, done:
  Promise<void> }`.
  - It builds one `span.ink-word` per word, with `--ink-start` and `--ink-dur`, and `<br>`s for breaks, keeping
    `white-space: pre-line` semantics.
  - Under `reduced`, it adds the class `ink-fade` instead.
  - `finish()` adds `inked` to `el`, which turns every animation off.
- The signoff starts at the message's `end + 0.4`.
- Words are written left to right, so each line still fills as if by a pen. This refines the spec's "line by
  line" sweep, which a wrapped line would break.
- The writing never moves the card's scroll position. Words below the fold write unseen, and she can scroll to
  them.

- [ ] **Step 1: Write the failing tests.**

```js
test('words write one after another at a writing pace', () => {
  const { words, end } = inkPlan('Happy one year, love.');
  assert.deepEqual(words.map((w) => w.text), ['Happy', 'one', 'year,', 'love.']);
  assert.ok(Math.abs(words[0].duration - 5 * INK.PER_CHAR) < 1e-9);
  assert.ok(words[3].start - (words[2].start + words[2].duration) >= INK.COMMA - 1e-9);
  assert.ok(end > words[3].start);
});
test('line and paragraph breaks pause longer, and are kept', () => {
  const { words } = inkPlan('one\ntwo\n\nthree');
  assert.deepEqual(words.map((w) => w.breakAfter), ['line', 'paragraph', 'none']);
});
test('an emoji is one character, an em dash is kept', () => {
  assert.ok(Math.abs(inkPlan('💛').words[0].duration - INK.MIN_WORD) < 1e-9);
  assert.equal(inkPlan('— Sam').words[0].text, '—');
});
```

  E2E `finale.spec.js` at `?finale=1&ui=0` with the fixture's message:
  - `.finale-message .ink-word` count equals the message's word count.
  - Tapping the card body adds `.inked` to the message.
  - Under `reducedMotion: 'reduce'`, there are no `.ink-word` animations, and `.ink-fade` is present.
  - `document.fonts.check('500 20px "Dancing Script"')` is true once loaded.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/finale.spec.js tests/e2e/ship.spec.js tests/e2e/resilience.spec.js`.
  Expected: PASS. Check by eye at phone size: the legibility of a long message, and the scroll.
- [ ] **Step 5:** Commit: `feat: his message writes itself in ink, in Dancing Script`.

---

### Task 18: His voice note

**Files:**
- Create: `site/src/audio/voiceNote.js`
- Modify:
  - `site/src/ui/finaleCard.js` (`showFinaleCard(content, { onRideAgain, voice })`, with a `.voice-note` button
    and an SVG progress ring);
  - `site/src/ui/fallback.js` (the same button, playing only on tap, without ducking);
  - `site/src/app.js`;
  - `site/src/state.js` (`voice`);
  - `site/styles.css`;
  - `README.md` (the "Voice note" section from Task 1, now with how it behaves).
- Test: `tests/unit/voiceNote.test.js`, `tests/e2e/voice.spec.js` (new)

**Interfaces:**
- Produces `createVoiceNote(file: string, { makeElement = () => new Audio(), doc = document } = {}) → { unlock(),
  play(): Promise<boolean>, stop(), readonly state: 'idle'|'playing'|'paused'|'ended'|'failed'|'blocked',
  readonly progress: number, onChange(fn) }`.
  - `unlock()` follows `recording.js`'s play-and-pause pattern. It is called in the Begin tap, right after
    `music.start()`, and the element has no `src` yet.
  - `play()` sets the `src`, plays from where it was, and resolves false if refused or failed. A failed file
    warns `[content.js] finale.voice: "<file>" could not be played, so there is no voice note.`
  - It pauses on `visibilitychange` to hidden, and the state becomes 'paused'.
  - `progress` goes from 0 to 1.
- The app:
  - On the 'card' event, when `content.finale.voice` is set and not failed, the card shows the button.
  - If `music.state === 'playing'`, then after `CARD_RISES_AFTER` (`audio/cueSounds.js`) it calls `voice.play()`
    and `music.setDucked(true)`.
  - When the voice changes to 'ended', 'paused', 'failed' or 'idle', it calls `music.setDucked(false)`.
  - `rideAgain()` and `jumpTo()` from the finale call `voice.stop()`, which goes back to idle at 0, and
    `music.setDucked(false)`.
- The button is labelled "Play my voice note" or "Pause my voice note", with `aria-pressed` while playing. The
  ring shows `progress`.

- [ ] **Step 1: Write the failing tests.**
  - Unit, with a fake element (as in `tests/unit/recording.test.js`):
    - unlock plays and pauses with no src;
    - play sets the src and the state becomes 'playing';
    - a hidden page pauses it;
    - the element's 'ended' gives 'ended' and progress 1;
    - an error event gives 'failed' and the warning text above.
  - E2E `voice.spec.js`: serve a generated 1.5 s WAV at `**/site/voice/test.wav` with `page.route` (a 16-bit PCM
    header plus a sine, built in the spec), and use `useFixture(page, { finale: { ...fixture.finale, voice:
    'voice/test.wav' } })`.
    - Tap Begin, then go to the finale with `?finale=1`. `appState.voice` becomes 'playing', then 'ended'.
      `appState.music` is 'playing' afterwards, and `audioSuspended` is false.
    - With the Sound button off before the finale, `appState.voice` stays 'idle' until `.voice-note` is tapped.
    - Ride again while it plays: `appState.voice` is 'idle', and the sound is back. (Review Focus 2.)
    - With no voice set, there is no `.voice-note`.
    - Hiding the page while it plays gives 'paused'. (Review Focus 3.) Use `page.evaluate` to dispatch a
      visibilitychange with `document.hidden` stubbed, as `resilience.spec.js` does.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `rtk npm test`, then `rtk npx playwright test tests/e2e/voice.spec.js tests/e2e/finale.spec.js tests/e2e/music.spec.js tests/e2e/video.spec.js`.
  Expected: PASS.
- [ ] **Step 5:** Commit: `feat: his voice note plays at the finale, with a button to hear it again`.

---

### Task 19: Whole-ride check

**Files:**
- Modify: `README.md` (one short "What's in the ride" paragraph listing the new touches; the content-field
  sections from Tasks 1 and 18 are already there)
- Modify: the comment at the top of `site/src/app.js` (the world and the UI now include the new parts)

- [ ] **Step 1:** Run `rtk npm test`. Expected: all PASS.
- [ ] **Step 2:** Run `rtk npx playwright test`. Expected: all PASS on both projects; the skipped count is no
  higher than before (8).
- [ ] **Step 3:** At 375 × 812, check by eye with `?ui=0`, screenshotting each stretch:
  - 100 m: wind, butterflies, a flock;
  - 290 m: gulls, palms swaying;
  - 470 m: a deer;
  - 545, 570 and 598 m: the tunnel;
  - 650 m: robins, cottages, smoke;
  - 900 m: stars, the moon;
  - `?finale=1&ft=9`: doves, the pet, the handwriting.
  Note anything off, and fix it in this task.
- [ ] **Step 4:** Commit: `docs: the ride's new touches in the README`.
