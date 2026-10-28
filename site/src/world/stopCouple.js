// The two of them at a stop, posed for its moment (world/poses.js): two figures (world/figures.js) and, for
// 'sitting', the park bench (world/props.js) they sit on, each one draw call.
//
// The group faces +Z with their middle on its origin, for world/signs.js `placeCouple`, which stands it beside the
// sign and turns it toward her seat. That puts the sign on their left at a stop on the right of the track, and on
// their right at a stop on the left. The poses are laid out with the sign on their left, so at a stop on the left
// the couple is mirrored: she still stands on the sign's side, and points at it.
//
// The figures stand in a group of their own inside it, which a dance turns round and sways; the bench stays put.
//
// DOM-free at import, so the Node unit tests can import it.

import { Group, Mesh } from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { createFigure, sittingLift } from './figures.js';
import { BENCH, coupleLayout, mirrorPose, posesAt } from './poses.js';
import { createPropGeometry } from './props.js';

/**
 * The two of them at a stop.
 * @param {{ her: { skin: string, hair: string, outfit: string }, you: { skin: string, hair: string, outfit: string } }} characters
 * @param {string} pose  one of content/normalize.js POSES but 'none' (the moment's `pose`)
 * @param {object|null} [pet]  the pet at their feet (Task 11); not drawn yet
 * @param {'left'|'right'} [side]  the side of the track the stop is on (world/layout.js Stop `side`)
 * @returns {{ group: Group, update: (time: number) => void, react: (now: number) => void, halfWidth: number }}
 *   Call `update` every frame they are drawn, with the seconds since the start. `react` is a tap on them at `now`
 *   (the same clock): they wave for a moment. `halfWidth`: how far either side of their middle they reach (m), for
 *   `placeCouple`.
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

  let tappedAt = -Infinity;

  function update(time) {
    const now = posesAt(pose, time, time - tappedAt);
    her.setPose(mirrored ? mirrorPose(now.her) : now.her);
    him.setPose(mirrored ? mirrorPose(now.him) : now.him);
    her.group.rotation.y = (layout.her.turn + now.twirl) * flip;
    pair.rotation.set(now.sway, now.spin * flip, 0);
  }

  function react(now) {
    tappedAt = now;
  }

  update(0);
  return { group, update, react, halfWidth: layout.halfWidth };
}
