import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAIN, WHISTLE, chugRate, chugInterval, chugLevel, clickLevel, bogieDelay, createChugClock, jointCrossed, createGate,
  isBraking,
} from '../../site/src/audio/sfxTiming.js';
import { createRide, RIDE } from '../../site/src/ride/rideController.js';
import { MUSIC, midiToFreq } from '../../site/src/audio/compose.js';

const FRAME = 1 / 60;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('chugs: none at a standstill, about 1.3 a second at the 6.5 m/s cruise, in step with the speed', () => {
  assert.equal(chugRate(0), 0);
  assert.equal(chugRate(-1), 0);
  assert.ok(near(chugRate(RIDE.CRUISE), 1.3, 0.05), `cruise rate ${chugRate(RIDE.CRUISE)}`);
  assert.ok(near(chugRate(RIDE.CRUISE / 2), chugRate(RIDE.CRUISE) / 2));
  assert.equal(chugInterval(0), Infinity);
  assert.ok(near(chugInterval(RIDE.CRUISE), 1 / chugRate(RIDE.CRUISE)));
});

test('chug level: silent standing still, full at cruise, rising with the speed', () => {
  assert.equal(chugLevel(0), 0);
  assert.equal(chugLevel(RIDE.CRUISE), 1);
  assert.equal(chugLevel(RIDE.CRUISE * 3), 1);
  let last = 0;
  for (let v = 0.5; v <= RIDE.CRUISE; v += 0.5) {
    assert.ok(chugLevel(v) > last, `level rises at ${v}`);
    last = chugLevel(v);
  }
  // A slow chug is softer but still heard: the train is setting off.
  assert.ok(chugLevel(1) > 0.3 && chugLevel(1) < 0.7);
});

test('rail-joint clicks are quieter at walking pace and full at cruise; the second bogie follows the first', () => {
  assert.equal(clickLevel(0), 0);
  assert.equal(clickLevel(RIDE.CRUISE), 1);
  assert.ok(clickLevel(1) < chugLevel(1));
  assert.ok(near(bogieDelay(RIDE.CRUISE), TRAIN.BOGIE_GAP / RIDE.CRUISE));
  assert.ok(bogieDelay(0) > 0 && bogieDelay(0) <= 0.6, 'a crawl still sounds its second click soon after');
  assert.ok(bogieDelay(1000) >= 0.08);
});

test('the chug clock follows the speed in real time', () => {
  const clock = createChugClock();
  let chugs = 0;
  for (let t = 0; t < 10 - 1e-9; t += FRAME) if (clock.step(RIDE.CRUISE, FRAME) >= 0) chugs++;
  assert.ok(Math.abs(chugs - 13) <= 1, `10 s at cruise gave ${chugs} chugs`);

  const still = createChugClock();
  for (let i = 0; i < 600; i++) assert.equal(still.step(0, FRAME), -1);
});

test('a chug falls at its exact moment inside a frame, and a stalled frame gives one chug, not a burst', () => {
  const rate = chugRate(RIDE.CRUISE);
  const clock = createChugClock();
  clock.reset(0.9);
  // The clock passes 1 part-way through the 0.1 s frame; the chug belongs that long before the frame's end.
  const ago = clock.step(RIDE.CRUISE, 0.1);
  assert.ok(near(ago, (0.9 + rate * 0.1 - 1) / rate), `ago ${ago}`);
  assert.ok(near(clock.phase, 0.9 + rate * 0.1 - 1));

  // A frame of several seconds (the page stalled) counts as no more than a short one: one chug at most.
  const stalled = createChugClock();
  stalled.reset(0.95);
  assert.ok(stalled.step(RIDE.CRUISE, 5) >= 0);
  assert.ok(stalled.phase >= 0 && stalled.phase < 1);
  let total = 0;
  for (let i = 0; i < 20; i++) if (stalled.step(RIDE.CRUISE, 5) >= 0) total++;
  assert.ok(total <= Math.ceil(20 * rate * TRAIN.MAX_STEP), `20 stalled frames gave ${total} chugs`);
});

test('departing: the first chug follows the whistle, then they come faster as the train speeds up', () => {
  const ride = createRide({ stops: [400], finaleDistance: 800 });
  ride.start();
  const clock = createChugClock();
  clock.reset(TRAIN.DEPART_PHASE);
  const times = [];
  for (let t = 0; t < 12; t += FRAME) {
    ride.update(FRAME);
    const ago = clock.step(ride.speed, FRAME);
    if (ago >= 0) times.push(t + FRAME - ago);
  }
  assert.ok(times[0] > 1.2 && times[0] < 3.5, `first chug at ${times[0].toFixed(2)} s`);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  for (let i = 1; i < 4; i++) assert.ok(gaps[i] < gaps[i - 1], 'gaps shrink while the train speeds up');
  assert.ok(near(gaps[gaps.length - 1], chugInterval(RIDE.CRUISE), 0.03), 'and settle at the cruise interval');
});

test('a rail joint every 12 m: crossing one is heard once, at its distance', () => {
  assert.equal(TRAIN.JOINT_EVERY, 12);
  assert.equal(jointCrossed(11.9, 12.1), 12);
  assert.equal(jointCrossed(23.5, 24), 24);
  assert.equal(jointCrossed(24, 24.4), -1, 'standing on a joint crossed it already');
  assert.equal(jointCrossed(12.1, 23.9), -1);
  assert.equal(jointCrossed(5, 5), -1);
  assert.equal(jointCrossed(30, 20), -1, 'backwards (a restart, a jump back) crosses nothing');

  // A ride at real speed crosses every joint, one by one.
  const crossed = [];
  let d = 0;
  while (d < 120) {
    const next = d + RIDE.CRUISE * FRAME;
    const joint = jointCrossed(d, next);
    if (joint >= 0) crossed.push(joint);
    d = next;
  }
  assert.deepEqual(crossed, [12, 24, 36, 48, 60, 72, 84, 96, 108, 120].filter((j) => j <= d));
});

test('a large distance jump does not click a burst: several joints in one step count once, a teleport not at all', () => {
  assert.equal(jointCrossed(10, 20 + TRAIN.JOINT_EVERY), 24, 'two joints in one step: one click, for the last');
  assert.equal(jointCrossed(0, 900), -1, 'a jump along the timeline');
  assert.ok(TRAIN.MAX_HOP >= 2 * TRAIN.JOINT_EVERY && TRAIN.MAX_HOP < 100);
});

test('a gate lets a sound through at most once per gap', () => {
  const gate = createGate(1);
  assert.equal(gate.open(0), true);
  assert.equal(gate.open(0.5), false);
  assert.equal(gate.open(0.99), false);
  assert.equal(gate.open(1), true);
  assert.equal(gate.open(1.2), false);
  gate.reset();
  assert.equal(gate.open(1.2), true);
});

test('under a ?speed=50 time warp the clicks and chugs keep to real time and skip rather than burst', () => {
  const ride = createRide({ stops: [3000], finaleDistance: 6000, speedScale: 50 });
  ride.start();
  const clock = createChugClock();
  const gate = createGate(TRAIN.JOINT_GAP);
  let clicks = 0;
  let chugs = 0;
  let crossings = 0;
  let last = ride.distance;
  const seconds = 6;
  for (let t = 0; t < seconds; t += FRAME) {
    ride.update(FRAME);
    if (clock.step(ride.speed, FRAME) >= 0) chugs++;
    if (jointCrossed(last, ride.distance) >= 0) {
      crossings++;
      if (gate.open(t)) clicks++;
    }
    last = ride.distance;
  }
  assert.ok(crossings > 50, `the warped train crossed ${crossings} joints`);
  assert.ok(clicks <= seconds / TRAIN.JOINT_GAP + 1, `${clicks} clicks in ${seconds} s`);
  assert.ok(chugs <= chugRate(RIDE.CRUISE) * seconds + 1, `${chugs} chugs in ${seconds} s`);
});

test('at real speed the joint gate never holds a click back', () => {
  assert.ok(TRAIN.JOINT_EVERY / RIDE.CRUISE > TRAIN.JOINT_GAP);
});

test('braking starts when the train must slow to stop where it is going, not before', () => {
  const brakingDistance = RIDE.CRUISE ** 2 / (2 * RIDE.BRAKE);
  assert.equal(isBraking(RIDE.CRUISE, brakingDistance + 1), false);
  assert.equal(isBraking(RIDE.CRUISE, brakingDistance), true);
  assert.equal(isBraking(0, 0), false, 'standing still is not braking');
  assert.equal(isBraking(RIDE.CRUISE, Infinity), false);

  // Ridden for real, it turns on once, as the train leaves its cruise, and stays on to the stop.
  const ride = createRide({ stops: [200], finaleDistance: 400 });
  ride.start();
  let starts = 0;
  let was = false;
  let startedAt = -1;
  for (let i = 0; i < 60 * 60 && ride.state === 'moving'; i++) {
    ride.update(FRAME);
    const now = isBraking(ride.speed, 200 - ride.distance);
    if (now && !was) {
      starts++;
      startedAt = ride.distance;
    }
    was = now;
  }
  assert.equal(ride.state, 'stopped');
  assert.equal(starts, 1);
  assert.ok(Math.abs(200 - startedAt - brakingDistance) < 0.5, `braking began ${(200 - startedAt).toFixed(2)} m out`);
});

test('the whistle: "choo-choo" is two toots of about 0.3 s and 0.45 s with a short gap', () => {
  const toots = WHISTLE.depart;
  assert.equal(toots.length, 2);
  assert.ok(near(toots[0].t, 0) && near(toots[0].dur, 0.3) && near(toots[1].dur, 0.45));
  const gap = toots[1].t - (toots[0].t + toots[0].dur);
  assert.ok(gap > 0.05 && gap < 0.2, `gap ${gap}`);
});

test('the finale whistle is longer and ends on its longest toot', () => {
  const end = (toots) => toots[toots.length - 1].t + toots[toots.length - 1].dur;
  const toots = WHISTLE.finale;
  assert.ok(end(toots) > end(WHISTLE.depart) + 0.5);
  const longest = Math.max(...toots.map((x) => x.dur));
  assert.equal(toots[toots.length - 1].dur, longest);
  assert.ok(longest >= 1);
  for (const kind of ['depart', 'finale']) {
    const list = WHISTLE[kind];
    for (let i = 1; i < list.length; i++) assert.ok(list[i].t > list[i - 1].t + list[i - 1].dur, `${kind} toots apart`);
  }
});

test('the whistle chord is two or three notes in the tune\'s key, in a whistle\'s range', () => {
  assert.ok(WHISTLE.CHORD.length >= 2 && WHISTLE.CHORD.length <= 3);
  for (const midi of WHISTLE.CHORD) {
    assert.ok(MUSIC.SCALE_PCS.includes(midi % 12), `${midi} in F major`);
    const f = midiToFreq(midi);
    assert.ok(f > 300 && f < 1000, `${f} Hz`);
  }
});
