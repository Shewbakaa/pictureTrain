// The finale's foley voices (site/src/audio/foleySounds.js) on the stub AudioContext: each counts in the node budget
// exactly the nodes it makes until it ends, plays into the output it is given, keeps to the finale's timing (the
// whoosh while she is in the air, the heartbeat's "dub", the bell's two strikes) and starts no oscillator below
// 20 Hz (the e2e tests count those as the whistle's vibrato).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoleySounds, FOLEY_NAMES } from '../../site/src/audio/foleySounds.js';
import { createKit } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { FOLEY } from '../../site/src/finale/foleyTiming.js';
import { STATION_BELL } from '../../site/src/audio/sfxTiming.js';
import { stubContext } from './audioStub.js';

/** A fresh kit on the stub, and a gain standing in for the finale's own bus. */
function setup(options) {
  const audio = stubContext(options);
  const kit = createKit(createMixer(audio.ctx));
  const out = audio.ctx.createGain();
  return { audio, kit, out, voices: createFoleySounds(kit, out) };
}

/** The latest stop time among the sources a voice started at `at` and after. */
const lastStop = (audio, from) => Math.max(...audio.sources.filter((s) => s.stopped && audio.starts.find((x) => x.node === s && x.at >= from)).map((s) => s.stopAt));

test('every finale cue has a voice', () => {
  assert.deepEqual([...FOLEY_NAMES].sort(), ['bell', 'crinkle', 'door', 'doves', 'dress', 'heartbeat', 'hop', 'land', 'shop-bell', 'step']);
  const { voices } = setup();
  for (const name of FOLEY_NAMES) assert.equal(typeof voices[name], 'function', name);
});

test('each voice counts in the budget exactly the nodes it makes, until it ends, and plays into its output', () => {
  for (const panning of [true, false]) {
    for (const name of FOLEY_NAMES) {
      const { audio, kit, out, voices } = setup({ panning });
      const before = audio.nodes;
      assert.equal(voices[name](0.1, 1), true, name);
      // Without StereoPannerNode a voice makes one node fewer than it counts: the budget errs on the safe side.
      const over = kit.live - (audio.nodes - before);
      assert.ok(panning ? over === 0 : over === 0 || over === 1, `${name}: ${kit.live} counted, ${audio.nodes - before} made`);
      const joined = audio.made.filter((n) => n.outputs.includes(out));
      assert.equal(joined.length, 1, `${name} joins its output by one node`);
      assert.ok(audio.made.every((n) => !n.outputs.includes(kit.buses.effects)), `${name} goes through its output, not round it`);
      audio.advance(60);
      assert.equal(kit.live, 0, `${name} lets them go`);
      assert.equal(joined[0].disconnected, true, `${name} leaves its output when it ends`);
    }
  }
});

test('at no level a voice plays nothing; without room in the budget, nothing either', () => {
  for (const name of FOLEY_NAMES) {
    const { audio, voices } = setup();
    assert.equal(voices[name](0, 0), false, name);
    assert.equal(audio.starts.length, 0, name);
  }
  const audio = stubContext();
  const kit = createKit(createMixer(audio.ctx), { budget: 2 });
  const voices = createFoleySounds(kit, audio.ctx.createGain());
  for (const name of FOLEY_NAMES) assert.equal(voices[name](0, 1), false, name);
  assert.equal(audio.starts.length, 0);
});

test('a burst of footsteps keeps within the 40-node budget', () => {
  const { kit, voices } = setup();
  for (let i = 0; i < 30; i++) voices.step(1 + i * 0.01, 1);
  assert.ok(kit.live <= 40, `${kit.live} nodes`);
});

test('the voices keep the finale\'s timing: a whoosh while she is in the air, the heartbeat\'s dub, the bell\'s two strikes', () => {
  {
    const { audio, voices } = setup();
    voices.hop(2, 1);
    const end = lastStop(audio, 2);
    assert.ok(end >= 2 + FOLEY.AIRTIME && end <= 2 + FOLEY.AIRTIME + 0.05, `the whoosh ends at ${end}`);
  }
  {
    const { audio, voices } = setup();
    voices.heartbeat(2, 1);
    const end = lastStop(audio, 2);
    const { DUB, RING } = FOLEY.HEART;
    assert.ok(end >= 2 + DUB + RING - 1e-9 && end <= 2 + DUB + RING + 0.03, `the beat dies away at ${end}`);
    const pitch = audio.starts.find((s) => s.type === 'osc').node.frequency;
    assert.ok(pitch.log.some(([, , at]) => Math.abs(at - (2 + DUB)) < 1e-9), 'the "dub" comes DUB after the "lub"');
  }
  {
    const { audio, voices } = setup();
    voices.bell(2, 1);
    // Each partial is struck twice, the second time STATION_BELL.APART after the first.
    const strikes = audio.made.filter((n) => n.gain && n.gain.log.some(([kind]) => kind === 'target'));
    assert.ok(strikes.length >= 3, `${strikes.length} partials`);
    for (const env of strikes) {
      const at = env.gain.log.filter(([kind]) => kind === 'set').map(([, , t]) => t);
      assert.deepEqual(at, [2, 2 + STATION_BELL.APART]);
    }
  }
});

test('no voice starts an oscillator below 20 Hz', () => {
  const { audio, voices } = setup();
  for (const name of FOLEY_NAMES) voices[name](0.1, 1);
  const tones = audio.starts.filter((s) => s.type === 'osc');
  assert.ok(tones.length > 0);
  for (const s of tones) assert.ok(s.node.frequency.value >= 20, `${s.node.frequency.value} Hz`);
});
