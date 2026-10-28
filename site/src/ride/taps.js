// Hidden taps: some things in the world answer when she taps them. A touch on the 3D view still turns her head
// (look.js); one that ends as a tap (released within SLOP of where it came down, within TIME) also casts a ray from
// her eye through the point she tapped, and the nearest tappable thing along it answers: the whistle cord tugs and
// the train whistles, the lantern flares.
//
// Each tappable thing has a generous invisible hit shape: a sphere `radius` round its position, so a fingertip need
// not land on a thin cord exactly, and for things far off (a balloon, a gull) a cone MIN_ANGLE either side of the
// ray, so even a tiny one is easy to tap. A tap inside a target's own sphere counts before one that only finds a target
// through its cone: far off, the cones of two things side by side (the two of them at a stop, and their pet a little
// nearer) both take in the whole of each, and the one she aimed at should answer. Each answers at most once per
// COOLDOWN, so mashing a tap does not stack sounds past the node budget.
//
// A tappable animates itself and asks for its effects (a sound, a burst of hearts) through the TapEffects it is
// handed, so the world modules never import the sound or the hearts.
//
// The cabin she rides in hides the world behind it: a tap on the dashboard or a pillar never reaches a balloon out
// beyond it, nor scatters the fireflies. The router's `blockers` (the cabin's body) are checked once per tap, and a
// target further along the ray than where it first meets them does not count, unless it is `aboard`, part of the cabin
// itself (the lantern stands on the dashboard).
//
// `isTap` and `pickTarget` are pure; `createTapRouter` needs only a camera and something with a bounding rect (the
// canvas), so the Node unit tests can import this file.

import { Raycaster, Vector2, Vector3 } from '../three.js';

/** SLOP: how far a tap may stray (CSS px). TIME: how long it may last (ms). MIN_ANGLE: the far targets' cone (rad). COOLDOWN (s). */
export const TAP = Object.freeze({ SLOP: 10, TIME: 350, MIN_ANGLE: 0.06, COOLDOWN: 1.5 });

/**
 * @typedef {object} TapEffects  what a reaction can ask for: the app makes it once
 * @property {(name: string) => void} play  a one-shot sound (audio/sfx.js), if the sound is on
 * @property {(at: Vector3) => void} burst  a little burst of hearts at a point in the world
 */

/**
 * @typedef {object} Tappable  something in the world she can tap
 * @property {string} name  what it is; reactions cool down per name, and the app reports the last one hit
 * @property {(out: Vector3) => Vector3|null} position  where it is in the world, written into `out`; null when it is
 *   not showing
 * @property {number} radius  its hit sphere (m)
 * @property {(now: number, fx: TapEffects) => void} react  it answers a tap at `now` (s, the app's clock)
 * @property {boolean} [aboard]  it is part of the cabin, which never hides it
 */

/**
 * Whether a touch that followed `path` (screen points, CSS px, and their times, ms, in order) is a tap: it never
 * strayed more than SLOP from where it came down, and lasted no longer than TIME. A drag that came back to where it
 * began is not one.
 * @param {Array<{ x: number, y: number, t: number }>} path
 */
export function isTap(path) {
  if (path.length === 0) return false;
  const first = path[0];
  if (path[path.length - 1].t - first.t > TAP.TIME) return false;
  return path.every((p) => Math.hypot(p.x - first.x, p.y - first.y) <= TAP.SLOP);
}

const toTarget = new Vector3();
const spot = new Vector3();

/**
 * The target a ray from `origin` along `direction` (a unit vector) hits: one whose position is within its radius of
 * the ray, or within MIN_ANGLE of it. Only targets ahead count. Of those the ray passes within their radius of, the
 * nearest along the ray wins; only if there are none, the nearest of those within MIN_ANGLE. Beyond `hiddenBeyond`
 * metres along it (where the ray meets the cabin's body) only `aboard` targets count.
 * @param {Vector3} origin
 * @param {Vector3} direction
 * @param {Tappable[]} targets
 * @param {number} [hiddenBeyond]
 * @returns {Tappable|null}
 */
export function pickTarget(origin, direction, targets, hiddenBeyond = Infinity) {
  let inside = null; // the nearest the ray passes within the radius of
  let insideAlong = Infinity;
  let near = null; // the nearest it passes within MIN_ANGLE of
  let nearAlong = Infinity;
  for (const target of targets) {
    if (!target.position(spot)) continue;
    toTarget.subVectors(spot, origin);
    const along = toTarget.dot(direction);
    if (!(along > 0) || along >= insideAlong) continue;
    if (along > hiddenBeyond && !target.aboard) continue;
    const off = Math.sqrt(Math.max(0, toTarget.lengthSq() - along * along));
    if (off <= target.radius) {
      inside = target;
      insideAlong = along;
    } else if (along < nearAlong && Math.atan2(off, along) <= TAP.MIN_ANGLE) {
      near = target;
      nearAlong = along;
    }
  }
  return inside ?? near;
}

/** Whether `object` is drawn: it and everything it hangs from are visible. */
function showing(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * Turns her taps on the canvas into reactions.
 * @param {{
 *   camera: import('../three.js').Camera,
 *   element: { getBoundingClientRect: () => { left: number, top: number, width: number, height: number } },
 *   sources: Array<() => Tappable[]>,
 *   blockers?: import('../three.js').Object3D[],
 *   fx: TapEffects,
 *   fallback?: (ray: import('../three.js').Ray, now: number) => void,
 * }} options  `element` is the canvas the camera draws into. Each of `sources` gives the targets one part of the
 *   world has now. `blockers` are the meshes that hide the world behind them while they are drawn (the cabin's
 *   body). `fallback` hears the taps that hit nothing and reach the world (the fireflies scatter from them).
 * @returns {{ tap: (clientX: number, clientY: number, now: number) => string|null,
 *             debugTargets: () => Array<{ name: string, x: number, y: number, hidden: boolean }> }}
 *   `tap` finds what is at that point of the page (CSS px) and has it react at `now` (s), unless it reacted less
 *   than COOLDOWN ago. It returns the name of the target hit, cooling down or not, or null when it hit none.
 *   `debugTargets` says where each showing target in front of her is on the page (CSS px), and whether the cabin hides
 *   it there, for tests.
 */
export function createTapRouter({ camera, element, sources, blockers = [], fx, fallback }) {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  /** @type {Map<string, number>} when each target (by name) last reacted */
  const reacted = new Map();
  /** @type {Tappable[]} every target now, gathered afresh for each tap */
  const targets = [];
  const drawn = [];
  const hits = [];

  function gather() {
    targets.length = 0;
    for (const source of sources) for (const target of source()) targets.push(target);
    return targets;
  }

  /** How far along the raycaster's ray it first meets a blocker that is drawn (m), or Infinity. */
  function wall() {
    drawn.length = 0;
    for (const blocker of blockers) if (showing(blocker)) drawn.push(blocker);
    hits.length = 0;
    raycaster.intersectObjects(drawn, false, hits);
    const near = hits.length > 0 ? hits[0].distance : Infinity;
    hits.length = 0;
    return near;
  }

  return {
    tap(clientX, clientY, now) {
      const rect = element.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2);
      raycaster.setFromCamera(ndc, camera);
      const { ray } = raycaster;
      const blocked = wall();
      const hit = pickTarget(ray.origin, ray.direction, gather(), blocked);
      targets.length = 0;
      if (!hit) {
        // A tap on the cabin's body is not a tap on the world.
        if (fallback && blocked === Infinity) fallback(ray, now);
        return null;
      }
      const last = reacted.get(hit.name);
      if (last === undefined || now - last >= TAP.COOLDOWN) {
        reacted.set(hit.name, now);
        hit.react(now, fx);
      }
      return hit.name;
    },

    debugTargets() {
      const rect = element.getBoundingClientRect();
      const spots = [];
      for (const target of gather()) {
        if (!target.position(spot)) continue;
        // Behind her, a point projects onto the screen all the same; it is left out instead.
        if (camera.worldToLocal(toTarget.copy(spot)).z >= 0) continue;
        // Whether the cabin is in the way: a tap there would meet it first.
        raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
        raycaster.ray.direction.subVectors(spot, raycaster.ray.origin);
        const far = raycaster.ray.direction.length();
        raycaster.ray.direction.normalize();
        const hidden = !target.aboard && wall() < far;
        spot.project(camera);
        spots.push({
          name: target.name,
          x: rect.left + ((spot.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - spot.y) / 2) * rect.height,
          hidden,
        });
      }
      targets.length = 0;
      return spots;
    },
  };
}
