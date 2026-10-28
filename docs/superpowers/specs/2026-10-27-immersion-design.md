# Immersion — Design

Addendum to `2026-10-18-anniversary-train-ride-design.md` and `2026-10-26-sound-effects-design.md`. The author
asked for research into making the ride more immersive. All 13 suggestions were approved in conversation on
2026-10-27 ("I like all the suggestions. We should build all."). The author will record #8, the voice note, later.

## Intent

Today the ride is lovely to watch: the scenery, the sounds and the photo stops all work. What it lacks is the
feeling of *being there*. The train never moves under her. The world has sound without sources: she hears gulls
but sees none, and doves at the finale that aren't there. The trees stand still in a breeze she can hear. She can
look around but cannot touch anything. Her phone may also dim halfway through. These additions make the ride feel
physical, alive and personal. None of them should pull attention from the photos and the message, which remain
the point.

## Goals

- She feels the train: a gentle rock and a bump at the rail joints, a lurch as it starts and stops, a tunnel.
- The world is alive. Creatures go with the sounds she hears, the foliage moves in the wind, stars come out at
  dusk, and smoke curls from the chimneys.
- She can play: hidden things respond when tapped, and she can look around by moving her phone.
- It is personal: a boarding ticket to start, his voice at the end, and the message written as if by hand.
  Little versions of the two of them stand at every stop.
- It just works on her phone: the screen stays on for the whole ride, and she is told to use sound and
  headphones.

## Non-goals

- Haptics (iPhone web has none), bloom or screen-space post-processing, rain on glass, 3D-depth photos,
  fullscreen, and HRTF-positioned sound. All were researched and dropped (conversation of 2026-10-27).
- New audio files beyond the author's own voice note. New sounds are synthesized, as before.
- Recording the voice note. The author supplies it later; this work makes a place for it.

## Anti-goals (a failure even if it works)

- **Motion sickness.** The rock and the bumps must stay subtle. A train-sim lesson applies: heavy sway reads as
  fake and makes people queasy. Under `prefers-reduced-motion`, the train's motion (#3), the ticket punch and
  the handwriting are off. The scenery (wind, creatures, smoke) keeps moving, as the particles do today.
- **A slower or janky ride on her phone.** Every addition fits the quality tiers. The low tier holds its frame
  rate as it does today.
- **Clutter in front of the photos.** Creatures, figures and effects never block a photo sign or the stop card.
- **A broken first impression.** No system permission pop-up while she taps Begin: the tilt permission is
  asked only when she turns tilt on. The ticket must never stop the ride from starting.
- **Surprise loudness.** New sounds follow the existing levels and buses, and the Sound button governs them all.

## Constraints (unchanged from the base design)

- Static ES modules, no bundler. Three.js r170 is vendored. Relative URLs. Safari 15 is the feature floor, so
  newer APIs are feature-detected and simply absent below it.
- Phone first. One AudioContext, created in the Begin tap. The 40-node audio budget (`NODE_BUDGET`) still holds
  at peak, counting any new persistent nodes.
- Pure modules stay DOM-free at import, so the Node unit tests can import them. Each feature gets unit tests,
  and e2e tests where it shows in the page. Both Playwright projects (iphone/WebKit, android/Chromium) pass.
- No third-party runtime services. Assets are vendored or built in code (low-poly geometry, no textures or
  models), like the existing props.
- `content.js` is still the one file the author edits. New fields are optional, defaulted and validated with
  friendly `[content.js]` console messages, like `live` and `music`.
- The 2D fallback (`ui/fallback.js`, for phones without WebGL2) is one scrolling scrapbook page with no Begin
  button, no AudioContext and no Sound button. *Claude's call:* it stays ungated and gets only the looks.
  - The ticket is styled at the top, with nothing to tap through.
  - The sound hint is hidden.
  - The handwriting starts when the message scrolls into view.
  - The voice note plays only when she taps its button.
- The author's zone order is theirs (content.js `zones`): the first four zones can come in any order, and a zone
  may be left out. Anything tied to a zone follows the zone, wherever it falls.

## Already done in this conversation

- **The view waits longer before turning back.** After she drags to look around, the view now holds for 4 s
  (was 1.2 s) before easing back ahead. The author asked for 3–5 s. `LOOK.RETURN_DELAY` is 4. The unit tests
  are updated, and an e2e check confirms the view is still turned 2.5 s after letting go.

## The features

### 1. The screen stays awake

- In the Begin tap, request a screen wake lock (`navigator.wakeLock.request('screen')`), feature-detected and
  in try/catch.
- The browser drops the lock when the page is hidden. Re-request it on `visibilitychange` back to visible for
  as long as the ride or the finale is showing.
- It is never released on purpose: she may sit on the finale card reading.
- Without the API (iOS below 16.4), nothing happens. *Claude's call:* no hidden-looping-video hack ("NoSleep"),
  because it fights the page's own media and audio session on iOS.

### 2. "Best with sound on" hint

- A small line on the first screen, under the Begin button, with a little headphones icon (inline SVG):
  *"Best with sound on and headphones in."*
- Optional override in content.js: `intro.hint`. Leave it as '' for the default, or write 'none' to hide the
  line. *Claude's call.*

### 3. The train moves under her

Today only the cabin bobs a little within the view (`cabin.js` BOB, 1.5 cm at 1.6 Hz). That stays. New motion
goes on the camera's rig (her seat and the cabin together), so the world rocks in the view while the dashboard
stays put. *Claude's call:* the camera also lags each bump very slightly, so the dashboard gives a tiny jolt too.
Everything scales with speed and is still at a standstill. It is off during the finale, which moves the camera
itself.

- **Rock:** a slow roll of about ±0.35° at about 0.5 Hz, with a slower wander on top, so it never looks
  mechanical. Full at cruising speed (6.5 m/s).
- **Rail-joint bumps:** two small dips (a few millimetres, a quick damped spring), one for each bogie, at the
  same moments as the two clicks of the clickety-clack. The visuals use the same pure timing as the audio
  (`jointCrossed`, `bogieDelay` in `audio/sfxTiming.js`) but run whether or not sound is on.
- **Starting and stopping:** a gentle pitch with the train's acceleration, about 0.5°. She tips back a little
  as it pulls away and forward as it brakes, then settles with a small overshoot as it halts.
- **Reduced motion:** all of it is off.

### 4. Creatures to go with the sounds

All built in code like the props: low-poly, a few parts, flat colours, wings flapping by simple part rotation.
The counts thin with the quality tier. None come within a few metres of the camera, and none fly in front of a
photo sign at a stop.

| Where | Creatures |
|---|---|
| Spring | A small flock of songbirds (5–7) crossing the sky every so often. Butterflies (white, lemon, pale blue) flutter low over the flowers beside the track. |
| Summer | 3–5 gulls gliding in lazy loops over the sea and shore. When a gull call plays (the existing ambience event), one of the visible gulls flaps and banks, so the sound has a source. |
| Autumn | A sparser flock now and then. A deer at the forest edge, in one or two places, that lifts its head as the train passes. |
| Winter | Two or three little robins perched on a fence or the snowman, which flutter off as the train nears. |
| Evening | The fireflies already there. |
| Finale | A handful of white doves burst off the Day 365 station's roof and circle away as the fireworks start, at the moment the existing dove sound plays (`foleyTiming.js` 'doves'). Today that sound has no doves to see. |

- Creatures follow their zone, not a place in the ride. In a blend window they fly off or fade with their zone,
  like the particles.
- The ambience schedules the gull calls (`audio/ambience.js` EVENTS) but tells nobody. It gains a way to report
  a gull call to the visuals, like the sea's `seaWave()`. When sound is off, the gulls flap on their own clock.
- The particles show one kind at a time, so butterflies are their own small system, not another particle kind.

### 5. Wind in the trees, grass and flowers

- Foliage sways in a breeze, done in the vertex shader (the same `onBeforeCompile` approach as the sea). There
  is no per-frame CPU cost.
- **Its own material.** Every prop, the terrain, the track and the figures share one material
  (`MATERIALS.solid`), so the wind cannot go there. The foliage types (tree_round, tree_autumn, pine, pine_snowy,
  palm, bush, bush_autumn, flower_patch, grass_tuft) get a "swaying" copy of it, and every other type keeps
  `solid`.
- **Weighted by height.** Trunk and canopy are one merged mesh, so the sway grows with height above the prop's
  base: the base stays put, the trunk bends a little and the canopy moves most. The weight is kept small enough
  that trunks never visibly shear.
- Each instance gets its own phase, from its position, so neighbours don't move in unison. Gusts roll along the
  track now and then.
- Strength by zone: spring gentle, summer breezy (palms), autumn gusty, winter barely (snowy pines), evening calm.
  Blended between zones like the rest of the look.
- If the shadows (high tier only) don't sway with the foliage, that is acceptable. The builder may patch the
  depth material if it is cheap.

### 6. The night sky and chimney smoke

- **Stars:** in the evening zone, stars fade in as the sky darkens, denser towards the zenith and none in the
  horizon haze. A slow, gentle twinkle. *Claude's call:* they are drawn in the sky's own shader, weighted by how
  much of the evening zone is showing, so they cost no extra draw call and never come closer.
- **Moon:** a thin crescent, low over the town, softly glowing. *Claude's call.*
- **Shooting star:** one, at a fixed point about 40 m before the final station, crossing the sky ahead where she
  is looking. A very soft shimmer of a sound goes with it. *Claude's call:* a second one appears during the
  finale, as the wish shows. It ties to the "1 year wish".
- **Chimney smoke:** soft puffs rising and drifting from cottage and station-house chimneys, fading as they
  rise. Thinned on the low tier.
  - In the evening town, from the existing houses and the Day 365 station house.
  - Winter has no houses today. *Claude's call:* it gains a few snow-roofed cottages, set back at least 25 m from
    the track, clear of the signs and the tunnel, and thinned with the density like the other props, so the snow
    has a cosy curl of smoke too.

### 7. A tunnel into winter

- The track runs through a hill: a stone portal (low-poly arch) at each end, and a tunnel of up to 60 m between.
- **Where:** centred on the boundary into winter, wherever winter falls in the zone order. If winter is first or
  not in the ride, it goes at the boundary nearest the middle of the ride, never the one into evening.
  *Claude's call.*
  - With the default content, that is the autumn→winter boundary at 570 m. The blend window is 555–585 m, and
    the stops either side are at 515 and 625 m, so the tunnel runs 540–600 m.
  - In general it is as long as fits, up to 60 m, leaving at least 25 m of open track to the stop on either side
    and always covering the whole blend window. If that can't fit (the author's content leaves too short a gap),
    there is no tunnel. Unit tests cover this sizing.
- **Hides the season change:** she enters in the zone before winter and comes out into snow. The blend between
  the two looks happens while she is inside.
- **Built to follow the track.** The track curves, so the tunnel shell is swept along the path, like the track
  mesh (`trackMesh.js` sweep). The terrain rises into a hill on both sides and over it, and no props stand in its
  stretch.
- **Inside:** dark, with warm lamps on the walls going by at a steady rhythm. The flicker sells the speed.
- **Sound:**
  - The whistle toots as the train enters.
  - Inside, the train's own sounds echo, and the outside ambience is muffled. Both come back as she exits.
  - The train sounds get their own small bus into the effects bus, with an echo send (delay, feedback,
    low-pass) whose level follows how far inside she is.
  - The ambience bus gets a low-pass that closes inside.
  - These nodes count against the budget. Today's peak is 36 of 40, as the train stops at the finale station.
    So the echo chain exists only near the tunnel: it is built on the way in and released after the exit.
- **Exit:** a brief bright glow of white light at the far portal, then the snowy hills. It is faked in the
  scene (a glowing plane, the fog briefly brightened), with no post-processing.
- A jump through the timeline crosses it like any stretch of track.

### 8. His voice at the finale

The author records it later. This work makes a place for it.

- content.js gets `finale.voice: ''`. Leave it empty and nothing changes. Set it to an audio file, such as
  `'voice/message.m4a'`, and the voice note plays at the finale. A comment in content.js says how to export a
  Voice Memo from an iPhone (share → save to Files, `.m4a`) and where to put it (`site/voice/`), with a README
  section to match. It is validated like `live` and `music`.
- **How it plays:** like a video's sound, as its own `<audio>` element. It quiets everything through the same
  path the stop-card video uses (`music.setDucked`, which fades the ride's sound out and back). That path is
  proven on iPhones. The finale's fireworks and dove sounds fade out under his voice; the visuals carry on.
- **Unlocked in the Begin tap**, like the songs, because iPhones only let an element play by itself after a tap.
- **When:** once the message card has fully appeared (finale time 9.5 s and its fade), as the handwriting starts.
- **Control:** the card shows a small round "play my voice" button with a progress ring, which replays it on tap.
  If the Sound button is off at that moment, nothing plays by itself: the button shows a ▶ and plays on her tap.
- **Ride again, or a jump away,** stops it and brings the sound back.
- **Testing:** a short synthetic test file under `tests/` (not shipped). A missing or broken file logs a
  friendly `[content.js]` message, and the button is not shown.

### 9. The message writes itself

- The final message and the sign-off appear as if written by hand, line by line. An ink-edge mask sweeps across
  each line at a calm writing pace, set by the line's length, with a short pause between lines and a longer one
  between paragraphs.
- **Font:** Dancing Script, vendored like the others (see "Answered by the author"). Any glyph it lacks falls
  back to the existing Cormorant Garamond italic.
- A tap on the card finishes the writing at once. Under reduced motion, it fades in instead.
- The wish and eyebrow stay as they are. Only the message and the sign-off are handwritten.
- The long-message scroll still works. The writing follows the scroll, or simply writes all of it with the
  scroll position untouched (the builder's call, as long as nothing jumps).
- Same in the 2D fallback.

### 10. A boarding ticket

- The first screen's card becomes a train ticket: a perforated stub edge, a soft paper texture done in CSS, and
  "ADMIT ONE".
- It reads "For <her name>", then the existing note. Below that: "From Day 1 · To Day 365", "Seat: by the
  window", and the Begin button.
- **Tapping Begin:** a ticket punch clips a little heart out of the stub, with a click sound synthesized in the
  same tap as the AudioContext. The stub tears off and the ticket slides away. The ride begins at once
  underneath; the animation takes under a second.
- Reduced motion: no punch animation, a plain fade.
- The intro's existing content fields keep working (eyebrow, title, note, button). Begin stays a real
  `<button>` with the same accessible name.
- Same in the 2D fallback, without the punch.

### 11. Hidden taps

Today every touch on the 3D view starts a drag to look around. That stays, and a touch that ends as a tap
(released within about 10 px and 350 ms) also checks a short list of tappable things. Each tappable has a
generous invisible hit shape, and far ones get an angular radius. Taps never open or close the stop card; its
own controls are unchanged.

| What | Response |
|---|---|
| Sky hot-air balloons | The burner roars (existing whoosh), the flame glows, and it bobs up a little |
| Party balloon clusters | One balloon pops into a little burst of hearts, with a soft pop |
| Snowman | Waves its stick arm, and its hat hops, with a jingle |
| Fireflies | Scatter outward from the tap and drift back over a few seconds |
| Gulls | Squawk and flap away, then glide back later |
| Deer | Looks up at her, flicks its ears and bounds off into the trees |
| Whistle cord (new, hangs from the cabin roof, top left) | It tugs down and the train whistles |
| Lantern on the dashboard | Flares warmly and flickers, then settles |
| The couple at a stop | They wave (or, if already waving, he spins her) |

- **Discovery:** once, after she closes the first stop's card, a toast says *"Psst… some things like being
  tapped ✨"*. *Claude's call.*
- Each response has a short cooldown, so mashing a tap doesn't stack sounds past the node budget.

### 12. Look around by moving the phone

- A small toggle button with a phone icon in the top bar, beside the Sound button. It is shown only where
  `DeviceOrientationEvent` exists. Off by default.
- **Turning it on:** on iOS, `DeviceOrientationEvent.requestPermission()` is called inside that tap. If she
  says no, or no orientation event arrives within about a second, a toast explains it, and the button turns
  itself off.
- **While on:** the view follows how she turns and tilts the phone relative to how she held it when she turned
  tilt on (that pose is "straight ahead"). It is smoothed and clamped to the same look limits as dragging, and
  corrected for the screen's rotation.
- Dragging still works on top. The drag part eases back after the 4 s wait; the tilt part does not, since the
  phone is where she is looking. At a stop, "straight ahead" means towards the sign, as now. In the finale, tilt
  does nothing (the finale directs the camera).
- Remembered for the session only.
- **Hint:** the toast in #11 also mentions it: *"…and tap 📱 to look around by moving your phone"*.
  *Claude's call:* one toast, not two.

### 13. The two of them at every stop

- Today a couple holding hands stands beside the sign at every other stop (`placeCouple` keeps them clear of the
  photo). It changes to every stop, each posed for its moment.
- **Pose per moment:** content.js gets an optional per-moment field, `pose`, documented like `live`. The poses:
  - `'holding-hands'` (the default, as today): side by side, swinging their joined hands a little.
  - `'waving'`: both wave as the train arrives.
  - `'hug'`
  - `'sitting'`: on a little bench (the existing bench prop).
  - `'dancing'`: a slow sway, turning.
  - `'pointing'`: she points at the photo, he looks.
  - `'none'`: no figures at this stop.

  Each pose has a gentle idle loop (breathing bob, a sway), so they are never frozen statues.
- **Pets:** a little low-poly dog or cat at their feet at every stop and in the finale, picked at random (see
  "Answered by the author"). Each has a small idle: a tail wag, a head turn. They are shown only near the train,
  like the couples.
- **Cost:** like the signs, couples are shown only near the train (`SIGN_RANGE`), so ten couples cost what a
  couple or two does.

## Sound additions (all synthesized, on the existing buses, within the 40-node budget)

| Sound | When | Level target |
|---|---|---|
| Ticket punch click | Begin tap | about −24 dBFS peak |
| Gull flap-and-bank | Already tied to the existing gull call | none new |
| Shooting-star shimmer | Each shooting star | about −30 dBFS peak, very soft |
| Tunnel: whistle at entry, echo on the train sounds, muffled ambience | Tunnel | Train levels unchanged dry; echo about −10 dB under dry |
| Balloon pop, snowman jingle, gull squawk, deer rustle, lantern whoosh, cord-pull whistle | Taps | Like the existing ambience events (about −24 dBFS peak) |

## Quality tiers

| Tier | Creatures | Wind | Stars | Smoke | Couples at stops |
|---|---|---|---|---|---|
| low | about 40 % | on | on | thinned | on, idle loop simplified |
| medium | about 70 % | on | on | on | on |
| high | all | on (+ shadows if cheap) | on | on | on |

The rock, the bumps, the tunnel and the taps cost little and are on in every tier. The governor's thresholds
are unchanged. The builder re-measures draw calls and frame time on the e2e phone profiles.

## Content additions (all optional)

| Field | Default | Purpose |
|---|---|---|
| `intro.hint` | '' (default line), 'none' hides it | #2 |
| `finale.voice` | '' (no voice note) | #8 |
| `moments[i].pose` | 'holding-hands' | #13 |
| `pets` | 'random' (also 'dog', 'cat', 'none') | #13 |

## Answered by the author (2026-10-27)

1. **The handwriting font (#9): Dancing Script.** The author approved the download: the npm package
   `@fontsource/dancing-script` 5.3.0 (OFL-1.1, 431 KB package). It is added to the dev dependencies and to
   `scripts/vendor.mjs` like the other fonts. Only its latin `.woff2` and its LICENSE ship in `site/fonts/`. The
   writing pace is tuned for it at phone size, and it is checked for the characters the defaults use, including
   the em dash in the default sign-off. Any missing glyph falls back to Cormorant Garamond italic.
2. **Pets (#13): "dogs and cats on random".** *Claude's reading:* they have no particular pet. Instead, each stop
   has a little dog or cat at the couple's feet, picked at random, with coats varied from a small palette. The
   picks are seeded, so every ride shows the same ones. The finale gets one too, which trots out of the station
   house with him, with no sound of its own.
   - content.js gains `pets: 'random'` (the default), `'dog'`, `'cat'` or `'none'`.
   - There is no per-moment pet field.

## Left to the builder

- Exact constants (amplitudes, counts, timings, colours) within the targets above, checked by eye at phone size.
- How creatures and effects are split into modules, and where the hit shapes for taps live.
- How the tunnel's hill is shaped in the terrain.
- The order of the work, in the plan.
