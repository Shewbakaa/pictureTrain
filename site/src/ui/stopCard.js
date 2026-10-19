// The stop card: a sheet that slides up from the bottom while the train stands at a moment's photo sign. The
// date, the title, the whole photo (never cropped) on a soft mount, the caption, and a footer with
// "Moment N of M" and Continue. Everything but the footer scrolls, so a long caption never pushes Continue away.
// A video moment shows its clip instead of the photo, playing muted, with a round speaker button that turns its
// sound on (the music fades out for it). A Live Photo shows its still with a LIVE badge: its motion plays once,
// silently, as the card comes up, then settles back to the still; a tap on it plays it again with its sound.

import { placeholderPalette } from '../photos/photos.js';
import { el, reveal, setChildren, svgEl } from './dom.js';

/** The speaker on the video: crossed out while the clip is muted, with sound waves while it plays aloud. */
function speakerIcon(on) {
  const body = svgEl('path', { d: 'M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z', fill: 'currentColor' });
  const marks = on
    ? [svgEl('path', { d: 'M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.4 7.4 0 0 1 0 10.4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' })]
    : [svgEl('path', { d: 'M15.5 9.5l5 5m0-5l-5 5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' })];
  return svgEl('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true', focusable: 'false' }, [body, ...marks]);
}

/** The Live Photo the card is showing: hiding the card (or the next card) stops it and gives the music back. */
let stopLive = null;

/** The Live Photo mark: a dot in two rings, the outer one dashed. */
function liveIcon() {
  return svgEl('svg', { viewBox: '0 0 24 24', width: 14, height: 14, 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('circle', { cx: 12, cy: 12, r: 2.6, fill: 'currentColor' }),
    svgEl('circle', { cx: 12, cy: 12, r: 6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }),
    svgEl('circle', { cx: 12, cy: 12, r: 9.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-dasharray': '1.6 2.2' }),
  ]);
}

/**
 * A Live Photo: its still, with its motion (asset.live) over it, shown only while it plays. With `autoplay` the
 * motion plays once, muted, as soon as it is shown; a tap plays it again from the start with its sound, and
 * `onLiveSound(true)` / `onLiveSound(false)` tell the app when its sound starts and stops (the music fades for it).
 */
function momentLive(moment, asset, { onLiveSound = () => {}, autoplay = false }) {
  const motion = asset.live;
  motion.classList.add('stop-live-motion');
  motion.setAttribute('aria-hidden', 'true');
  motion.controls = false;
  const still = el('img', { src: asset.src, alt: moment.title, width: asset.width, height: asset.height, decoding: 'async' });
  const badge = el('span', { class: 'live-badge', 'aria-hidden': 'true' }, [liveIcon(), 'LIVE']);
  const button = el('button', { type: 'button', class: 'stop-live', 'aria-label': 'Play the Live Photo with its sound' }, [still, motion, badge]);
  const figure = el('figure', { class: 'stop-photo stop-photo-live' }, [button]);
  let loud = false;
  const sound = (on) => {
    if (on === loud) return;
    loud = on;
    onLiveSound(on);
  };
  const settle = () => {
    figure.classList.remove('is-playing');
    if (!motion.paused) motion.pause();
    motion.muted = true;
    sound(false);
  };
  const play = (withSound) => {
    motion.currentTime = 0;
    motion.muted = !withSound;
    sound(withSound);
    let outcome;
    try {
      outcome = motion.play();
    } catch (error) {
      outcome = Promise.reject(error);
    }
    Promise.resolve(outcome).catch(() => settle()); // held back (iOS Low Power Mode): the still stays
  };
  // Shown only once it has a picture, so the still never blinks to black; properties, not listeners, because
  // the same <video> comes back if she rides past this moment again.
  motion.onplaying = () => figure.classList.add('is-playing');
  motion.onended = settle;
  button.addEventListener('click', () => play(true));
  stopLive = settle;
  if (autoplay) play(false);
  return figure;
}

/**
 * A video moment's clip, its own <video> (the one its sign shows), in the photo's mount. With `onSound`, a speaker
 * button over it turns its sound on and off: `onSound(on)` answers whether the sound really is on. With
 * `controls`, the browser's own controls instead (the 2D story).
 */
function momentVideo(moment, asset, { onSound, soundOn = false, controls = false }) {
  const video = asset.video;
  video.classList.add('stop-video');
  video.setAttribute('aria-label', moment.title);
  video.controls = controls;
  const children = [video];
  if (onSound && !controls) {
    const button = el('button', { type: 'button', class: 'stop-sound' });
    const show = (on) => {
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.setAttribute('aria-label', on ? 'Turn the video sound off' : 'Turn the video sound on');
      setChildren(button, speakerIcon(on));
    };
    show(soundOn);
    button.addEventListener('click', () => show(onSound(button.getAttribute('aria-pressed') !== 'true')));
    children.push(button);
  }
  return el('figure', { class: 'stop-photo stop-photo-video' }, children);
}

/**
 * The moment's photo, shown whole (the 2D story, fallback.js, shows it the same way). A browser that would not give
 * the photos a canvas leaves a placeholder without a picture (`src` ''), which gets a pastel block in the
 * placeholder's own colours instead of a broken image.
 * A video moment's clip goes through `momentVideo`.
 * @param {import('../content/normalize.js').Moment} moment
 * @param {import('../photos/photos.js').PhotoAsset|null} asset
 * @param {{ onSound?: (on: boolean) => boolean, soundOn?: boolean, controls?: boolean,
 *           onLiveSound?: (on: boolean) => void, autoplay?: boolean }} [video]  for a video moment or a Live Photo
 * @returns {HTMLElement}  a figure.stop-photo
 */
export function momentPhoto(moment, asset, video = {}) {
  if (asset && asset.kind === 'video' && asset.video) return momentVideo(moment, asset, video);
  if (asset && asset.live && asset.src) return momentLive(moment, asset, video);
  if (asset && asset.src) {
    return el('figure', { class: 'stop-photo' }, [
      el('img', { src: asset.src, alt: moment.title, width: asset.width, height: asset.height, decoding: 'async' }),
    ]);
  }
  const { from, to } = placeholderPalette(moment.index);
  const blank = el('div', { class: 'stop-photo-blank', role: 'img', 'aria-label': moment.title });
  blank.style.backgroundImage = `linear-gradient(160deg, ${from}, ${to})`;
  return el('figure', { class: 'stop-photo' }, [blank]);
}

/**
 * Shows the card for `moment`, replacing whatever it showed before. Continue disables itself on its first tap,
 * so a double tap only ever moves on one stop.
 * @param {import('../content/normalize.js').Moment} moment
 * @param {import('../photos/photos.js').PhotoAsset|null} asset
 * @param {{ total: number, onContinue: () => void, onSound?: (on: boolean) => boolean,
 *           onLiveSound?: (on: boolean) => void }} options  `total` is the number of moments; `onSound` turns a
 *   video moment's sound on or off and answers whether it is on; `onLiveSound` hears a Live Photo's sound start
 *   and stop
 */
export function showStopCard(moment, asset, { total, onContinue, onSound, onLiveSound }) {
  endLive();
  const card = document.getElementById('stop-card');
  const next = el('button', { type: 'button', class: 'btn-primary' }, ['Continue']);
  next.addEventListener('click', () => {
    if (next.disabled) return;
    next.disabled = true;
    onContinue();
  });
  setChildren(card, [
    el('div', { class: 'stop-card-body' }, [
      moment.date ? el('p', { class: 'eyebrow stop-date' }, [moment.date]) : null,
      el('h2', { class: 'stop-title', id: 'stop-title' }, [moment.title]),
      momentPhoto(moment, asset, { onSound, onLiveSound, autoplay: true }),
      moment.caption ? el('p', { class: 'stop-caption' }, [moment.caption]) : null,
    ]),
    el('div', { class: 'stop-card-footer' }, [
      el('span', { class: 'stop-count' }, [`Moment ${moment.index + 1} of ${total}`]),
      next,
    ]),
  ]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'stop-title');
  reveal(card);
}

/**
 * Hides the card. At once, with no slide: her view is already turning back to the track as the train sets off,
 * and at a high debug speed the next stop can come before a slide would have finished.
 */
export function hideStopCard() {
  endLive();
  document.getElementById('stop-card').hidden = true;
}

/** Stops the Live Photo the card was showing, if any. */
function endLive() {
  if (!stopLive) return;
  const stop = stopLive;
  stopLive = null;
  stop();
}
