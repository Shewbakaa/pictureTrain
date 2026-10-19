import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProgress, saveProgress } from '../../site/src/progress.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('round-trips', () => {
  const s = mem();
  saveProgress({ reachedMax: 3 }, s);
  assert.deepEqual(loadProgress(s), { reachedMax: 3 });
});

test('defaults when empty, corrupt or throwing', () => {
  assert.deepEqual(loadProgress(mem()), { reachedMax: -1 });
  const bad = mem(); bad.setItem('pictureTrain.progress.v1', '{oops');
  assert.deepEqual(loadProgress(bad), { reachedMax: -1 });
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadProgress(throwing), { reachedMax: -1 });
  assert.doesNotThrow(() => saveProgress({ reachedMax: 1 }, throwing));
});

test('clamps to the number of moments', () => {
  const s = mem();
  saveProgress({ reachedMax: 5 }, s);
  assert.deepEqual(loadProgress(s, { momentCount: 2 }), { reachedMax: 1 });
});
