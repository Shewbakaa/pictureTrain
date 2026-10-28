// The cue sounds (site/src/audio/cueSounds.js): the card's rustle, and the finale's own sounds on its clock: the
// station bell as the train pulls in, the foley (finale/foleyTiming.js), the hearts' sparkle and a pop for each of
// the fireworks, in time with the finale's own bursts. A skipped-to or frozen finale plays nothing in a burst, and
// Ride again or a jump from the finale hushes whatever of it is still sounding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_RISES_AFTER, createCues, createCueSounds } from '../../site/src/audio/cueSounds.js';
import { createKit, createSfx } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { STATION_BELL } from '../../site/src/audio/sfxTiming.js';
import { FIREWORK_TIMING as FIREWORKS, fireworkBlooms } from '../../site/src/finale/fireworkTiming.js';
import { BED_NODES } from '../../site/src/audio/ambienceBeds.js';
import { FINALE_TIMES as T } from '../../site/src/finale/finale.js';
import { FINALE_FADE } from '../../site/src/finale/finaleTimes.js';
import { foleyCues, footfalls } from '../../site/src/finale/foleyTiming.js';
import { stubContext } from './audioStub.js';
import { finaleOnStage } from './finaleStage.js';

const FRAME = 1 / 60;
const isPop = (name) => /^firework-\d$/.test(name);

/** A stand-in for the sound effects: it remembers each one-shot asked for, by name, on a frame count. */
function fakeSfx() {
  const asked = [];
  let frame = 0;
  return {
    asked,
    settled: true,
    set frame(f) { frame = f; },
    define() {},
    play(name, delay = 0, level = 1) { asked.push({ name, delay, level, frame }); return true; },
  };
}

/** The real sound effects on the stub context, with the sound on, and the cues on them. */
function engine() {
  const audio = stubContext();
  const music = { mixer: createMixer(audio.ctx), audible: true, waking: false };
  audio.ctx.state = 'running';
  music.mixer.fade(true, 0.01);
  audio.advance(1);
  const sfx = createSfx(music, { now: () => 0 });
  return { audio, music, sfx, cues: createCues(sfx) };
}

/** Plays the finale's clock from `from` to `to` in frames of `frame` s, the context's clock keeping pace. */
function run(cues, from, to, { frame = FRAME, audio = null, bursts = 4 } = {}) {
  for (let t = from + frame; t <= to + 1e-9; t += frame) {
    if (audio) audio.advance(audio.ctx.currentTime + frame);
    cues.finale(t, bursts);
  }
}

function finale(tier) {
  const { scene, finale: f } = finaleOnStage();
  f.setQuality(tier);
  return { finale: f, ages: scene.getObjectByName('finale-fireworks').material.uniforms.uAge.value };
}

/** The frames in which each burst's sparks came out, as the finale draws them, and the frames each popped in. */
function popsAndBlooms(tier, seconds) {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  const { finale: f, ages } = finale(tier);
  cues.arrival();
  f.begin();
  const before = ages.slice();
  const blooms = [];
  for (let i = 0; i < seconds * 60; i++) {
    sfx.frame = i;
    f.update(FRAME);
    for (let b = 0; b < FIREWORKS.MAX; b++) {
      if (ages[b] >= FIREWORKS.RISE && (before[b] < FIREWORKS.RISE || ages[b] < before[b])) blooms.push(`${i}:firework-${b}`);
      before[b] = ages[b];
    }
    cues.finale(f.time, f.bursts);
  }
  return { pops: sfx.asked.filter((a) => isPop(a.name)).map((a) => `${a.frame}:${a.name}`), blooms };
}

test('each firework pops in the very frame its burst blooms, round after round', () => {
  const { pops, blooms } = popsAndBlooms('high', 30);
  assert.ok(blooms.length >= 20);
  assert.deepEqual(pops, blooms);
});

test('on the low tier only its two bursts pop', () => {
  const { pops, blooms } = popsAndBlooms('low', 30);
  assert.ok(pops.every((p) => /firework-[01]$/.test(p)));
  assert.deepEqual(pops, blooms);
});

test('a second finale (after riding again) pops from its own start, not where the first left off', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  const pops = () => sfx.asked.filter((a) => isPop(a.name)).length;
  cues.arrival();
  run(cues, 0, 20);
  const first = pops();
  cues.arrival();
  run(cues, 0, 9);
  assert.equal(pops(), first, 'nothing before the fireworks start');
  run(cues, 9, 9.9);
  assert.equal(pops(), first + 1, 'its first burst pops');
});

test('the card rustles as it rises', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  cues.card();
  assert.deepEqual(sfx.asked.map((a) => [a.name, a.delay]), [['rustle', CARD_RISES_AFTER]]);
});

test('the finale\'s own sounds: the station bell as the train pulls in, then every cue once, in order, each on its time', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  cues.arrival();
  assert.deepEqual(sfx.asked.map((a) => [a.name, a.delay]), [['bell', STATION_BELL.AFTER]]);
  const frames = [];
  for (let t = FRAME; t <= T.end; t += FRAME) {
    frames.push(t);
    sfx.frame = frames.length - 1;
    cues.finale(t, 4);
  }
  const heard = sfx.asked.slice(1).filter((a) => !isPop(a.name));
  const due = [];
  foleyCues(0, T.end, (name, t, level) => due.push({ name, t, level }));
  assert.deepEqual(heard.map((a) => a.name), due.map((c) => c.name), 'every cue, in order');
  heard.forEach((a, i) => {
    // Heard in the frame its time falls in, and played back to that time.
    const frameTime = frames[a.frame];
    assert.ok(due[i].t <= frameTime + 1e-9 && due[i].t > frameTime - FRAME - 1e-9, `${a.name} at ${due[i].t} heard in the frame to ${frameTime}`);
    assert.ok(Math.abs(a.delay - (due[i].t - frameTime)) < 1e-9, `${a.name} played ${a.delay} s on`);
    assert.equal(a.level, due[i].level);
  });
  // App state lists what was heard, in order: the bell, the cues, the fireworks.
  assert.deepEqual(cues.heard, ['bell', ...sfx.asked.slice(1).map((a) => (isPop(a.name) ? 'firework' : a.name))]);
});

test('a skipped-to or frozen finale plays nothing in a burst, then each sound in its own time from there', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  // ?ft=9.6: the clock jumps there and is held.
  cues.arrival();
  cues.finale(9.6, 4);
  for (let i = 0; i < 30; i++) cues.finale(9.6, 4);
  assert.deepEqual(sfx.asked.map((a) => a.name), ['bell'], 'none of what was skipped over');
  // Let go again, it plays on from there: the second burst's first bloom comes at 10 s.
  run(cues, 9.6, 10.1);
  assert.deepEqual(sfx.asked.map((a) => a.name), ['bell', 'firework-1']);

  // A jump forward mid-finale skips what it jumps over: no heartbeats, no crinkle, no sparkle.
  const later = fakeSfx();
  const again = createCues(later);
  again.arrival();
  run(again, 0, 5);
  const before = later.asked.length;
  again.finale(8.2, 4);
  run(again, 8.2, 8.3);
  assert.equal(later.asked.length, before);
  // A long frame counts for at most a frame's step of the clock (finale.js): such steps play on.
  run(again, 8.3, 8.6, { frame: 0.1 });
  assert.deepEqual(later.asked.slice(before).map((a) => a.name), ['doves']);
});

test('Ride again or a jump hushes the finale\'s sounds at once, and nothing more of it plays until the next arrival', () => {
  const { audio, music, cues } = engine();
  cues.arrival();
  run(cues, 0, 9.3, { audio });
  // Everything of the finale plays through its own bus, the one node it joins the effects bus by (the mixer's own
  // train bus is the other way in: it carries the train's sounds).
  const [bus, ...others] = audio.made.filter((n) => n !== music.mixer.train && n.outputs.includes(music.mixer.effects));
  assert.equal(others.length, 0, 'one way into the effects bus');
  assert.ok(audio.made.filter((n) => n.outputs.includes(bus)).length >= 10, 'the cues play into it');
  const sounding = audio.starts.length;
  const now = audio.ctx.currentTime;
  cues.silence();
  const hush = bus.gain.log.slice(-3);
  assert.deepEqual(hush.map(([kind, value]) => [kind, value]), [['cancel', null], ['set', 1], ['linear', 0]]);
  assert.ok(hush.every(([, , at], i) => (i < 2 ? at === now : at > now && at <= now + 0.25)), 'fading out at once, quickly');
  const logged = bus.gain.log.length;
  cues.silence(); // hushing again does not bring it back up first
  assert.equal(bus.gain.log.length, logged);
  // The finale plays on under the blush, and goes on being drawn until the screen is covered: nothing of it is heard.
  run(cues, 9.3, 14, { audio });
  assert.equal(audio.starts.length, sounding, 'no pop, nothing');
  // The next time the train pulls in at the Day 365 station, its sounds are back, from the station bell on.
  cues.arrival();
  const back = bus.gain.log.slice(-2);
  assert.deepEqual(back.map(([kind, value]) => [kind, value]), [['cancel', null], ['set', 1]]);
  assert.ok(audio.starts.length > sounding, 'the bell rings');
  assert.deepEqual(cues.heard, ['bell']);
});

test('on a slow phone (a tenth of a second a frame) every footstep and cue is still heard, through the real gates', () => {
  const { audio, cues } = engine();
  cues.arrival();
  run(cues, 0, T.end, { frame: 0.1, audio });
  const steps = [];
  footfalls(0, T.end, () => steps.push(1));
  assert.equal(cues.heard.filter((n) => n === 'step').length, steps.length);
  for (const name of ['bell', 'hop', 'land', 'dress', 'door', 'shop-bell', 'crinkle', 'sparkle', 'doves']) {
    assert.equal(cues.heard.filter((n) => n === name).length, 1, name);
  }
  assert.equal(cues.heard.filter((n) => n === 'heartbeat').length, 2);
});

test('the whole finale fits the node budget beside the evening\'s crickets: nothing it plays is skipped for want of room', (t) => {
  const { audio, sfx, cues } = engine();
  assert.ok(sfx.kit.hold(BED_NODES.evening), 'the crickets');
  let most = 0;
  const watch = () => { most = Math.max(most, sfx.kit.live); };
  sfx.finale(); // the sigh and the whistle as the train stops
  cues.arrival(); // the bell, after the whistle
  watch();
  // The blush covers the screen and the finale begins: its clock starts FINALE_FADE after the stop.
  for (let i = 0; i < FINALE_FADE / FRAME; i++) {
    audio.advance(audio.ctx.currentTime + FRAME);
    watch();
  }
  for (let time = FRAME; time <= 16; time += FRAME) {
    audio.advance(audio.ctx.currentTime + FRAME);
    cues.finale(time, 4);
    watch();
  }
  const due = [];
  foleyCues(0, 16, (name) => due.push(name));
  const pops = [];
  fireworkBlooms(0, 16, 4, () => pops.push('firework'));
  assert.equal(cues.heard.length, 1 + due.length + pops.length, `${cues.heard.length} played`);
  t.diagnostic(`most nodes held at once in the finale: ${most} of 40`);
  assert.ok(most <= 36, `${most} nodes at the busiest, leaving room for a passing sound`);
});

test('while the sound is off or coming back up, the finale\'s cues are skipped, not saved up to land together', () => {
  const { audio, music, sfx, cues } = engine();
  cues.arrival();
  run(cues, 0, 4.2, { audio });
  const before = cues.heard.length;
  // The sound goes off as he sets off across the platform: his steps and the first heartbeat pass unheard...
  music.audible = false;
  run(cues, 4.2, 6.0, { audio });
  assert.equal(cues.heard.length, before);
  // ...and it comes back on: while the master fader rises, nothing; once it is up, each in its own time again.
  music.audible = true;
  music.mixer.fade(true, 0.4);
  assert.equal(sfx.settled, false, 'the fader is rising');
  const from = audio.starts.length;
  run(cues, 6.0, 7.05, { audio });
  assert.equal(sfx.settled, true);
  assert.deepEqual(cues.heard.slice(before), ['heartbeat', 'crinkle'], 'the step at 6.3 s fell while it rose');
  // The heartbeat's sources start at its own time, not bunched with anything held back.
  const started = audio.starts.slice(from).map((st) => st.at);
  assert.ok(started.every((at) => at >= 1 + 6.6), `${started}`);
});

test('the list of what the finale played is kept short', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  cues.arrival();
  run(cues, 0, 600); // the card stays up ten minutes, the fireworks going on
  assert.ok(cues.heard.length <= 64, `${cues.heard.length} listed`);
  assert.deepEqual(cues.heard.slice(0, 2), ['bell', 'hop']);
});

test('the cue voices on a real engine: the rustle waits for the card, the sparkle climbs, the pops keep the budget', () => {
  const { audio, sfx, cues } = engine();
  cues.card();
  const rustle = audio.starts.filter((s) => s.type === 'noise');
  assert.equal(rustle.length, 2, 'crinkles and a breath of noise');
  assert.ok(rustle.every((s) => Math.abs(s.at - (1 + 0.05 + CARD_RISES_AFTER)) < 1e-9), 'as the card rises');
  cues.arrival();
  cues.finale(T.hearts - 0.05, 4);
  const from = audio.starts.length;
  cues.finale(T.hearts + 0.01, 4);
  const notes = audio.starts.slice(from).filter((s) => s.type === 'osc').map((s) => s.node.frequency.value);
  assert.equal(notes.length, 5);
  assert.ok(notes.every((f, i) => i === 0 || f > notes[i - 1]), 'rising');
  // Every burst at once, again and again: the budget holds them back rather than piling them up.
  for (let i = 0; i < 10; i++) {
    for (let b = 0; b < 4; b++) createCueSounds(sfx.kit).firework(1.1 + i * 0.01, 1, 0);
  }
  assert.ok(sfx.kit.live <= 40, `${sfx.kit.live} nodes`);
  // None starts an oscillator below 20 Hz: the e2e tests count those as the whistle's vibrato.
  for (const s of audio.starts.filter((x) => x.type === 'osc')) assert.ok(s.node.frequency.value >= 20);
});

test('each cue counts in the budget exactly the nodes it makes, until it ends', () => {
  for (const name of ['rustle', 'sparkle', 'firework']) {
    const audio = stubContext();
    const kit = createKit(createMixer(audio.ctx));
    const voices = createCueSounds(kit);
    const before = audio.nodes;
    assert.equal(voices[name](0.1, 1), true, name);
    assert.equal(kit.live, audio.nodes - before, name);
    audio.advance(60);
    assert.equal(kit.live, 0, `${name} lets them go`);
  }
});

test('a cue at no level plays nothing', () => {
  const audio = stubContext();
  const kit = createKit(createMixer(audio.ctx));
  const voices = createCueSounds(kit);
  assert.equal(voices.rustle(0, 0), false);
  assert.equal(voices.sparkle(0, 0), false);
  assert.equal(voices.firework(0, 0), false);
  assert.equal(audio.starts.length, 0);
});

test('the wish: a shimmer for the finale\'s shooting star, on the finale\'s own bus, hushed with the rest', () => {
  const { audio, music, cues } = engine();
  cues.arrival();
  const tones = () => audio.starts.filter((s) => s.type === 'osc').length;
  const before = tones();
  cues.wish();
  assert.equal(tones() - before, 6, 'three bells, each two sines');
  // It joins the effects bus by the finale's bus, the same one node as every other sound of the finale.
  const [bus, ...others] = audio.made.filter((n) => n !== music.mixer.train && n.outputs.includes(music.mixer.effects));
  assert.equal(others.length, 0, 'one way into the effects bus');
  assert.ok(audio.made.some((n) => n.outputs.includes(bus) && n.gain && n.gain.value > 0.004 && n.gain.value < 0.006), 'the shimmer plays into it');
  assert.deepEqual(cues.heard, ['bell'], 'it is not one of the sounds the app state lists');

  // Ride again or a jump hushes it with the rest, and none comes while hushed; the next arrival brings it back.
  cues.silence();
  assert.equal(bus.gain.log.at(-1)[1], 0, 'faded out at once');
  audio.advance(5);
  const heard = tones();
  cues.wish();
  assert.equal(tones(), heard, 'nothing while hushed');
  const afterHush = tones();
  cues.arrival(); // the station bell rings, with oscillators of its own
  const bell = tones() - afterHush;
  audio.advance(10);
  cues.wish();
  assert.equal(tones() - afterHush - bell, 6, 'back, six sines');
});

test('the wish is only asked for, never noted: the finale\'s state is as it was', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  cues.arrival();
  cues.wish();
  assert.deepEqual(sfx.asked.map((a) => a.name), ['bell', 'wish']);
  assert.deepEqual(cues.heard, ['bell']);
  cues.silence();
  cues.wish();
  assert.equal(sfx.asked.length, 2, 'not while hushed');
});
