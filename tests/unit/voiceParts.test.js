// The envelope helpers in site/src/audio/voiceParts.js: `fallen`, a ring's level some time after it began falling,
// and `strike`, a param struck again and again (a bell's partials, the doves' wingbeats).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallen, strike, toSilence } from '../../site/src/audio/voiceParts.js';
import { stubContext } from './audioStub.js';

/** A gain's param on the stub, which logs every automation call. */
const param = () => stubContext().ctx.createGain().gain;

test('fallen: a ring only falls, and a moment before it began counts as no time', () => {
  assert.equal(fallen(0.5, 0, 0.1), 0.5);
  assert.ok(fallen(0.5, 0.2, 0.1) < 0.5);
  assert.equal(fallen(0.5, -0.005, 0.1), 0.5);
});

test('two strikes a millisecond apart never push the envelope above a single strike\'s peak', () => {
  const env = param();
  const attack = 0.008;
  strike(env, [[1, 1], [1.001, 0.9]], 0.5, attack, toSilence(0.06));
  const levels = env.log.filter(([kind]) => kind !== 'cancel').map(([, value]) => value);
  assert.ok(levels.every((v) => v <= 0.5 + 1e-12), `levels ${levels}`);
  // The second picks up where the first's rise had got to, rather than jumping.
  const [, again] = env.log.filter(([kind]) => kind === 'set');
  assert.ok(Math.abs(again[1] - 0.5 * (0.001 / attack)) < 1e-12, `the second starts from ${again[1]}`);
});

test('a strike while the last still rings starts from where its ring has fallen to', () => {
  const env = param();
  const tau = toSilence(1);
  strike(env, [[0, 1], [0.5, 1]], 1, 0.002, tau);
  const sets = env.log.filter(([kind]) => kind === 'set');
  assert.deepEqual(sets.map(([, , at]) => at), [0, 0.5]);
  assert.equal(sets[0][1], 0);
  assert.ok(Math.abs(sets[1][1] - fallen(1, 0.498, tau)) < 1e-12);
});
