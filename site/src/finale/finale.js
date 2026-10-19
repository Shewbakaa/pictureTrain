// The finale at the Day 365 station: the ride's last scene, played once the train has pulled in.
//
// Under a blush fade (app.js) her first-person cabin gives way to the little train seen from outside, and the
// camera, which was her eyes, rises out of her seat and glides out over the platform. She is there now, a little
// figure at the carriage door: she steps to the edge, crouches and hops down onto the platform, and turns to the
// station house, where he has been waiting by the door with a bouquet. He walks over to her with a happy bob and
// holds the flowers out, she takes them in both hands and hugs them, and hearts rise between them while soft
// fireworks bloom over the town and confetti flutters down. Then the app shows his message.
//
// Everything is a pure function of the finale's clock (`time`), so `skipTo` and `freeze` (the ?ft= debug param)
// show any instant exactly, and screenshots are repeatable. The choreography is a set of keyframed tracks
// (`finaleTracks`, timeline.js); `update` reads them, places the camera, the two of them and the bouquet, poses
// their limbs, and runs the hearts, the fireworks and the confetti.
//
// Places are given in the frame of the finale station, `frameAt(finaleDistance + along, right, up)`: `along` is
// metres further along the track (the station house is ahead of the seat), `right` is right of the track (the
// platform side) and `up` is metres above the rails' ground. The track is straight there (app.js), so straight
// lines between such points stay true.
//
// DOM-free (only Three's classes are used), so the Node unit tests can import it. `finale.js` never touches the page:
// the app hides the swap under its fade and shows the message card when `update` reports 'card'.

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, ExtrudeGeometry,
  Float32BufferAttribute, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial,
  Points, Quaternion, ShaderMaterial, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from '../three.js';
import { MATERIALS } from '../render/materials.js';
import { EYE_HEIGHT } from '../world/layout.js';
import { fovForAspect } from '../ride/look.js';
import { createFigure, walkPose } from '../world/figures.js';
import { heartShape } from '../world/signs.js';
import { mergeParts, moveParts, part, triangleSoup } from '../util/geo.js';
import { clamp, smoothstep } from '../util/math.js';
import { createRng, rngRange } from '../util/rng.js';
import { createTimeline } from './timeline.js';

/** When things happen (s from the start of the finale). */
export const FINALE_TIMES = Object.freeze({
  cameraDone: 2.6, herStepStart: 2.6, herStepEnd: 4.2, himWalkStart: 4.0, himWalkEnd: 7.0,
  handoffStart: 7.0, handoffEnd: 8.0, hearts: 8.0, fireworks: 8.5, card: 9.5, end: 12,
});

const T = FINALE_TIMES;

/** What `update` reports, and when. */
const EVENTS = Object.freeze([{ name: 'hearts', t: T.hearts }, { name: 'fireworks', t: T.fireworks }, { name: 'card', t: T.card }]);

/**
 * Her hop off the carriage (s): she steps to the edge of the doorway, crouches, takes off, is at the top of her
 * hop, lands with a little squash and takes two small steps further onto the platform by herStepEnd.
 */
const HOP = Object.freeze({
  edge: T.herStepStart + 0.4, takeoff: T.herStepStart + 0.55, apex: T.herStepStart + 0.8,
  land: T.herStepStart + 1.1, settle: T.herStepStart + 1.25,
});

/** Where she goes [along, right, up]: from beside her seat to the platform, by way of the top of her hop. */
const HER = Object.freeze({
  seat: [0.4, 1.0, 0.9], edge: [0.4, 1.3, 0.9], apex: [0.4, 2.2, 1.2], land: [0.4, 2.95, 0.6], end: [0.4, 3.4, 0.6],
});

/** Where he goes: from just outside the station house door (R27: its face is 6.9 m out) to beside her. */
const HIM = Object.freeze({ door: [7.5, 6.6, 0.6], end: [1.2, 3.6, 0.6] });

/** The bouquet in his hand, from his feet, and in her hands at the end. */
const HAND = Object.freeze([-0.3, -0.25, 0.65]);
const HER_HANDS = Object.freeze([0.6, 3.45, 1.15]);

/**
 * The camera: her seat, where the glide out ends and where the slow push-in ends, and what it looks at.
 * Between the first two the glide follows a smooth curve through `via`: back along the carriage behind her (so
 * that she is seen standing at the open door), out of its side under the bunting, and up over the platform between
 * two of its lamps, above the string lights, before it settles back. `ahead` is where it looks from her seat, `her`
 * at her by the door, `subject` (cameraDone) where she lands and `meeting` where the two of them meet.
 */
const CAMERA = Object.freeze({
  seat: [0, 0, EYE_HEIGHT], out: [-4.5, 9.5, 3.4], close: [-2.5, 7.8, 2.9],
  via: [[-1.4, 0.5, 2.25], [-1.3, 2.3, 2.42], [-0.9, 5.4, 3.55]],
  // Once he is clear of the station house, the push-in drifts out a little ([along, right, up], most 1.6 s into his
  // walk), so that the canopy post and the lamp at the back of the platform pass behind him in its quick part.
  drift: [0.6, 1.1, 0],
  ahead: [6, 1.8, 1.75], her: [0.45, 1.15, 1.45], subject: [0.8, 3.4, 1.1], meeting: [0.8, 3.5, 1.1],
  // Where what it looks at sits on the screen (a share of the way from the middle to the top): a little low while
  // they meet, for the sky over them, and higher once the card is up, so that they stand just above it.
  frameY: -0.12, cardY: 0.18,
  walkY: -0.28,   // lower still while it follows him over, for more of the sky and less of the lawn
  wideX: -0.45,   // on a wide screen, how far left of the middle they stand once the card is up
  zoom: 0.72,     // the third-person lens against her own view (a share of tan(fov/2)): a little longer, so they read
  walkZoom: 0.62, // and longer still while it follows him over from the door
  cardZoom: 0.85, // and a little wider again once the card is up, for the fireworks over the town
});

/** Screens at least this wide for their height put the card to the right of the two of them (styles.css). */
const WIDE = 1.25;

const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * The finale's choreography as keyframed tracks (timeline.js). Positions are world points (`frameAt`), numbers
 * are as their key says:
 * - camera: her seat → the glide out (at cameraDone) → a slow push-in (by card). `glide` is how far along the
 *   curve of the glide out the camera is (0 to 1, see CAMERA.via), `drift` bends the push-in (see CAMERA.drift),
 *   `zoom` is its lens (see CAMERA.zoom) and `look`
 *   what it looks at. `follow` (0 to 1) pulls that towards the two of them while he walks over, `followBias` saying
 *   how far towards him (0 = her, 1 = him), and `frameY` says where on the screen it sits (see CAMERA.frameY).
 * - her: beside her seat → the doorway's edge → the top of her hop → the platform. herUp is the height of her feet,
 *   eased so that the hop is an arc rather than the peak the straight `her` segments would draw.
 * - him: at the station house door, then over to her (himWalkStart to himWalkEnd).
 * - bouquet: in his hand (his keys and eases, offset by HAND) until handoffStart, then into her hands by handoffEnd.
 * @param {import('../world/trackPath.js').TrackPath} path
 * @param {number} finaleDistance
 * @returns {import('./timeline.js').Track[]}
 */
export function finaleTracks(path, finaleDistance) {
  const at = (place) => path.frameAt(finaleDistance + place[0], place[1], place[2]).toArray();
  const key = (t, place, ease) => (ease ? { t, v: at(place), ease } : { t, v: at(place) });
  const num = (t, v, ease) => (ease ? { t, v, ease } : { t, v });
  return [
    { key: 'camera', keys: [key(0, CAMERA.seat), key(T.cameraDone, CAMERA.out, 'inOut'), key(T.card, CAMERA.close, 'inOut')] },
    { key: 'glide', keys: [num(0, 0), num(T.cameraDone, 1, 'inOut')] },
    {
      key: 'drift',
      keys: [num(T.himWalkStart + 0.6, [0, 0, 0]), num(T.himWalkStart + 1.6, CAMERA.drift, 'inOut'), num(T.card, [0, 0, 0], 'inOut')],
    },
    {
      key: 'zoom',
      keys: [
        num(0, 1), num(T.cameraDone, CAMERA.zoom, 'inOut'), num(T.herStepEnd, CAMERA.zoom), num(T.himWalkStart + 1, CAMERA.walkZoom, 'inOut'),
        num(T.himWalkEnd - 0.7, CAMERA.walkZoom), num(T.himWalkEnd + 0.2, CAMERA.zoom, 'inOut'), num(T.card - 0.6, CAMERA.zoom),
        num(T.card + 0.5, CAMERA.cardZoom, 'inOut'),
      ],
    },
    {
      key: 'look',
      keys: [
        key(0, CAMERA.ahead), key(1.0, CAMERA.her, 'inOut'), key(1.7, CAMERA.her), key(T.cameraDone, CAMERA.subject, 'inOut'),
        key(T.handoffStart, CAMERA.subject), key(T.handoffEnd, CAMERA.meeting, 'inOut'),
      ],
    },
    { key: 'follow', keys: [num(HOP.settle, 0), num(T.himWalkStart + 0.6, 1, 'inOut'), num(T.handoffStart, 1), num(T.handoffEnd, 0, 'inOut')] },
    { key: 'followBias', keys: [num(T.himWalkStart + 1.2, 0.95), num(T.himWalkEnd, 0.5, 'inOut')] },
    {
      key: 'frameY',
      keys: [
        num(0, 0), num(T.cameraDone, CAMERA.frameY, 'inOut'), num(T.herStepEnd, CAMERA.frameY), num(T.himWalkStart + 1, CAMERA.walkY, 'inOut'),
        num(T.himWalkEnd - 0.7, CAMERA.walkY), num(T.himWalkEnd + 0.2, CAMERA.frameY, 'inOut'), num(T.card - 0.6, CAMERA.frameY),
        num(T.card + 0.5, CAMERA.cardY, 'inOut'),
      ],
    },
    {
      key: 'her',
      keys: [
        key(0, HER.seat), key(T.herStepStart, HER.seat), key(HOP.edge, HER.edge, 'inOut'), key(HOP.takeoff, HER.edge),
        key(HOP.apex, HER.apex), key(HOP.land, HER.land), key(HOP.settle, HER.land), key(T.herStepEnd, HER.end, 'inOut'),
      ],
    },
    { key: 'herUp', keys: [num(HOP.takeoff, HER.seat[2]), num(HOP.apex, HER.apex[2], 'out'), num(HOP.land, HER.land[2], 'in')] },
    { key: 'him', keys: [key(0, HIM.door), key(T.himWalkStart, HIM.door), key(T.himWalkEnd, HIM.end, 'inOut')] },
    {
      key: 'bouquet',
      keys: [
        key(0, add3(HIM.door, HAND)), key(T.himWalkStart, add3(HIM.door, HAND)), key(T.himWalkEnd, add3(HIM.end, HAND), 'inOut'),
        key(T.handoffEnd, HER_HANDS, 'inOut'),
      ],
    },
  ];
}

// --- The bouquet ------------------------------------------------------------------------------------------------

/** Bouquet colours (sRGB hex): a cream paper cone tied with a rose ribbon round pink, peach and white blooms. */
const BOUQUET = Object.freeze({
  paper: '#fff1e2', paperEdge: '#f6d7de', ribbon: '#e0607e', stem: '#5c9e5a', leaf: '#6fbf73',
  blooms: ['#ff7aa2', '#f9a8c9', '#ffffff', '#ffb38a', '#f48fb1', '#ffd1e0', '#ff5c8a'], heart: '#ffd56b',
  SCALE: 1.2, // a generous bunch, so that it reads from where the camera watches
});

/** The bouquet, held at its origin (where the ribbon ties it): the stems below, the blooms above, upright along +Y. */
function createBouquet() {
  const parts = [
    part(new CylinderGeometry(0.11, 0.022, 0.26, 9, 1, true), BOUQUET.paper, { position: [0, 0.06, 0] }),
    part(new CylinderGeometry(0.113, 0.11, 0.025, 9, 1, true), BOUQUET.paperEdge, { position: [0, 0.18, 0] }),
    part(new TorusGeometry(0.04, 0.012, 5, 10), BOUQUET.ribbon, { position: [0, -0.01, 0], rotation: [Math.PI / 2, 0, 0] }),
    part(new ConeGeometry(0.025, 0.08, 4), BOUQUET.ribbon, { position: [0.03, -0.06, 0.03], rotation: [0.3, 0, 0.5] }),
    part(new ConeGeometry(0.025, 0.08, 4), BOUQUET.ribbon, { position: [-0.03, -0.06, 0.03], rotation: [0.3, 0, -0.5] }),
    part(new CylinderGeometry(0.018, 0.018, 0.08, 6), BOUQUET.stem, { position: [0, -0.1, 0] }),
  ];
  // Blooms in a dome over the paper, each with a golden heart, and leaves tucked in round them.
  const spots = [[0, 0.27, 0], [0.075, 0.24, 0.03], [-0.07, 0.245, 0.035], [0.03, 0.235, -0.075], [-0.045, 0.23, -0.065],
    [0.08, 0.215, -0.04], [-0.085, 0.21, -0.02], [0.01, 0.235, 0.08]];
  spots.forEach(([x, y, z], i) => {
    const colour = BOUQUET.blooms[i % BOUQUET.blooms.length];
    parts.push(part(new IcosahedronGeometry(0.048, 0), colour, { position: [x, y, z], rotation: [i, i * 0.7, 0] }));
    parts.push(part(new IcosahedronGeometry(0.016, 0), BOUQUET.heart, { position: [x * 1.25, y + 0.035, z * 1.25] }));
  });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    parts.push(part(new SphereGeometry(1, 5, 3), BOUQUET.leaf, {
      position: [Math.cos(a) * 0.1, 0.19, Math.sin(a) * 0.1], rotation: [Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8], scale: [0.03, 0.065, 0.014],
    }));
  }
  const mesh = new Mesh(mergeParts(moveParts(parts, { scale: BOUQUET.SCALE })), MATERIALS.solid);
  mesh.name = 'finale-bouquet';
  mesh.castShadow = true;
  mesh.visible = false;
  return mesh;
}

// --- Hearts ------------------------------------------------------------------------------------------------------

/** The hearts that rise between them: how many, how far apart they set off (s), how long each takes (s), how high (m). */
const HEARTS = Object.freeze({ COUNT: 10, STAGGER: 0.3, LIFE: 3.0, RISE: 2.3, FROM: 1.3, SIZE: 0.22 });
const HEART_COLOURS = ['#ff7aa2', '#ff5c8a', '#ffb3c6', '#f06292', '#ff8fab'];

/** A lit material whose instances each fade by their own `aFade` (0 to 1), and glow a little in their own colour. */
function fadingMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;')
      // A little glow of their own, so they stay bright and sweet on their shaded side too.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.45;');
  };
  material.customProgramCacheKey = () => 'finale-fading';
  return material;
}

function createHearts() {
  const shape = new ExtrudeGeometry(heartShape(0.5), {
    depth: 0.32, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 2, curveSegments: 8,
  });
  const geometry = mergeParts([part(shape, '#ffffff', { position: [0, 0, -0.16] })]);
  geometry.setAttribute('aFade', new InstancedBufferAttribute(new Float32Array(HEARTS.COUNT), 1));
  const mesh = new InstancedMesh(geometry, fadingMaterial(), HEARTS.COUNT);
  mesh.name = 'finale-hearts';
  mesh.frustumCulled = false;
  mesh.visible = false;
  const colour = new Color();
  for (let i = 0; i < HEARTS.COUNT; i++) mesh.setColorAt(i, colour.set(HEART_COLOURS[i % HEART_COLOURS.length]));
  return mesh;
}

// --- Fireworks ---------------------------------------------------------------------------------------------------

/**
 * Soft pastel fireworks over the town: up to MAX bursts, one every STAGGER seconds, each relaunching every PERIOD.
 * A burst's shell rises for RISE seconds from LAUNCH metres below where it blooms, then SPARKS sparks spread to
 * RADIUS metres, droop and fade out over FADE seconds. Each relaunch blooms somewhere new in the AREA (along,
 * right and up ranges in the station's frame: across the track and well beyond it, over the rooftops).
 */
const FIREWORKS = Object.freeze({
  MAX: 4, LOW: 2, STAGGER: 0.8, PERIOD: 3.2, RISE: 0.7, LAUNCH: 7, TRAIL: 8, SPARKS: 110, RADIUS: 5.4, FADE: 2.3,
  SIZE: 1.25, AREA: { along: [24, 44], right: [-34, -56], up: [6, 9.5] },
});

/**
 * Colour pairs; a spark's colour lies between its burst's two. They are deeper than pastel because they are added
 * to the pink dusk sky, which lifts them to soft pastels; paler ones would only turn white.
 */
const FIREWORK_COLOURS = [
  ['#ff3d7f', '#ff8fb8'], ['#7b4dff', '#3fa9ff'], ['#ffb000', '#ff7a3d'], ['#20d39b', '#8ee04a'],
  ['#ff5470', '#c44dff'], ['#3fc6ff', '#9d6bff'],
].map((pair) => pair.map((hex) => new Color(hex)));

const fireworkVertex = /* glsl */ `
attribute vec3 aDir;
attribute float aBurst;
attribute float aSeed;
attribute float aTrail;

uniform vec3 uCenter[${FIREWORKS.MAX}];
uniform vec3 uColorA[${FIREWORKS.MAX}];
uniform vec3 uColorB[${FIREWORKS.MAX}];
uniform float uAge[${FIREWORKS.MAX}];
uniform float uHalfHeight;
uniform float uSize;

varying vec3 vColor;
varying float vAlpha;

void main() {
  int b = int(aBurst + 0.5);
  float age = uAge[b];
  vec3 centre = uCenter[b];
  vec3 colour = mix(uColorA[b], uColorB[b], aSeed);
  vec3 p = centre;
  float alpha = 0.0;
  float size = uSize;
  if (aTrail > 0.0) {
    // The rising shell and its little trail: each trail point follows a moment behind the one before.
    float t = clamp((age - aTrail * 0.035) / ${FIREWORKS.RISE.toFixed(2)}, 0.0, 1.0);
    float rise = 1.0 - (1.0 - t) * (1.0 - t);
    p = centre + vec3(0.0, -${FIREWORKS.LAUNCH.toFixed(1)} * (1.0 - rise), 0.0);
    alpha = (age > 0.0 && age < ${FIREWORKS.RISE.toFixed(2)}) ? (1.0 - aTrail / ${(FIREWORKS.TRAIL + 1).toFixed(1)}) * 0.85 : 0.0;
    size = uSize * (0.75 - 0.05 * aTrail);
    colour = mix(colour, vec3(1.0, 0.95, 0.85), 0.6);
  } else {
    float e = age - ${FIREWORKS.RISE.toFixed(2)};
    if (e > 0.0) {
      float r = ${FIREWORKS.RADIUS.toFixed(2)} * (0.82 + 0.36 * aSeed) * (1.0 - exp(-3.0 * e));
      p = centre + aDir * r - vec3(0.0, 0.55 * e * e, 0.0);
      float twinkle = 0.78 + 0.22 * sin(e * 23.0 + aSeed * 40.0);
      alpha = (1.0 - smoothstep(0.75, ${FIREWORKS.FADE.toFixed(2)}, e)) * twinkle * smoothstep(0.0, 0.06, e);
      size = uSize * (1.0 - 0.45 * smoothstep(0.0, ${FIREWORKS.FADE.toFixed(2)}, e));
      colour = mix(colour, vec3(1.0), 0.6 * exp(-8.0 * e));
    }
  }
  vColor = colour;
  vAlpha = alpha;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = alpha > 0.0 ? size * projectionMatrix[1][1] * uHalfHeight / max(-mvPosition.z, 0.1) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fireworkFragment = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  // A soft spark: not too bright at its heart, so its colour still shows when added to the pink sky.
  float glow = 0.75 * exp(-r * r * 6.0) + 0.25 * (1.0 - smoothstep(0.0, 1.0, r));
  float alpha = glow * vAlpha;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.2 * exp(-r * r * 20.0)), alpha);
  #include <colorspace_fragment>
}
`;

/** A number from 0 to 1 for the integers (a, b), the same every time. */
function hash01(a, b) {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A number in [range[0], range[1]] for the integers (a, b), the same every time. */
const pick = (range, a, b) => range[0] + (range[1] - range[0]) * hash01(a, b);

function createFireworks() {
  const perBurst = FIREWORKS.TRAIL + FIREWORKS.SPARKS;
  const count = FIREWORKS.MAX * perBurst;
  const dirs = new Float32Array(count * 3);
  const burst = new Float32Array(count);
  const seed = new Float32Array(count);
  const trail = new Float32Array(count);
  const rng = createRng(365);
  const dir = new Vector3();
  for (let b = 0; b < FIREWORKS.MAX; b++) {
    for (let j = 0; j < perBurst; j++) {
      const i = b * perBurst + j;
      burst[i] = b;
      seed[i] = rng();
      if (j < FIREWORKS.TRAIL) {
        trail[i] = j + 1;
      } else {
        // Evenly spread over a sphere (a Fibonacci lattice), with a little jitter.
        const k = j - FIREWORKS.TRAIL + 0.5;
        const y = 1 - (2 * k) / FIREWORKS.SPARKS;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        const a = k * 2.399963 + rngRange(rng, -0.08, 0.08);
        dir.set(Math.cos(a) * ring, y, Math.sin(a) * ring).normalize();
        dir.toArray(dirs, i * 3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aDir', new BufferAttribute(dirs, 3));
  geometry.setAttribute('aBurst', new BufferAttribute(burst, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geometry.setAttribute('aTrail', new BufferAttribute(trail, 1));
  const uniforms = {
    uCenter: { value: Array.from({ length: FIREWORKS.MAX }, () => new Vector3()) },
    uColorA: { value: Array.from({ length: FIREWORKS.MAX }, () => new Color()) },
    uColorB: { value: Array.from({ length: FIREWORKS.MAX }, () => new Color()) },
    uAge: { value: new Array(FIREWORKS.MAX).fill(-1) },
    uHalfHeight: { value: 400 },
    uSize: { value: FIREWORKS.SIZE },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: fireworkVertex, fragmentShader: fireworkFragment,
    transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
  });
  const points = new Points(geometry, material);
  points.name = 'finale-fireworks';
  points.frustumCulled = false; // the sparks are placed in the shader
  points.visible = false;
  const bufferSize = new Vector2();
  points.onBeforeRender = (renderer) => {
    uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(bufferSize).y / 2;
  };
  return { points, uniforms };
}

// --- Confetti ----------------------------------------------------------------------------------------------------

/**
 * Confetti fluttering down round the two of them once the fireworks start: MAX pieces (LOW on the low tier), each
 * PIECE metres, falling from FROM metres up over a disc SPREAD metres round them, tumbling as it goes, and
 * shrinking away as it reaches the platform before it starts again from the top.
 */
const CONFETTI = Object.freeze({ MAX: 120, LOW: 50, PIECE: [0.11, 0.075], FROM: [3.4, 6.5], SPREAD: 4.2, FALL: [0.45, 0.8] });
const CONFETTI_COLOURS = ['#ffb3c6', '#ffe08a', '#b5ead7', '#c9b8ff', '#ffc8a2', '#bfe3ff', '#e2b04a', '#ffffff'];

function createConfetti() {
  const [w, h] = CONFETTI.PIECE;
  // A little card, seen from both sides.
  const corners = [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0];
  const back = [];
  for (let i = corners.length - 3; i >= 0; i -= 3) back.push(corners[i], corners[i + 1], corners[i + 2]);
  const geometry = triangleSoup([...corners, ...back], new Array(36).fill(1));
  const mesh = new InstancedMesh(geometry, MATERIALS.solid, CONFETTI.MAX);
  mesh.name = 'finale-confetti';
  mesh.frustumCulled = false;
  mesh.visible = false;
  const rng = createRng(1225);
  const colour = new Color();
  const pieces = [];
  for (let i = 0; i < CONFETTI.MAX; i++) {
    const a = rng() * Math.PI * 2;
    const r = CONFETTI.SPREAD * Math.sqrt(rng());
    const from = rngRange(rng, CONFETTI.FROM[0], CONFETTI.FROM[1]);
    const fall = rngRange(rng, CONFETTI.FALL[0], CONFETTI.FALL[1]);
    const axis = new Vector3(rngRange(rng, -1, 1), rngRange(rng, -1, 1), rngRange(rng, -1, 1)).normalize();
    const life = (from - 0.6) / fall;
    pieces.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r, from, fall, life, axis,
      spin: rngRange(rng, 3, 7), sway: rngRange(rng, 0.15, 0.4), phase: rng() * Math.PI * 2,
      delay: rng() * life * 0.85,
    });
    mesh.setColorAt(i, colour.set(CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]));
  }
  return { mesh, pieces };
}

// --- Posing helpers ----------------------------------------------------------------------------------------------

/** The turn from angle a to angle b (rad) the short way round, `t` of the way. */
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** The heading (rotation about Y) that faces a figure, built facing +Z, along `dir`. */
const headingOf = (dir) => Math.atan2(dir.x, dir.z);

const _aim = new Vector3();

/**
 * Turns a figure's arm (`side` 'left' or 'right') to reach for the world point `target`, `weight` of the way from
 * where its pose left it. The arm's bone hangs down its local -Y from the shoulder; it is turned about X (forward)
 * and then Z (sideways) to point there. Call after `setPose`, with the figure's matrices up to date.
 */
function reachFor(figure, side, target, weight) {
  if (!(weight > 0)) return;
  const arm = figure.parts[`${side}Arm`];
  _aim.copy(target);
  figure.parts.hips.worldToLocal(_aim);
  _aim.sub(arm.position).normalize();
  const x = Math.atan2(-_aim.z, -_aim.y);
  const z = Math.asin(clamp(_aim.x, -1, 1));
  arm.rotation.x += (x - arm.rotation.x) * weight;
  arm.rotation.z += (z - arm.rotation.z) * weight;
}

/** How far a walk swings per metre walked (rad), for his stride and her shorter one. */
const STRIDE = Object.freeze({ HIM: (Math.PI * 2) / 1.15, HER: (Math.PI * 2) / 0.6 });

/**
 * The finale.
 * @param {{ stage: import('../render/stage.js').Stage, path: import('../world/trackPath.js').TrackPath,
 *           layout: import('../world/layout.js').Layout, content: import('../content/normalize.js').Content,
 *           cabin: { setVisible: (visible: boolean) => void }, exterior: import('../three.js').Group }} options
 *   `exterior` is train/exterior.js's train; the finale places it at the station and shows it while it plays.
 * @returns {{ readonly active: boolean, readonly time: number, begin: () => void, update: (dt: number) => string[],
 *             skipTo: (t: number) => void, freeze: (frozen: boolean) => void, reset: () => void,
 *             setQuality: (tier: 'low'|'medium'|'high') => void }}
 *   `begin` swaps her cabin for the train outside and starts the clock at 0. `update` moves the clock on by `dt`
 *   seconds (at most a tenth of a second per frame), draws that instant and returns the events passed on the way
 *   ('hearts', 'fireworks', 'card'), each once. `skipTo` moves the clock to `t`; `freeze` stops it. `reset` puts
 *   her back in her seat with the cabin, as before `begin`. `setQuality` thins the effects on the low tier.
 */
export function createFinale({ stage, path, layout, content, cabin, exterior }) {
  const { scene, camera, rig } = stage;
  const fd = layout.finaleDistance;
  const timeline = createTimeline(finaleTracks(path, fd), EVENTS);

  // The frame of the station: right of the track, up, and along it.
  const side = path.sideAt(fd);
  const ahead = path.tangentAt(fd);
  const up = new Vector3(0, 1, 0);
  const toRight = headingOf(side);
  const glidePoints = [CAMERA.seat, ...CAMERA.via, CAMERA.out].map(([along, right, high]) => path.frameAt(fd + along, right, high));
  const glide = new CatmullRomCurve3(glidePoints, false, 'centripetal');

  // The train outside, where the ride stopped.
  path.frameAt(fd, 0, 0, exterior.position);
  exterior.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(side, up, ahead.clone().negate()));
  exterior.visible = false;
  scene.add(exterior);

  // The two of them, the flowers and the effects. All hidden until `begin`.
  const her = createFigure({ ...content.characters.her, style: 'her' });
  const him = createFigure({ ...content.characters.you, style: 'him' });
  const baseSpread = {};
  for (const [name, figure] of [['her', her], ['him', him]]) {
    figure.group.name = `finale-${name}`;
    figure.group.visible = false;
    figure.group.rotation.order = 'YXZ'; // a heading, then a lean about the figure's own forward axis
    figure.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    baseSpread[name] = { left: figure.parts.leftArm.rotation.z, right: figure.parts.rightArm.rotation.z };
    scene.add(figure.group);
  }
  const bouquet = createBouquet();
  const hearts = createHearts();
  const fireworks = createFireworks();
  const confetti = createConfetti();
  scene.add(bouquet, hearts, fireworks.points, confetti.mesh);
  const effects = [hearts, fireworks.points, confetti.mesh];

  let active = false;
  let time = 0;
  let heard = 0;     // events up to this time have been reported
  let frozen = false;
  let bursts = FIREWORKS.MAX;

  // Per-frame scratch.
  const s = {};
  const before = {};
  const after = {};
  const herAt = new Vector3();
  const himAt = new Vector3();
  const flowers = new Vector3();
  const hand = new Vector3();
  const target = new Vector3();
  const towards = new Vector3();
  const pair = new Vector3();
  const lean = new Vector3();
  const leanTurn = new Quaternion();
  const herStart = path.frameAt(fd + HER.seat[0], HER.seat[1], 0);
  const hisStart = path.frameAt(fd + HIM.door[0], HIM.door[1], 0);
  const middle = path.frameAt(fd + (HER.end[0] + HIM.end[0]) / 2, (HER.end[1] + HIM.end[1]) / 2, 0);
  const matrix = new Matrix4();
  const turn = new Quaternion();
  const size = new Vector3();
  const spot = new Vector3();
  const herPose = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0, bob: 0 };
  const hisPose = { leftLeg: 0, rightLeg: 0, leftArm: 0, rightArm: 0, bob: 0 };

  /** How fast (m/s, across the ground) a position track is moving at t. */
  function speedOf(name, t) {
    timeline.sample(t - 0.05, before);
    timeline.sample(t + 0.05, after);
    const a = before[name], b = after[name];
    return Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.1;
  }

  function placeCamera() {
    // A longer lens than her own eyes once outside (`zoom` shares of her view's tan(fov / 2)).
    camera.fov = (360 / Math.PI) * Math.atan(s.zoom * Math.tan((fovForAspect(camera.aspect) * Math.PI) / 360));
    camera.updateProjectionMatrix();
    if (s.glide < 1) {
      glide.getPointAt(s.glide, camera.position);
    } else {
      const [dAlong, dRight, dUp] = s.drift;
      camera.position.fromArray(s.camera).addScaledVector(ahead, dAlong).addScaledVector(side, dRight).addScaledVector(up, dUp);
    }
    // What it looks at, pulled towards the two of them while he walks over.
    pair.copy(herAt).lerp(himAt, s.followBias);
    pair.y = (herAt.y + himAt.y) / 2 + 0.5;
    target.fromArray(s.look).lerp(pair, s.follow);
    camera.lookAt(target);
    // Then turn it so that what it looks at sits frameY of the way up (or down) the screen. A wide screen has the
    // card on the right (styles.css), so there they move over to the left of it instead of up above it.
    let frameY = s.frameY;
    let frameX = 0;
    if (camera.aspect > WIDE) {
      const card = clamp((s.frameY - CAMERA.frameY) / (CAMERA.cardY - CAMERA.frameY), 0, 1);
      frameY = CAMERA.frameY * (1 - card);
      frameX = CAMERA.wideX * card;
    }
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    camera.rotateY(Math.atan(frameX * tanHalf * camera.aspect));
    camera.rotateX(-Math.atan(frameY * tanHalf));
    camera.updateMatrixWorld();
  }

  function poseHer(t) {
    const g = her.group;
    g.position.set(s.her[0], s.herUp, s.her[2]);
    // She faces the doorway until she has landed, then turns to him; once she holds the flowers she turns part of
    // the way back towards the camera, beaming, as if for a photo.
    towards.subVectors(himAt, herAt);
    let heading = lerpAngle(toRight, headingOf(towards), smoothstep(HOP.land + 0.15, T.herStepEnd + 0.6, t));
    towards.subVectors(camera.position, herAt);
    heading = lerpAngle(heading, headingOf(towards), 0.4 * smoothstep(T.handoffEnd + 0.2, T.handoffEnd + 1.2, t));
    g.rotation.set(0, heading, 0);
    Object.assign(herPose, walkPose(0, 0));
    let squash = 1;
    const airborne = t >= HOP.takeoff && t < HOP.land;
    if (!airborne && ((t > T.herStepStart && t < HOP.takeoff) || (t > HOP.settle && t < T.herStepEnd + 0.1))) {
      // Little steps: to the edge of the doorway, and on along the platform after landing.
      const walked = Math.hypot(s.her[0] - herStart.x, s.her[2] - herStart.z);
      Object.assign(herPose, walkPose(walked * STRIDE.HER, clamp(speedOf('her', t) / 0.8, 0, 1)));
    }
    if (t >= HOP.edge && t < HOP.takeoff) {
      // Crouching to spring, arms swung back.
      const c = Math.sin(Math.PI * clamp((t - HOP.edge) / (HOP.takeoff - HOP.edge + 0.04), 0, 1));
      squash = 1 - 0.12 * c;
      herPose.leftArm = herPose.rightArm = -0.6 * c;
    } else if (airborne) {
      // In the air: arms up with joy, one knee forward, a little stretched.
      const u = (t - HOP.takeoff) / (HOP.land - HOP.takeoff);
      const lift = Math.sin(Math.PI * clamp(u * 1.6, 0, 1));
      herPose.leftArm = herPose.rightArm = 2.1 * lift + 0.4;
      herPose.leftLeg = 0.45 * Math.sin(Math.PI * u);
      herPose.rightLeg = -0.2 * Math.sin(Math.PI * u);
      squash = 1 + 0.06 * Math.sin(Math.PI * u);
    } else if (t >= HOP.land && t < HOP.settle + 0.15) {
      // Landing: a squash that springs back.
      const c = Math.sin(Math.PI * clamp((t - HOP.land) / (HOP.settle + 0.15 - HOP.land), 0, 1));
      squash = 1 - 0.13 * c;
      herPose.leftArm = herPose.rightArm = 0.9 * (1 - clamp((t - HOP.land) / 0.3, 0, 1)) + 0.3 * c;
    } else if (t >= T.herStepEnd) {
      // Waiting for him: up on her toes, a happy little bounce.
      herPose.bob = 0.012 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 1.3));
    } else if (t < T.herStepStart) {
      herPose.bob = 0.006 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.6));
    }
    g.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    her.setPose(herPose);
    her.parts.leftArm.rotation.z = baseSpread.her.left;
    her.parts.rightArm.rotation.z = baseSpread.her.right;

    // Her head tilts as he comes near, and stays tilted, happy.
    const tilt = smoothstep(T.himWalkEnd - 1, T.handoffEnd, t);
    her.parts.head.rotation.set(0.08 * tilt, 0, 0.14 * tilt + 0.04 * tilt * Math.sin(t * 1.7));
    // A gentle sway once she holds the flowers.
    const sway = smoothstep(T.handoffEnd, T.handoffEnd + 0.8, t);
    g.rotation.z = 0.05 * sway * Math.sin((t - T.handoffEnd) * 2.4);
    g.updateMatrixWorld(true);

    // Hands: clasped in front while she waits, then reaching for the flowers and holding them close.
    if (t >= T.herStepEnd) {
      const clasp = smoothstep(T.herStepEnd, T.herStepEnd + 0.6, t) * (1 - smoothstep(T.handoffStart + 0.1, T.handoffStart + 0.5, t));
      if (clasp > 0) {
        her.parts.hips.localToWorld(spot.set(0, 0.06, 0.2));
        reachFor(her, 'left', spot, clasp);
        reachFor(her, 'right', spot, clasp);
      }
      const hold = smoothstep(T.handoffStart + 0.15, T.handoffStart + 0.6, t);
      if (hold > 0) {
        reachFor(her, 'left', flowers, hold);
        reachFor(her, 'right', flowers, hold);
      }
    }
  }

  function poseHim(t) {
    const g = him.group;
    g.position.fromArray(s.him);
    // He watches her: facing her while he waits by the door, as he walks over and as he gives her the flowers.
    towards.subVectors(herAt, himAt);
    g.rotation.set(0, headingOf(towards), 0);
    const speed = speedOf('him', t);
    if (t > T.himWalkStart && t < T.himWalkEnd) {
      const walked = Math.hypot(s.him[0] - hisStart.x, s.him[2] - hisStart.z);
      Object.assign(hisPose, walkPose(walked * STRIDE.HIM, clamp(speed / 0.9, 0, 1)));
      // A happy bounce in his step.
      hisPose.bob *= 1.6;
    } else {
      Object.assign(hisPose, walkPose(0, 0));
      hisPose.bob = 0.006 * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 0.55 + 1));
    }
    him.setPose(hisPose);
    him.parts.leftArm.rotation.z = baseSpread.him.left;
    him.parts.rightArm.rotation.z = baseSpread.him.right;
    // After giving the flowers he tucks his hands behind his back, head tilted towards her, shy and pleased.
    const shy = smoothstep(T.handoffEnd - 0.2, T.handoffEnd + 0.6, t);
    him.parts.head.rotation.set(0.05 * shy, 0, -0.13 * shy);
    g.rotation.z = -0.04 * shy * Math.sin((t - T.handoffEnd) * 2.4 + 0.8);
    g.updateMatrixWorld(true);
    if (shy > 0) {
      him.parts.hips.localToWorld(spot.set(0, 0.02, -0.22));
      reachFor(him, 'left', spot, shy);
      reachFor(him, 'right', spot, shy);
    }
  }

  /**
   * The bouquet: in his right hand, held out towards her, until the hand-off; then along its track into her
   * hands, leaning away from whoever holds it so the blooms face the other.
   */
  function placeBouquet(t) {
    // His right arm reaches for where the track holds the bouquet; it sits in his hand from there.
    const holding = 1 - smoothstep(T.handoffStart + 0.45, T.handoffEnd, t);
    target.fromArray(s.bouquet);
    if (holding > 0) {
      reachFor(him, 'right', target, holding);
      him.group.updateMatrixWorld(true);
    }
    him.parts.rightHand.getWorldPosition(hand);
    const onTrack = smoothstep(T.handoffStart, T.handoffStart + 0.45, t);
    flowers.copy(hand).lerp(target, onTrack);
    if (t >= T.handoffEnd) flowers.y += herPose.bob;
    bouquet.position.copy(flowers);
    // Leaning: his way while he holds it out, hers once she has it (through upright on the way).
    const hisWay = towards.subVectors(herAt, himAt).setY(0).normalize();
    lean.copy(hisWay).multiplyScalar(1 - 2 * smoothstep(T.handoffStart, T.handoffEnd, t)).multiplyScalar(0.38).add(up).normalize();
    leanTurn.setFromUnitVectors(up, lean);
    bouquet.quaternion.copy(leanTurn);
  }

  function updateHearts(t) {
    const age = t - T.hearts;
    hearts.visible = age > 0;
    if (!hearts.visible) return;
    const fade = hearts.geometry.attributes.aFade;
    for (let i = 0; i < HEARTS.COUNT; i++) {
      const since = age - i * HEARTS.STAGGER;
      if (since < 0) {
        fade.array[i] = 0;
        hearts.setMatrixAt(i, matrix.makeScale(0, 0, 0));
        continue;
      }
      const cycle = Math.floor(since / HEARTS.LIFE);
      const u = (since % HEARTS.LIFE) / HEARTS.LIFE;
      const jitter = hash01(i, cycle) - 0.5;
      const depth = hash01(i + 40, cycle) - 0.5;
      // From between them, fanning out as they rise, swaying, slowing as they go.
      const rise = HEARTS.RISE * (0.8 + 0.35 * hash01(i + 120, cycle));
      spot.copy(middle)
        .addScaledVector(ahead, jitter * (0.3 + 1.1 * u) + 0.16 * Math.sin(u * 6.5 + i * 2.1))
        .addScaledVector(side, depth * (0.2 + 0.6 * u));
      spot.y = HEARTS.FROM + rise * (1 - (1 - u) * (1 - u) * 0.6 - 0.4 * (1 - u));
      const grow = smoothstep(0, 0.12, u);
      const scale = HEARTS.SIZE * (0.75 + 0.5 * hash01(i + 80, cycle)) * grow * (1 - 0.35 * smoothstep(0.7, 1, u));
      // Facing the camera, wobbling.
      towards.subVectors(camera.position, spot);
      turn.setFromAxisAngle(up, headingOf(towards) + 0.5 * Math.sin(u * 6 + i * 1.3));
      hearts.setMatrixAt(i, matrix.compose(spot, turn, size.setScalar(scale)));
      fade.array[i] = 1 - smoothstep(0.55, 1, u);
    }
    hearts.instanceMatrix.needsUpdate = true;
    fade.needsUpdate = true;
  }

  function updateFireworks(t) {
    const age = t - T.fireworks;
    fireworks.points.visible = age > 0;
    if (!fireworks.points.visible) return;
    const { uCenter, uColorA, uColorB, uAge } = fireworks.uniforms;
    const { along, right, up: high } = FIREWORKS.AREA;
    for (let b = 0; b < FIREWORKS.MAX; b++) {
      const since = age - b * FIREWORKS.STAGGER;
      if (b >= bursts || since < 0) {
        uAge.value[b] = -1;
        continue;
      }
      // Each launch of a burst blooms somewhere new, in new colours.
      const launch = Math.floor(since / FIREWORKS.PERIOD);
      uAge.value[b] = since % FIREWORKS.PERIOD;
      path.frameAt(fd + pick(along, b * 7 + 1, launch), pick(right, b * 7 + 2, launch), pick(high, b * 7 + 3, launch), uCenter.value[b]);
      const colours = FIREWORK_COLOURS[Math.floor(hash01(b * 7 + 4, launch) * FIREWORK_COLOURS.length)];
      uColorA.value[b].copy(colours[0]);
      uColorB.value[b].copy(colours[1]);
    }
  }

  function updateConfetti(t) {
    const age = t - T.fireworks;
    confetti.mesh.visible = age > 0;
    if (!confetti.mesh.visible) return;
    for (let i = 0; i < confetti.mesh.count; i++) {
      const p = confetti.pieces[i];
      const since = age - p.delay;
      if (since < 0) {
        confetti.mesh.setMatrixAt(i, matrix.makeScale(0, 0, 0));
        continue;
      }
      const a = since % p.life;
      spot.copy(middle)
        .addScaledVector(ahead, p.x + p.sway * Math.sin(a * 1.9 + p.phase))
        .addScaledVector(side, p.z + p.sway * Math.cos(a * 1.5 + p.phase));
      spot.y = p.from - p.fall * a;
      turn.setFromAxisAngle(p.axis, p.spin * a + p.phase);
      const shown = smoothstep(0, 0.4, since) * (1 - smoothstep(p.life - 0.5, p.life, a));
      confetti.mesh.setMatrixAt(i, matrix.compose(spot, turn, size.setScalar(shown)));
    }
    confetti.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Draws instant `t`. */
  function draw(t) {
    timeline.sample(t, s);
    herAt.set(s.her[0], s.herUp, s.her[2]);
    himAt.fromArray(s.him);
    placeCamera();
    // His pose first, so that the bouquet can sit in his hand; hers last, so that she can reach for it.
    poseHim(t);
    placeBouquet(t);
    poseHer(t);
    updateHearts(t);
    updateFireworks(t);
    updateConfetti(t);
  }

  function setShown(shown) {
    exterior.visible = shown;
    her.group.visible = shown;
    him.group.visible = shown;
    bouquet.visible = shown;
    if (!shown) for (const effect of effects) effect.visible = false;
  }

  return {
    get active() { return active; },
    get time() { return time; },
    begin() {
      active = true;
      time = 0;
      heard = 0;
      frozen = false;
      cabin.setVisible(false);
      setShown(true);
      scene.add(camera); // off her seat: the finale moves the camera itself
      draw(0);
    },
    update(dt) {
      if (!active) return [];
      if (!frozen && dt > 0) time += Math.min(dt, 0.1);
      draw(time);
      const fired = timeline.events(heard, time);
      heard = Math.max(heard, time);
      return fired;
    },
    skipTo(t) {
      if (Number.isFinite(t)) time = Math.max(0, t);
    },
    freeze(value) {
      frozen = Boolean(value);
    },
    reset() {
      active = false;
      time = 0;
      heard = 0;
      frozen = false;
      setShown(false);
      cabin.setVisible(true);
      rig.add(camera);
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
      camera.fov = fovForAspect(camera.aspect);
      camera.updateProjectionMatrix();
    },
    setQuality(tier) {
      const low = tier === 'low';
      bursts = low ? FIREWORKS.LOW : FIREWORKS.MAX;
      confetti.mesh.count = low ? CONFETTI.LOW : CONFETTI.MAX;
    },
  };
}
