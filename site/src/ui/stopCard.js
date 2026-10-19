// The stop card: a sheet that slides up from the bottom while the train stands at a moment's photo sign. The
// date, the title, the whole photo (never cropped) on a soft mount, the caption, and a footer with
// "Moment N of M" and Continue. Everything but the footer scrolls, so a long caption never pushes Continue away.

import { placeholderPalette } from '../photos/photos.js';
import { el, reveal, setChildren } from './dom.js';

/**
 * The moment's photo, shown whole. A browser that would not give the photos a canvas leaves a placeholder
 * without a picture (`src` ''), which gets a pastel block in the placeholder's own colours instead of a broken image.
 * @param {import('../content/normalize.js').Moment} moment
 * @param {import('../photos/photos.js').PhotoAsset|null} asset
 */
function photo(moment, asset) {
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
 * @param {{ total: number, onContinue: () => void }} options  `total` is the number of moments
 */
export function showStopCard(moment, asset, { total, onContinue }) {
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
      photo(moment, asset),
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
  document.getElementById('stop-card').hidden = true;
}
