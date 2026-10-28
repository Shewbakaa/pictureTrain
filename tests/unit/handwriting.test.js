import test from 'node:test';
import assert from 'node:assert/strict';
import { INK, inkPlan } from '../../site/src/ui/handwriting.js';

test('words write one after another at a writing pace', () => {
  const { words, end } = inkPlan('Happy one year, love.');
  assert.deepEqual(words.map((w) => w.text), ['Happy', 'one', 'year,', 'love.']);
  assert.ok(Math.abs(words[0].duration - 5 * INK.PER_CHAR) < 1e-9);
  assert.ok(words[3].start - (words[2].start + words[2].duration) >= INK.COMMA - 1e-9);
  assert.ok(end > words[3].start);
});

test('line and paragraph breaks pause longer, and are kept', () => {
  const { words } = inkPlan('one\ntwo\n\nthree');
  assert.deepEqual(words.map((w) => w.breakAfter), ['line', 'paragraph', 'none']);
});

test('an emoji is one character, an em dash is kept', () => {
  assert.ok(Math.abs(inkPlan('💛').words[0].duration - INK.MIN_WORD) < 1e-9);
  assert.equal(inkPlan('— Sam').words[0].text, '—');
});

test('the constants are the agreed pace, and frozen', () => {
  assert.deepEqual({ ...INK }, {
    PER_CHAR: 0.055, MIN_WORD: 0.12, WORD_GAP: 0.06, COMMA: 0.2, SENTENCE: 0.35, LINE: 0.45, PARAGRAPH: 0.9,
  });
  assert.ok(Object.isFrozen(INK));
});

test('it starts at startAt, and a plain word is followed by the word gap', () => {
  const { words, end } = inkPlan('so very kind', 2);
  assert.equal(words[0].start, 2);
  // 'so' is two characters, under the shortest a word takes.
  assert.ok(Math.abs(words[0].duration - INK.MIN_WORD) < 1e-9);
  assert.ok(Math.abs(words[1].start - (2 + INK.MIN_WORD + INK.WORD_GAP)) < 1e-9);
  assert.ok(Math.abs(words[1].duration - 4 * INK.PER_CHAR) < 1e-9);
  // The pen lifts when the last word is done: nothing waits after it.
  assert.ok(Math.abs(end - (words[2].start + words[2].duration)) < 1e-9);
});

test('the pause after a word comes from its last character', () => {
  const gap = (text) => {
    const { words } = inkPlan(`${text} next`);
    return words[1].start - (words[0].start + words[0].duration);
  };
  for (const mark of [',', ';', ':']) assert.ok(Math.abs(gap(`word${mark}`) - INK.COMMA) < 1e-9, mark);
  for (const mark of ['.', '!', '?', '…']) assert.ok(Math.abs(gap(`word${mark}`) - INK.SENTENCE) < 1e-9, mark);
  assert.ok(Math.abs(gap('word') - INK.WORD_GAP) < 1e-9);
  // A closing quote or bracket after the full stop does not hide it.
  assert.ok(Math.abs(gap('word.”') - INK.SENTENCE) < 1e-9);
  assert.ok(Math.abs(gap('word.)') - INK.SENTENCE) < 1e-9);
});

test('a line break waits the line pause, a paragraph break the paragraph pause', () => {
  const after = (text) => {
    const { words } = inkPlan(text);
    return words[1].start - (words[0].start + words[0].duration);
  };
  assert.ok(Math.abs(after('one\ntwo') - INK.LINE) < 1e-9);
  assert.ok(Math.abs(after('one\n\ntwo') - INK.PARAGRAPH) < 1e-9);
  // After a sentence, the longer of the two pauses wins.
  assert.ok(Math.abs(after('one.\ntwo') - INK.LINE) < 1e-9);
  assert.ok(Math.abs(after('one.\n\ntwo') - INK.PARAGRAPH) < 1e-9);
});

test('spaces and tabs around words are only separators, and every line break the author wrote is kept', () => {
  const plan = inkPlan('\n\n  one \t two  \r\n\r\n three\n\n\n\nfour\n');
  assert.deepEqual(plan.words.map((w) => w.text), ['one', 'two', 'three', 'four']);
  // Two breaks make a paragraph, and three or more are the blank lines white-space: pre-line would have drawn.
  assert.deepEqual(plan.words.map((w) => w.breakAfter), ['none', 'paragraph', 'paragraph', 'none']);
  assert.deepEqual(plan.words.map((w) => w.breaks), [0, 2, 4, 0]);
  assert.equal(plan.leading, 2);
  // The breaks at the very end have nothing after them, so there are none.
  assert.equal(inkPlan('one\n\n').words[0].breaks, 0);
});

test('extra blank lines wait no longer than a paragraph', () => {
  const gap = (text) => {
    const { words } = inkPlan(text);
    return words[1].start - (words[0].start + words[0].duration);
  };
  assert.ok(Math.abs(gap('one\n\n\n\ntwo') - INK.PARAGRAPH) < 1e-9);
});

test('no text is no words, and ends where it starts', () => {
  assert.deepEqual(inkPlan(''), { words: [], end: 0, leading: 0 });
  assert.deepEqual(inkPlan(' \n ', 1.5), { words: [], end: 1.5, leading: 0 });
  assert.deepEqual(inkPlan(undefined, 1.5), { words: [], end: 1.5, leading: 0 });
});

test('a word of nothing but a quote or a bracket is only a word, not the end of a sentence', () => {
  const { words } = inkPlan('a " b ) c');
  assert.deepEqual(words.map((w) => w.text), ['a', '"', 'b', ')', 'c']);
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - (words[i - 1].start + words[i - 1].duration);
    assert.ok(Math.abs(gap - INK.WORD_GAP) < 1e-9, `before word ${i}`);
  }
});

test('a no-break space keeps its two halves in one word, so a wrap cannot part them', () => {
  const { words } = inkPlan('Day\u00a0365 and\u00a0more');
  assert.deepEqual(words.map((w) => w.text), ['Day\u00a0365', 'and\u00a0more']);
  assert.ok(Math.abs(words[0].duration - 7 * INK.PER_CHAR) < 1e-9);
});

test('a long word takes longer, in whole characters', () => {
  const { words } = inkPlan('Thank-you-for-everything');
  assert.ok(Math.abs(words[0].duration - 24 * INK.PER_CHAR) < 1e-9);
});

test('an emoji made of several code points is still one character', () => {
  // Two letters and a family (three people joined): three characters, 0.165 s.
  assert.ok(Math.abs(inkPlan('ab👨‍👩‍👧').words[0].duration - 3 * INK.PER_CHAR) < 1e-9);
});

test('without Intl.Segmenter it counts code points and still plans', async () => {
  const real = Intl.Segmenter;
  Intl.Segmenter = undefined; // Safari before 14.1
  try {
    // A fresh copy of the module, which has not yet looked for the segmenter.
    const plain = await import('../../site/src/ui/handwriting.js?without-segmenter');
    assert.ok(Math.abs(plain.inkPlan('💛').words[0].duration - INK.MIN_WORD) < 1e-9);
    assert.ok(Math.abs(plain.inkPlan('Happy').words[0].duration - 5 * INK.PER_CHAR) < 1e-9);
  } finally {
    Intl.Segmenter = real;
  }
});
