import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineItems } from '../../site/src/ui/timeline.js';

const moments = Array.from({ length: 4 }, (_, i) => ({ index: i, date: `D${i}`, title: `T${i}` }));

test('locks unreached moments and marks the current one', () => {
  const items = timelineItems(moments, { reachedMax: 1, currentIndex: 1 });
  assert.deepEqual(items.map((i) => i.state), ['reached', 'current', 'locked', 'locked']);
  assert.equal(items[2].label, 'Moment 3 (not reached yet)');
  assert.equal(items[0].label, 'D0: T0');
});

test('no current while riding', () => {
  assert.deepEqual(timelineItems(moments, { reachedMax: 0, currentIndex: -1 }).map((i) => i.state), ['reached', 'locked', 'locked', 'locked']);
});

test('date-less label falls back to the title', () => {
  assert.equal(timelineItems([{ index: 0, date: '', title: 'T0' }], { reachedMax: 0, currentIndex: -1 })[0].label, 'T0');
});
