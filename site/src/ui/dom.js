// Small DOM helpers the ride UI shares: building elements without ever parsing HTML, showing and hiding panels
// with a gentle animation, and the blush fade that hides a jump along the track.
//
// Nothing here touches the DOM until it is called, so modules that import it can still be imported by Node.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** How long a panel takes to leave (ms) unless the caller says otherwise. */
const LEAVE_MS = 200;

/**
 * Sets `attrs` on `node`. `null`, `undefined` and `false` are left out, `true` sets an empty attribute, and a
 * function under an `on...` name becomes an event listener (`onClick` listens for 'click').
 */
function setAttributes(node, attrs) {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function' && name.startsWith('on')) {
      node.addEventListener(name.slice(2).toLowerCase(), value);
    } else {
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
}

/** Appends `children` to `node`: nodes as they are, anything else as a text node. Nested arrays are flattened. */
function appendChildren(node, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else node.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/**
 * Creates an HTML element. Text children become text nodes, so author text can never turn into markup.
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {unknown[]|unknown} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  setAttributes(node, attrs);
  appendChildren(node, children);
  return node;
}

/**
 * Replaces everything inside `node` with `children`, treated as `el` treats them.
 * @param {Element} node
 * @param {unknown[]|unknown} children
 */
export function setChildren(node, children) {
  node.textContent = '';
  appendChildren(node, children);
}

/**
 * Creates an SVG element (an icon or a little flourish), the same way as `el`.
 * @returns {SVGElement}
 */
export function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  setAttributes(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Whether she has asked her phone for less motion. */
export function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The leave animation each panel is playing, so showing it again can cut it short. */
const leaving = new WeakMap();

/**
 * Unhides `element`; its CSS entrance animation, if it has one, plays as it appears. A `dismiss` still playing is
 * cut short, so a panel shown again straight away never vanishes a moment later.
 * @param {HTMLElement} element
 */
export function reveal(element) {
  const animation = leaving.get(element);
  if (animation) {
    leaving.delete(element);
    animation.cancel();
  }
  element.classList.remove('is-leaving');
  element.hidden = false;
}

/**
 * Plays `keyframes` on `element` and then hides it; with reduced motion (or no Web Animations) it hides at once.
 * While it leaves it has the class `is-leaving`, which lets taps through to whatever is behind it.
 * @param {HTMLElement} element
 * @param {Keyframe[]} keyframes
 * @param {{ duration?: number, delay?: number }} [timing]  ms
 */
export function dismiss(element, keyframes, { duration = LEAVE_MS, delay = 0 } = {}) {
  if (element.hidden || leaving.has(element)) return;
  if (prefersReducedMotion() || typeof element.animate !== 'function') {
    element.hidden = true;
    return;
  }
  element.classList.add('is-leaving');
  const animation = element.animate(keyframes, { duration, delay, easing: 'ease-in', fill: 'forwards' });
  leaving.set(element, animation);
  animation.onfinish = () => {
    if (leaving.get(element) !== animation) return;
    leaving.delete(element);
    element.hidden = true;
    element.classList.remove('is-leaving');
    animation.cancel(); // drops the held end state, so the next reveal starts from the panel's own style
  };
}

/** Calls `fn` once `count` frames have been drawn. */
function afterFrames(count, fn) {
  if (count <= 0) fn();
  else requestAnimationFrame(() => afterFrames(count - 1, fn));
}

/** How many fades are covering the screen right now; it only lifts when the last one has finished. */
let covers = 0;

/**
 * Covers the screen in a soft blush over `ms`, runs `midway` under it, lets the new view draw, then lifts the
 * cover over another `ms`. Taps are caught by the cover meanwhile. The cover always lifts, even if `midway`
 * throws, and the promise then rejects with that error.
 * @param {number} ms
 * @param {() => void} midway
 * @returns {Promise<void>}
 */
export function fadeThrough(ms, midway) {
  const fade = document.getElementById('fade');
  covers += 1;
  fade.style.setProperty('--fade-ms', `${ms}ms`);
  fade.hidden = false;
  void fade.offsetWidth; // so the fade starts from transparent rather than appearing at once
  fade.classList.add('is-on');
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      let failure = null;
      try {
        midway();
      } catch (error) {
        failure = error;
      }
      // Two frames, so the train is drawn in its new place before the cover lifts.
      afterFrames(2, () => {
        covers -= 1;
        if (covers === 0) fade.classList.remove('is-on');
        setTimeout(() => {
          if (covers === 0) fade.hidden = true;
          if (failure) reject(failure);
          else resolve();
        }, ms);
      });
    }, ms);
  });
}
