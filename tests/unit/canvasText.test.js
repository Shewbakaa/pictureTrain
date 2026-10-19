// Text drawn on canvases (R28): digits never in Cormorant Garamond's old-style figures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textRuns } from '../../site/src/util/canvasText.js';

test('runs of digits are split from the words around them', () => {
  assert.deepEqual(textRuns('Day 365'), [{ text: 'Day ', digits: false }, { text: '365', digits: true }]);
  assert.deepEqual(textRuns('Photo 10'), [{ text: 'Photo ', digits: false }, { text: '10', digits: true }]);
  assert.deepEqual(textRuns('14 Feb'), [{ text: '14', digits: true }, { text: ' Feb', digits: false }]);
  assert.deepEqual(textRuns('Our first date'), [{ text: 'Our first date', digits: false }]);
  assert.deepEqual(textRuns(''), []);
});

test('a written date or number keeps its separators with its digits, so it is drawn in one font', () => {
  assert.deepEqual(textRuns('14/02/2025'), [{ text: '14/02/2025', digits: true }]);
  assert.deepEqual(textRuns('Oct 3, 2025'), [
    { text: 'Oct ', digits: false }, { text: '3', digits: true }, { text: ', ', digits: false }, { text: '2025', digits: true },
  ]);
  assert.deepEqual(textRuns('2025-10-18.'), [{ text: '2025-10-18', digits: true }, { text: '.', digits: false }]);
});
