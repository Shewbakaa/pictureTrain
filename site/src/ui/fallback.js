// The 2D story: what she sees when her browser cannot draw the 3D ride (no WebGL2, which some in-app browsers lack,
// or a first frame that fails), and with ?fallback=1. It is the ride told as a little scrapbook she scrolls through:
// the intro (the boarding ticket, with nothing to tap), then every moment in order on a cream card with its photo
// whole, its date, title and caption, and at the end the wish, the message and the signoff. Same cards, fonts and
// photos as the ride, so it never reads as an error page. A video moment's clip plays here with the browser's own
// controls.

import { appState } from '../state.js';
import { el, setChildren, svgEl } from './dom.js';
import { squiggle, ticketLines, ticketParts } from './intro.js';
import { momentPhoto } from './stopCard.js';

/** A small heart over the wish. */
function heart() {
  return svgEl('svg', { class: 'fallback-heart', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M12 21s-7.4-4.5-9.5-9.1C1 8.6 3 5 6.5 5c2.1 0 3.6 1.2 4.6 2.6.4.5.6.5.9 0C13 6.2 14.4 5 16.5 5 20 5 22 8.6 20.5 11.9 18.4 16.5 12 21 12 21z' }),
  ]);
}

/**
 * Fills #fallback with the story and shows it.
 * @param {import('../content/normalize.js').Content} content
 * @param {import('../photos/photos.js').PhotoAsset[]} assets  the moments' photos, as the 3D ride would have used them
 */
export function showFallback(content, assets) {
  const { intro, finale, moments } = content;
  const page = document.getElementById('fallback');
  setChildren(page, el('div', { class: 'fallback-page' }, [
    // The same boarding ticket as the ride opens with, already punched, with nothing to tap.
    el('header', { class: 'fallback-card fallback-intro ticket' }, ticketParts([
      el('p', { class: 'eyebrow' }, [intro.eyebrow]),
      el('h1', { class: 'intro-title' }, [intro.title]),
      squiggle(),
      intro.note ? el('p', { class: 'intro-note' }, [intro.note]) : null,
      ...ticketLines(),
    ])),
    el('ol', { class: 'fallback-moments' }, moments.map((moment) => el('li', { class: 'fallback-card fallback-moment' }, [
      momentPhoto(moment, assets.find((asset) => asset.index === moment.index) || null, { controls: true }),
      moment.date ? el('p', { class: 'eyebrow fallback-date' }, [moment.date]) : null,
      el('h2', { class: 'fallback-title' }, [moment.title]),
      moment.caption ? el('p', { class: 'fallback-caption' }, [moment.caption]) : null,
    ]))),
    el('footer', { class: 'fallback-card fallback-finale' }, [
      heart(),
      el('p', { class: 'eyebrow' }, [finale.eyebrow]),
      el('h2', { class: 'fallback-wish' }, [finale.wish]),
      finale.message ? el('p', { class: 'fallback-message' }, [finale.message]) : null,
      finale.signoff ? el('p', { class: 'fallback-signoff' }, [finale.signoff]) : null,
    ]),
  ]));
  page.hidden = false;
  appState.phase = 'fallback';
  appState.mode = 'fallback';
}
