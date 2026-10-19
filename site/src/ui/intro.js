// The intro card: the first thing she reads, over the train waiting at the Day 1 station. An eyebrow, the title
// ("For <her name>"), a little squiggle, the author's note and the button that starts the ride.

import { el, reveal, setChildren, svgEl } from './dom.js';

/** A hand-drawn wave under the title (the 2D story, fallback.js, draws it under its title too). */
export function squiggle() {
  return svgEl('svg', { class: 'squiggle', viewBox: '0 0 72 12', 'aria-hidden': 'true', focusable: 'false' }, [
    svgEl('path', { d: 'M2 6c5-5 9-5 14 0s9 5 14 0 9-5 14 0 9 5 14 0 9-5 12-2' }),
  ]);
}

/**
 * Shows the intro card. The button disables itself on its first tap, so a double tap starts the ride once.
 * @param {import('../content/normalize.js').Content} content
 * @param {{ onBegin: () => void }} handlers
 */
export function showIntro(content, { onBegin }) {
  const { eyebrow, title, note, button: buttonText } = content.intro;
  const card = document.getElementById('intro');
  const begin = el('button', { type: 'button', class: 'btn-primary intro-begin' }, [buttonText]);
  begin.addEventListener('click', () => {
    if (begin.disabled) return;
    begin.disabled = true;
    onBegin();
  });
  setChildren(card, [
    el('p', { class: 'eyebrow' }, [eyebrow]),
    el('h1', { class: 'intro-title', id: 'intro-title' }, [title]),
    squiggle(),
    note ? el('p', { class: 'intro-note' }, [note]) : null,
    begin,
  ]);
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'intro-title');
  reveal(card);
}

/**
 * Hides the intro card. At once, with no fade: the train sets off the moment she taps, so the card is gone the
 * moment the ride has begun.
 */
export function hideIntro() {
  document.getElementById('intro').hidden = true;
}
