// The look of the world at any point of the ride: sky, fog, light, ground colours, sea and particles.
//
// Inside a zone this is that zone's look from zones.js. Around each boundary between two zones, in the window
// that layout.js's `zoneAt` describes, the two looks are mixed by its eased `t`, so there is never a hard seam.
// Colours are mixed in linear space, where Three keeps them once the sRGB hex has been parsed.
//
// The renderer calls `envAt` every frame. Given an `out` it overwrites the colours and the vector already in it
// and allocates nothing of its own (the two small objects `zoneAt` returns are all the garbage a call makes).
//
// Pure and DOM-free (only Three's maths is used), so the Node unit tests can import it.

import { Color, Vector3 } from '../three.js';
import { lerp } from '../util/math.js';
import { ZONE_IDS } from '../content/normalize.js';
import { zoneAt } from './layout.js';
import { ZONES } from './zones.js';

/**
 * @typedef {import('../content/normalize.js').ZoneId} ZoneId
 * @typedef {import('./zones.js').ParticleStyle} ParticleStyle
 * @typedef {{
 *   skyTop: Color, skyHorizon: Color, fogColor: Color, sunColor: Color, hemiSky: Color, hemiGround: Color,
 *   groundNear: Color, groundFar: Color, path: Color,
 *   fogNear: number, fogFar: number, sunIntensity: number, hemiIntensity: number,
 *   sunDir: Vector3, water: number,
 *   particlesA: ParticleStyle, particlesB: ParticleStyle, particlesT: number,
 *   zoneA: ZoneId, zoneB: ZoneId, t: number,
 * }} Env
 *   The look at one point of the track. The colours are linear. `fogNear` and `fogFar` are distances (m);
 *   the two intensities are in the units zones.js describes. `sunDir` is a unit vector towards the sun.
 *   `water` is how much sea there is on the left, 0 to 1. The particle layer does not mix its two styles; it
 *   fades one out and the other in, so it gets both (`particlesA` of zone A, `particlesB` of zone B) and how far
 *   across the boundary the train is (`particlesT`, the same as `t`). `zoneA` and `zoneB` are the zone before and
 *   the zone after the boundary, and `t` (0 to 1) is how far the blend has got; inside a zone both are that
 *   zone and `t` is 0.
 */

/** Every zone's colours and sun direction, parsed once, so a frame only has numbers to mix. ZONES is frozen, so this cannot go stale. */
const PARSED = {};
for (const id of ZONE_IDS) {
  const zone = ZONES[id];
  PARSED[id] = {
    skyTop: new Color(zone.sky.top),
    skyHorizon: new Color(zone.sky.horizon),
    fogColor: new Color(zone.fog.color),
    sunColor: new Color(zone.sun.color),
    hemiSky: new Color(zone.hemi.sky),
    hemiGround: new Color(zone.hemi.ground),
    groundNear: new Color(zone.ground.near),
    groundFar: new Color(zone.ground.far),
    path: new Color(zone.ground.path),
    fogNear: zone.fog.near,
    fogFar: zone.fog.far,
    sunIntensity: zone.sun.intensity,
    hemiIntensity: zone.hemi.intensity,
    sunDir: new Vector3(...zone.sun.dir).normalize(),
    water: zone.water ? 1 : 0,
    particles: zone.particles,
  };
}

/** An Env to be filled in by `envAt`: the right colours and vector, with placeholder values. */
function newEnv() {
  return {
    skyTop: new Color(),
    skyHorizon: new Color(),
    fogColor: new Color(),
    sunColor: new Color(),
    hemiSky: new Color(),
    hemiGround: new Color(),
    groundNear: new Color(),
    groundFar: new Color(),
    path: new Color(),
    fogNear: 0,
    fogFar: 0,
    sunIntensity: 0,
    hemiIntensity: 0,
    sunDir: new Vector3(),
    water: 0,
    particlesA: null,
    particlesB: null,
    particlesT: 0,
    zoneA: null,
    zoneB: null,
    t: 0,
  };
}

/**
 * The look of the world `d` metres along the track.
 * @param {import('./layout.js').Layout} layout
 * @param {number} d  distance along the track (m)
 * @param {Env} [out]  an Env to overwrite and return (do that in per-frame code); without one a new Env is made
 * @returns {Env}
 */
export function envAt(layout, d, out = newEnv()) {
  const { a, b, t } = zoneAt(layout, d).blend;
  const from = PARSED[a];
  const to = PARSED[b];
  out.skyTop.lerpColors(from.skyTop, to.skyTop, t);
  out.skyHorizon.lerpColors(from.skyHorizon, to.skyHorizon, t);
  out.fogColor.lerpColors(from.fogColor, to.fogColor, t);
  out.sunColor.lerpColors(from.sunColor, to.sunColor, t);
  out.hemiSky.lerpColors(from.hemiSky, to.hemiSky, t);
  out.hemiGround.lerpColors(from.hemiGround, to.hemiGround, t);
  out.groundNear.lerpColors(from.groundNear, to.groundNear, t);
  out.groundFar.lerpColors(from.groundFar, to.groundFar, t);
  out.path.lerpColors(from.path, to.path, t);
  out.fogNear = lerp(from.fogNear, to.fogNear, t);
  out.fogFar = lerp(from.fogFar, to.fogFar, t);
  out.sunIntensity = lerp(from.sunIntensity, to.sunIntensity, t);
  out.hemiIntensity = lerp(from.hemiIntensity, to.hemiIntensity, t);
  // Mixing two unit vectors shortens them in between, so the result is made a unit vector again.
  out.sunDir.lerpVectors(from.sunDir, to.sunDir, t).normalize();
  out.water = lerp(from.water, to.water, t);
  out.particlesA = from.particles;
  out.particlesB = to.particles;
  out.particlesT = t;
  out.zoneA = a;
  out.zoneB = b;
  out.t = t;
  return out;
}
