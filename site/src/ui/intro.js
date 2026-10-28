// The intro card: the first thing she reads, over the train waiting at the Day 1 station. It is a boarding ticket: an
// eyebrow, the title ("For <her name>"), a little squiggle, the author's note, the route and her seat, the button that
// starts the ride and, under it, a small line suggesting headphones (unless the author has turned it off); and the
// ticket's stub, ADMIT ONE, along a perforated edge. When she taps Begin a punch clips a little heart out of the stub,
// the stub tears off and the ticket slides away, while the ride starts underneath at once.

import { el, prefersReducedMotion, reveal, setChildren, svgEl } from './dom.js';

/** Where the ride goes, printed on the ticket: from the first station to the last. */
const ROUTE = 'From Day 1 · To Day 365';

/** And where she sits. */
const SEAT = 'Seat: by the window';

/**
 * How long the ticket takes to leave once punched (ms), counted from the call: the punch, the stub tearing off and the
 * slide away, the last of which (`.ticket.punched` in styles.css) ends 640 ms after the first frame. The rest is for
 * the tap's other work (starting the ride), which can hold that first frame back: a ticket is never still up a
 * second after her tap.
 */
export const PUNCH_MS = 680;

/** A hand-drawn wave under the title (the 2D story, fallback.js, draws it under its title too). */
export function squiggle() {
  return svgEl('svg', { class: 'squiggle', viewBox: '0 0 72 12', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M2 6c5-5 9-5 14 0s9 5 14 0 9-5 14 0 9 5 14 0 9-5 12-2' }),
  ]);
}

/** A pair of headphones, drawn in the colour of the line it stands beside. */
function headphonesIcon() {
  return svgEl('svg', { class: 'intro-hint-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M4 15v-3a8 8 0 0 1 16 0v3' }),
    svgEl('rect', { x: 3, y: 13.5, width: 4.5, height: 7, rx: 1.8 }),
    svgEl('rect', { x: 16.5, y: 13.5, width: 4.5, height: 7, rx: 1.8 }),
  ]);
}

/**
 * The route and the seat, printed under the note (the 2D story's ticket, fallback.js, prints them too).
 * @returns {HTMLElement[]}
 */
export function ticketLines() {
  return [el('p', { class: 'ticket-route' }, [ROUTE]), el('p', { class: 'ticket-seat' }, [SEAT])];
}

/**
 * The ticket's two pieces of paper: the main part, with `body` (which scrolls if a phone is too small for it) and
 * under it `actions` (the button and its hint, which stay where she can reach them), and the stub, which says ADMIT ONE
 * with the punch's heart between the words. The stub is decoration, so it is hidden from screen readers.
 * @param {unknown[]} body
 * @param {unknown[]} [actions]
 * @returns {HTMLElement[]}
 */
export function ticketParts(body, actions = []) {
  return [
    el('div', { class: 'ticket-main' }, [
      el('div', { class: 'ticket-body' }, body),
      actions.length ? el('div', { class: 'ticket-actions' }, actions) : null,
    ]),
    el('div', { class: 'ticket-stub', 'aria-hidden': 'true' }, [
      el('span', { class: 'ticket-admit' }, ['ADMIT ', el('span', { class: 'ticket-hole' }), 'ONE']),
    ]),
  ];
}

/** The promise for the ticket on its way out (`null` while it is not leaving). */
let leaving = null;

/**
 * Shows the intro card. The button disables itself on its first tap, so a double tap starts the ride once.
 * @param {import('../content/normalize.js').Content} content
 * @param {{ onBegin: () => void }} handlers
 */
export function showIntro(content, { onBegin }) {
  const { eyebrow, title, note, button: buttonText, hint } = content.intro;
  const card = document.getElementById('intro');
  const begin = el('button', { type: 'button', class: 'btn-primary intro-begin' }, [buttonText]);
  begin.addEventListener('click', () => {
    if (begin.disabled) return;
    begin.disabled = true;
    onBegin();
  });
  card.classList.add('ticket');
  setChildren(card, ticketParts([
    el('p', { class: 'eyebrow' }, [eyebrow]),
    el('h1', { class: 'intro-title', id: 'intro-title' }, [title]),
    squiggle(),
    note ? el('p', { class: 'intro-note' }, [note]) : null,
    ...ticketLines(),
  ], [
    begin,
    hint ? el('p', { class: 'intro-hint' }, [headphonesIcon(), hint]) : null,
  ]));
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'intro-title');
  reveal(card);
}

/**
 * Takes the ticket away. A punch clips the heart out of its stub, the stub tears off and the ticket slides away (the
 * `punched` class, which styles.css animates), PUNCH_MS in all; the returned promise resolves once it is gone. The
 * ride does not wait for it: the train sets off the moment she taps, and until the ticket has gone it lets her taps
 * through to the view behind it. With reduced motion there is no punch, and the card is gone at once, the promise
 * already resolved.
 * @returns {Promise<void>}
 */
export function hideIntro() {
  const card = document.getElementById('intro');
  if (leaving) return leaving;
  if (card.hidden) return Promise.resolve();
  if (prefersReducedMotion()) {
    card.hidden = true;
    return Promise.resolve();
  }
  card.classList.add('punched', 'is-leaving');
  leaving = new Promise((resolve) => {
    setTimeout(() => {
      leaving = null;
      card.hidden = true;
      card.classList.remove('is-leaving');
      resolve();
    }, PUNCH_MS);
  });
  return leaving;
}
