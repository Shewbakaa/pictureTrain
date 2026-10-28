// His voice note at the finale (site/src/audio/voiceNote.js): an audio element of its own, with a stand-in element and
// a stand-in document that log what is asked of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceNote } from '../../site/src/audio/voiceNote.js';

const FILE = 'voice/message.m4a';
const WARNING = `[content.js] finale.voice: "${FILE}" could not be played, so there is no voice note.`;

/** A stand-in audio element. `answer` decides how play() goes: 'ok', or the name of the error it is refused with. */
function stubElement() {
  const listeners = {};
  const el = {
    src: '',
    preload: 'auto',
    paused: true,
    ended: false,
    currentTime: 0,
    duration: NaN,
    answer: 'ok',
    calls: [],
    play() {
      el.calls.push(`play ${el.src || '(none)'}`);
      if (el.answer === 'throw') throw new TypeError('no play here');
      if (el.answer !== 'ok') return Promise.reject(Object.assign(new Error(el.answer), { name: el.answer }));
      el.paused = false;
      el.ended = false;
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

/** A stand-in document: whether the page is hidden, and its visibilitychange. */
function stubDocument() {
  const listeners = [];
  return {
    hidden: false,
    addEventListener(type, fn) {
      if (type === 'visibilitychange') listeners.push(fn);
    },
    setHidden(hidden) {
      this.hidden = hidden;
      for (const fn of listeners) fn({ type: 'visibilitychange' });
    },
  };
}

function setup() {
  const el = stubElement();
  const doc = stubDocument();
  const voice = createVoiceNote(FILE, { makeElement: () => el, doc });
  const heard = [];
  voice.onChange(() => heard.push(voice.state));
  return { el, doc, voice, heard };
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

/** The element as it plays its file through to the end: its position at the end, then 'pause', then 'ended'. */
function playToEnd(el) {
  el.currentTime = el.duration;
  el.paused = true;
  el.ended = true;
  el.dispatch('pause');
  el.dispatch('ended');
}

test('it is made silent and unloaded: idle at its start, nothing to fetch yet', () => {
  const { el, voice } = setup();
  assert.equal(voice.state, 'idle');
  assert.equal(voice.progress, 0);
  assert.equal(el.src, '');
  assert.equal(el.preload, 'none');
  assert.deepEqual(el.calls, []);
});

test('unlock: play then pause at once, inside the tap, with no file to fetch, and no harm if refused', async () => {
  const { el, voice, heard } = setup();
  el.answer = 'AbortError'; // the pause interrupts the play, as it does in a browser
  const said = await warnings(() => voice.unlock());
  assert.deepEqual(el.calls, ['play (none)', 'pause']);
  assert.equal(el.src, '');
  assert.equal(el.paused, true);
  assert.equal(voice.state, 'idle', 'still waiting for the finale');
  assert.deepEqual(heard, []);
  assert.deepEqual(said, []);
  // The element's own events for that play and pause are not his voice playing.
  el.dispatch('play');
  el.dispatch('pause');
  assert.equal(voice.state, 'idle');
  const other = setup();
  other.el.answer = 'throw';
  assert.doesNotThrow(() => other.voice.unlock());
  assert.equal(other.voice.state, 'idle');
});

test('load() points it at its file once, to be fetched whole', () => {
  const { el, voice } = setup();
  voice.load();
  assert.equal(el.src, FILE);
  assert.equal(el.preload, 'auto');
  el.src = 'changed by the browser';
  voice.load();
  assert.equal(el.src, 'changed by the browser', 'only once');
  assert.equal(voice.state, 'idle', 'loading is not playing');
});

test('play() sets the src and plays: the state becomes playing, and it resolves true', async () => {
  const { el, voice, heard } = setup();
  const played = voice.play();
  assert.equal(el.src, FILE);
  assert.equal(el.paused, false);
  assert.equal(voice.state, 'playing');
  assert.deepEqual(heard, ['playing']);
  assert.equal(await played, true);
});

test('progress goes from 0 to 1 with its position, and is 0 while its length is not known', () => {
  const { el, voice } = setup();
  voice.play();
  assert.equal(voice.progress, 0, 'no length yet');
  el.duration = 4;
  el.currentTime = 1;
  assert.equal(voice.progress, 0.25);
  el.currentTime = 4.2; // a browser can run a little past its stated length
  assert.equal(voice.progress, 1);
  el.duration = Infinity;
  assert.equal(voice.progress, 0);
});

test('a hidden page pauses it where it was; it waits there for her tap, and plays on from there', async () => {
  const { el, doc, voice, heard } = setup();
  voice.play();
  el.duration = 1.5;
  el.currentTime = 0.6;
  doc.setHidden(true);
  assert.equal(el.paused, true);
  assert.equal(voice.state, 'paused');
  assert.equal(el.currentTime, 0.6);
  assert.ok(Math.abs(voice.progress - 0.4) < 1e-9);
  el.dispatch('pause'); // the element's own event for that pause changes nothing
  assert.deepEqual(heard, ['playing', 'paused']);
  doc.setHidden(false);
  assert.equal(voice.state, 'paused', 'coming back to the page does not start it by itself');
  assert.equal(await voice.play(), true);
  assert.equal(voice.state, 'playing');
  assert.equal(el.currentTime, 0.6, 'on from where it was');
  // A page hidden while it is not playing leaves it be.
  voice.stop();
  el.calls.length = 0;
  doc.setHidden(true);
  assert.deepEqual(el.calls, []);
  assert.equal(voice.state, 'idle');
});

test("pause() pauses it where it was, and play() plays on from there", () => {
  const { el, voice } = setup();
  voice.play();
  el.currentTime = 0.9;
  voice.pause();
  assert.equal(voice.state, 'paused');
  assert.equal(el.paused, true);
  voice.play();
  assert.equal(el.currentTime, 0.9);
  assert.equal(voice.state, 'playing');
});

test("the element's 'ended' gives 'ended' and progress 1, and play() starts it again from its top", async () => {
  const { el, voice, heard } = setup();
  voice.play();
  el.duration = 1.5;
  playToEnd(el); // its 'pause' at the end is not a pause: 'ended' follows
  assert.equal(voice.state, 'ended');
  assert.equal(voice.progress, 1);
  assert.deepEqual(heard, ['playing', 'ended']);
  assert.equal(await voice.play(), true);
  assert.equal(el.currentTime, 0);
  assert.equal(voice.state, 'playing');
  assert.equal(voice.progress, 0);
});

test('stop() pauses it and takes it back to idle at its start', () => {
  const { el, voice, heard } = setup();
  voice.play();
  el.duration = 1.5;
  el.currentTime = 0.75;
  voice.stop();
  assert.equal(el.paused, true);
  assert.equal(el.currentTime, 0);
  assert.equal(voice.state, 'idle');
  assert.equal(voice.progress, 0);
  assert.deepEqual(heard, ['playing', 'idle']);
  voice.stop(); // and again: nothing more to say
  assert.deepEqual(heard, ['playing', 'idle']);
});

test("an error event gives 'failed' and the warning, once, and it is never played again", async () => {
  const { el, voice, heard } = setup();
  voice.play();
  const said = await warnings(() => {
    el.dispatch('error');
    el.dispatch('error');
  });
  assert.equal(voice.state, 'failed');
  assert.deepEqual(said, [WARNING]);
  assert.deepEqual(heard, ['playing', 'failed']);
  assert.equal(el.paused, true);
  el.calls.length = 0;
  assert.equal(await voice.play(), false);
  voice.unlock();
  voice.load();
  voice.stop();
  assert.deepEqual(el.calls, [], 'a failed voice note is left alone');
  assert.equal(voice.state, 'failed');
  assert.equal(voice.progress, 0);
});

test('a play the browser refuses (not audio, say) fails it with the warning, and resolves false', async () => {
  for (const refusal of ['NotSupportedError', 'throw']) {
    const { el, voice } = setup();
    el.answer = refusal;
    let played;
    const said = await warnings(async () => { played = await voice.play(); });
    assert.equal(played, false, refusal);
    assert.equal(voice.state, 'failed', refusal);
    assert.deepEqual(said, [WARNING]);
  }
});

test('a play refused for want of a tap holds it back (blocked), resolves false, and her tap plays it', async () => {
  const { el, voice, heard } = setup();
  el.answer = 'NotAllowedError';
  let played;
  const said = await warnings(async () => { played = await voice.play(); });
  assert.equal(played, false);
  assert.equal(voice.state, 'blocked');
  assert.equal(said.length, 1, 'a word for the author in the console');
  assert.ok(said[0].includes(`"${FILE}"`));
  assert.ok(!said[0].startsWith('[content.js]'), 'not a fault in content.js');
  el.answer = 'ok';
  assert.equal(await voice.play(), true);
  assert.equal(voice.state, 'playing');
  assert.deepEqual(heard, ['playing', 'blocked', 'playing']);
});

test('a play interrupted by a pause is not a failure: it resolves false and the pause has its way', async () => {
  const { el, voice } = setup();
  el.answer = 'AbortError';
  let played;
  const said = await warnings(async () => {
    const attempt = voice.play();
    voice.stop();
    played = await attempt;
  });
  assert.equal(played, false);
  assert.equal(voice.state, 'idle');
  assert.deepEqual(said, []);
});

test('paused or played from outside the page (the lock screen) it follows along', () => {
  const { el, voice } = setup();
  voice.play();
  el.paused = true;
  el.dispatch('pause');
  assert.equal(voice.state, 'paused');
  el.paused = false;
  el.dispatch('play');
  assert.equal(voice.state, 'playing');
});

test('onChange: each listener hears every change of state until it stops listening', () => {
  const { voice } = setup();
  let a = 0;
  let b = 0;
  const stopA = voice.onChange(() => { a += 1; });
  voice.onChange(() => { b += 1; });
  voice.play();
  stopA();
  voice.pause();
  assert.equal(a, 1);
  assert.equal(b, 2);
});

test('a browser with no audio element: failed with the warning, and nothing throws', async () => {
  let voice;
  const said = await warnings(() => {
    voice = createVoiceNote(FILE, { makeElement: () => { throw new Error('no Audio'); }, doc: stubDocument() });
  });
  assert.equal(voice.state, 'failed');
  assert.deepEqual(said, [WARNING]);
  assert.doesNotThrow(() => {
    voice.unlock();
    voice.load();
    voice.pause();
    voice.stop();
  });
  assert.equal(await voice.play(), false);
});
