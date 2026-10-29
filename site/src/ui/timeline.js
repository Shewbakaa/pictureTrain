// The timeline: a dot for every moment on a thin line along the bottom of the screen. Moments she has reached
// are rose and take her back there when tapped; the one the train is standing at wears a ring; the ones still
// ahead are pale, say nothing about themselves and do nothing, so the surprise is kept.
//
// `timelineItems` is pure, and `renderTimeline` only touches the DOM once it is called, so the Node unit tests
// can import this module.

import { el, prefersReducedMotion } from './dom.js';

/**
 * @typedef {{ index: number, date: string, title: string, state: 'locked'|'reached'|'current', label: string }} TimelineItem
 *   `label` is what the dot is called to a screen reader; a locked one gives nothing away.
 */

/**
 * @param {Array<{ index: number, date: string, title: string }>} moments  in ride order
 * @param {{ reachedMax: number, currentIndex: number }} where
 *   `reachedMax` is the furthest moment reached (-1 for none); `currentIndex` the one the train stands at, or -1
 * @returns {TimelineItem[]}
 */
export function timelineItems(moments, { reachedMax, currentIndex }) {
  return moments.map(({ index, date, title }) => {
    let state = 'reached';
    if (index > reachedMax) state = 'locked';
    else if (index === currentIndex) state = 'current';
    let label = date ? `${date}: ${title}` : title;
    if (state === 'locked') label = `Moment ${index + 1} (not reached yet)`;
    return { index, date, title, state, label };
  });
}

/** Points `button` at `item`: its look, its name, and whether it is the current step or locked. */
function applyItem(button, item) {
  button.className = `timeline-dot is-${item.state}`;
  button.setAttribute('aria-label', item.label);
  if (item.state === 'locked') button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
  if (item.state === 'current') button.setAttribute('aria-current', 'step');
  else button.removeAttribute('aria-current');
}

/** Scrolls `container` sideways so `button` sits in its middle, as far as the ends allow. */
function centre(container, button) {
  const box = container.getBoundingClientRect();
  if (box.width === 0) return; // hidden: nothing to scroll yet
  const dot = button.getBoundingClientRect();
  const left = container.scrollLeft + (dot.left + dot.width / 2) - (box.left + box.width / 2);
  const max = container.scrollWidth - container.clientWidth;
  container.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Draws `items` into `container` (nav#timeline): one button per moment, at least 44 px square. Redrawing the
 * same number of moments updates the buttons in place, so focus and scroll survive. The strip scrolls sideways
 * when it is wider than the screen and keeps the current dot (or, while riding, the last one reached) in view.
 * @param {HTMLElement} container
 * @param {TimelineItem[]} items
 * @param {{ onJump: (index: number) => void }} handlers  hears a tap on a reached dot that is not the current one
 */
export function renderTimeline(container, items, { onJump }) {
  let list = container.querySelector('.timeline-track');
  if (!list || list.children.length !== items.length) {
    list = el('ol', { class: 'timeline-track' }, items.map(() => el('li', {}, [el('button', { type: 'button' })])));
    container.textContent = '';
    container.appendChild(list);
    if (!container.hasAttribute('aria-label')) container.setAttribute('aria-label', 'Your moments');
  }
  const buttons = Array.from(list.querySelectorAll('button'));
  items.forEach((item, at) => {
    const button = buttons[at];
    applyItem(button, item);
    button.onclick = () => {
      if (item.state === 'reached') onJump(item.index);
    };
  });

  // The line between the dots is rose up to the last one reached.
  let lastReached = -1;
  items.forEach((item, at) => {
    if (item.state !== 'locked') lastReached = at;
  });
  list.style.setProperty('--reached', String(Math.max(0, lastReached)));

  const current = items.findIndex((item) => item.state === 'current');
  const focus = current >= 0 ? current : Math.max(0, lastReached);
  if (buttons[focus]) centre(container, buttons[focus]);
}
