// The sound-effects engine (site/src/audio/sfx.js) on a stub AudioContext that records when each sound source
// starts, with a fake music player standing in for music.js's switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, createKit } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { RIDE } from '../../site/src/ride/rideController.js';

/** A stand-in for an AudioContext: enough of the API for the mixer and the train's sounds, logging every start. */
function stubContext() {
  const starts = []; // { type: 'noise'|'osc', at }
  const sources = [];
  const param = (value = 0) => ({
    value,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const node = (extra) => ({
    disconnected: false,
    connect(target) { return target; },
    disconnect() { this.disconnected = true; },
    ...extra,
  });
  const source = (type, extra) => {
    const n = node({
      onended: null,
      stopAt: Infinity,
      start(at) { starts.push({ type, at }); },
      stop(at) { this.stopAt = at; },
      ...extra,
    });
    sources.push(n);
    return n;
  };
  const ctx = {
    currentTime: 0,
    state: 'suspended',
    sampleRate: 8000,
    destination: node({}),
    createGain: () => node({ gain: param(1) }),
    createDynamicsCompressor: () => node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBufferSource: () => source('noise', { buffer: null, loop: false }),
    createOscillator: () => source('osc', { type: 'sine', frequency: param(440), detune: param() }),
    createBuffer: (channels, length, rate) => {
      const data = new Float32Array(length);
      return { duration: length / rate, getChannelData: () => data };
    },
  };
  /** Moves the clock on to `t`, ending every source that has stopped by then. */
  const advance = (t) => {
    ctx.currentTime = t;
    for (const s of sources) {
      if (s.stopAt <= t && s.onended) {
        const ended = s.onended;
        s.onended = null;
        ended();
      }
    }
  };
  return { ctx, starts, advance };
}

/** A fake music player: the sound starts off and silent; tests switch it on. */
function setup() {
  const audio = stubContext();
  const music = { mixer: createMixer(audio.ctx), audible: false, waking: false };
  let clock = 0;
  const sfx = createSfx(music, { now: () => clock });
  return {
    ...audio,
    music,
    sfx,
    setClock: (ms) => { clock = ms; },
    /** The sound is on and heard: the browser has let the context run and the master fader is coming up. */
    on(fade = 0.05) {
      music.waking = false;
      music.audible = true;
      audio.ctx.state = 'running';
      music.mixer.fade(true, fade);
    },
    whistles: () => audio.starts.filter((s) => s.type === 'osc').length / 4, // three notes and a vibrato each
    noises: () => audio.starts.filter((s) => s.type === 'noise').length,
  };
}

const BRAKING_DISTANCE = RIDE.CRUISE ** 2 / (2 * RIDE.BRAKE);

test('nothing plays, and nothing breaks, before the Begin tap has made the context', () => {
  const sfx = createSfx({ mixer: null, audible: false, waking: false }, { now: () => 0 });
  assert.equal(sfx.kit, null);
  assert.equal(sfx.audible, false);
  assert.equal(sfx.play('whistle'), false);
  sfx.depart();
  sfx.update(RIDE.CRUISE, 10, 1 / 60, Infinity);
});

test('setting off while the sound is coming on: the whistle and the puff wait, then play once it is fully up', () => {
  const t = setup();
  t.music.waking = true; // the Begin tap: the browser has not let the context run yet
  t.sfx.depart();
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.starts.length, 0);

  t.setClock(120);
  t.on(0.4); // a fade-in like the one after a video's sound
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.whistles(), 1);
  const whistleAt = t.starts.find((s) => s.type === 'osc').at;
  assert.ok(whistleAt >= 0.4 - 1e-9, `the whistle waits for the fade (starts at ${whistleAt})`);
  const noise = t.starts.filter((s) => s.type === 'noise').map((s) => s.at).sort((a, b) => a - b);
  assert.equal(noise.length, 2, 'the whistle\'s breath and the steam puff');
  assert.ok(Math.abs(noise[1] - whistleAt - 0.95) < 1e-9, 'the puff follows the whistle');
});

test('a one-shot that waits longer than a second for the sound is dropped', () => {
  const t = setup();
  t.music.waking = true;
  t.sfx.play('whistle');
  t.setClock(1500);
  t.on();
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.starts.length, 0);

  const u = setup();
  u.music.waking = true;
  u.sfx.play('whistle');
  u.setClock(900);
  u.on();
  u.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(u.whistles(), 1);
});

test('the context running late counts as coming on: what she asked for still waits', () => {
  const t = setup();
  // Her song answered first (music shows as playing), but the context has yet to run.
  t.music.audible = true;
  t.sfx.play('sigh');
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.starts.length, 0);
  t.ctx.state = 'running';
  t.music.mixer.fade(true, 0.05);
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.noises(), 1);
});

test('departing while everything is ducked for a video drops the whistle; un-ducking first lets it wait (app order)', () => {
  // Wrong order: still ducked (not audible, not coming back) when the train sets off.
  const wrong = setup();
  wrong.sfx.depart();
  wrong.on();
  wrong.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(wrong.starts.length, 0, 'sounds asked for while ducked are skipped, not saved up');

  // Right order: the video's sound goes off first, so the music is waking when the train sets off.
  const right = setup();
  right.music.waking = true;
  right.sfx.depart();
  right.on(0.4);
  right.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(right.whistles(), 1);
});

test('the same one-shot twice within its gap plays once', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('whistle'), true);
  assert.equal(t.sfx.play('whistle'), false);
  t.advance(1);
  assert.equal(t.sfx.play('whistle'), false);
  t.advance(1.6);
  assert.equal(t.sfx.play('whistle'), true);
  assert.equal(t.whistles(), 2);
});

test('an unknown sound warns and plays nothing', (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('foghorn'), false);
  assert.equal(warn.mock.callCount(), 1);
});

test('the brake hisses once per stop, as braking begins, and not again after a pause', () => {
  const t = setup();
  t.on();
  const frame = (speed, toStop) => t.sfx.update(speed, 0, 0, toStop); // standing distance, no frame time: no chugs
  frame(RIDE.CRUISE, 100);
  assert.equal(t.noises(), 0);
  frame(RIDE.CRUISE, BRAKING_DISTANCE);
  assert.equal(t.noises(), 1, 'braking begins');
  frame(5, 10);
  assert.equal(t.noises(), 1, 'still braking: no second hiss');
  frame(0.5, 10); // paused near the stop
  frame(Math.sqrt(2 * RIDE.BRAKE * 9.9), 9.9); // resumed, braking again
  assert.equal(t.noises(), 1, 'a pause and resume close to the stop does not hiss again');
  frame(0, Infinity); // standing at the stop
  t.advance(5);
  frame(RIDE.CRUISE, 60); // off to the next stop
  frame(RIDE.CRUISE, BRAKING_DISTANCE);
  assert.equal(t.noises(), 2, 'the next stop hisses again');
});

test('braking that begins while the sound is off is not hissed late', () => {
  const t = setup();
  t.sfx.update(RIDE.CRUISE, 0, 0, 100);
  t.sfx.update(RIDE.CRUISE, 0, 0, BRAKING_DISTANCE); // sound off: skipped
  t.on();
  t.sfx.update(5, 0, 0, 10);
  assert.equal(t.starts.length, 0);
});

test('riding: chugs and a rail joint\'s two clicks, from the frame loop; a teleport clicks nothing', () => {
  const t = setup();
  t.on();
  const dt = 1 / 60;
  let d = 0;
  for (let time = 0; time < 3; time += dt) {
    d += RIDE.CRUISE * dt;
    t.advance(time + dt);
    t.sfx.update(RIDE.CRUISE, d, dt, Infinity);
  }
  // 3 s at 1.3 chugs a second, and the joint at 12 m (1.85 s in) clicked by both bogies.
  assert.equal(t.noises(), 3 + 2);
  t.sfx.update(RIDE.CRUISE, d + 500, dt, Infinity);
  assert.equal(t.noises(), 5);
});

test('the kit holds at most 40 nodes of sound at once, and frees them as each sound ends', () => {
  const { ctx } = stubContext();
  const kit = createKit(createMixer(ctx));
  const source = ctx.createBufferSource();
  const last = ctx.createGain();
  assert.equal(kit.room(40), true);
  assert.equal(kit.room(41), false);
  kit.track(source, 30, last);
  assert.equal(kit.live, 30);
  assert.equal(kit.room(11), false);
  assert.equal(kit.room(10), true);
  source.onended();
  assert.equal(kit.live, 0);
  assert.equal(last.disconnected, true);
});

test('a sound that does not fit in the budget is skipped', () => {
  const t = setup();
  t.on();
  t.sfx.define('big', { gap: 0, play: (kit, at) => {
    if (!kit.room(30)) return false;
    const src = kit.ctx.createBufferSource();
    src.start(at);
    src.stop(at + 10);
    kit.track(src, 30, src);
    return true;
  } });
  assert.equal(t.sfx.play('big'), true);
  assert.equal(t.sfx.play('whistle'), false, 'a 12-node whistle does not fit beside 30 nodes');
  t.advance(11);
  assert.equal(t.sfx.play('whistle'), true);
});
