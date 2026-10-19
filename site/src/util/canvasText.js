// Words drawn on canvases in the display font: the station boards, the signs' date placards, the placeholder photos.
//
// Cormorant Garamond draws old-style figures, whose "1" looks like a small "ı" and whose "10" looks like "ıo", so
// "Day 1" and "Photo 1" read as typos. Runs of digits are drawn in Nunito 700 instead, sized to stand as tall as
// the Cormorant capitals and sitting on the same baseline, and the words stay in Cormorant. Both fonts must be
// loaded before anything is drawn (main.js waits for them).
//
// The functions take a 2D context and touch no DOM themselves, so the Node unit tests can import this module.

const WORDS = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
const DIGITS = 'Nunito, "Trebuchet MS", Arial, sans-serif';

/** Nunito's figures at this share of the size stand as tall as Cormorant's capitals. */
const DIGIT_SIZE = 0.86;

/** A number as people write it: digits, with any of . , / : - – between them. */
const NUMBER = /\d(?:[\d.,/:\-–]*\d)?/g;

/**
 * `text` cut into runs of digits (a written number, separators and all) and runs of everything else, in order.
 * @param {string} text
 * @returns {Array<{ text: string, digits: boolean }>}
 */
export function textRuns(text) {
  const runs = [];
  let at = 0;
  for (const match of text.matchAll(NUMBER)) {
    if (match.index > at) runs.push({ text: text.slice(at, match.index), digits: false });
    runs.push({ text: match[0], digits: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), digits: false });
  return runs;
}

/** The CSS font for a run, at a display size of `px`. */
const fontFor = (run, px) => (run.digits ? `700 ${Math.round(px * DIGIT_SIZE)}px ${DIGITS}` : `600 ${px}px ${WORDS}`);

/**
 * How wide `text` is in the display font at `px`, digits in Nunito.
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} px
 */
export function displayTextWidth(g, text, px) {
  let width = 0;
  for (const run of textRuns(text)) {
    g.font = fontFor(run, px);
    width += g.measureText(run.text).width;
  }
  return width;
}

/**
 * Draws `text` in the display font at `px`, digits in Nunito, centred on `x` with the middle of its capitals at
 * `y`, in the context's current fill style. Leaves the context's font and alignment as it found them.
 * @param {CanvasRenderingContext2D} g
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} px
 * @returns {number}  how wide the text is
 */
export function fillDisplayText(g, text, x, y, px) {
  const width = displayTextWidth(g, text, px);
  g.save();
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `600 ${px}px ${WORDS}`;
  const capHeight = g.measureText('H').actualBoundingBoxAscent || px * 0.63;
  const baseline = y + capHeight / 2;
  let at = x - width / 2;
  for (const run of textRuns(text)) {
    g.font = fontFor(run, px);
    g.fillText(run.text, at, baseline);
    at += g.measureText(run.text).width;
  }
  g.restore();
  return width;
}
