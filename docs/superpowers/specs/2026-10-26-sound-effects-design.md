# Sound Effects and Ambience — Design

Addendum to `2026-10-18-anniversary-train-ride-design.md`. Approved by the author in conversation on
2026-10-26 ("All these sound great", plus the winter carol).

## Intent

The ride is quiet apart from the music. Gentle, believable sound makes the world feel alive: the little train
chuffing and whistling, the sea at the beach, birds in the meadow, a carol drifting over the snow, crickets in
the evening town, fireworks at the finale. Everything stays soft: the music is still the main thing, and the
effects sit just audible under it.

## Decided by the author

- Turn the song (built-in tune) down a bit.
- Train sounds at every stop and start: a "choo choo" whistle, steam, the train moving.
- Waves at the beach; birds chirping in some scenes.
- All the suggested sounds below are approved.
- Winter hills: a Christmas carol, faintly.

## Claude's calls (the author can override)

- **Everything is synthesized with Web Audio**, like the built-in tune: no audio files, no licensing, instant
  loading, and nothing third-party (global constraint).
- **One AudioContext for everything** (phones limit them; iOS unlocks one per tap), created inside the Begin tap
  as today. Music, ambience and effects are separate buses into one master chain.
- **The carol replaces the tune in winter** (crossfading with the zone blend), so two melodies never clash:
  *Silent Night* (Franz Gruber, 1818, public domain), played softly on the same music-box bell, slow, with the
  pad. Only for the built-in tune: when the author's own song plays (content.music), the song continues through
  winter and there is no carol.
- **The music button becomes one Sound button** (same element, `#music-toggle`, with a speaker icon; its
  accessible name is a static "Sound" and `aria-pressed` says whether it is on): it turns music, ambience and
  effects on and off together. `appState.music` keeps its meaning for it.
- **Video and Live Photo sound duck everything** (music, ambience and effects), not just the music.
- **Music is turned down by about a third** (MASTER_GAIN 0.16 → about 0.105, roughly −3.6 dB).

## The sounds

Levels below are targets for the mixed output measured offline (OfflineAudioContext), after the master chain.

### Train (the ride's own sounds)

| When | Sound |
|---|---|
| Departing (after Begin, after Continue) | Two short whistle toots ("choo-choo"), a puff of steam hiss, then chugs starting slow and speeding up with the train |
| Riding | A soft rhythmic chug and a gentle clickety-clack over the rail joints, both following the ride's speed; silent at a standstill |
| Braking into a stop | The chugs slow with the train; a soft brake hiss as braking begins |
| Stopped | A long, soft "pshhh" steam sigh, then quiet |
| Finale arrival | A longer, happy whistle as the train pulls into the Day 365 station |

- Whistle: a breathy two-to-three-note chord (sines/triangles with a little noise and vibrato), soft attack.
  Peak about −20 dBFS. Toots about 0.3 s and 0.45 s with a short gap.
- Chug: band-passed noise bursts with a quick decay, rate tied to speed (about 1.3 chugs/s at cruise, 6.5 m/s),
  level following speed. About −37 dBFS RMS while cruising (first −34; lowered 3 dB so the whistle stands out).
- Clickety-clack: two short clicks per rail joint (bogies), every 12 m of track at the ride's distance; quieter
  than the chug.
- Steam hiss/sigh: high-passed noise with a slow decay (sigh about 1.5 s).
- Brake hiss: short soft filtered-noise swell when the ride starts braking for a stop.

### Zone ambience (crossfaded with the scenery, using envAt's zoneA/zoneB/t like the particles)

| Zone | Ambience |
|---|---|
| Spring meadow | Songbirds chirping here and there (several call shapes, random timing, panned), a light breeze, a faint bee buzz now and then; an occasional soft hot-air-balloon burner whoosh |
| Summer beach | Waves rolling in and out every 8–10 s (swelling filtered noise), panned to the sea's side relative to where she is looking; an occasional distant seagull |
| Autumn forest | Rustling leaves in soft gusts; a few calmer birds, sparser than spring |
| Winter hills | Soft, muffled wind; a faint sleigh-bell jingle now and then; **the carol** in place of the tune |
| Evening town | Crickets; a distant clock-tower chime (a few soft bell strikes) once as the train enters the evening zone |

- Ambience bed about −36 dBFS RMS; occasional events (birds, gull, bells, chime, burner) peak about −24 dBFS.
- Events are random but never crowded (minimum gaps), and stop while stopped at a card only if the author's
  video/Live Photo sound is on (ducked like everything else).

### Finale and interface

- Fireworks: a soft pop and a crackle for each burst, in time with the finale's bursts; ends with the finale.
- Hearts and bouquet: a gentle sparkle chime (a few high bell notes) at the finale's 'hearts' event.
- Stop card: a quiet paper rustle as the card slides up.

## Behaviour and constraints

- Starts with the Begin tap; nothing plays before it. Respects the Sound button, ducking (video/Live Photo
  sound) and page hiding (everything suspends while hidden and comes back as she left it).
- `?speed=` time-warped rides (tests) must not pile up sounds: event schedulers clamp to real time and skip
  rather than burst.
- Performance: bounded live nodes (no more than ~40 at any time); shared noise buffers created once; one
  scheduler tick (~50 ms lookahead pattern, as the music does); no per-frame allocation in the parts driven
  from the frame loop.
- Safari 15.0 floor (no StereoPannerNode problems: it exists in Safari 14.1+; guard and fall back to no pan).
- DOM-free pure parts (schedules, rates, gains, the carol's notes) are unit-tested in Node.
- No audio files; the carol's melody is public domain.

## Acceptance

- Unit: chug rate and level from speed; rail-joint click distances; zone gains from an env blend (crossfade
  through zone pairs, every zone's ambience present only near its zone); wave pan from look yaw and the sea's
  side; the carol's notes (Silent Night melody, in key, sorted, loopable) and the tune/carol crossfade weight;
  event schedulers never firing more than their minimum gap allows, also under a time warp.
- Offline render (Playwright Chromium, OfflineAudioContext): the mixed output never clips (peak < 0.9); music
  bus about 3–4 dB quieter than before; ambience and effects within their target ranges.
- E2E: the Sound button turns everything off and on; video/Live Photo sound ducks ambience and effects too;
  page hidden suspends; no console errors on a full ride (Chromium, speed 50).
- Real phone (author): listen once on her kind of phone; adjust levels if anything is too loud.
