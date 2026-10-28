// His message and signoff, written out in ink as the finale card (and the 2D story's last card) comes up, as if by
// hand: each word is revealed left to right by a soft ink edge, at a calm writing pace set by its length, with a
// little pause after a comma and a longer one after a full stop, a line or a paragraph.
//
// Words are written left to right in turn, so each line still fills as if by a pen, even where the phone wraps it
// (a sweep along whole wrapped lines would have to leap back to the left in the middle of a sentence). The writing
// only reveals words in place; it never scrolls anything, so a long message below the fold writes unseen and she
// can scroll to it.
//
// `inkPlan` is the timing, pure. `writeInk` builds the words into the page and the styles.css rules (`.ink-word`,
// `.ink-fade`, `.inked`) do the revealing. Nothing here touches the page until one of the functions that write or
// load is called, so Node can import the module to test `inkPlan`.

/** How long the pen takes, in seconds. */
export const INK = Object.freeze({
  PER_CHAR: 0.055, // writing one character (a letter, a digit, an emoji)
  MIN_WORD: 0.12, // the least a word takes, however short ("a", "—")
  WORD_GAP: 0.06, // the pen lifts between two words
  COMMA: 0.2, // after a word ending , ; :
  SENTENCE: 0.35, // after a word ending . ! ? …
  LINE: 0.45, // at the end of a line (a single line break in the message)
  PARAGRAPH: 0.9, // at the end of a paragraph (a blank line)
});

/**
 * Starts fetching the handwriting font now, so it is on the phone long before the message is, and the words are
 * never written in one face and swapped to another halfway. A font that cannot be had leaves the card in Cormorant
 * Garamond, which the stylesheet names after it.
 */
export function loadInkFont() {
  try {
    if (document.fonts && typeof document.fonts.load === 'function') document.fonts.load('500 21px "Dancing Script"').catch(() => {});
  } catch {
    // No font loading API here: the font loads when the message first uses it.
  }
}

/** How long a message takes to fade in instead, when she has asked for less motion (s). */
const FADE_S = 0.9;

/** The pause after a word reads its last character through these, closing quotes and brackets ("love.”") skipped. */
const CLOSERS = /["'”’»)\]}]+$/;
const COMMA_MARKS = ',;:';
const SENTENCE_MARKS = '.!?…';

let segmenter; // undefined until first asked, then an Intl.Segmenter, or null where there is none (Safari before 14.1)

/** How many characters she would count in `word`: graphemes where the browser can tell them apart, so an emoji is one. */
function graphemeCount(word) {
  if (segmenter === undefined) {
    try {
      segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
    } catch {
      segmenter = null;
    }
  }
  return segmenter ? Array.from(segmenter.segment(word)).length : Array.from(word).length;
}

/** The pause after `word` from how it ends, s (at least the gap between words). */
function pauseAfter(word) {
  const last = word.replace(CLOSERS, '').slice(-1);
  // A word of nothing but closers (a lone quote or bracket) has no last character to read a pause from.
  if (!last) return INK.WORD_GAP;
  if (SENTENCE_MARKS.includes(last)) return INK.SENTENCE;
  if (COMMA_MARKS.includes(last)) return INK.COMMA;
  return INK.WORD_GAP;
}

/**
 * Where a message splits into words: spaces, tabs and line breaks only, as `white-space: pre-line` collapses them. A
 * no-break space stays inside its word, so the two halves are never parted by a wrap.
 */
const SEPARATOR = /([ \t\f\n]+)/;

/**
 * @typedef {{ text: string, start: number, duration: number, breakAfter: 'none' | 'line' | 'paragraph', breaks: number }} InkWord
 *   `start` and `duration` in seconds. `breaks` is how many line breaks the message has right after the word (none
 *   after the last), and `breakAfter` what that makes of it: one is a 'line', two or more a 'paragraph'.
 */

/**
 * When each word of `text` is written. Words are split on spaces and tabs; each line break in the text is kept (so
 * are the blank lines the author leaves, however many, and any before the first word), a single one ends a line and
 * two or more a paragraph. After each word the pen waits for the longest of the gap between words, the pause its last
 * character asks for, and its line or paragraph break, if it has one.
 * @param {string} text
 * @param {number} [startAt]  s, where the first word starts
 * @returns {{ words: InkWord[], end: number, leading: number }}  `end` is when the last word is done (the pen's last
 *   pause is not waited for); `leading` is how many line breaks the text starts with
 */
export function inkPlan(text, startAt = 0) {
  const words = [];
  let leading = 0;
  // Splitting on the separators and keeping them: the words are the even pieces, and what lies between two words (the
  // odd ones) says how many line breaks there are.
  String(text ?? '').replace(/\r\n?/g, '\n').split(SEPARATOR).forEach((piece, i) => {
    if (i % 2 === 0) {
      if (piece) words.push({ text: piece, start: 0, duration: Math.max(INK.MIN_WORD, graphemeCount(piece) * INK.PER_CHAR), breakAfter: 'none', breaks: 0 });
      return;
    }
    const breaks = piece.split('\n').length - 1;
    const previous = words[words.length - 1];
    if (!previous) leading = breaks;
    else if (breaks) Object.assign(previous, { breaks, breakAfter: breaks > 1 ? 'paragraph' : 'line' });
  });
  // Breaks at the very end of the message have nothing after them to wait for (and a message of nothing but breaks
  // is all end).
  if (words.length) Object.assign(words[words.length - 1], { breaks: 0, breakAfter: 'none' });
  else leading = 0;

  let t = startAt;
  for (const word of words) {
    word.start = t;
    const breakPause = word.breakAfter === 'paragraph' ? INK.PARAGRAPH : word.breakAfter === 'line' ? INK.LINE : 0;
    t += word.duration + Math.max(pauseAfter(word.text), breakPause);
  }
  const last = words[words.length - 1];
  return { words, end: last ? last.start + last.duration : startAt, leading };
}

/**
 * Writes `text` into `el` in ink, replacing what it held. Every word becomes a `span.ink-word` carrying `--ink-start`
 * and `--ink-dur` (s) for the stylesheet's sweep, with the spaces kept between them and a `<br>` for each line break
 * of the text (so a blank line is two of them), so under `white-space: pre-line` it lays out as the text did. The sweep is the stylesheet's
 * business (`.ink-word`), and `finish()` (or the writing running out) puts the class `inked` on `el`, which turns it all
 * off and leaves the text as it is.
 *
 * With `reduced` (she has asked for less motion) nothing is swept: the class `ink-fade` makes `el` fade in as one.
 * @param {HTMLElement} el
 * @param {string} text
 * @param {{ startAt?: number, reduced?: boolean }} [options]  `startAt` s from now; `reduced` fades instead
 * @returns {{ finish: () => void, done: Promise<void>, end: number, running: boolean }}  `finish` shows all of it at
 *   once; `done` settles when it has been written (or finished); `end` is when that is, s from now (`startAt` plus
 *   the writing's length); `running` is whether it is still being written
 */
export function writeInk(el, text, { startAt = 0, reduced = false } = {}) {
  const plan = inkPlan(text, startAt);
  const end = reduced && plan.words.length ? startAt + FADE_S : plan.end;

  el.classList.remove('inked', 'ink-fade');
  el.textContent = '';
  const fragment = document.createDocumentFragment();
  const lineBreaks = (count) => { for (let n = 0; n < count; n++) fragment.appendChild(document.createElement('br')); };
  lineBreaks(plan.leading);
  plan.words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'ink-word';
    span.textContent = word.text;
    span.style.setProperty('--ink-start', `${word.start.toFixed(3)}s`);
    span.style.setProperty('--ink-dur', `${word.duration.toFixed(3)}s`);
    fragment.appendChild(span);
    if (i === plan.words.length - 1) return;
    // A space even before a break, where it collapses away, so the text reads as words with its spaces in it.
    fragment.appendChild(document.createTextNode(' '));
    lineBreaks(word.breaks);
  });
  el.appendChild(fragment);

  if (reduced) {
    el.style.setProperty('--ink-start', `${startAt}s`);
    el.style.setProperty('--ink-dur', `${FADE_S}s`);
    el.classList.add('ink-fade');
  }

  let settle;
  let running = true;
  const done = new Promise((resolve) => { settle = resolve; });
  // The page's clock runs the animations, and this one the end of them, a beat late rather than early.
  const timer = setTimeout(() => finish(), end * 1000 + 100);
  function finish() {
    clearTimeout(timer);
    running = false;
    el.classList.add('inked'); // the writing is over: the stylesheet lets go of every mask and animation
    settle();
  }
  return { finish, done, end, get running() { return running; } };
}

/** The signoff is written this long (s) after the message is done, as if the pen were lifted and put down again. */
const SIGNOFF_AFTER = 0.4;

/**
 * Writes his message and, a beat after it, his signoff. Either may be missing.
 * @param {{ el: HTMLElement, text: string } | null} message
 * @param {{ el: HTMLElement, text: string } | null} signoff
 * @param {{ startAt?: number, reduced?: boolean }} [options]  as for `writeInk`
 * @returns {{ finish: () => void, done: Promise<void>, running: boolean }}  of both together
 */
export function writeLetter(message, signoff, { startAt = 0, reduced = false } = {}) {
  const writings = [];
  let signoffAt = startAt;
  if (message) {
    const writing = writeInk(message.el, message.text, { startAt, reduced });
    writings.push(writing);
    signoffAt = writing.end + SIGNOFF_AFTER;
  }
  if (signoff) writings.push(writeInk(signoff.el, signoff.text, { startAt: signoffAt, reduced }));
  return {
    finish: () => writings.forEach((writing) => writing.finish()),
    done: Promise.all(writings.map((writing) => writing.done)).then(() => {}),
    get running() { return writings.some((writing) => writing.running); },
  };
}

/**
 * Lets a tap on `target` finish the writing at once. A tap on a button or a link inside it is theirs and is left alone,
 * and while nothing is being written (before it starts, after it is over) the tap passes by untouched; only a tap that
 * finishes the writing is kept from reaching anything else.
 * @param {HTMLElement} target
 * @param {() => ({ finish: () => void, running: boolean } | null)} current  the writing now, or null if none has begun
 */
export function finishOnTap(target, current) {
  target.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    const writing = current();
    if (!writing || !writing.running) return;
    event.stopPropagation();
    writing.finish();
  });
}
