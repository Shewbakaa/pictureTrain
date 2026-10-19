// The sky: a big sphere round the camera, painted from the horizon colour up to the zenith colour of the zone.
//
// The sphere moves with the camera, so the sky never comes any closer. It is not fogged: each zone's horizon
// colour is also its fog colour (zones.js), so the far ground melts into it. Below the horizon it stays the
// horizon colour all the way down, so wherever the ground runs out the gap reads as haze, not a void.
//
// The colours are linear (from environment.js) and the shader converts them for the screen. A touch of
// dithering keeps the long, soft gradient from banding on 8-bit screens.
//
// DOM-free (only Three's classes are used), so it can be imported anywhere.

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from '../three.js';

export const SKY = Object.freeze({
  RADIUS: 350,   // m; inside the camera's far plane (400 m)
  SOFTNESS: 0.35, // gradient exponent: below 1 the zenith colour takes over quickly above the horizon
});

const vertexShader = /* glsl */ `
varying vec3 vDirection;

void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>

uniform vec3 topColor;
uniform vec3 horizonColor;
uniform float softness;
varying vec3 vDirection;

void main() {
  float up = max(normalize(vDirection).y, 0.0);
  gl_FragColor = vec4(mix(horizonColor, topColor, pow(up, softness)), 1.0);
  #include <colorspace_fragment>
  #include <dithering_fragment>
}
`;

/**
 * @returns {{ mesh: Mesh, update: (env: import('./environment.js').Env, cameraPosition: import('../three.js').Vector3) => void }}
 *   Call `update` every frame with the environment where the train is and the camera's world position.
 */
export function createSky() {
  const uniforms = {
    topColor: { value: new Color() },
    horizonColor: { value: new Color() },
    softness: { value: SKY.SOFTNESS },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
    dithering: true,
  });
  const mesh = new Mesh(new SphereGeometry(SKY.RADIUS, 32, 16), material);
  mesh.name = 'sky';
  mesh.renderOrder = -1;       // first, so everything else draws over it
  mesh.frustumCulled = false;  // it is always around the camera

  function update(env, cameraPosition) {
    uniforms.topColor.value.copy(env.skyTop);
    uniforms.horizonColor.value.copy(env.skyHorizon);
    mesh.position.copy(cameraPosition);
  }

  return { mesh, update };
}
