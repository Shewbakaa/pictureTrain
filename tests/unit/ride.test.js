import test from 'node:test';
import assert from 'node:assert/strict';
import { createRide, RIDE } from '../../site/src/ride/rideController.js';
import { createRng, rngRange } from '../../site/src/util/rng.js';

const stops = [85, 155, 265];
const finaleDistance = 400;
const run = (r, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) r.update(dt); };
const runUntil = (r, pred, max = 200000) => { for (let i = 0; i < max && !pred(); i++) r.update(1 / 60); assert.ok(pred(), 'condition not reached'); };
const stoppedAt = (i) => { const r = createRide({ stops, finaleDistance }); r.start(); for (let k = 0; k <= i; k++) { if (k > 0) r.continue(); runUntil(r, () => r.state === 'stopped' && r.stopIndex === k); } return r; };

test('idle until started', () => {
  const r = createRide({ stops, finaleDistance });
  run(r, 2);
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
});

test('accelerates to cruise', () => {
  const r = createRide({ stops, finaleDistance });
  r.start();
  run(r, 8);
  assert.equal(r.speed, RIDE.CRUISE);
});

test('stops exactly at a stop and emits arrive once', () => {
  const r = createRide({ stops, finaleDistance });
  const events = [];
  r.on('arrive', (e) => events.push(e));
  r.start();
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.distance, 85);
  assert.equal(r.speed, 0);
  assert.equal(r.stopIndex, 0);
  assert.equal(r.reachedMax, 0);
  run(r, 5);
  assert.equal(r.distance, 85);
  assert.deepEqual(events, [{ index: 0, jumped: false }]);
});

test('continue departs once; repeated continue is a no-op', () => {
  const r = stoppedAt(0);
  const departs = [];
  r.on('depart', (e) => departs.push(e));
  r.continue(); r.continue(); run(r, 1); r.continue();
  assert.deepEqual(departs, [{ index: 0 }]);
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
});

test('long frames are clamped', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 8);
  const d0 = r.distance;
  r.update(5);
  assert.ok(r.distance - d0 <= RIDE.CRUISE * RIDE.MAX_DT + 1e-9);
});

test('time warp never overshoots and reaches the finale', () => {
  const r = createRide({ stops, finaleDistance, speedScale: 50 });
  const seen = [];
  let finales = 0;
  r.on('arrive', () => { seen.push(r.distance); r.continue(); });
  r.on('finale', () => finales++);
  r.start();
  for (let i = 0; i < 5000 && r.state !== 'finale'; i++) {
    r.update(1 / 60);
    const target = r.nextStopIndex >= 0 ? stops[r.nextStopIndex] : finaleDistance;
    assert.ok(r.distance <= target + 1e-9);
  }
  assert.deepEqual(seen, stops);
  assert.equal(r.state, 'finale');
  assert.equal(r.distance, finaleDistance);
  assert.equal(finales, 1);
});

test('zero stops goes straight to the finale', () => {
  const r = createRide({ stops: [], finaleDistance: 100, speedScale: 20 });
  r.start();
  runUntil(r, () => r.state === 'finale');
  assert.equal(r.distance, 100);
});

test('jumpTo only reaches stops already reached', () => {
  const r = stoppedAt(1);
  const events = [];
  r.on('arrive', (e) => events.push(e));
  assert.equal(r.jumpTo(2), false);
  assert.equal(r.jumpTo(0), true);
  assert.equal(r.distance, 85);
  assert.equal(r.state, 'stopped');
  assert.equal(r.nextStopIndex, 1);
  assert.deepEqual(events, [{ index: 0, jumped: true }]);
});

test('jumpTo works from the finale', () => {
  const r = createRide({ stops, finaleDistance, speedScale: 50 });
  r.on('arrive', (e) => { if (!e.jumped) r.continue(); });
  r.start();
  runUntil(r, () => r.state === 'finale');
  assert.equal(r.jumpTo(2), true);
  assert.equal(r.state, 'stopped');
});

test('pause eases to a halt and resumes', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 3);
  r.setPaused(true); run(r, RIDE.PAUSE_EASE + 0.05);
  const d = r.distance;
  run(r, 2);
  assert.equal(r.distance, d);
  r.setPaused(false); run(r, 2);
  assert.ok(r.distance > d);
});

test('restart keeps reachedMax', () => {
  const r = stoppedAt(1);
  r.restart();
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
  assert.equal(r.reachedMax, 1);
});

test('starting mid-track picks the next stop ahead', () => {
  const r = createRide({ stops, finaleDistance, startDistance: 100, reachedMax: 0 });
  assert.equal(r.distance, 100);
  assert.equal(r.nextStopIndex, 1);
  assert.equal(createRide({ stops, finaleDistance, startDistance: 85 }).nextStopIndex, 1);
});

// Everything below is in addition to the brief's tests.

test('brakes along a steady-deceleration curve into the stop', () => {
  const r = createRide({ stops, finaleDistance });
  const dt = 1 / 60;
  const speedAt = {};
  r.start();
  for (let i = 0; i < 20000 && r.state === 'moving'; i++) {
    r.update(dt);
    if (r.state !== 'moving') break;
    const left = stops[0] - r.distance;
    assert.ok(left > RIDE.ARRIVE_EPS);       // closer than that and it would already have arrived
    // The speed never exceeded what can still be braked away in the distance that was left before the step.
    assert.ok(r.speed <= Math.sqrt(2 * RIDE.BRAKE * (left + r.speed * dt)) + 1e-9);
    for (const mark of [20, 10, 5]) if (left <= mark && !(mark in speedAt)) speedAt[mark] = r.speed;
  }
  assert.equal(r.state, 'stopped');
  assert.equal(speedAt[20], RIDE.CRUISE);                                       // not braking yet
  assert.ok(Math.abs(speedAt[10] - Math.sqrt(2 * RIDE.BRAKE * 10)) < 0.1);      // about 4.9 m/s
  assert.ok(Math.abs(speedAt[5] - Math.sqrt(2 * RIDE.BRAKE * 5)) < 0.1);        // about 3.5 m/s
});

test('every event fires after the state has been updated', () => {
  const r = createRide({ stops: [10], finaleDistance: 20, speedScale: 50 });
  const log = [];
  const look = (name) => log.push([name, r.state, r.stopIndex, r.nextStopIndex, r.reachedMax, r.distance, r.speed]);
  r.on('arrive', () => look('arrive'));
  r.on('depart', () => look('depart'));
  r.on('finale', () => look('finale'));
  r.start();
  runUntil(r, () => r.state === 'stopped');
  r.continue();
  runUntil(r, () => r.state === 'finale');
  r.jumpTo(0);
  assert.deepEqual(log, [
    ['arrive', 'stopped', 0, -1, 0, 10, 0],
    ['depart', 'moving', -1, -1, 0, 10, 0],
    ['finale', 'finale', -1, -1, 0, 20, 0],
    ['arrive', 'stopped', 0, -1, 0, 10, 0],
  ]);
});

test('the finale is reached once and then the ride stays put', () => {
  const r = createRide({ stops: [], finaleDistance: 30, speedScale: 50 });
  const events = [];
  r.on('finale', (e) => events.push(['finale', e]));
  r.on('depart', (e) => events.push(['depart', e]));
  r.start();
  runUntil(r, () => r.state === 'finale');
  r.continue();
  r.start();
  run(r, 3);
  assert.deepEqual(events, [['finale', {}]]);
  assert.equal(r.state, 'finale');
  assert.equal(r.distance, 30);
  assert.equal(r.speed, 0);
  assert.equal(r.stopIndex, -1);
  assert.equal(r.nextStopIndex, -1);
});

test('start only works from idle', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 2);
  const d = r.distance;
  r.start();                       // Begin tapped twice must not restart anything
  assert.equal(r.distance, d);
  assert.ok(r.speed > 0);
  const waiting = stoppedAt(0);
  waiting.start();                 // and must not drive a train that is waiting at a stop
  run(waiting, 1);
  assert.equal(waiting.state, 'stopped');
  assert.equal(waiting.distance, 85);
});

test('jumpTo rejects stops that do not exist or are not reached', () => {
  const r = stoppedAt(1);
  const events = [];
  r.on('arrive', (e) => events.push(e));
  for (const bad of [-1, 2, 3, 1.5, NaN, undefined, '0']) assert.equal(r.jumpTo(bad), false, String(bad));
  assert.deepEqual(events, []);
  assert.equal(r.state, 'stopped');
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
  assert.equal(createRide({ stops, finaleDistance }).jumpTo(0), false);   // nothing reached yet
});

test('jumpTo from mid-leg stops the train on that stop and the ride carries on from it', () => {
  const r = stoppedAt(1);
  r.continue(); run(r, 3);
  assert.equal(r.state, 'moving');
  assert.ok(r.speed > 0);
  assert.equal(r.jumpTo(0), true);
  assert.equal(r.state, 'stopped');
  assert.equal(r.stopIndex, 0);
  assert.equal(r.distance, 85);
  assert.equal(r.speed, 0);
  assert.equal(r.nextStopIndex, 1);
  assert.equal(r.reachedMax, 1);                 // jumping back never lowers it
  const events = [];
  r.on('depart', (e) => events.push(['depart', e]));
  r.on('arrive', (e) => events.push(['arrive', e]));
  r.continue();
  runUntil(r, () => r.state === 'stopped');
  assert.deepEqual(events, [['depart', { index: 0 }], ['arrive', { index: 1, jumped: false }]]);
  assert.equal(r.distance, 155);
});

test('a handler may continue() from a jumped arrival too, and the train departs', () => {
  const r = stoppedAt(1);
  const events = [];
  r.on('arrive', ({ jumped }) => { events.push(['arrive', jumped, r.state]); if (jumped) r.continue(); });
  r.on('depart', (e) => events.push(['depart', e]));
  assert.equal(r.jumpTo(0), true);
  assert.deepEqual(events, [['arrive', true, 'stopped'], ['depart', { index: 0 }]]);   // it saw the new state first
  assert.equal(r.state, 'moving');
  assert.equal(r.stopIndex, -1);
  assert.equal(r.distance, 85);
  runUntil(r, () => r.state === 'stopped');                                            // and the ride carries on
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
});

test('a handler that throws during a jump leaves the ride stopped on that stop and usable', () => {
  const r = stoppedAt(1);
  const off = r.on('arrive', () => { throw new Error('boom'); });
  assert.throws(() => r.jumpTo(0), /boom/);
  assert.equal(r.state, 'stopped');                    // the state was already settled before the event
  assert.equal(r.stopIndex, 0);
  off();
  r.continue();
  assert.equal(r.state, 'moving');
});

test('speed is what the train is actually making; paused reports the request', () => {
  const r = createRide({ stops, finaleDistance });
  assert.equal(r.paused, false);
  r.start(); run(r, 3);
  const before = r.speed;
  assert.ok(Math.abs(before - 3 * RIDE.ACCEL) < 0.05);
  r.setPaused(true);
  assert.equal(r.paused, true);                  // straight away, while the train is still easing down
  run(r, RIDE.PAUSE_EASE / 2);
  assert.ok(r.speed > 0 && r.speed < before);
  run(r, RIDE.PAUSE_EASE);
  assert.equal(r.speed, 0);
  r.setPaused(false);
  assert.equal(r.paused, false);
  run(r, RIDE.PAUSE_EASE / 2);
  assert.ok(r.speed > 0);
});

test('pausing while stopped holds the train, and it is never stuck', () => {
  const r = stoppedAt(0);
  r.setPaused(true);
  run(r, 1);
  r.continue();                                  // Continue tapped while paused: it leaves, but waits
  run(r, 2);
  assert.equal(r.state, 'moving');
  assert.equal(r.distance, 85);
  assert.equal(r.speed, 0);
  r.setPaused(false);
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
});

test('the frame clamp applies before the speed scale', () => {
  const longFrame = createRide({ stops, finaleDistance, speedScale: 3 });
  const clamped = createRide({ stops, finaleDistance, speedScale: 3 });
  longFrame.start(); clamped.start();
  longFrame.update(5);
  clamped.update(RIDE.MAX_DT);
  assert.equal(longFrame.speed, clamped.speed);
  assert.equal(longFrame.distance, clamped.distance);
  assert.ok(Math.abs(clamped.speed - 3 * RIDE.ACCEL * RIDE.MAX_DT) < 1e-12);   // 0.3 s of ride time, not 0.1 s
});

test('zero, negative and NaN frame times change nothing', () => {
  const r = createRide({ stops, finaleDistance });
  r.start(); run(r, 2);
  const before = [r.state, r.distance, r.speed];
  for (const dt of [0, -1, NaN, undefined]) r.update(dt);
  assert.deepEqual([r.state, r.distance, r.speed], before);
});

test('starting at the finale arrives at it straight away', () => {
  const r = createRide({ stops, finaleDistance, startDistance: finaleDistance, reachedMax: 2 });
  assert.equal(r.nextStopIndex, -1);
  const finales = [];
  r.on('finale', (e) => finales.push(e));
  r.start();
  r.update(1 / 60);
  assert.equal(r.state, 'finale');
  assert.equal(r.distance, finaleDistance);
  assert.deepEqual(finales, [{}]);
});

test('a start beyond the finale settles back onto the finale', () => {
  const r = createRide({ stops, finaleDistance, startDistance: finaleDistance + 500, reachedMax: 2 });
  assert.equal(r.nextStopIndex, -1);
  r.start();
  run(r, 1);
  assert.equal(r.state, 'finale');
  assert.equal(r.distance, finaleDistance);
});

test('a ride started mid-track stops at the next stop ahead', () => {
  const r = createRide({ stops, finaleDistance, startDistance: 100, reachedMax: 0 });
  r.start();
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.stopIndex, 1);
  assert.equal(r.distance, 155);
  assert.equal(r.reachedMax, 1);
});

test('reachedMax cannot point past the last stop', () => {
  const r = createRide({ stops, finaleDistance, reachedMax: 9 });
  assert.equal(r.reachedMax, 2);
  assert.equal(r.jumpTo(3), false);
  assert.equal(createRide({ stops: [], finaleDistance, reachedMax: 0 }).reachedMax, -1);
});

test('restart from the finale gives a fresh ride that keeps what she has reached', () => {
  const r = createRide({ stops, finaleDistance, speedScale: 50 });
  const off = r.on('arrive', () => r.continue());
  r.start();
  runUntil(r, () => r.state === 'finale');
  off();
  const events = [];
  for (const name of ['arrive', 'depart', 'finale']) r.on(name, (e) => events.push([name, e]));
  r.restart();
  assert.deepEqual(events, []);                  // restart itself says nothing
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
  assert.equal(r.speed, 0);
  assert.equal(r.stopIndex, -1);
  assert.equal(r.nextStopIndex, 0);
  assert.equal(r.reachedMax, 2);
  r.start();
  runUntil(r, () => r.state === 'stopped');
  assert.equal(r.stopIndex, 0);
  assert.equal(r.distance, 85);
  assert.deepEqual(events, [['arrive', { index: 0, jumped: false }]]);
});

test('restart from mid-ride or from a stop comes to rest at the start', () => {
  const cruising = createRide({ stops, finaleDistance });
  cruising.start(); run(cruising, 8);
  assert.equal(cruising.speed, RIDE.CRUISE);
  for (const r of [cruising, stoppedAt(1)]) {
    r.restart();
    assert.equal(r.state, 'idle');
    assert.equal(r.distance, 0);
    assert.equal(r.speed, 0);
    assert.equal(r.stopIndex, -1);
    assert.equal(r.nextStopIndex, 0);
  }
  assert.equal(cruising.reachedMax, -1);
});

test('on() runs handlers in order and returns an unsubscribe', () => {
  const r = stoppedAt(0);
  const calls = [];
  const offA = r.on('depart', () => calls.push('a'));
  r.on('depart', () => calls.push('b'));
  const offC = r.on('depart', () => calls.push('c'));
  offC(); offC();                                // unsubscribing twice is harmless
  offA();
  r.continue();
  assert.deepEqual(calls, ['b']);
  assert.throws(() => r.on('arrived', () => {}), /arrived/);
});

test('a handler removed during an emit is not called afterwards', () => {
  const r = stoppedAt(0);
  const calls = [];
  let offSecond;
  r.on('depart', () => { calls.push('first'); offSecond(); });
  offSecond = r.on('depart', () => calls.push('second'));
  r.continue();
  assert.deepEqual(calls, ['first']);
});

test('a handler that removes itself does not make the next one skip', () => {
  const r = stoppedAt(0);
  const calls = [];
  const off = r.on('depart', () => { calls.push('once'); off(); });
  r.on('depart', () => calls.push('next'));
  r.continue();
  assert.deepEqual(calls, ['once', 'next']);
});

test('the getters are read-only', () => {
  const r = createRide({ stops, finaleDistance });
  for (const key of ['state', 'distance', 'speed', 'stopIndex', 'nextStopIndex', 'reachedMax', 'paused']) {
    assert.throws(() => { r[key] = 99; }, TypeError, key);
  }
  assert.equal(r.state, 'idle');
  assert.equal(r.distance, 0);
});

test('never skips or overshoots a stop, whatever the frame times, pauses and speed scale', () => {
  for (const speedScale of [1, 3, 10, 50]) {
    const rng = createRng(speedScale);
    const r = createRide({ stops, finaleDistance, speedScale });
    const arrivals = [];
    r.on('arrive', () => { arrivals.push(r.distance); r.continue(); });
    r.start();
    let previous = r.distance;
    for (let i = 0; i < 100000 && r.state !== 'finale'; i++) {
      if (rng() < 0.02) r.setPaused(!r.paused);
      r.update(rngRange(rng, 0.001, 0.4));
      const target = r.nextStopIndex >= 0 ? stops[r.nextStopIndex] : finaleDistance;
      assert.ok(r.distance <= target + 1e-9, `overshot at scale ${speedScale}`);
      assert.ok(r.distance >= previous, `went backwards at scale ${speedScale}`);
      previous = r.distance;
      if (i % 50 === 49) r.setPaused(false);     // keep the run moving
    }
    assert.equal(r.state, 'finale', `scale ${speedScale}`);
    assert.deepEqual(arrivals, stops, `scale ${speedScale}`);
  }
});
