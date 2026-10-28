// The hearts that burst from a balloon cluster she taps (site/src/world/heartBurst.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeartBurst, HEARTS } from '../../site/src/world/heartBurst.js';
import { Vector3 } from '../../site/src/three.js';

/** How many hearts are in the air: the live ones are the first in the buffers, and only they are drawn. */
const live = (hearts) => (hearts.points.visible ? hearts.points.geometry.drawRange.count : 0);

/** Runs `seconds` of frames, `dt` apart. */
function run(hearts, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds - 1e-9; t += dt) hearts.update(dt);
}

test('after a burst 12 hearts are live; after 1.7 s of updates none are', () => {
  const hearts = createHeartBurst({ max: 48 });
  hearts.burst(new Vector3(3, 2, -10));
  assert.equal(live(hearts), 12);
  run(hearts, 1.7);
  assert.equal(live(hearts), 0);
});

// Beyond the brief.

test('the numbers a burst is made of', () => {
  assert.ok(Object.isFrozen(HEARTS));
  assert.equal(HEARTS.COUNT, 12);
  assert.equal(HEARTS.RISE, 1.5);
  assert.equal(HEARTS.LIFE, 1.6);
});

test('nothing is drawn before the first burst, nor once the hearts have gone', () => {
  const hearts = createHeartBurst();
  assert.equal(hearts.points.visible, false);
  hearts.update(0.1);
  assert.equal(hearts.points.visible, false);
  hearts.burst(new Vector3());
  hearts.update(0.1);
  assert.equal(hearts.points.visible, true);
  run(hearts, 1.6);
  assert.equal(hearts.points.visible, false);
});

test('the hearts rise about 1.5 m from where they burst, spreading a little, and fade as they go', () => {
  const hearts = createHeartBurst();
  const at = new Vector3(3, 2, -10);
  hearts.burst(at);
  hearts.update(0);
  const { position, color } = hearts.points.geometry.attributes;
  const start = Array.from({ length: 12 }, (_, i) => new Vector3().fromBufferAttribute(position, i));
  for (const p of start) assert.ok(p.distanceTo(at) < 0.2, `each starts at the burst: ${p.toArray()}`);
  run(hearts, 0.3);
  const early = Array.from({ length: 12 }, (_, i) => color.getW(i));
  run(hearts, 1.15); // 1.45 s in, near the end of their life
  let highest = 0;
  for (let i = 0; i < 12; i++) {
    const p = new Vector3().fromBufferAttribute(position, i);
    highest = Math.max(highest, p.y - at.y);
    assert.ok(p.y - at.y > 1 && p.y - at.y < 1.8, `heart ${i} has risen ${(p.y - at.y).toFixed(2)} m`);
    assert.ok(Math.hypot(p.x - at.x, p.z - at.z) < 1, `heart ${i} keeps near the cluster`);
    assert.ok(color.getW(i) < early[i], `heart ${i} is fading`);
  }
  const spread = new Set(Array.from({ length: 12 }, (_, i) => position.getX(i).toFixed(2)));
  assert.ok(spread.size > 6, 'they spread out, each its own way');
});

test('bursts add up to `max` hearts; one more takes the oldest', () => {
  const hearts = createHeartBurst({ max: 30 });
  hearts.burst(new Vector3(0, 0, 0));
  run(hearts, 0.5);
  hearts.burst(new Vector3(10, 0, 0));
  assert.equal(live(hearts), 24);
  hearts.burst(new Vector3(20, 0, 0));
  assert.equal(live(hearts), 30);
  // The third took six of the first burst's hearts, the oldest; the second keeps all twelve.
  hearts.update(0);
  const { position } = hearts.points.geometry.attributes;
  const from = (x) => Array.from({ length: 30 }, (_, i) => position.getX(i)).filter((px) => Math.abs(px - x) < 2).length;
  assert.deepEqual([from(0), from(10), from(20)], [6, 12, 12]);
  run(hearts, 1.2);
  assert.equal(live(hearts), 24, 'the first burst has ended, the newer two are still rising');
  run(hearts, 0.5);
  assert.equal(live(hearts), 0);
});

test('without a document (the Node tests) there is no sprite, and nothing breaks', () => {
  const hearts = createHeartBurst();
  assert.equal(hearts.points.material.map, null);
  assert.equal(hearts.points.material.vertexColors, true);
  assert.equal(hearts.points.geometry.attributes.color.itemSize, 4, 'each heart its own colour and fade');
});
