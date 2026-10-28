// The two of them at a stop, posed for its moment (world/poses.js): two figures (world/figures.js) and, for
// 'sitting', the park bench (world/props.js) they sit on, each one draw call, and their pet (world/pets.js) sitting
// at their feet, in two more.
//
// The group faces +Z with their middle on its origin, for world/signs.js `placeCouple`, which stands it beside the
// sign and turns it toward her seat. That puts the sign on their left at a stop on the right of the track, and on
// their right at a stop on the left. The poses are laid out with the sign on their left, so at a stop on the left
// the couple is mirrored: she still stands on the sign's side, and points at it.
//
// The figures stand in a group of their own inside it, which a dance turns round and sways; the bench stays put, and
// so does the pet: it sits PET_AHEAD in front of their middle, between them, facing the train like them. In front of
// a dancing pair it sits a little further out, clear of the circle they turn in, however it turns itself.
//
// They answer her taps, silently (`targets`, ride/taps.js): the two of them wave (or, already waving, he twirls her),
// and the pet, a target of its own round its paws, hops for joy. Sitting in front of them, it is the nearer of the two
// to her, so a tap at its feet reaches it rather than them.
//
// DOM-free at import, so the Node unit tests can import it.

import { Group, Mesh, Vector3 } from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { createFigure, sittingLift } from './figures.js';
import { BENCH, coupleLayout, mirrorPose, posesAt } from './poses.js';
import { createPropGeometry } from './props.js';
import { createPet, PET_RADIUS } from './pets.js';

/** How far in front of their middle their pet sits (m). */
const PET_AHEAD = 0.45;

/**
 * Their hit spheres for taps: the couple's is round their middle, COUPLE_AT metres up, at least COUPLE_REACH metres
 * round (or as wide as they stand); the pet's is PET_REACH round its body, PET_AT up.
 */
const HIT = Object.freeze({ COUPLE_AT: 0.9, COUPLE_REACH: 0.85, PET_AT: 0.2, PET_REACH: 0.35 });

/** Whether `object` is drawn: it and everything it hangs from are visible. */
function drawn(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * The two of them at a stop.
 * @param {{ her: { skin: string, hair: string, outfit: string }, you: { skin: string, hair: string, outfit: string } }} characters
 * @param {string} pose  one of content/normalize.js POSES but 'none' (the moment's `pose`)
 * @param {import('./pets.js').PetLook|null} [pet]  their pet at their feet (world/pets.js `petFor`), or none
 * @param {'left'|'right'} [side]  the side of the track the stop is on (world/layout.js Stop `side`)
 * @returns {{ group: Group, update: (time: number) => void, react: (now: number) => void, halfWidth: number,
 *             pet: ReturnType<typeof createPet>|null, targets: import('../ride/taps.js').Tappable[] }}
 *   Call `update` every frame they are drawn, with the seconds since the start. `react` is a tap on them at `now`
 *   (the same clock): they wave for a moment. `halfWidth`: how far either side of their middle they reach (m), their
 *   pet among them, for `placeCouple`. `pet` is their pet, for a tap on it (its own `react`), or null. `targets` are
 *   the two of them ('couple') and their pet ('pet'), for taps; not there while they are not drawn.
 */
export function createStopCouple(characters, pose, pet = null, side = 'right') {
  const layout = coupleLayout(pose);
  const mirrored = side === 'left';
  const flip = mirrored ? -1 : 1;

  const group = new Group();
  group.name = `couple-${pose}`;
  const pair = new Group();
  pair.name = 'couple-pair';
  pair.rotation.order = 'YXZ'; // turned round (a dance), then swayed about the line between them
  group.add(pair);

  const her = createFigure({ ...characters.her, style: 'her' });
  const him = createFigure({ ...characters.you, style: 'him' });
  const lift = layout.bench ? sittingLift(BENCH.SEAT) : 0;
  for (const [figure, place] of [[her, layout.her], [him, layout.him]]) {
    figure.group.position.set(place.x * flip, lift, place.z);
    figure.group.rotation.y = place.turn * flip;
    pair.add(figure.group);
  }

  if (layout.bench) {
    const bench = new Mesh(createPropGeometry('bench').body, MATERIALS.solid);
    bench.name = 'couple-bench';
    bench.position.z = -BENCH.BACK;
    bench.castShadow = true;
    bench.receiveShadow = true;
    group.add(bench);
  }

  const companion = pet ? createPet(pet) : null;
  if (companion) {
    const ahead = (layout.her.z + layout.him.z) / 2 + PET_AHEAD;
    companion.group.position.z = pose === 'dancing' ? Math.max(ahead, layout.halfWidth + PET_RADIUS) : ahead;
    group.add(companion.group);
  }

  let tappedAt = -Infinity;

  function update(time) {
    const now = posesAt(pose, time, time - tappedAt);
    her.setPose(mirrored ? mirrorPose(now.her) : now.her);
    him.setPose(mirrored ? mirrorPose(now.him) : now.him);
    her.group.rotation.y = (layout.her.turn + now.twirl) * flip;
    pair.rotation.set(now.sway, now.spin * flip, 0);
    if (companion) companion.update(time);
  }

  function react(now) {
    tappedAt = now;
  }

  update(0);
  const halfWidth = companion ? Math.max(layout.halfWidth, PET_RADIUS) : layout.halfWidth;

  const middle = new Vector3(0, HIT.COUPLE_AT, 0);
  const paws = new Vector3(0, HIT.PET_AT, 0);
  /** @type {import('../ride/taps.js').Tappable[]} */
  const targets = [{
    name: 'couple',
    radius: Math.max(HIT.COUPLE_REACH, layout.halfWidth),
    position: (out) => (drawn(group) ? group.localToWorld(out.copy(middle)) : null),
    react: (now) => react(now),
  }];
  if (companion) {
    targets.push({
      name: 'pet',
      radius: HIT.PET_REACH,
      position: (out) => (drawn(group) ? companion.group.localToWorld(out.copy(paws)) : null),
      react: (now) => companion.react(now),
    });
  }
  return { group, update, react, halfWidth, pet: companion, targets };
}
