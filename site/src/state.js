// The app-state contract. The app mirrors what it is doing into `appState`; e2e tests (and a
// curious person in the console) read a snapshot of it through `window.__app.state`.
// Other modules mutate `appState` directly.
//
// phase: 'loading' | 'intro' | 'riding' | 'stopped' | 'finale' | 'done' | 'fallback' | 'error'
// mode:  '3d' | 'fallback' | null (null until the first 3D frame or the fallback page is shown)
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
  quality: null,
  drawCalls: 0,
  triangles: 0,
  music: 'off',
  musicSource: null,
  audioSuspended: false,
  finaleTime: null,
  view: 'cabin',
};

if (typeof window !== 'undefined') {
  window.__app = {
    get state() {
      return { ...appState };
    },
  };
}
