// The scenery props of the whole ride, drawn as instanced meshes.
//
// Each zone's props are placed by scatter.js, then stood on the ground: each one at the terrain's height where
// it stands (terrain.js `terrainHeight`, with the sea's share there from environment.js), at the lowest point
// under its footprint so that on a slope it never floats, and sunk a few centimetres more because the ground
// mesh is a coarse grid over that smooth height. Anything that would stand in the sea is left out: the
// neighbours of a beach zone spill their props into its blend window, where the ground slopes into the water. So is
// anything on the tunnel's hill (tunnel.js) or within TUNNEL_CLEAR of its portals, where the hill rises; beyond that
// the props stand on the hill's last gentle slope.
//
// There is one InstancedMesh for each zone's body of each type and variant, and another for its glow (lamp
// glass, windows) where it has one: about forty meshes for the default ride, and only the zones near the
// train are drawn. Within a mesh the instances are in `priority` order (scatter.js), so drawing only the first
// share of them (`setDensity`, for a slow phone) keeps the props nearest the track and thins the rest evenly.
//
// Each street lamp also has a soft halo round its lantern: one THREE.Points per lamp mesh, in the same order,
// thinned with it. The balloon clusters sway and bob on their strings (`update`). The trees, bushes, flowers and
// grass sway in the breeze, in the vertex shader of their own material (wind.js).
//
// It also says where things stand that others need (`spots`): the top of every house's and snowy cottage's chimney in
// the world, for the smoke, each with the share of the density (`rank`) above which its house is drawn, so the smoke
// goes with the house when a slow phone thins the props.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it.

import { BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Points, Quaternion, Vector3 } from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { clamp } from '../util/math.js';
import { createRng } from '../util/rng.js';
import { envAt } from './environment.js';
import { chimneyTop, createPropGeometry } from './props.js';
import { scatterZone } from './scatter.js';
import { SIGN } from './signs.js';
import { START_STATION_DISTANCE } from './stations.js';
import { terrainHeight, TERRAIN } from './terrain.js';
import { tunnelSpan } from './tunnel.js';
import { swayMaterialFor } from './wind.js';
import { ZONES } from './zones.js';

/** Distances in metres. */
export const DRESSING = Object.freeze({
  DRY: TERRAIN.WATER_LEVEL + 0.1, // a prop whose ground is lower than this would stand in the sea, so it is left out
  SINK: 0.08,                     // every prop sits this far into the ground: the ground mesh only follows the hills to within about that
  TUNNEL_CLEAR: 10,               // no prop stands over the tunnel, nor within this far of either of its portals
});

/**
 * The spots the props keep clear of: each photo sign (where signs.js `placeSign` stands it, with the couple just
 * ahead of some of them), the start station and the finale station with its house.
 * @param {import('./layout.js').Layout} layout
 * @returns {import('./scatter.js').AvoidSpot[]}
 */
export function avoidSpots(layout) {
  return [
    ...layout.stops.map((stop) => ({ distance: stop.distance + SIGN.AHEAD, right: stop.side === 'right' ? SIGN.OUT : -SIGN.OUT, radius: 5 })),
    { distance: START_STATION_DISTANCE, right: 4, radius: 12 },
    { distance: layout.finaleDistance, right: 5, radius: 16 },
  ];
}

/** Props whose glow (props.js) gets a halo round it (render/materials.js `halo`). */
const HALOS = new Set(['lamp_post']);

/** Props too small and too many for their shadows to be worth drawing. */
const NO_SHADOW = new Set(['grass_tuft', 'flower_patch']);

/** Only the parts of a prop this close to its origin's height (m) count as its footprint. */
const FOOT_HEIGHT = 0.15;
/** No footprint is taken as wider than this (m) across the slope. */
const MAX_FOOT = 2.5;

/** How a balloon cluster moves: tilts (rad) about its peg, stretches on its strings (a share of its height), over these periods (s). */
const BALLOON_SWAY = Object.freeze({ TILT: 0.05, STRETCH: 0.025, PERIODS: [5.3, 6.7, 3.9] });

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/** How far from its origin (m) a prop touches the ground: the widest of its parts down by the ground. */
function footprintRadius(geometry) {
  const p = geometry.attributes.position;
  let widest = 0;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < FOOT_HEIGHT) widest = Math.max(widest, Math.hypot(p.getX(i), p.getZ(i)));
  }
  return Math.min(widest, MAX_FOOT);
}

/**
 * @typedef {Vector3 & { rank?: number }} Chimney
 *   The world position of a chimney's top. Its house is drawn while the density is above `rank` (0 to 1; none
 *   means always, the way the station house is).
 */

/**
 * Builds the props of every zone of the ride.
 * @param {{ path: import('./trackPath.js').TrackPath, layout: import('./layout.js').Layout, seed?: number }} options
 *   `seed` is the first zone's scatter seed; each zone after it takes the next one (the default, 1, gives every
 *   zone its position in the ride + 1, as the world is meant to be built).
 * @returns {{
 *   group: Group, setDensity: (share: number) => void, update: (dt: number, time: number) => void,
 *   spots: { chimneys: Chimney[] },
 * }}
 *   Add `group` to the scene. `setDensity` draws that share (0 to 1) of every mesh's props: the quality tier's
 *   `density`. Call `update` every frame with the seconds since the last frame and the seconds since the start.
 *   `spots` lists where things stand: `chimneys`, the top of every chimney (smoke.js).
 */
export function createDressing({ path, layout, seed = 1 }) {
  const group = new Group();
  group.name = 'dressing';
  const avoid = avoidSpots(layout);
  const tunnel = tunnelSpan(layout);
  const bare = tunnel ? [tunnel.from - DRESSING.TUNNEL_CLEAR, tunnel.to + DRESSING.TUNNEL_CLEAR] : null;
  const env = envAt(layout, 0);
  const geometries = new Map(); // 'type#variant' → { body, glow, foot }, built once and shared by every zone
  /** @type {Array<{ mesh: InstancedMesh|Points, total: number }>} */
  const meshes = [];
  const balloons = [];
  const matrix = new Matrix4();
  const position = new Vector3();
  const turn = new Quaternion();
  const size = new Vector3();
  /** @type {Chimney[]} */
  const chimneys = [];

  layout.zones.forEach((zone, index) => {
    const def = ZONES[zone.id];
    const placements = scatterZone({ path, zone, rules: def.props, seed: seed + index, avoid, water: def.water });

    // Stand each prop on the ground, or leave it out if that ground is under the sea or is the tunnel's hill.
    const byKind = new Map();
    for (const p of placements) {
      if (bare && p.d >= bare[0] && p.d <= bare[1]) continue;
      const water = envAt(layout, p.d, env).water;
      const ground = (d, offset) => terrainHeight(d, offset, { water, tunnel });
      if (ground(p.d, p.offset) < DRESSING.DRY) continue;
      const key = `${p.type}#${p.variant}`;
      if (!geometries.has(key)) {
        const { body, glow } = createPropGeometry(p.type, p.variant);
        geometries.set(key, { body, glow, foot: footprintRadius(body) });
      }
      const r = geometries.get(key).foot * p.scale;
      const y = Math.min(ground(p.d, p.offset), ground(p.d - r, p.offset), ground(p.d + r, p.offset),
        ground(p.d, p.offset - r), ground(p.d, p.offset + r)) - DRESSING.SINK;
      if (!byKind.has(key)) byKind.set(key, []);
      byKind.get(key).push({ ...p, y });
    }

    for (const [key, list] of byKind) {
      list.sort((a, b) => a.priority - b.priority);
      const { body, glow } = geometries.get(key);
      const [type, variant] = key.split('#');
      const name = `props-${zone.id}-${type}-${variant}`;
      const solid = new InstancedMesh(body, swayMaterialFor(type) ?? MATERIALS.solid, list.length);
      solid.name = name;
      solid.castShadow = !NO_SHADOW.has(type);
      solid.receiveShadow = true;
      const lit = glow ? new InstancedMesh(glow, MATERIALS.glow, list.length) : null;
      if (lit) lit.name = `${name}-glow`;
      const top = chimneyTop(type, Number(variant));
      list.forEach((p, i) => {
        matrix.compose(position.set(p.x, p.y, p.z), turn.setFromAxisAngle(UP, p.rotY), size.setScalar(p.scale));
        solid.setMatrixAt(i, matrix);
        if (lit) lit.setMatrixAt(i, matrix);
        // Where the smoke leaves it, in the world: the house's turn and size put on the point the prop's frame gives.
        // Its house is the i-th of the list, so it is drawn while the density is more than i / total.
        if (top) chimneys.push(Object.assign(new Vector3(...top).applyMatrix4(matrix), { rank: i / list.length }));
      });
      for (const mesh of lit ? [solid, lit] : [solid]) {
        mesh.computeBoundingSphere();
        group.add(mesh);
        meshes.push({ mesh, total: list.length });
      }
      if (glow && HALOS.has(type)) {
        // A halo on the middle of each glow, in the same order as the instances.
        const centre = glow.boundingBox.getCenter(new Vector3());
        const spots = [];
        list.forEach((p, i) => {
          solid.getMatrixAt(i, matrix);
          spots.push(...position.copy(centre).applyMatrix4(matrix).toArray());
        });
        const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(spots, 3));
        geometry.computeBoundingSphere();
        const halos = new Points(geometry, MATERIALS.halo);
        halos.name = `${name}-halo`;
        group.add(halos);
        meshes.push({ mesh: halos, total: list.length });
      }
      if (type === 'balloon_cluster') balloons.push({ mesh: solid, placements: list });
    }
  });

  // Each balloon cluster sways to its own rhythm.
  const rng = createRng(seed * 7919 + 13);
  const swaying = balloons.map(({ mesh, placements }) => ({
    mesh,
    clusters: placements.map((p) => ({ x: p.x, y: p.y, z: p.z, rotY: p.rotY, scale: p.scale, phase: [rng(), rng(), rng()].map((u) => u * Math.PI * 2) })),
  }));
  const yaw = new Quaternion();
  const tiltX = new Quaternion();
  const tiltZ = new Quaternion();
  const { TILT, STRETCH, PERIODS } = BALLOON_SWAY;
  const angular = PERIODS.map((period) => (2 * Math.PI) / period);

  function update(dt, time) {
    for (let m = 0; m < swaying.length; m++) {
      const { mesh, clusters } = swaying[m];
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        // Tilted about its peg and stretched up its strings, so the gift box stays on the ground.
        tiltX.setFromAxisAngle(X_AXIS, TILT * Math.sin(angular[0] * time + c.phase[0]));
        tiltZ.setFromAxisAngle(Z_AXIS, TILT * Math.sin(angular[1] * time + c.phase[1]));
        turn.multiplyQuaternions(yaw.setFromAxisAngle(UP, c.rotY), tiltX).multiply(tiltZ);
        const stretch = 1 + STRETCH * Math.sin(angular[2] * time + c.phase[2]);
        size.set(c.scale, c.scale * stretch, c.scale);
        mesh.setMatrixAt(i, matrix.compose(position.set(c.x, c.y, c.z), turn, size));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    group,
    setDensity(share) {
      const f = clamp(share, 0, 1);
      for (const { mesh, total } of meshes) {
        const count = Math.ceil(total * f);
        if (mesh.isInstancedMesh) mesh.count = count;
        else mesh.geometry.setDrawRange(0, count);
      }
    },
    update,
    spots: { chimneys },
  };
}
