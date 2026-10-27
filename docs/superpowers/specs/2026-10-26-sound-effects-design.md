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
  level following speed. About −40 dBFS RMS while cruising (first −34; lowered about 6 dB so the whistle's
  loudest moment is clearly above the chug's).
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
  After the first measurements: the crickets about 6 dB under the other beds (high tones carry), and the sleigh
  bells, the fireworks and the sparkle about 6 dB over the other events (they must be clearly heard).
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

## Addendum: per-zone music

Approved by the author on 2026-10-27: romantic instrumental music for each scene instead of the single built-in
tune. This replaces "Everything is synthesized with Web Audio … no audio files" above (and the global "no
third-party audio files" rule) for the music only: the four recordings are public domain (CC0) and served from
the site itself, like the photos. Everything else here still holds.

| Zone | Music |
|---|---|
| Spring meadow | `site/music/zones/spring.mp3`: Chopin, *Wiosna* ("Spring"), 1:27 |
| Summer beach | `site/music/zones/summer.mp3`: Chopin, Nocturne Op. 9 No. 2, 4:37 |
| Autumn forest | `site/music/zones/autumn.mp3`: Chopin, Prelude Op. 28 No. 15 "Raindrop", 4:55 |
| Winter hills | The synthesized music-box *Silent Night* (carol.js), unchanged |
| Evening town (and the finale) | `site/music/zones/evening.mp3`: Chopin, Nocturne Op. 27 No. 2, 6:18 |

- **Source.** Musopen's Complete Chopin Collection (https://archive.org/details/musopen-chopin, CC0 1.0),
  loudness-normalised to about −25 to −26 LUFS integrated (peaks ≤ −5.8 dBFS), re-encoded to 96 kbps 44.1 kHz
  stereo MP3 without metadata. Credited in the README.
- **One piece per zone, crossfaded by the zone blend** (`audio/zoneMusic.js`). Each piece's share follows its
  zone's weight (envAt's zoneA/zoneB/t, as the ambience) through the carol's dip: across a boundary the piece
  behind fades out over t 0 to 0.55 and the piece ahead rises over t 0.45 to 1, equal-power, so both sound only
  between t 0.45 and 0.55, faintly (each about 0.14 of its level at t 0.5): two melodies are never loud together. The carol now crosses with its neighbours this way (it used to cross with
  the tune; the curve is the same).
- **The built-in tune is a fallback only.** A zone whose recording cannot load or play (missing, not audio)
  plays the tune instead, with `[music] Could not play "music/zones/<zone>.mp3" — the built-in tune plays in
  this scene instead.` A recording the browser refuses for want of a tap (NotAllowedError: the unlock did not
  take) is only held back: the tune plays there "for now", with a warning saying the browser held the file back
  until a tap, and her next tap on the Sound button plays and pauses each held-back element again (it has its
  file by then), after which it takes over from the tune. Two neighbouring zones both on the tune play it whole
  across their boundary.
- **Her song (content.music) overrides everything**: it plays throughout, with no zone piece and no carol, and
  no zone file is fetched. If it fails, the zones' music takes over (it used to be the tune).
- **Starting and stopping.** A piece starts from its top as its zone becomes audible. A recording loops, fading
  out over its last 3 s and, after the seam, in over 1 s (the files end in 2.6–4.3 s of silence, so the seam is
  the piece's own ending and a breath). When its share returns to 0 a recording plays on for a 0.5 s tail while
  its gain eases out, then pauses and rewinds; the carol and the tune stop booking notes at once, as before. At
  most two pieces play at once: a piece starting while two others play cuts short any fading tail (only a jump
  from the middle of a blend makes three). Timeline jumps and Ride again simply move the zone weights, so the
  pieces follow. At the finale the evening piece plays on.
- **Routing.** `HTMLAudioElement → MediaElementAudioSourceNode → seam gain → share × trim gain → the soundtrack's
  fader → the music bus`, on the one shared context: the Sound button, ducking, hiding and the master fader
  apply. Holding the sound (off, ducked, hidden) pauses each element where it is; it plays on from there. When
  the page is hidden the elements are paused at once, not after the 40 ms fade's timer, since a background
  page's timers may never run (and a playing element would show in iOS's Now Playing).
- **iOS.** Each element needs a tap of its own. All four are created inside the Begin tap with no file, and
  unlocked there with play() then pause(), so nothing is downloaded. A file is fetched (`preload='auto'`, src set)
  once its zone is within 250 m of the train or is the next zone, only while the sound is wanted and not held
  back by the browser; otherwise when it is first played. If the context could only be made on a later Sound tap,
  the elements are made and unlocked in that tap. Playwright's WebKit does not enforce the gesture rule, so this
  is checked on a real iPhone (README section 6).
- **Levels.** The tune comes out of its instruments at −13.46 LUFS (both speakers, measured offline); each
  recording gets a trim of 10^((−13.46 − its LUFS)/20), +11.5 to +12.9 dB, before the music bus. Through the
  master chain (offline, whole files): tune −22.75 LUFS / −25.21 dBFS RMS; recordings −22.74 to −22.94 LUFS /
  −25.65 to −25.94 dBFS RMS, peaks −7.2 to −5.8 dBFS. Their loudest chords (short-term max −16.3 to −16.9 LUFS,
  against the tune's −20.0) reach the compressor, which takes up to about 3 dB off their peaks and 0.1–0.2 LU off
  their loudness. Measured again in real time in Chromium (AnalyserNodes on the music bus, the first 40 s, through
  the real MediaElementSource path): the same as offline within 0.05 dB.
- **State.** `appState.musicPiece`: the piece the train's place calls for, the largest share, whether or not
  the sound is on ('spring'|'summer'|'autumn'|'winter'|'evening'|'tune'|'file'; null before Begin and until the
  scenes' music has first been allowed to play). `appState.musicSource` is now 'built-in' or 'file' (it was
  'generated' or 'file').
- **Code.** `zoneMusic.js` (the numbers), `recording.js` (one element), `soundtrack.js` (the pieces' lifecycle,
  tails and the two-piece cap), `musicBox.js` (the carol's and the tune's instruments and note scheduler) and
  `music.js` (the context, her song, and the Sound button, hiding and ducking).

Acceptance: unit tests for the N-piece dip at every zone pair, the start/stop/rewind and tail decisions, at most
two pieces, the loop-seam timing, the preload distance and the fallback choice (`zoneMusic.test.js`,
`soundtrack.test.js`, `recording.test.js`); an offline level test of every recording against the tune
(`zoneMusicLevels.spec.js`); E2E on both engines for spring giving way to summer (≤ 2 playing), the carol after a
jump into winter, a 404 giving the tune with the warning, Sound off, ducking and hiding pausing the pieces, her
song staying 'file' through every zone, and no console errors on a full ride at speed 50 (Chromium).
