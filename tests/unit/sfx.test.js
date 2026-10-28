// The sound-effects engine (site/src/audio/sfx.js) on a stub AudioContext that records when each sound source
// starts, with a fake music player standing in for music.js's switch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSfx, createKit } from '../../site/src/audio/sfx.js';
import { createAmbience } from '../../site/src/audio/ambience.js';
import { createCues, createCueSounds } from '../../site/src/audio/cueSounds.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { RIDE } from '../../site/src/ride/rideController.js';
import { stubContext } from './audioStub.js';

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

test('Continue moments after a video\'s sound came on: the whistle waits for the sound to come all the way back', () => {
  const t = setup();
  t.on();
  t.advance(1);
  // Her tap on the video's speaker: everything fades out over 0.4 s. The context is idled only once it has.
  t.music.audible = false;
  t.music.mixer.fade(false, 0.4);
  t.advance(1.2);
  // Continue, 0.2 s later: the clip's sound goes off and the sound is asked back while the context still runs.
  t.music.audible = true;
  t.music.waking = true;
  t.sfx.depart();
  assert.equal(t.whistles(), 0, 'not into a fader that is still going down');
  // The browser answers at once: the master fader comes back up over 0.4 s from where it had got to.
  t.music.waking = false;
  t.music.mixer.fade(true, 0.4);
  t.sfx.update(0, 0, 1 / 60, Infinity);
  assert.equal(t.whistles(), 1);
  const whistleAt = t.starts.find((s) => s.type === 'osc').at;
  assert.ok(whistleAt >= 1.6 - 1e-9, `the whistle starts once the fader is up (at ${whistleAt})`);
});

test('a one-shot asked for while the master fader is still coming up starts once it is up', () => {
  const t = setup();
  t.on(0.4); // the Sound button turned on: the fader rises over 0.4 s
  t.advance(0.1);
  t.sfx.depart();
  assert.equal(t.whistles(), 1);
  const whistleAt = t.starts.find((s) => s.type === 'osc').at;
  assert.ok(whistleAt >= 0.4 - 1e-9, `the whistle waits for the fader (starts at ${whistleAt})`);
  const noise = t.starts.filter((s) => s.type === 'noise').map((s) => s.at).sort((a, b) => a - b);
  assert.ok(Math.abs(noise[1] - whistleAt - 0.95) < 1e-9, 'the puff still follows the whistle');
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

test('a sound defined twice warns, and the later one replaces the earlier', (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  const t = setup();
  t.on();
  const played = [];
  t.sfx.define('horn', { gap: 0, play: () => { played.push('first'); } });
  assert.equal(warn.mock.callCount(), 0);
  t.sfx.define('horn', { gap: 0, play: () => { played.push('second'); } });
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(warn.mock.calls[0].arguments[0], '[sfx] "horn" is defined twice; the later one replaces the earlier.');
  t.sfx.play('horn');
  assert.deepEqual(played, ['second']);
});

test('the effects, the ambience and the cues, built together as the app builds them, share no sound\'s name', (context) => {
  const warn = context.mock.method(console, 'warn', () => {});
  // The app's order (app.js): the effects, then the ambience and the cues, each defining its sounds on the effects.
  const t = setup();
  createAmbience(t.sfx);
  createCues(t.sfx);
  const twice = warn.mock.calls.map((call) => String(call.arguments[0])).filter((message) => message.includes('defined twice'));
  assert.deepEqual(twice, []);
  t.on();
  // A deer's rustle is the leaves of tapSounds.js, a noise, a filter and a gain...
  assert.equal(t.sfx.play('deer-rustle'), true);
  assert.equal(t.sfx.kit.live, 3);
  t.advance(Math.max(...t.sources.map((s) => s.stopAt)) + 0.1);
  assert.equal(t.sfx.kit.live, 0);
  // ...and the cues' 'rustle' is the stop card's paper brush, as the card's own voice makes it.
  const card = stubContext();
  const kit = createKit(createMixer(card.ctx));
  assert.equal(createCueSounds(kit).rustle(0.1, 1), true);
  assert.notEqual(kit.live, 3, 'the paper is not the leaves');
  assert.equal(t.sfx.play('rustle'), true);
  assert.equal(t.sfx.kit.live, kit.live);
  assert.equal(warn.mock.callCount(), 0, 'and every sound asked for is there');
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

test('a continuous sound holds its nodes in the budget until it lets them go, and passing sounds fit in the rest', () => {
  const { ctx } = stubContext();
  const kit = createKit(createMixer(ctx));
  assert.equal(kit.hold(10), true);
  assert.equal(kit.live, 10);
  assert.equal(kit.room(31), false);
  assert.equal(kit.room(30), true);
  assert.equal(kit.hold(31), false, 'no room: nothing is held');
  assert.equal(kit.live, 10);
  kit.release(10);
  assert.equal(kit.live, 0);
});

test('a one-shot that found no room does not use up its gap: it can play as soon as there is room', () => {
  const t = setup();
  t.on();
  const busy = t.ctx.createBufferSource();
  t.sfx.kit.track(busy, 30, t.ctx.createGain());
  assert.equal(t.sfx.play('whistle'), false, 'no room for its 12 nodes');
  busy.onended();
  t.advance(0.1);
  assert.equal(t.sfx.play('whistle'), true, 'well inside its 1.5 s gap');
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

test('settled: only once the sound is on, not still coming on, and the master fader all the way up', () => {
  const stub = stubContext();
  const player = { mixer: createMixer(stub.ctx), audible: false, waking: false };
  const effects = createSfx(player, { now: () => 0 });
  assert.equal(effects.settled, false, 'the sound is off');
  stub.ctx.state = 'running';
  player.audible = true;
  player.mixer.fade(true, 0.4);
  assert.equal(effects.settled, false, 'the fader is rising');
  stub.advance(0.4);
  assert.equal(effects.settled, true);
  player.waking = true;
  assert.equal(effects.settled, false, 'the browser is still answering a request to sound');
});

test('the shimmer of a shooting star is a few soft high bells, and plays once in a while', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('shimmer'), true);
  const tones = t.starts.filter((s) => s.type === 'osc');
  assert.equal(tones.length, 6, 'three notes, each two sines beating against each other');
  assert.equal(t.noises(), 0);
  for (const { node, at } of tones) assert.ok(Number.isFinite(node.stopAt) && node.stopAt > at + 1.4, 'each rings for a second and a half');
  // A second shimmer in the same breath is skipped: one a star.
  assert.equal(t.sfx.play('shimmer'), false);
  t.ctx.currentTime = 2.5;
  assert.equal(t.sfx.play('shimmer'), true);
});

test('the shimmer is held in the node budget while it rings, and gives its nodes back when it has', () => {
  const t = setup();
  t.on();
  t.sfx.play('shimmer');
  const live = t.sfx.kit.live;
  assert.equal(live, 10, 'a mix, and a gain and two sines for each of three notes');
  const last = Math.max(...t.sources.map((s) => s.stopAt));
  t.advance(last + 0.1);
  assert.equal(t.sfx.kit.live, 0);
  assert.ok(t.made.filter((n) => n.disconnected).length >= 1, 'the mix is disconnected from the bus');
});

test('the shimmer is skipped, not queued, when the sound is off', () => {
  const t = setup();
  assert.equal(t.sfx.play('shimmer'), false);
  assert.equal(t.starts.length, 0);
});

test('the lantern is a soft, warm whoosh of noise, and one at a time', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('lantern'), true);
  assert.equal(t.noises(), 1, 'one breath of noise');
  assert.equal(t.starts.filter((s) => s.type === 'osc').length, 0);
  const filters = t.made.filter((n) => n.type === 'bandpass' || n.type === 'lowpass');
  const band = filters.find((n) => n.type === 'bandpass');
  assert.ok(band, 'a bandpass shapes it');
  const swept = band.frequency.log.filter(([kind]) => kind !== 'cancel').map(([, hz]) => hz);
  assert.ok(Math.max(...swept) <= 1200, `it stays warm: the band sweeps no higher than ${Math.max(...swept)} Hz`);
  assert.ok(filters.some((n) => n.type === 'lowpass' && n.frequency.value <= 2000), 'a lowpass takes off the hiss');
  const [noise] = t.sources;
  assert.ok(noise.stopAt > 0.6 && noise.stopAt < 2, `it lasts about a second (${noise.stopAt.toFixed(2)} s)`);
  // A second flare in the same breath is skipped.
  assert.equal(t.sfx.play('lantern'), false);
});

test('the lantern is held in the node budget while it plays, and gives its nodes back', () => {
  const t = setup();
  t.on();
  t.sfx.play('lantern');
  assert.equal(t.sfx.kit.live, 4, 'its noise, two filters and a gain');
  t.advance(Math.max(...t.sources.map((s) => s.stopAt)) + 0.1);
  assert.equal(t.sfx.kit.live, 0);
  assert.ok(t.made.some((n) => n.disconnected), 'it is disconnected from the bus');
});

// Her taps on the world (Task 14): a balloon cluster's pop, a snowman's jingle and a deer's rustle.

test('a balloon cluster pops: a quick burst of noise, gone in a moment', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('pop'), true);
  assert.equal(t.noises(), 1, 'one burst of noise');
  assert.equal(t.starts.filter((s) => s.type === 'osc').length, 0);
  assert.ok(t.made.some((n) => n.type === 'bandpass'), 'a bandpass softens it');
  const [noise] = t.sources;
  assert.equal(noise.buffer, t.sfx.kit.noise);
  assert.ok(noise.stopAt < 0.5, `it is over in a moment (${noise.stopAt.toFixed(2)} s)`);
  assert.equal(t.sfx.play('pop'), false, 'one pop at a time');
});

test('a snowman jingles: little high bells, shaken a few times', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('jingle'), true);
  const bells = t.starts.filter((s) => s.type === 'osc');
  assert.equal(bells.length, 3, 'three little bells');
  assert.equal(t.noises(), 0);
  for (const { node } of bells) assert.ok(node.frequency.value > 2000, `high: ${node.frequency.value} Hz`);
  const shakes = t.made.find((n) => n.gain && n.gain.log.filter(([kind]) => kind === 'linear').length >= 3);
  assert.ok(shakes, 'shaken at least three times');
  assert.ok(Math.max(...bells.map((b) => b.node.stopAt)) < 1.5, 'and over within a second or so');
});

test('a deer rustles off through the leaves: a hiss of noise in steps', () => {
  const t = setup();
  t.on();
  assert.equal(t.sfx.play('deer-rustle'), true);
  assert.equal(t.noises(), 1);
  assert.equal(t.sources[0].buffer, t.sfx.kit.noise);
  assert.ok(t.made.some((n) => n.type === 'bandpass'));
  const steps = t.made.find((n) => n.gain && n.gain.log.filter(([kind]) => kind === 'linear').length >= 6);
  assert.ok(steps, 'its level falls back and swells again with each step');
  assert.ok(t.sources[0].stopAt > 0.5 && t.sources[0].stopAt < 2, `about a second (${t.sources[0].stopAt.toFixed(2)} s)`);
});

test('every tap sound is held in the node budget while it plays and gives its nodes back; all of them at once fit in it', () => {
  for (const [name, nodes] of [['pop', 3], ['jingle', 4], ['deer-rustle', 3]]) {
    const t = setup();
    t.on();
    t.sfx.play(name);
    assert.equal(t.sfx.kit.live, nodes, name);
    t.advance(Math.max(...t.sources.map((s) => s.stopAt)) + 0.1);
    assert.equal(t.sfx.kit.live, 0, `${name} gives its nodes back`);
    assert.ok(t.made.some((n) => n.disconnected), `${name} is disconnected from the bus`);
  }
  // The cord's whistle and the lantern too, all at once.
  const t = setup();
  t.on();
  for (const name of ['whistle', 'lantern', 'pop', 'jingle', 'deer-rustle']) assert.equal(t.sfx.play(name), true, name);
  assert.ok(t.sfx.kit.live <= 40, `${t.sfx.kit.live} nodes`);
});

// The tunnel's sound: the ambience goes muffled and the train's sounds echo while she is inside it.
const TUNNEL = { from: 540, to: 600, boundary: 570 };

test('the mixer has a train bus into the effects bus, and a low-pass between the ambience bus and the master', () => {
  const t = setup();
  const { mixer } = t.music;
  assert.equal(mixer.train.gain.value, 1);
  assert.deepEqual(mixer.train.outputs, [mixer.effects]);
  const filter = mixer.ambience.outputs[0];
  assert.equal(filter.type, 'lowpass');
  assert.equal(filter.frequency.value, 20000, 'wide open by default');
  assert.deepEqual(filter.outputs, mixer.effects.outputs, 'on into the same master as the other buses');
});

test('setMuffle closes the ambience low-pass from 20 kHz to 700 Hz over a 0.15 s time constant', () => {
  const t = setup();
  const { mixer } = t.music;
  const filter = mixer.ambience.outputs[0];
  const near = (actual, wanted) => assert.ok(Math.abs(actual - wanted) < 1e-6, `${actual} is not ${wanted}`);
  mixer.setMuffle(1);
  near(filter.frequency.target, 700);
  assert.equal(filter.frequency.log.at(-1)[0], 'target');
  assert.equal(filter.frequency.log.at(-1)[2], 0, 'from now');
  mixer.setMuffle(0);
  near(filter.frequency.target, 20000);
  mixer.setMuffle(0.5);
  near(filter.frequency.target, Math.sqrt(20000 * 700)); // halfway in pitch
  mixer.setMuffle(7); // out of range counts as fully closed
  near(filter.frequency.target, 700);
  mixer.setMuffle(-1);
  near(filter.frequency.target, 20000);
  mixer.setMuffle(7);
  const events = filter.frequency.events;
  mixer.setMuffle(7);
  assert.equal(filter.frequency.events, events, 'the same setting again schedules nothing');
});

test('the kit puts the train bus beside the others and passes the muffle on', () => {
  const t = setup();
  const kit = createKit(t.music.mixer);
  assert.equal(kit.buses.train, t.music.mixer.train);
  kit.setMuffle(1);
  assert.ok(Math.abs(t.music.mixer.ambience.outputs[0].frequency.target - 700) < 1e-6);
});

test('the train\'s sounds play into the train bus, and so reach the effects bus through it', () => {
  const t = setup();
  t.on();
  t.sfx.play('whistle');
  const joined = t.made.filter((n) => n.outputs.includes(t.music.mixer.train));
  assert.ok(joined.length >= 1, 'the whistle\'s envelope joins the train bus');
  assert.ok(t.made.every((n) => !n.outputs.includes(t.music.mixer.effects) || n === t.music.mixer.train), 'none goes round it');
});

test('update(…, inside) muffles the ambience by how far inside the tunnel she is', () => {
  const t = setup();
  t.on();
  const filter = t.music.mixer.ambience.outputs[0];
  t.sfx.setTunnel(TUNNEL);
  t.sfx.update(RIDE.CRUISE, 570, 0, Infinity, 1);
  assert.ok(Math.abs(filter.frequency.target - 700) < 1e-6);
  t.sfx.update(RIDE.CRUISE, 610, 0, Infinity, 0);
  assert.ok(Math.abs(filter.frequency.target - 20000) < 1e-6);
  t.sfx.update(RIDE.CRUISE, 570, 0, Infinity, 1);
  t.sfx.update(RIDE.CRUISE, 100, 0, Infinity); // no `inside` given: the open air
  assert.ok(Math.abs(filter.frequency.target - 20000) < 1e-6);
});

test('the echo is built within 40 m of the tunnel, with the sound on, and let go beyond it', () => {
  const t = setup();
  t.on();
  t.sfx.setTunnel(TUNNEL);
  const frame = (d, inside = 0) => t.sfx.update(RIDE.CRUISE, d, 0, Infinity, inside); // no frame time: no chugs
  frame(100);
  assert.equal(t.sfx.kit.live, 0, 'far from it, nothing');
  frame(500);
  assert.equal(t.sfx.kit.live, 4, 'at 40 m before the mouth');
  frame(570, 1);
  assert.equal(t.sfx.kit.live, 4);
  frame(639);
  assert.equal(t.sfx.kit.live, 4, 'within 40 m past the far mouth');
  frame(641);
  assert.equal(t.sfx.kit.live, 0, 'out of reach');
});

test('jumping out of the tunnel releases the echo at once, and so does the sound going off', () => {
  const t = setup();
  t.on();
  t.sfx.setTunnel(TUNNEL);
  t.sfx.update(RIDE.CRUISE, 570, 0, Infinity, 1);
  assert.equal(t.sfx.kit.live, 4);
  t.sfx.update(0, 100, 0, Infinity, 0); // a timeline jump: far away in one update
  assert.equal(t.sfx.kit.live, 0);

  t.sfx.update(RIDE.CRUISE, 570, 0, Infinity, 1);
  assert.equal(t.sfx.kit.live, 4);
  t.music.audible = false; // the Sound button, or a video's sound: update() returns early now
  t.sfx.update(RIDE.CRUISE, 571, 0, Infinity, 1);
  assert.equal(t.sfx.kit.live, 0, 'the echo is let go even when nothing is audible');
  t.ctx.state = 'suspended';
  t.sfx.update(RIDE.CRUISE, 572, 0, Infinity, 1);
  assert.equal(t.sfx.kit.live, 0);
});

test('with no tunnel (no span, or none set) there is no echo and no toot', () => {
  const t = setup();
  t.on();
  const echoes = () => t.made.filter((n) => n.delayTime).length;
  t.sfx.update(RIDE.CRUISE, 570, 0, Infinity, 1);
  assert.equal(echoes(), 0);
  t.sfx.setTunnel(null);
  for (let d = 500; d < 560; d += 0.5) t.sfx.update(RIDE.CRUISE, d, 0, Infinity);
  assert.equal(echoes(), 0);
  assert.equal(t.whistles(), 0);
});

test('the train toots once as it comes up to the tunnel, 15 m before it, and again after a jump back', () => {
  const t = setup();
  t.on();
  t.sfx.setTunnel({ from: 540, to: 600 });
  const ride = (from, to) => {
    for (let d = from; d <= to; d += RIDE.CRUISE / 60) t.sfx.update(RIDE.CRUISE, d, 1 / 60, Infinity);
  };
  ride(520, 530);
  assert.equal(t.whistles(), 1, 'it crossed 525');
  ride(530, 560);
  assert.equal(t.whistles(), 1, 'once, not on every frame after');
  t.advance(2); // past the whistle's gap
  t.sfx.update(0, 400, 0, Infinity); // a jump back
  ride(520, 530);
  assert.equal(t.whistles(), 2, 'it crosses 525 again');
});

test('the toot is only for a moving train going forwards, crossing from outside: not a jump past it, not backing, not standing', () => {
  const t = setup();
  t.on();
  t.sfx.setTunnel(TUNNEL);
  t.sfx.update(RIDE.CRUISE, 100, 0, Infinity);
  t.sfx.update(RIDE.CRUISE, 530, 0, Infinity); // a jump forward past 525
  assert.equal(t.whistles(), 0, 'a teleport toots nothing');
  t.sfx.update(RIDE.CRUISE, 530.1, 0, Infinity);
  t.sfx.update(-RIDE.CRUISE, 520, 0, Infinity); // backwards, across it
  assert.equal(t.whistles(), 0);
  t.sfx.update(0, 524.9, 0, Infinity);
  t.sfx.update(0, 525.1, 0, Infinity); // crossing it without moving (a nudge): no toot
  assert.equal(t.whistles(), 0, 'standing still');
});

test('the toot is skipped, not saved up, while the sound is off', () => {
  const t = setup();
  t.sfx.setTunnel(TUNNEL);
  t.sfx.update(RIDE.CRUISE, 520, 0, Infinity);
  t.sfx.update(RIDE.CRUISE, 530, 0, Infinity);
  t.on();
  t.sfx.update(RIDE.CRUISE, 531, 0, Infinity);
  assert.equal(t.starts.length, 0);
});
