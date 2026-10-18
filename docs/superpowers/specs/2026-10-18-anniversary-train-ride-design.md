# Anniversary Train Ride — Design

## Intent

A static website the author gives their girlfriend for their **1-year anniversary**.
She opens a link (on her **phone**) and rides a cartoon 3D train through a
little world that represents their year together, stopping at their **10
favourite moments**. It ends with a small scene at a final station and a
personal message + 1-year wish.

Inspiration: https://birthday.getforevermore.co/ — a first-person, low-poly
3D train ride with photo signs beside the track, bunting, balloons, a cute
train car dashboard (flowers, lantern), drag-to-look, pause and music toggle,
and scenery that changes as you ride (meadow → beach). We copy the *feel*,
not its code or assets.

Success = she feels it was made for her: smooth on her phone, charming,
personal, and the moments land.

## Goals

- Full 3D, low-poly, cartoon world rendered in the browser (Three.js).
- First-person seat in a cute train car that rolls along a curvy track on
  its own.
- 10 moment stops. At each stop the train **slows and stops and waits for
  her**: a photo sign beside the track, and a card with photo, date and
  caption. She taps **Continue** to ride on.
- A **timeline** of all 10 moments (dates) she can use to jump back to any
  moment she has already reached.
- Distinct scenery zones along the ride (see Zones).
- **Finale scene** at an evening station (see Finale).
- Soft romantic background music, with on/off toggle.
- Content editable without touching code: photos in a folder + one config
  file for names, dates, captions, messages.
- Plain static files. No server, no build step required to host. Free
  hosting (GitHub Pages / Netlify) works by uploading the folder.

## Non-goals

- No accounts, backend, analytics, sharing/creator tools (unlike
  getforevermore, this is a one-off gift, not a product).
- No desktop-first polish beyond "works fine". Phone is the target.
- No realistic graphics. Low-poly cartoon only.
- More than 10 moments not needed now (config should not hard-cap it, but
  zones are designed around 10).

## Anti-goals (would make it a failure even if it "works")

- Choppy / laggy / hot phone, or long blank loading.
- Text or buttons too small or cut off on a phone in portrait.
- Feels generic / template-y — any visible "made with X" branding.
- Breaking if she opens it from a messaging app's in-app browser
  (Instagram/iMessage/WhatsApp webviews) — must still work there.

## Experience, start to finish

1. **Loading** — short, cute loading state while 3D assets/photos load.
2. **Intro card** over the 3D scene (train sitting at first station):
   "For <her name>", a short note from the author, button **Begin the ride**.
   Tapping it also unlocks audio (browsers require a tap before sound).
3. **Ride** — first-person from inside the train car. Dashboard foreground
   (flowers in a pot, lantern, wood trim), bunting overhead. Train moves
   on its own along a curving track. She can drag (thumb) to look around;
   view eases back forward when she lets go. Pause button, music toggle.
4. **Stops** — as a moment approaches, the photo sign is visible beside the
   track; train eases to a stop beside it. Card slides up: photo, date,
   caption. **Continue** button resumes the ride. Small cartoon couple
   figures standing near some signs (like the reference) — nice to have.
5. **Timeline** — compact bar/strip showing the 10 moments (dates or dots).
   Reached moments are tappable to jump back (train teleports/rides to
   that stop and shows its card). Unreached ones are shown but locked, so
   the surprise is kept.
6. **Finale** — see below.
7. After finale card: option to **Ride again** and to reopen timeline.

## Zones (builder's call, chosen by Claude — the author has no preference yet)

Seasonal order to suggest a year passing, 2 moments per zone:

| Zone | Moments | Look |
|---|---|---|
| Spring meadow | 1–2 | green hills, flowers, trees, balloons |
| Summer beach | 3–4 | sand, palms, sea, beach ball |
| Autumn forest | 5–6 | orange/red trees, leaves, pumpkins |
| Winter hills | 7–8 | snow, pines, snowman, falling snow |
| Evening town | 9–10 + finale | dusk sky, lit lamps, houses, string lights |

Transitions between zones should blend (ground colour, sky, props) rather
than hard-cut. Exact props are the builder's call.

**Zones are laid out from config, not hard-coded** (Claude's call, so the
scenery can later match when each moment really happened):

- Config has a `zones` list in ride order. Default = the table above.
  The author can reorder the first four (e.g. start at autumn if that's
  when they got together). Evening town is always last — it hosts the
  finale.
- Each moment has a `zone` field. Default assignment = 2 per zone as in
  the table.
- A zone's stretch of track scales with how many moments it holds. A zone
  holding none still appears as a short scenic stretch (keeps the
  "year passing" feel). Moments must appear in the same order as their
  zones; the builder validates this and shows a clear console error if
  not.
- Neighbouring zones blend whatever the order, so every zone pair must
  transition cleanly (blend by colour/sky/prop density, not bespoke
  per-pair transitions).

## Finale

Train pulls into the final evening station and stops. Camera smoothly moves
out of the first-person seat to a third-person view of the platform.

1. A low-poly **girl** figure steps off the train onto the platform.
2. A low-poly **boy** figure (the author) walks up and hands her a **bouquet of flowers**.
3. Small hearts / sparkles; optional confetti or fireworks over the town.
4. Card appears: the author's final **message** and the **"Happy 1 year"** wish.

Figures are simple, cute, stylised (like the reference's chunky little
people). Simple keyframed/tweened movement is fine — no rigging or
character animation pipeline needed. Hair/clothes colours set in config so the
author can make them resemble the two of them.

## Content / config

One file (e.g. `content.js` or `content.json`) plus a `photos/` folder.
Fields:

- her name, author's name
- intro title + intro note
- final message + 1-year wish text
- `zones`: ride order (see Zones)
- 10 moments: `photo` (filename), `date` (display text), `title`
  (short), `caption`, `zone`
- character colours (girl figure hair/outfit, boy figure hair/outfit)
- `music` file path (optional; empty = use generated music)

Until the author supplies photos, use **placeholder images** (generated, e.g.
soft-coloured cards with "Photo 1" etc.) and placeholder text clearly marked
for replacement. Include a short `README` telling the author how to swap photos,
edit text, add a song, and host on GitHub Pages / Netlify.

Photos will likely be phone photos (large, mixed portrait/landscape) — the
site must handle any aspect ratio. The README gives a one-line macOS
`sips` command to shrink photos (max ~1600px long side) before adding them;
the 3D signs additionally downscale textures to ≤1024px at load. Config is
a `content.js` (plain JS object) so it can hold comments explaining each
field.

## Music

For now: soft, romantic, generic background — generated in the browser with
Web Audio (e.g. gentle music-box / piano-ish chord loop). No downloaded
third-party audio files. When `music` in config points to an mp3, play that
instead (looped). Starts after "Begin the ride" tap; toggle on/off.

## Constraints

- **Phone first, portrait.** iPhone Safari and Android Chrome, plus in-app
  webviews. Touch controls. Safe-area insets (notch / home bar).
- **Performance:** keep scene light — low-poly, instanced/merged geometry,
  limited draw calls, no heavy post-processing, cap pixel ratio (~2),
  generate the world procedurally in code rather than loading big models.
- **Device baseline** (Claude's call; her exact phone unknown): iOS 15+
  Safari and Android Chrome from the last ~4 years, WebGL2. Automatic
  quality tiers: measure frame time in the first seconds and step down
  pixel ratio, prop density and shadows if slow. Start at medium.
  Test target: iPhone-sized portrait viewport in a browser, plus a real
  phone by the author before giving it to her.
- In-app webviews (Instagram, WhatsApp; iMessage opens Safari): must not
  break. Audio may only start after a tap; that's already the design.
- Static files only; must work served from any static host under a
  sub-path (GitHub Pages `user.github.io/repo/`).
- Three.js vendored locally (no runtime dependence on a CDN), no bundler
  required to run. Plain ES modules with relative imports — no import
  map (keeps older iOS working).
- **Preview needs a local web server**, not double-clicking
  `index.html`: browsers block local photos as 3D textures from `file://`.
  README gives a one-line preview command (`python3 -m http.server`) and
  GitHub Pages deploy steps. The author is comfortable with a terminal
  (uses Claude Code).
- No getforevermore code or assets copied.

## Timing and scope

The anniversary has already passed; this is a belated gift, so there is
**no deadline and nothing is cut**. Build the full experience, including
the "nice to have" items:

- small cartoon couple figures standing near some photo signs
- confetti / fireworks over the town in the finale
- per-zone ambient particles (petals, falling leaves, snow, fireflies or
  lantern glow at evening) — kept light for phones
- polished loading screen, ride again

Quality over speed: real-phone smoothness and charm matter more than
finishing fast. The author tests on a real phone before giving it to her.

## Decided by the author

- 3D world like the reference (not 2D).
- 10 moments.
- Train stops and waits at each moment.
- Timeline of moments.
- Finale: girl steps off, boy hands her flowers, then message + 1-year wish.
- Primary device: phone.
- Soft generic romantic music for now; the author adds their own song later.
- Zones: distinct, Claude's choice.
- No deadline (anniversary passed); full build, extras included.

## Claude's calls (the author can override)

- Seasonal zones listed above, laid out from config so they can be
  reordered/retagged to match real dates.
- Three.js, no build step, vendored, no import map.
- Device baseline + automatic quality tiers.
- Preview via local server; `content.js` config; `sips` resize tip.
- Generated Web Audio music as the placeholder.
- Timeline: unreached moments locked to keep the surprise.
- Content in one config file + photos folder; placeholders until filled.
- "Ride again" at the end.

## Left to the builder

- Exact track shape, ride length/speed (aim ~2–4 min including stops at a
  relaxed pace), prop designs, colour palette, typography, card styling,
  animation timings, how the timeline looks, loading screen design,
  file structure.
