// The tunnel's echo (site/src/audio/tunnelEcho.js) on a stub AudioContext, through the real kit and master chain: it
// is built from four nodes of the kit's budget only near the tunnel, follows how far inside she is, and gives
// everything back as she leaves, or when the sound goes off or she jumps away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createKit } from '../../site/src/audio/sfx.js';
import { createMixer } from '../../site/src/audio/mixer.js';
import { ECHO, createTunnelEcho } from '../../site/src/audio/tunnelEcho.js';
import { stubContext } from './audioStub.js';

function setup() {
  const audio = stubContext();
  const mixer = createMixer(audio.ctx);
  const kit = createKit(mixer);
  const echo = createTunnelEcho(kit);
  /** The chain's nodes, found by following the connections from the train bus. */
  const chain = () => {
    const send = mixer.train.outputs.find((n) => n !== mixer.effects);
    const delay = send.outputs[0];
    const tone = delay.outputs[0];
    const feedback = tone.outputs.find((n) => n !== mixer.effects);
    return { send, delay, tone, feedback };
  };
  return { ...audio, mixer, kit, echo, chain };
}

test('the echo is a delay with feedback, darker with each repeat, about 10 dB under the dry sound', () => {
  assert.ok(Object.isFrozen(ECHO));
  assert.deepEqual({ ...ECHO }, { DELAY: 0.11, FEEDBACK: 0.38, TONE: 2400, SEND: 0.32, NODES: 4, NEAR: 40 });
  assert.ok(Math.abs(20 * Math.log10(ECHO.SEND) + 10) < 0.3);
});

test('near the tunnel it holds four nodes of the budget, and gives them back away from it', () => {
  const t = setup();
  assert.equal(t.echo.held, false);
  assert.equal(t.kit.live, 0);
  t.echo.update(0, true);
  assert.equal(t.echo.held, true);
  assert.equal(t.kit.live, 4);
  t.echo.update(0.5, true);
  assert.equal(t.kit.live, 4, 'built once, not again every frame');
  t.echo.update(0, false);
  assert.equal(t.echo.held, false);
  assert.equal(t.kit.live, 0);
});

test('the chain: the train bus into a send, a delay, a low-pass into the effects bus, and a feedback loop round the delay', () => {
  const t = setup();
  const made = t.made.length;
  t.echo.update(1, true);
  assert.equal(t.made.length - made, ECHO.NODES, 'the nodes it makes are the nodes it holds');
  const { send, delay, tone, feedback } = t.chain();
  assert.equal(delay.delayTime.value, ECHO.DELAY);
  assert.equal(tone.type, 'lowpass');
  assert.equal(tone.frequency.value, ECHO.TONE);
  assert.equal(feedback.gain.value, ECHO.FEEDBACK);
  assert.deepEqual(feedback.outputs, [delay], 'the feedback goes back into the delay');
  assert.ok(tone.outputs.includes(t.mixer.effects), 'the wet sound joins the effects bus, not the train bus again');
  assert.ok(!send.outputs.includes(t.mixer.effects), 'only the wet path, through the delay');
});

test('the send follows how far inside she is, and stays silent in the open', () => {
  const t = setup();
  t.echo.update(0, true); // within reach of the tunnel but outside it
  const { send } = t.chain();
  assert.equal(send.gain.value, 0);
  assert.equal(t.echo.held, true);
  t.echo.update(0.5, true);
  assert.ok(Math.abs(send.gain.target - ECHO.SEND * 0.5) < 1e-9);
  t.echo.update(1, true);
  assert.ok(Math.abs(send.gain.target - ECHO.SEND) < 1e-9);
  t.echo.update(0.25, true);
  assert.ok(Math.abs(send.gain.target - ECHO.SEND * 0.25) < 1e-9);
  t.echo.update(0, true); // out of the far mouth, still within reach: the tail rings out as the send closes
  assert.equal(send.gain.target, 0);
  assert.equal(t.echo.held, true);
});

test('a send that is already where it should be is not scheduled again every frame', () => {
  const t = setup();
  t.echo.update(0, true);
  const { send } = t.chain();
  assert.equal(send.gain.events, 0, 'in the open the send stays at its silent start');
  t.echo.update(1, true);
  const events = send.gain.events;
  assert.equal(events, 1);
  for (let frame = 0; frame < 60; frame++) t.echo.update(1, true);
  assert.equal(send.gain.events, events, 'deep inside, nothing more');
});

test('leaving cuts the tap off the shared train bus and every node loose, so nothing is left connected', () => {
  const t = setup();
  t.echo.update(1, true);
  const { send, delay, tone, feedback } = t.chain();
  t.echo.update(0, false);
  assert.ok(t.mixer.train.cut.includes(send), 'the train bus no longer feeds it');
  for (const node of [send, delay, tone, feedback]) assert.equal(node.disconnected, true);
  assert.ok(t.mixer.train.outputs.includes(t.mixer.effects) && !t.mixer.train.disconnected, 'the dry sound carries on');
});

test('a browser that cannot cut one connection off the bus still lets the echo go, and its budget', () => {
  const t = setup();
  t.echo.update(1, true);
  const { send, delay, tone, feedback } = t.chain();
  t.mixer.train.disconnect = () => { throw new TypeError('no selective disconnect'); };
  t.echo.update(1, false);
  assert.equal(t.echo.held, false);
  assert.equal(t.kit.live, 0);
  for (const node of [send, delay, tone, feedback]) assert.equal(node.disconnected, true, 'cut loose all the same');
});

test('with no room in the budget it holds nothing and makes nothing: no echo', () => {
  const t = setup();
  assert.equal(t.kit.hold(38), true);
  const made = t.made.length;
  t.echo.update(1, true);
  assert.equal(t.echo.held, false);
  assert.equal(t.kit.live, 38);
  assert.equal(t.made.length, made);
  assert.deepEqual(t.mixer.train.outputs, [t.mixer.effects]);
  // Room comes back (a sound ended): the echo follows on the next frame.
  t.kit.release(38);
  t.echo.update(1, true);
  assert.equal(t.echo.held, true);
  assert.equal(t.kit.live, 4);
});

test('a jump from inside to far away in one update releases it', () => {
  const t = setup();
  t.echo.update(1, true);
  assert.equal(t.kit.live, 4);
  t.echo.update(0, false);
  assert.equal(t.echo.held, false);
  assert.equal(t.kit.live, 0);
});

test('release() gives the nodes back once, however often it is called, and the echo can be built again', () => {
  const t = setup();
  t.echo.release(); // nothing held: nothing to give back
  assert.equal(t.kit.live, 0);
  t.echo.update(1, true);
  t.echo.release();
  t.echo.release();
  assert.equal(t.kit.live, 0, 'never below what it held');
  assert.equal(t.echo.held, false);
  for (let i = 0; i < 5; i++) {
    t.echo.update(1, true);
    t.echo.update(1, false);
  }
  assert.equal(t.kit.live, 0, 'five passes through the tunnel leak nothing');
  t.echo.update(1, true);
  assert.equal(t.kit.live, 4);
});
