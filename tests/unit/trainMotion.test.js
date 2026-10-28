// The train's rock, rail-joint bumps and pitch under her (ride/trainMotion.js), as numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../site/src/three.js';
import { createTrainMotion, TRAIN_MOTION } from '../../site/src/ride/trainMotion.js';
import { TRAIN, bogieDelay } from '../../site/src/audio/sfxTiming.js';
import { RIDE } from '../../site/src/ride/rideController.js';

const FRAME = 1 / 60;

/** Rides `seconds` at `speed` from `from` m, a frame at a time, calling `each(motion)` after every one. Returns the end. */
function ride(m, seconds, speed, from, each = () => {}) {
  let distance = from;
  for (let t = 0; t < seconds - 1e-9; t += FRAME) {
    distance += speed * FRAME;
    m.update(FRAME, speed, distance);
    each(m);
  }
  return distance;
}

/** Runs the speed from `a` to `b` m/s over `seconds`, going nowhere in particular (the distance stays put). */
function ramp(m, a, b, seconds, each = () => {}) {
  const frames = Math.round(seconds / FRAME);
  for (let i = 1; i <= frames; i++) {
    m.update(FRAME, a + ((b - a) * i) / frames, 100);
    each(m);
  }
}

test('still at a standstill', () => {
  const m = createTrainMotion();
  for (let i = 0; i < 120; i++) m.update(1 / 60, 0, 100);
  assert.equal(m.roll, 0); assert.equal(m.lift, 0); assert.equal(m.pitch, 0); assert.equal(m.headLag, 0);
});

test('rocks gently at cruise, never past ROLL', () => {
  const m = createTrainMotion();
  let peak = 0;
  ride(m, 20, RIDE.CRUISE, 1000, () => { peak = Math.max(peak, Math.abs(m.roll)); });
  assert.ok(peak <= TRAIN_MOTION.ROLL * 1.3 + 1e-12, `rolled ${peak} rad`);
  assert.ok(peak > TRAIN_MOTION.ROLL * 0.5, `rolled only ${peak} rad`);
});

test('the rock follows the speed: gentler at a walking pace, none standing still', () => {
  const peakAt = (speed) => {
    const m = createTrainMotion();
    let peak = 0;
    ride(m, 20, speed, 1000, () => { peak = Math.max(peak, Math.abs(m.roll)); });
    return peak;
  };
  assert.ok(peakAt(RIDE.CRUISE / 3) < peakAt(RIDE.CRUISE) * 0.5);
  assert.equal(peakAt(0), 0);
});

test('two dips for each rail joint, one per bogie', () => {
  const m = createTrainMotion();
  const lifts = [];
  ride(m, 0.8, RIDE.CRUISE, 10, () => lifts.push(m.lift)); // 10 m to 15.2 m: over the joint at 12 m, 0.31 s in
  let dips = 0;
  for (let i = 1; i < lifts.length - 1; i++) {
    if (lifts[i] < -TRAIN_MOTION.BUMP / 4 && lifts[i] <= lifts[i - 1] && lifts[i] < lifts[i + 1]) dips++;
  }
  assert.equal(dips, 2, `${dips} dips in ${lifts.length} frames`);
});

test('the second dip falls as late after the first as the second bogie\'s click does', () => {
  const m = createTrainMotion();
  const began = [];
  let before = 0;
  let frames = 0;
  ride(m, 1, RIDE.CRUISE, 10, () => {
    frames++;
    if (before >= -TRAIN_MOTION.BUMP / 4 && m.lift < -TRAIN_MOTION.BUMP / 4) began.push(frames * FRAME);
    before = m.lift;
  });
  assert.equal(began.length, 2);
  const gap = began[1] - began[0];
  assert.ok(Math.abs(gap - bogieDelay(RIDE.CRUISE)) <= 1.5 * FRAME, `${gap} s apart`);
});

test('a bump drops her by BUMP at cruise, never lifts her, and the head follows it by HEAD_LAG', () => {
  const m = createTrainMotion();
  let deepest = 0;
  let highest = 0;
  ride(m, 2, RIDE.CRUISE, 10, () => {
    deepest = Math.min(deepest, m.lift);
    highest = Math.max(highest, m.lift);
    assert.ok(m.headLag >= 0);
    assert.ok(Math.abs(m.headLag + TRAIN_MOTION.HEAD_LAG * m.lift) < 1e-12);
  });
  assert.equal(highest, 0, 'the rail only ever drops her');
  // A frame lands somewhere on the dip, not necessarily on its bottom.
  assert.ok(deepest < -TRAIN_MOTION.BUMP * 0.8 && deepest >= -TRAIN_MOTION.BUMP * 1.0001, `dropped ${deepest} m`);
});

test('a slow train bumps less', () => {
  const deepestAt = (speed) => {
    const m = createTrainMotion();
    let deepest = 0;
    ride(m, 6, speed, 10, () => { deepest = Math.min(deepest, m.lift); });
    return deepest;
  };
  assert.ok(deepestAt(RIDE.CRUISE / 3) > deepestAt(RIDE.CRUISE) * 0.5, 'a third of the speed, under half the drop');
  assert.ok(deepestAt(RIDE.CRUISE / 3) < 0, 'but still felt');
});

test('no bump where there is no joint', () => {
  const m = createTrainMotion();
  ride(m, 1.5, RIDE.CRUISE, 12.5, () => assert.equal(m.lift, 0)); // 12.5 m to 22.2 m: the next joint is at 24 m
});

test('the first dip comes as the joint is crossed, within a frame or two, at any frame rate', () => {
  const crossedAt = 2 / RIDE.CRUISE; // from 10 m to the joint at 12 m
  const firstDip = (frame) => {
    const m = createTrainMotion();
    let distance = 10;
    for (let t = 0; t < 1; t += frame) {
      distance += RIDE.CRUISE * frame;
      m.update(frame, RIDE.CRUISE, distance);
      if (m.lift < 0) return t + frame;
    }
    return NaN;
  };
  for (const frame of [1 / 30, 1 / 60, 1 / 120]) {
    const at = firstDip(frame);
    assert.ok(at > crossedAt && at <= crossedAt + 2 * frame + 1e-9, `${at} s at ${frame} s frames`);
  }
});

test('the dip is as deep as BUMP, whatever the frames', () => {
  const m = createTrainMotion();
  let deepest = 0;
  let distance = 10;
  for (let i = 0; i < 400; i++) { // 0.4 s in 1 ms frames: over the joint, and the first bogie's dip is done by 0.35 s
    distance += RIDE.CRUISE * 0.001;
    m.update(0.001, RIDE.CRUISE, distance);
    deepest = Math.min(deepest, m.lift);
  }
  assert.ok(Math.abs(deepest + TRAIN_MOTION.BUMP) < TRAIN_MOTION.BUMP * 0.02, `${deepest} m`);
});

test('pulling away tips her back, braking tips her forward, then it settles', () => {
  const m = createTrainMotion();
  let most = 0;
  ramp(m, 0, RIDE.CRUISE, 3, () => { most = Math.max(most, m.pitch); });
  assert.ok(most > 0, 'tipped back setting off');
  assert.ok(most <= TRAIN_MOTION.PITCH * 1.3, `${most} rad is more than the 0.5 degrees`);
  let least = 0;
  ramp(m, RIDE.CRUISE, 0, 2, () => { least = Math.min(least, m.pitch); });
  assert.ok(least < 0, 'tipped forward braking');
  // The swing from tipped right back to tipped right forward overshoots a fifth of its length: under 0.8 degrees.
  assert.ok(least >= -TRAIN_MOTION.PITCH * 1.5, `${least} rad`);
  for (let i = 0; i < 300; i++) m.update(FRAME, 0, 100);
  assert.ok(Math.abs(m.pitch) < 1e-4, `still ${m.pitch} rad after 5 s`);
});

test('a train already at cruise tips nowhere', () => {
  const m = createTrainMotion();
  ride(m, 10, RIDE.CRUISE, 1000, () => assert.equal(m.pitch, 0));
});

test('a jump along the track is no bump and no lurch', () => {
  const m = createTrainMotion();
  m.update(1 / 60, 6.5, 100); m.update(1 / 60, 0, 445); // a 345 m jump, speed straight to 0
  for (let i = 0; i < 30; i++) m.update(1 / 60, 0, 445);
  assert.ok(Math.abs(m.pitch) < 1e-6 && m.lift === 0);
});

test('a jump while the train is bumping or tipping stops that dead, the second bogie\'s dip included', () => {
  const m = createTrainMotion();
  ride(m, 0.35, RIDE.CRUISE, 10); // just over the joint at 12 m: the first bogie's dip, the second still to come
  assert.ok(m.lift < 0);
  m.update(FRAME, 0, 5000); // the jump, and the train stops
  assert.equal(m.lift, 0); assert.equal(m.pitch, 0); assert.equal(m.roll, 0); assert.equal(m.headLag, 0);
  for (let i = 0; i < 60; i++) { m.update(FRAME, 0, 5000); assert.equal(m.lift, 0); }
  // The same, jumping back and still at speed: no dip comes late either.
  const n = createTrainMotion();
  ride(n, 0.35, RIDE.CRUISE, 10);
  n.update(FRAME, RIDE.CRUISE, 3);
  for (let i = 0; i < 60; i++) { n.update(FRAME, RIDE.CRUISE, 3 + (i + 1) * RIDE.CRUISE * FRAME / 4); assert.equal(n.lift, 0); }
});

test('a jump that changes the speed too is no lurch', () => {
  const m = createTrainMotion();
  ride(m, 5, RIDE.CRUISE / 2, 1000); // at half speed, the pitch long settled
  m.update(FRAME, RIDE.CRUISE, 1000 + 4 * TRAIN.MAX_HOP); // far ahead, and at once at cruise: the speed is not an acceleration
  for (let i = 0; i < 30; i++) {
    m.update(FRAME, RIDE.CRUISE, 1000 + 4 * TRAIN.MAX_HOP + 0.1 * (i + 1));
    assert.equal(m.pitch, 0);
  }
});

test('a frame that moves backwards is a restart, and resets', () => {
  const m = createTrainMotion();
  ride(m, 1, RIDE.CRUISE, 10);
  m.update(FRAME, 0, 3);
  assert.equal(m.lift, 0); assert.equal(m.pitch, 0);
  for (let i = 0; i < 60; i++) { m.update(FRAME, 0, 3); assert.equal(m.lift, 0); }
});

test('a frame of exactly MAX_HOP is still a frame; one more metre is a jump', () => {
  const bumps = (hop) => {
    const m = createTrainMotion();
    m.update(FRAME, RIDE.CRUISE, 11.5);
    m.update(FRAME, RIDE.CRUISE, 11.5 + hop);
    let deepest = 0;
    for (let i = 0; i < 20; i++) { m.update(FRAME, RIDE.CRUISE, 11.5 + hop); deepest = Math.min(deepest, m.lift); }
    return deepest;
  };
  assert.ok(bumps(TRAIN.MAX_HOP) < 0, 'the joint a long frame crosses still bumps');
  assert.equal(bumps(TRAIN.MAX_HOP + 1), 0);
});

test('reset() puts everything back to still', () => {
  const m = createTrainMotion();
  ride(m, 2.2, RIDE.CRUISE, 10);
  ramp(m, RIDE.CRUISE, 0, 0.5);
  m.reset();
  assert.equal(m.roll, 0); assert.equal(m.lift, 0); assert.equal(m.pitch, 0); assert.equal(m.headLag, 0);
  // The first frame after it takes the speed it finds as the speed she was already making, so no lurch.
  m.update(FRAME, RIDE.CRUISE, 100);
  assert.equal(m.pitch, 0);
});

test('a long frame (a tab that was away) neither blows up nor kicks her', () => {
  const m = createTrainMotion();
  ride(m, 2, RIDE.CRUISE, 10);
  m.update(30, RIDE.CRUISE, 80);
  for (const value of [m.roll, m.pitch, m.lift, m.headLag]) assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(m.roll) <= TRAIN_MOTION.ROLL * 1.3 && Math.abs(m.pitch) <= TRAIN_MOTION.PITCH * 1.3);
  assert.ok(m.lift >= -TRAIN_MOTION.BUMP * 2 && m.lift <= 0);
});

test('a frame of no time changes nothing', () => {
  const m = createTrainMotion();
  ride(m, 1, RIDE.CRUISE, 10);
  const before = [m.roll, m.pitch, m.lift, m.headLag];
  m.update(0, RIDE.CRUISE, 20);
  assert.deepEqual([m.roll, m.pitch, m.lift, m.headLag], before);
});

test('what she feels is small: under half a degree, a few millimetres', () => {
  const { ROLL, PITCH, BUMP } = TRAIN_MOTION;
  assert.ok(ROLL < (0.5 * Math.PI) / 180 && PITCH <= (0.5 * Math.PI) / 180 + 1e-4 && BUMP <= 0.005);
  assert.ok(Object.isFrozen(TRAIN_MOTION));
});

// The sign the frame loop relies on: rig.rotateX(+pitch) tips the view up (the rig looks down -Z, +X is its right).
test('a positive pitch tilts the way she looks upwards', () => {
  const rig = new THREE.Object3D();
  rig.rotateX(0.1);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.quaternion);
  assert.ok(forward.y > 0, `forward ${forward.toArray()}`);
});
