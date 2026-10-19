// The shared materials that everything built in code is drawn with.
//
// Every model takes its colours from its geometry's vertex colours (util/geo.js), so one material serves every
// model and each shader is compiled once. The app sets `needsUpdate` on all of them when the quality tier turns
// shadows on or off.
//
// Creating materials touches no DOM, so the world builders and the Node unit tests can import this module.

import {
  AdditiveBlending, DataTexture, LinearFilter, MeshBasicMaterial, MeshLambertMaterial, PointsMaterial,
} from '../three.js';

/** The halo sprite: a soft round glow, opaque white in the middle and fading to nothing at the edge. */
function haloTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const glow = Math.max(0, 1 - r) ** 1.8;
      const at = (y * size + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = 255;
      data[at + 3] = Math.round(255 * glow);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * `solid` is for every lit thing (terrain, track, props, stations, cabin, figures). `glow` is for what should
 * look lit whatever the light (lamp glass, windows, string lights). `distant` is lit like `solid` but never
 * fogged, for the hot-air balloons far out beyond the fog (world/skyDecor.js), which would otherwise vanish into
 * the horizon colour. `halo` draws THREE.Points as soft warm glows round the street lamps' lanterns, added to
 * what is behind them like light; it is not fogged either, so the lamps of the town still shine through the dusk
 * haze.
 */
export const MATERIALS = Object.freeze({
  solid: new MeshLambertMaterial({ vertexColors: true }),
  glow: new MeshBasicMaterial({ vertexColors: true }),
  distant: new MeshLambertMaterial({ vertexColors: true, fog: false }),
  halo: new PointsMaterial({
    map: haloTexture(),
    color: '#ffc46e',
    size: 2.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  }),
});
