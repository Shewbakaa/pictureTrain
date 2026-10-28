// The app-state contract. The app mirrors what it is doing into `appState`; e2e tests (and a
// curious person in the console) read a snapshot of it through `window.__app.state`.
// Other modules mutate `appState` directly.
//
// phase: 'loading' | 'intro' | 'riding' | 'stopped' | 'finale' | 'done' | 'fallback' | 'error'
// mode:  '3d' | 'fallback' | null (null until the first 3D frame or the fallback page is shown)
// ambience: the zones whose ambience is playing (their beds are up), e.g. ['spring'] or ['spring', 'summer']
// musicSource: 'built-in' (each scene's own music) | 'file' (her song) | null before the ride UI is up
// musicPiece: the piece of music the train's place calls for (the one with the largest share), whether or not the
//   sound is on: a scene's own 'spring' | 'summer' | 'autumn' | 'winter' (the carol) | 'evening', 'tune' (the
//   built-in tune, standing in for a scene whose recording cannot play or is held back), 'file' (her song), or null
//   (before Begin, and until the scenes' music has first been allowed to play)
// carol: how much of the music is the winter carol, 0 to 1
// finaleCues: the finale's own sounds played since the train last pulled in at the Day 365 station, in order, by name
//   ('bell', 'hop', 'land', 'dress', 'door', 'shop-bell', 'step', 'heartbeat', 'crinkle', 'sparkle', 'doves',
//   'firework'), the first 64 of them; [] before
// tunnel: how far inside the tunnel the train is (world/tunnel.js tunnelInside), 0 out in the open to 1 inside, easing
//   over the first and last few metres; 0 on a ride without a tunnel
// finalePets: how many pets the finale is showing (world/pets.js): 1 from the moment its dog or cat trots out of the
//   station house with him, 0 before that, outside the finale and when content.js `pets` is 'none'
// finaleDoves: how many doves the finale is showing (world/birds.js): up to 5, sitting on the station house's roof from
//   the start of the finale and then flying until they are gone, 6 s after the fireworks start; 0 after that and outside
//   the finale (fewer on the lower quality tiers)
// wakeLock: whether the screen is being kept awake: 'held', 'off' (not at the moment: before Begin, or the browser has
//   let it go while the page was away), 'refused' (the browser said no) or 'none' (it has no Wake Lock API)
export const appState = {
  phase: 'loading',
  mode: null,
  distance: 0,
  speed: 0,
  stopIndex: -1,
  nextStopIndex: -1,
  reachedMax: -1,
  paused: false,
  yaw: 0,
  tunnel: 0,
  quality: null,
  drawCalls: 0,
  triangles: 0,
  music: 'off',
  musicSource: null,
  musicPiece: null,
  audioSuspended: false,
  videoSound: false,
  ambience: [],
  carol: 0,
  finaleCues: [],
  finaleTime: null,
  finalePets: 0,
  finaleDoves: 0,
  view: 'cabin',
  wakeLock: 'off',
};

if (typeof window !== 'undefined') {
  window.__app = {
    get state() {
      return { ...appState };
    },
  };
}
