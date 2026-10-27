// The cue sounds (site/src/audio/cueSounds.js): the card's rustle, the hearts' sparkle and a pop for each of the
// finale's fireworks, in time with the finale's own bursts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_RISES_AFTER, createCues, createCueSounds } from '../../site/src/audio/cueSounds.js';
import { createKit, createSfx } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { FIREWORK_TIMING as FIREWORKS } from '../../site/src/finale/fireworkTiming.js';
import { stubContext } from './audioStub.js';
import { finaleOnStage } from './finaleStage.js';

/** A stand-in for the sound effects: it remembers each one-shot asked for, by name, on a frame count. */
function fakeSfx() {
  const asked = [];
  let frame = 0;
  return {
    asked,
    set frame(f) { frame = f; },
    define() {},
    play(name, delay = 0) { asked.push({ name, delay, frame }); return true; },
  };
}

function finale(tier) {
  const { scene, finale: f } = finaleOnStage();
  f.setQuality(tier);
  return { finale: f, ages: scene.getObjectByName('finale-fireworks').material.uniforms.uAge.value };
}

/** The frames in which each burst's sparks came out, as the finale draws them. */
function popsAndBlooms(tier, seconds) {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  const { finale: f, ages } = finale(tier);
  f.begin();
  const before = ages.slice();
  const blooms = [];
  for (let i = 0; i < seconds * 60; i++) {
    sfx.frame = i;
    f.update(1 / 60);
    for (let b = 0; b < FIREWORKS.MAX; b++) {
      if (ages[b] >= FIREWORKS.RISE && (before[b] < FIREWORKS.RISE || ages[b] < before[b])) blooms.push(`${i}:firework-${b}`);
      before[b] = ages[b];
    }
    cues.fireworks(f.time, f.bursts);
  }
  return { pops: sfx.asked.map((a) => `${a.frame}:${a.name}`), blooms, cues, sfx, f };
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
  for (let t = 0; t <= 20; t += 1 / 60) cues.fireworks(t, 4);
  const first = sfx.asked.length;
  for (let t = 1 / 60; t <= 9; t += 1 / 60) cues.fireworks(t, 4); // the clock starts again from 0
  assert.equal(sfx.asked.length, first, 'nothing before the fireworks start');
  for (let t = 9; t <= 10; t += 1 / 60) cues.fireworks(t, 4);
  assert.equal(sfx.asked.length, first + 1, 'its first burst pops');
});

test('the card rustles as it rises, and the hearts sparkle', () => {
  const sfx = fakeSfx();
  const cues = createCues(sfx);
  cues.card();
  cues.hearts();
  assert.deepEqual(sfx.asked.map((a) => [a.name, a.delay]), [['rustle', CARD_RISES_AFTER], ['sparkle', 0]]);
});

test('the cue voices on a real engine: the rustle waits for the card, the sparkle climbs, the pops keep the budget', () => {
  const audio = stubContext();
  const music = { mixer: createMixer(audio.ctx), audible: true, waking: false };
  audio.ctx.state = 'running';
  music.mixer.fade(true, 0.01);
  audio.advance(1);
  const sfx = createSfx(music, { now: () => 0 });
  const cues = createCues(sfx);
  cues.card();
  const rustle = audio.starts.filter((s) => s.type === 'noise');
  assert.equal(rustle.length, 2, 'crinkles and a breath of noise');
  assert.ok(rustle.every((s) => Math.abs(s.at - (1 + 0.05 + CARD_RISES_AFTER)) < 1e-9), 'as the card rises');
  cues.hearts();
  const notes = audio.starts.filter((s) => s.type === 'osc').map((s) => s.node.frequency.value);
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
