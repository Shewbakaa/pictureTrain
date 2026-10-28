// The wake lock: the screen stays on for the ride, asked for in the Begin tap and again whenever the page returns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keepAwake } from '../../site/src/ui/wakeLock.js';

/** A stand-in for `document`: whether it is hidden, its listeners, and a way to fire an event at them. */
function fakeDocument() {
  const listeners = {};
  return {
    hidden: false,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type) { for (const fn of listeners[type] || []) fn(); },
  };
}

/** A stand-in for a WakeLockSentinel, which tells its listeners when the browser lets the lock go. */
function fakeSentinel() {
  const listeners = [];
  return {
    addEventListener(type, fn) { if (type === 'release') listeners.push(fn); },
    release() { for (const fn of listeners) fn(); },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('asks for the screen at once, and again whenever the page comes back', async () => {
  const asked = [];
  const doc = fakeDocument();
  const nav = { wakeLock: { request: async (type) => { asked.push(type); return { addEventListener() {} }; } } };
  const lock = keepAwake({ nav, doc });
  await tick();
  assert.deepEqual(asked, ['screen']);
  assert.equal(lock.state, 'held');
  doc.hidden = true; doc.fire('visibilitychange'); await tick();
  assert.deepEqual(asked, ['screen'], 'nothing is asked of a page that is away');
  doc.hidden = false; doc.fire('visibilitychange'); await tick();
  assert.deepEqual(asked, ['screen', 'screen']);
});

test('no Wake Lock API: nothing happens', () => {
  assert.equal(keepAwake({ nav: {}, doc: fakeDocument() }).state, 'none');
  assert.equal(keepAwake({ nav: undefined, doc: fakeDocument() }).state, 'none');
});

test('a refused request is not an error', async () => {
  const lock = keepAwake({ nav: { wakeLock: { request: () => Promise.reject(new Error('battery')) } }, doc: fakeDocument() });
  await tick();
  assert.equal(lock.state, 'refused');
});

test('a request that throws at once is not an error either', async () => {
  const lock = keepAwake({ nav: { wakeLock: { request() { throw new Error('old browser'); } } }, doc: fakeDocument() });
  await tick();
  assert.equal(lock.state, 'refused');
});

test('the state follows the lock: off while it is not held, held again once the page is back', async () => {
  const doc = fakeDocument();
  const sentinels = [];
  const nav = { wakeLock: { request: async () => { sentinels.push(fakeSentinel()); return sentinels[sentinels.length - 1]; } } };
  const lock = keepAwake({ nav, doc });
  assert.equal(lock.state, 'off', 'before the first answer');
  await tick();
  assert.equal(lock.state, 'held');
  doc.hidden = true;
  sentinels[0].release(); // the browser lets it go as the page goes away
  doc.fire('visibilitychange');
  await tick();
  assert.equal(lock.state, 'off');
  doc.hidden = false; doc.fire('visibilitychange'); await tick();
  assert.equal(lock.state, 'held');
  assert.equal(sentinels.length, 2);
});

test('a refusal is tried again when the page comes back', async () => {
  const doc = fakeDocument();
  let refuse = true;
  const nav = { wakeLock: { request: async () => { if (refuse) throw new Error('battery'); return fakeSentinel(); } } };
  const lock = keepAwake({ nav, doc });
  await tick();
  assert.equal(lock.state, 'refused');
  refuse = false;
  doc.fire('visibilitychange'); await tick();
  assert.equal(lock.state, 'held');
});

test('a request still waiting for its answer is not asked again', async () => {
  const doc = fakeDocument();
  let asked = 0;
  let answer;
  const nav = { wakeLock: { request: () => { asked += 1; return new Promise((resolve) => { answer = resolve; }); } } };
  const lock = keepAwake({ nav, doc });
  doc.fire('visibilitychange'); doc.fire('visibilitychange');
  assert.equal(asked, 1);
  answer(fakeSentinel());
  await tick();
  assert.equal(lock.state, 'held');
});
