// The ride's controls: the progress pill and the Sound button along the top, the pause button beside the
// timeline along the bottom. The app tells them what to show; they tell the app when they are tapped. Once the
// ride is over, the timeline comes back under the finale's card, and the Sound button with it, since the music
// plays on; the pill and the pause button stay away, with no stop left to count down to and nothing to pause.
//
// The Sound button (#music-toggle) turns all the ride's sound on and off together: the music, the train and the
// ambience. Its label says which it is, "Sound on" or "Sound off", and it reads as pressed while the sound is on.

import { dismiss, reveal, setChildren, svgEl } from './dom.js';

const icon = (children) => svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, children);

const pauseIcon = () => icon([
  svgEl('rect', { x: 6.5, y: 5, width: 4, height: 14, rx: 1.6 }),
  svgEl('rect', { x: 13.5, y: 5, width: 4, height: 14, rx: 1.6 }),
]);

const playIcon = () => icon([
  svgEl('path', { d: 'M8.5 5.9v12.2c0 .9 1 1.4 1.7.9l9.3-6.1a1.1 1.1 0 0 0 0-1.8l-9.3-6.1c-.7-.5-1.7 0-1.7.9z' }),
]);

/** Two beamed notes; struck through when the sound is off. */
const musicIcon = (on) => icon([
  svgEl('g', { opacity: on ? 1 : 0.55 }, [
    svgEl('circle', { cx: 6.8, cy: 17.2, r: 2.6 }),
    svgEl('circle', { cx: 16.6, cy: 15.2, r: 2.6 }),
    svgEl('path', { d: 'M8.4 17.2V7.4l9.8-2.6v10.4', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svgEl('path', { d: 'M8.4 7.4l9.8-2.6v3.1L8.4 10.5z' }),
  ]),
  on ? null : svgEl('path', { d: 'M4.5 4.5l15 15', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
]);

/**
 * @typedef {{
 *   setPaused: (paused: boolean) => void, setMusic: (state: 'off'|'playing'|'blocked') => void,
 *   setProgress: (text: string) => void, show: () => void, showTimeline: () => void, hide: () => void,
 * }} Controls
 */

/**
 * Wires the buttons in #topbar and #bottombar. They start hidden; `show` brings both bars in, `showTimeline` only
 * the timeline and the music button (the bars without the progress pill and the pause button).
 * @param {{ onPauseToggle: () => void, onMusicToggle: () => void }} handlers
 * @returns {Controls}
 */
export function initControls({ onPauseToggle, onMusicToggle }) {
  const topbar = document.getElementById('topbar');
  const bottombar = document.getElementById('bottombar');
  const pill = document.getElementById('progress-pill');
  const pause = document.getElementById('pause-toggle');
  const music = document.getElementById('music-toggle');

  pill.setAttribute('role', 'status'); // read out as it changes: "Next stop · 3 of 10"
  pause.addEventListener('click', () => onPauseToggle());
  music.addEventListener('click', () => onMusicToggle());

  let shownPaused = null;
  let shownMusic = null;
  const controls = {
    setPaused(paused) {
      if (paused === shownPaused) return;
      shownPaused = paused;
      setChildren(pause, paused ? playIcon() : pauseIcon());
      pause.setAttribute('aria-label', paused ? 'Resume the ride' : 'Pause the ride');
    },
    setMusic(state) {
      const on = state === 'playing';
      if (on === shownMusic) return;
      shownMusic = on;
      setChildren(music, musicIcon(on));
      music.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
      music.setAttribute('aria-pressed', String(on));
    },
    setProgress(text) {
      if (pill.textContent !== text) pill.textContent = text;
    },
    show() {
      pill.hidden = false;
      pause.hidden = false;
      reveal(topbar);
      reveal(bottombar);
    },
    showTimeline() {
      pill.hidden = true;  // no next stop once the ride is over
      pause.hidden = true; // and nothing to pause
      reveal(topbar);      // but the music plays on, so the Sound button comes back
      reveal(bottombar);
    },
    hide() {
      for (const bar of [topbar, bottombar]) dismiss(bar, [{ opacity: 1 }, { opacity: 0 }]);
    },
  };
  controls.setPaused(false);
  controls.setMusic('off');
  return controls;
}
