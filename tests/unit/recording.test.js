// A scene's recording (site/src/audio/recording.js): an audio element played through the ride's one AudioContext.
// On the stub AudioContext (audioStub.js) with a stand-in element that logs what is asked of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecording } from '../../site/src/audio/recording.js';
import { ZONE_MUSIC } from '../../site/src/audio/zoneMusic.js';
import { stubContext } from './audioStub.js';

const FILE = 'music/zones/spring.mp3';

/** A stand-in audio element. `answer` decides how play() goes: 'ok', or the name of the error it is refused with. */
function stubElement() {
  const listeners = {};
  const el = {
    src: '',
    preload: 'auto',
    loop: false,
    paused: true,
    currentTime: 0,
    duration: NaN,
    answer: 'ok',
    calls: [],
    play() {
      el.calls.push(`play ${el.src || '(none)'}`);
      if (el.answer === 'throw') throw new TypeError('no play here');
      if (el.answer !== 'ok') return Promise.reject(Object.assign(new Error(el.answer), { name: el.answer }));
      el.paused = false;
      return Promise.resolve();
    },
    pause() {
      el.calls.push('pause');
      el.paused = true;
    },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    dispatch(type) {
      for (const fn of listeners[type] || []) fn({ type });
    },
  };
  return el;
}

function setup() {
  const audio = stubContext();
  const el = stubElement();
  const recording = createRecording(audio.ctx, 'spring', { file: FILE, trim: 4.4 }, { makeElement: () => el });
  return { ...audio, el, recording };
}

/** Runs `fn` with console.warn captured; returns what was warned. */
async function warnings(fn) {
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(args.join(' '));
  try {
    await fn();
    await new Promise((resolve) => setImmediate(resolve)); // a refused play() answers a moment later
  } finally {
    console.warn = warn;
  }
  return said;
}

test('it is made silent and unloaded, its element looping into the context', () => {
  const { el, recording } = setup();
  assert.equal(el.src, '', 'nothing to fetch yet');
  assert.equal(el.preload, 'none');
  assert.equal(el.loop, true);
  assert.deepEqual(el.calls, []);
  assert.equal(recording.name, 'spring');
  assert.equal(recording.file, FILE);
  assert.equal(recording.trim, 4.4);
  assert.equal(recording.failed, false);
  assert.ok(recording.output.gain, 'its output is a gain, for the loop seam');
});

test('unlock: play then pause at once, inside the tap, with no file to fetch, and no harm if refused', async () => {
  const { el, recording } = setup();
  el.answer = 'AbortError'; // the pause interrupts the play, as it does in a browser
  const said = await warnings(() => recording.unlock());
  assert.deepEqual(el.calls, ['play (none)', 'pause']);
  assert.equal(el.src, '');
  assert.equal(el.paused, true);
  assert.equal(recording.failed, false, 'a refused unlock is not a failure: the file has not been tried');
  assert.deepEqual(said, []);
  const other = setup();
  other.el.answer = 'throw';
  assert.doesNotThrow(() => other.recording.unlock());
  assert.equal(other.recording.failed, false);
});

test('load() points it at its file once, to be fetched whole', () => {
  const { el, recording } = setup();
  recording.load();
  assert.equal(el.src, FILE);
  assert.equal(el.preload, 'auto');
  el.src = 'changed by the browser';
  recording.load();
  assert.equal(el.src, 'changed by the browser', 'only once');
});

test('start(true) plays from its top, loading it if need be; start(false) plays on from where it was', () => {
  const { el, recording } = setup();
  el.currentTime = 30;
  recording.start(true);
  assert.equal(el.src, FILE);
  assert.equal(el.currentTime, 0);
  assert.equal(el.paused, false);
  el.currentTime = 12;
  recording.stop(false);
  assert.equal(el.paused, true);
  assert.equal(el.currentTime, 12, 'paused where it was: for the sound going off, or the page going away');
  recording.start(false);
  assert.equal(el.currentTime, 12);
  assert.equal(el.paused, false);
});

test('stop(true) pauses and rewinds, for a piece whose zone has gone', () => {
  const { el, recording } = setup();
  recording.start(true);
  el.currentTime = 50;
  recording.stop(true);
  assert.equal(el.paused, true);
  assert.equal(el.currentTime, 0);
});

test('a play the browser refuses fails the recording, with a warning naming the file', async () => {
  for (const refusal of ['NotAllowedError', 'NotSupportedError', 'throw']) {
    const { el, recording } = setup();
    el.answer = refusal;
    const said = await warnings(() => recording.start(true));
    assert.equal(recording.failed, true, refusal);
    assert.deepEqual(said, [`[music] Could not play "${FILE}" — the built-in tune plays in this scene instead.`]);
  }
});

test('a play interrupted by a pause or a new load is not a failure', async () => {
  const { el, recording } = setup();
  el.answer = 'AbortError';
  const said = await warnings(() => recording.start(true));
  assert.equal(recording.failed, false);
  assert.deepEqual(said, []);
});

test('a file that will not load (missing, or not audio) fails it once, and it is never played again', async () => {
  const { el, recording } = setup();
  recording.start(true);
  const said = await warnings(() => {
    el.dispatch('error');
    el.dispatch('error');
  });
  assert.equal(recording.failed, true);
  assert.equal(said.length, 1);
  assert.ok(said[0].includes(`"${FILE}"`));
  assert.equal(el.paused, true);
  el.calls.length = 0;
  recording.start(true);
  recording.load();
  assert.deepEqual(el.calls, [], 'a failed recording is left alone');
});

test('update() follows the loop seam: out over its last seconds, back in after it has looped', () => {
  const { el, recording, ctx } = setup();
  const { SEAM_OUT, SEAM_IN } = ZONE_MUSIC;
  recording.start(true);
  el.duration = 87;
  const level = () => recording.output.gain.target;
  el.currentTime = 40;
  recording.update();
  assert.equal(recording.output.gain.events, 0, 'nothing to move in the middle of the piece');
  el.currentTime = 87 - SEAM_OUT / 2;
  ctx.currentTime = 1;
  recording.update();
  assert.ok(Math.abs(level() - 0.5) < 1e-9, 'half way through the fade out');
  el.currentTime = SEAM_IN / 4; // it has come round again
  recording.update();
  assert.ok(Math.abs(level() - 0.25) < 1e-9, 'coming back in from silence');
  el.currentTime = 20;
  recording.update();
  assert.equal(level(), 1);
  // Rewound for a fresh start, its first pass is not faded in.
  recording.stop(true);
  recording.start(true);
  el.currentTime = SEAM_IN / 4;
  recording.update();
  assert.equal(level(), 1);
});

test('update() does nothing while it is not playing', () => {
  const { el, recording } = setup();
  el.duration = 87;
  el.currentTime = 86;
  recording.update();
  assert.equal(recording.output.gain.events, 0);
});

test('a browser that cannot route an element into the context: failed with a warning, and nothing throws', async () => {
  const audio = stubContext();
  delete audio.ctx.createMediaElementSource;
  let recording;
  const said = await warnings(() => {
    recording = createRecording(audio.ctx, 'summer', { file: 'music/zones/summer.mp3', trim: 1 }, { makeElement: stubElement });
  });
  assert.equal(recording.failed, true);
  assert.equal(said.length, 1);
  assert.ok(said[0].includes('"music/zones/summer.mp3"'));
  assert.doesNotThrow(() => {
    recording.unlock();
    recording.load();
    recording.start(true);
    recording.update();
    recording.stop(true);
  });
});
