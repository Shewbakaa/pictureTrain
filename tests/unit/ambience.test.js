// The ambience (site/src/audio/ambience.js) on a stub AudioContext, through the real sound-effects engine (sfx.js)
// with a fake music player, riding the fixture's real layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbience } from '../../site/src/audio/ambience.js';
import { createSfx } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { AMBIENCE } from '../../site/src/audio/ambienceTiming.js';
import { envAt } from '../../site/src/world/environment.js';
import { buildLayout } from '../../site/src/world/layout.js';
import { normalizeContent } from '../../site/src/content/normalize.js';
import { createRide } from '../../site/src/ride/rideController.js';
import fixture from '../fixtures/content.fixture.js';
import { stubContext } from './audioStub.js';

const L = buildLayout(normalizeContent(fixture).content);
const FRAME = 1 / 60;
const zone = (id) => L.zones.find((z) => z.id === id);
const middleOf = (id) => (zone(id).start + zone(id).end) / 2;

function setup(options) {
  const audio = stubContext(options);
  const music = { mixer: createMixer(audio.ctx), audible: false, waking: false };
  const sfx = createSfx(music, { now: () => audio.ctx.currentTime * 1000 });
  const played = [];
  const play = sfx.play;
  sfx.play = (name, ...rest) => {
    const heard = play(name, ...rest);
    if (heard) played.push({ name, t: audio.ctx.currentTime });
    return heard;
  };
  const ambience = createAmbience(sfx);
  const env = envAt(L, 0);
  let distance = 0;
  /** Runs `seconds` of frames with the train at `at` m (or moving from it at `speed`), looking `yaw`. */
  const ride = (seconds, at, { speed = 0, yaw = 0 } = {}) => {
    distance = at;
    for (let t = 0; t < seconds - 1e-9; t += FRAME) {
      distance += speed * FRAME;
      audio.advance(audio.ctx.currentTime + FRAME);
      ambience.update(envAt(L, distance, env), yaw, FRAME, distance);
    }
  };
  return {
    ...audio, music, sfx, ambience, played, ride,
    on() {
      music.audible = true;
      audio.ctx.state = 'running';
      music.mixer.fade(true, 0.05);
    },
    off() {
      music.audible = false;
      audio.ctx.state = 'suspended';
    },
    named: (name) => played.filter((p) => p.name === name),
  };
}

test('nothing plays, and nothing breaks, before the Begin tap has made the context', () => {
  const ambience = createAmbience(createSfx({ mixer: null, audible: false, waking: false }, { now: () => 0 }));
  const env = envAt(L, middleOf('winter'));
  for (let i = 0; i < 30; i++) ambience.update(env, 0, FRAME, middleOf('winter'));
  assert.equal(ambience.winter, 1, 'the carol still hears where winter is');
  assert.deepEqual(ambience.beds, []);
});

test('with the sound off nothing is made or started; once it is on, the zone\'s bed comes in', () => {
  const t = setup();
  t.ride(5, middleOf('spring'));
  assert.equal(t.starts.length, 0);
  assert.deepEqual(t.ambience.beds, []);
  t.on();
  t.ride(0.2, middleOf('spring'));
  assert.deepEqual(t.ambience.beds, ['spring']);
  assert.ok(t.starts.length >= 1, 'the breeze');
});

test('a bed comes in as its zone comes near and is taken down after it has gone; never more than two at once', () => {
  const t = setup();
  t.on();
  const seen = new Set();
  let most = 0;
  let d = 10;
  for (let s = 0; s < (L.finaleDistance - 10) / 6.5; s += FRAME) {
    d += 6.5 * FRAME;
    t.advance(t.ctx.currentTime + FRAME);
    t.ambience.update(envAt(L, d), 0, FRAME, d);
    for (const bed of t.ambience.beds) seen.add(bed);
    most = Math.max(most, t.ambience.beds.length);
  }
  assert.deepEqual([...seen].sort(), ['autumn', 'evening', 'spring', 'summer', 'winter']);
  assert.ok(most <= 2, `${most} beds up at once`);
  assert.deepEqual(t.ambience.beds, ['evening']);
});

test('spring\'s birds come at random, never crowded, and only in spring; the bee and the burner now and then', () => {
  const t = setup();
  t.on();
  t.ride(300, middleOf('spring'));
  const birds = t.named('bird-spring').map((p) => p.t);
  assert.ok(birds.length >= 300 / 6.5 && birds.length <= 300 / 2.2 + 1, `${birds.length} birds in 5 minutes`);
  const gaps = birds.slice(1).map((b, i) => b - birds[i]);
  assert.ok(Math.min(...gaps) >= 2.2 - 0.1, `closest ${Math.min(...gaps)}`);
  assert.ok(t.named('bee').length >= 3 && t.named('burner').length >= 3);
  for (const name of ['gull', 'bird-autumn', 'sleigh', 'chime']) assert.equal(t.named(name).length, 0, name);
});

test('each zone has its own passing sounds', () => {
  for (const [id, name] of [['summer', 'gull'], ['autumn', 'bird-autumn'], ['winter', 'sleigh']]) {
    const t = setup();
    t.on();
    t.ride(120, middleOf(id));
    assert.ok(t.named(name).length >= 2, `${name} in ${id}`);
    assert.equal(t.named('bird-spring').length, 0);
  }
});

test('the clock tower strikes once as the train rolls into the evening; a jump there strikes nothing', () => {
  const t = setup();
  t.on();
  t.ride((zone('evening').start + 40 - (zone('evening').start - 40)) / 6.5, zone('evening').start - 40, { speed: 6.5 });
  t.ride(20, zone('evening').start + 40);
  assert.equal(t.named('chime').length, 1);

  const u = setup();
  u.on();
  u.ride(1, middleOf('winter'));
  u.ride(20, middleOf('evening'));
  assert.equal(u.named('chime').length, 0);
});

test('the waves come from the sea on her left, and move round as she turns her head', () => {
  const t = setup();
  t.on();
  t.ride(1, middleOf('summer'));
  const pan = t.panners.find((p) => p.pan.events > 0);
  assert.ok(pan, 'the waves are panned');
  assert.ok(Math.abs(pan.pan.target - -AMBIENCE.WAVE_WIDTH) < 1e-9, `looking ahead: ${pan.pan.target}`);
  t.ride(0.5, middleOf('summer'), { yaw: Math.PI / 2 });
  assert.ok(Math.abs(pan.pan.target) < 1e-9, 'facing the sea');
});

test('without StereoPannerNode the sounds play unpanned', () => {
  const t = setup({ panning: false });
  t.on();
  t.ride(60, middleOf('summer'));
  t.ride(60, middleOf('spring'));
  assert.ok(t.played.length > 5);
});

test('while a video\'s sound is on (everything ducked) nothing new starts; after it, the ambience carries on', () => {
  const t = setup();
  t.on();
  t.ride(10, middleOf('spring'));
  t.off();
  const before = t.starts.length;
  t.ride(30, middleOf('spring'));
  assert.equal(t.starts.length, before, 'no sound starts while ducked');
  t.on();
  t.ride(30, middleOf('spring'));
  assert.ok(t.starts.length > before);
});

test('a ?speed=50 ride through every zone never piles sounds up, and keeps the node budget', () => {
  const t = setup();
  t.on();
  const ride = createRide({ stops: L.stops.map((s) => s.distance), finaleDistance: L.finaleDistance, speedScale: 50 });
  let dwell = 0;
  ride.on('arrive', () => { dwell = 2; });
  ride.start();
  const env = envAt(L, 0);
  let most = 0;
  for (let s = 0; s < 120 && ride.state !== 'finale'; s += FRAME) {
    ride.update(FRAME);
    if (ride.state === 'stopped' && (dwell -= FRAME) <= 0) ride.continue();
    t.advance(t.ctx.currentTime + FRAME);
    t.ambience.update(envAt(L, ride.distance, env), 0, FRAME, ride.distance);
    most = Math.max(most, t.sfx.kit.live);
  }
  assert.equal(ride.state, 'finale');
  const times = t.starts.map((s) => s.at).sort((a, b) => a - b);
  let busiest = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] > 1) j++;
    busiest = Math.max(busiest, i - j + 1);
  }
  assert.ok(busiest <= 8, `${busiest} sounds started within one second`);
  assert.ok(most <= 40, `${most} nodes of passing sounds at once`);
  assert.ok(t.ambience.beds.length <= 2);
});

test('no ambience sound starts an oscillator below 20 Hz (the e2e tests count those as the whistle\'s vibrato)', () => {
  const t = setup();
  t.on();
  for (const id of ['spring', 'summer', 'autumn', 'winter']) t.ride(200, middleOf(id));
  t.ride((zone('evening').start + 30 - (zone('evening').start - 30)) / 6.5, zone('evening').start - 30, { speed: 6.5 });
  for (const name of ['bird-spring', 'bee', 'burner', 'gull', 'bird-autumn', 'sleigh', 'chime']) {
    assert.ok(t.named(name).length > 0, `${name} was heard`);
  }
  const tones = t.starts.filter((s) => s.type === 'osc');
  assert.ok(tones.length > 50);
  for (const s of tones) assert.ok(s.node.frequency.value >= 20, `an oscillator at ${s.node.frequency.value} Hz`);
});
