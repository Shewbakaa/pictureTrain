// The message card at the end of the ride: it rises over the evening station once the fireworks have begun. A
// small heart, the eyebrow ("One year of us"), the wish ("Happy 1 year, Maya") large in the display font, his
// message with its line breaks kept, his signoff in italics, and "Ride again", which takes her back to the start.
// The body scrolls inside the card, so a long message never pushes the button off the screen.

import { el, reveal, setChildren, svgEl } from './dom.js';

/** A small heart over the eyebrow (the same one as the 2D story's). */
function heart() {
  return svgEl('svg', { class: 'finale-heart', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M12 21s-7.4-4.5-9.5-9.1C1 8.6 3 5 6.5 5c2.1 0 3.6 1.2 4.6 2.6.4.5.6.5.9 0C13 6.2 14.4 5 16.5 5 20 5 22 8.6 20.5 11.9 18.4 16.5 12 21 12 21z' }),
  ]);
}

/**
 * Shows the card, replacing whatever it showed before. "Ride again" disables itself on its first tap, so a double
 * tap starts one ride.
 * @param {import('../content/normalize.js').Content} content
 * @param {{ onRideAgain: () => void }} handlers
 */
export function showFinaleCard(content, { onRideAgain }) {
  const { eyebrow, wish, message, signoff } = content.finale;
  const card = document.getElementById('finale-card');
  const again = el('button', { type: 'button', class: 'btn-primary finale-again' }, ['Ride again']);
  again.addEventListener('click', () => {
    if (again.disabled) return;
    again.disabled = true;
    onRideAgain();
  });
  setChildren(card, [
    el('div', { class: 'finale-card-body' }, [
      heart(),
      el('p', { class: 'eyebrow' }, [eyebrow]),
      el('h2', { class: 'finale-wish', id: 'finale-wish' }, [wish]),
      message ? el('p', { class: 'finale-message' }, [message]) : null,
      signoff ? el('p', { class: 'finale-signoff' }, [signoff]) : null,
    ]),
    el('div', { class: 'finale-card-footer' }, [again]),
  ]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'finale-wish');
  reveal(card);
}

/** Hides the card at once (the app does it under a fade). */
export function hideFinaleCard() {
  document.getElementById('finale-card').hidden = true;
}
