// The sea's waves: a slow swell out in the bay and, at the beach, a wave every PERIOD seconds or so that comes in
// as a line of foam, breaks, rushes up the sand and slides back. When there is sound they keep time with the waves
// she hears (ambienceBeds.js): each breaks as its hiss peaks.
//
// The sea is a flat mesh (terrain.js); this material moves it, in the vertex shader, and paints the foam, in the
// fragment shader. Each corner of the sea carries `seaPlace`: how far along the track it is (m), how far out from
// the centre line (m), and how deep the still water there is (m: the sea's level less the ground mesh's height,
// negative under dry land). The waves are worked out from that depth, so the waterline, the breaking crest and the
// foam fall where the sand really meets the water, whatever the ground's shape: the coast comes and goes with the
// zone blend. The faces are shaded from the moved surface (flatShading), so the facets catch the light as they tilt.
//
// The shapes are written once here as numbers and twice as code: in GLSL for the shaders and in JS (`seaRise` and
// what it uses) for the Node unit tests, which check what matters most: no wave ever covers ground that a prop
// may stand on (dressing.js DRY). Keep the two in step.
//
// Pure and DOM-free at import, like materials.js, so the Node unit tests can import it.

import { Color, MeshLambertMaterial } from '../three.js';
import { lerp, smoothstep } from '../util/math.js';

/**
 * PERIOD: seconds between waves at the beach when none are heard (the heard ones come every 8 to 10 s). SLEW: the
 * most (waves a second) the seen waves speed up or slow down to fall in with the heard ones. LAG: metres along the
 * beach over which a wave comes a whole wave later, so each runs along the sand at a slant from where she is.
 *
 * A wave, as a share of its time: it builds, its crest coming in from CREST_FROM metres of water as a hump CREST
 * high and its foam CREST_WIDTH metres of depth wide, while the water at the beach draws back DRAW metres; it
 * breaks at BREAK and rushes up the sand, RUN metres higher, by RUSHED; then it slides back. The rise and fall at
 * the beach fade out to sea over SURGE_DEEP metres of depth. Water shallower than FRINGE is all foam.
 *
 * The bay swells SWELL metres either way, growing over SWELL_DEEP metres of depth: two trains of waves, the first
 * SWELL_LENGTH metres long, rolling in at SWELL_SPEED m/s.
 */
export const SEA_WAVES = Object.freeze({
  PERIOD: 9,
  SLEW: 0.06,
  LAG: 260,
  BREAK: 0.45,
  RUSHED: 0.62,
  DRAW: 0.035,
  RUN: 0.08,
  SURGE_DEEP: Object.freeze([0.3, 1.6]),
  CREST: 0.07,
  CREST_FROM: 1.3,
  CREST_WIDTH: 0.35,
  FRINGE: 0.09,
  SWELL: 0.2,
  SWELL_DEEP: Object.freeze([0.8, 1.9]),
  SWELL_LENGTH: 14,
  SWELL_SPEED: 2.8,
  FOAM: '#f3fbf8',
});

const SWELL_K = (2 * Math.PI) / SEA_WAVES.SWELL_LENGTH;
const SWELL_W = SWELL_K * SEA_WAVES.SWELL_SPEED;

/** Where in its wave (0 to 1) the beach `d` metres along the track is, when she, at `here`, is `wave` waves in. */
export function wavePhase(wave, d, here) {
  const x = wave - (d - here) / SEA_WAVES.LAG;
  return x - Math.floor(x);
}

/** How far (m) the water at the beach is above its still level at `phase` of a wave: under it while the wave builds. */
export function surge(phase) {
  const { BREAK, RUSHED, DRAW, RUN } = SEA_WAVES;
  if (phase < BREAK) return -DRAW * smoothstep(0, BREAK, phase);
  if (phase < RUSHED) {
    const k = (phase - BREAK) / (RUSHED - BREAK);
    return lerp(-DRAW, RUN, 1 - (1 - k) * (1 - k));
  }
  return RUN * (1 - smoothstep(RUSHED, 1, phase));
}

/** How much there is of the coming wave's crest (0 to 1) at `phase`: it rises as it comes in and is gone as it breaks. */
export function crestLife(phase) {
  const { BREAK } = SEA_WAVES;
  if (phase >= BREAK) return 0;
  return smoothstep(0, 0.35 * BREAK, phase) * (1 - smoothstep(0.8 * BREAK, BREAK, phase));
}

/** How deep the water is (m) where the coming wave's crest is at `phase`: from CREST_FROM in to the waterline. */
export function crestDepth(phase) {
  const { BREAK, CREST_FROM } = SEA_WAVES;
  return CREST_FROM * (1 - Math.min(phase, BREAK) / BREAK);
}

/**
 * How far (m) the sea's surface is raised, `d` metres along the track and `out` metres from the centre line, where
 * the still water is `depth` metres deep, at `time` (s), with her at `here` and `wave` waves in. The vertex shader's
 * `seaRise`.
 */
export function seaRise(d, out, depth, time, wave, here) {
  const S = SEA_WAVES;
  const phase = wavePhase(wave, d, here);
  const beach = surge(phase) * (1 - smoothstep(S.SURGE_DEEP[0], S.SURGE_DEEP[1], depth));
  const crest = S.CREST * crestLife(phase) * Math.exp(-(((depth - crestDepth(phase)) / S.CREST_WIDTH) ** 2));
  const swell = S.SWELL * smoothstep(S.SWELL_DEEP[0], S.SWELL_DEEP[1], depth) * (
    0.65 * Math.sin(SWELL_K * out + SWELL_W * time + 0.9 * Math.sin(d * 0.045))
    + 0.35 * Math.sin(0.21 * out - 0.17 * d + 0.9 * time)
  );
  return beach + crest + swell;
}

/**
 * The seen waves' count `wave` after `seconds` more: one every PERIOD seconds, drawn (by at most SLEW waves a
 * second) toward the waves heard, `heard` (ambience.js seaWave: a count whose fraction is how far into the wave
 * now heard it is), by the shorter way round. NaN `heard` (none heard) leaves them to keep their own time.
 */
export function followWave(wave, seconds, heard) {
  const { PERIOD, SLEW } = SEA_WAVES;
  const next = wave + seconds / PERIOD;
  if (!Number.isFinite(heard)) return next;
  const behind = heard - next;
  const off = behind - Math.round(behind);
  const most = SLEW * seconds;
  return next + Math.max(-most, Math.min(most, off));
}

// ---------------------------------------------------------------------------------------------------------------
// The shaders
// ---------------------------------------------------------------------------------------------------------------

/** `x` as a GLSL float literal. */
const f = (x) => {
  const text = String(x);
  return /[.e]/.test(text) ? text : `${text}.0`;
};

const S = SEA_WAVES;

/** What both shaders share: the uniforms and the wave's shape (the GLSL of wavePhase, surge, crestLife, crestDepth). */
const SHARED = /* glsl */ `
uniform float uSeaTime;
uniform float uSeaWave;
uniform float uSeaHere;
float seaPhase(float d) {
  return fract(uSeaWave - (d - uSeaHere) / ${f(S.LAG)});
}
float seaSurge(float p) {
  if (p < ${f(S.BREAK)}) return -${f(S.DRAW)} * smoothstep(0.0, ${f(S.BREAK)}, p);
  if (p < ${f(S.RUSHED)}) {
    float k = (p - ${f(S.BREAK)}) / ${f(S.RUSHED - S.BREAK)};
    return mix(-${f(S.DRAW)}, ${f(S.RUN)}, 1.0 - (1.0 - k) * (1.0 - k));
  }
  return ${f(S.RUN)} * (1.0 - smoothstep(${f(S.RUSHED)}, 1.0, p));
}
float seaCrestLife(float p) {
  if (p >= ${f(S.BREAK)}) return 0.0;
  return smoothstep(0.0, ${f(0.35 * S.BREAK)}, p) * (1.0 - smoothstep(${f(0.8 * S.BREAK)}, ${f(S.BREAK)}, p));
}
float seaCrest(float p, float depth) {
  float at = ${f(S.CREST_FROM)} * (1.0 - min(p, ${f(S.BREAK)}) / ${f(S.BREAK)});
  float x = (depth - at) / ${f(S.CREST_WIDTH)};
  return seaCrestLife(p) * exp(-x * x);
}
`;

const VERTEX_HEAD = /* glsl */ `
attribute vec3 seaPlace;
varying vec3 vSeaPlace;
varying float vSeaRise;
${SHARED}
float seaRise(vec3 place) {
  float p = seaPhase(place.x);
  float depth = place.z;
  float beach = seaSurge(p) * (1.0 - smoothstep(${f(S.SURGE_DEEP[0])}, ${f(S.SURGE_DEEP[1])}, depth));
  float crest = ${f(S.CREST)} * seaCrest(p, depth);
  float swell = ${f(S.SWELL)} * smoothstep(${f(S.SWELL_DEEP[0])}, ${f(S.SWELL_DEEP[1])}, depth) * (
    0.65 * sin(${f(SWELL_K)} * place.y + ${f(SWELL_W)} * uSeaTime + 0.9 * sin(place.x * 0.045))
    + 0.35 * sin(0.21 * place.y - 0.17 * place.x + 0.9 * uSeaTime)
  );
  return beach + crest + swell;
}
`;

const VERTEX_MOVE = /* glsl */ `
vSeaPlace = seaPlace;
vSeaRise = seaRise(seaPlace);
transformed.y += vSeaRise;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uSeaFoam;
varying vec3 vSeaPlace;
varying float vSeaRise;
${SHARED}
float seaLace(vec2 at) {
  return 0.55 + 0.45 * sin(at.x * 1.9 + at.y * 0.7 + uSeaTime * 0.6) * sin(at.x * 0.73 - at.y * 1.3 - uSeaTime * 0.4);
}
`;

// The foam: all over the thinnest water at the waterline, along the coming wave's crest, and over the shallows
// as the broken wave slides back.
const FRAGMENT_FOAM = /* glsl */ `
{
  float p = seaPhase(vSeaPlace.x);
  float depth = vSeaPlace.z;
  float now = depth + vSeaRise;
  float fringe = 1.0 - smoothstep(0.0, ${f(S.FRINGE)}, now);
  float crest = seaCrest(p, depth);
  float wash = (p > ${f(S.RUSHED)} ? 1.0 - smoothstep(${f(S.RUSHED)}, 1.0, p) : 0.0) * (1.0 - smoothstep(0.0, 0.3, now)) * 0.85;
  float foam = clamp(max(fringe, max(crest, wash)) * seaLace(vSeaPlace.xy), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uSeaFoam, 0.92 * foam);
}
`;

const uniforms = {
  uSeaTime: { value: 0 },
  uSeaWave: { value: 0 },
  uSeaHere: { value: 0 },
  uSeaFoam: { value: new Color(SEA_WAVES.FOAM) },
};

/** `source` with `text` added after `chunk`, which must be in it: a renamed three.js chunk fails loudly here. */
function after(source, chunk, text) {
  if (!source.includes(chunk)) throw new Error(`seaWaves: the shader has no ${chunk}`);
  return source.replace(chunk, `${chunk}\n${text}`);
}

/** The sea's material: lit like materials.js `solid`, from the vertex colours, with the waves. */
export const SEA_MATERIAL = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
SEA_MATERIAL.name = 'sea';
SEA_MATERIAL.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = after(after(shader.vertexShader, '#include <common>', VERTEX_HEAD), '#include <begin_vertex>', VERTEX_MOVE);
  shader.fragmentShader = after(after(shader.fragmentShader, '#include <common>', FRAGMENT_HEAD), '#include <color_fragment>', FRAGMENT_FOAM);
};
SEA_MATERIAL.customProgramCacheKey = () => 'sea-waves';

/**
 * Moves the waves to `time` (s, as the scenery's other swaying and bobbing keeps it), `wave` (followWave's count)
 * and her place on the track, `here` (m). Call it every frame while there is a sea.
 */
export function updateSea(time, wave, here) {
  uniforms.uSeaTime.value = time;
  uniforms.uSeaWave.value = wave;
  uniforms.uSeaHere.value = here;
}
