// The stage: the WebGL2 canvas and renderer, the scene, and the camera on its rig. Also the two materials that
// everything built in code is drawn with.
//
// The rig is what the app moves along the track (her seat); the camera sits on it at its origin and only
// turns, so she can look around without leaving her seat. The cabin (Task 10) hangs on the rig too.
//
// Creating the materials touches no DOM, so this module can be imported by the world builders and by the Node
// unit tests; only `createStage` needs a browser.

import {
  MeshBasicMaterial, MeshLambertMaterial, NoToneMapping, Object3D, PCFShadowMap, PerspectiveCamera, Scene,
  SRGBColorSpace, WebGLRenderer,
} from '../three.js';
import { fovForAspect } from '../ride/look.js';

/**
 * The shared materials. `solid` is for every lit thing (terrain, track, props, cabin, figures); `glow` is for
 * what should look lit whatever the light (lamp glass, windows). Both take their colours from the geometry's
 * vertex colours, so one material serves every model and the shader is compiled once. The app sets
 * `needsUpdate` on both when shadows are switched on or off.
 */
export const MATERIALS = Object.freeze({
  solid: new MeshLambertMaterial({ vertexColors: true }),
  glow: new MeshBasicMaterial({ vertexColors: true }),
});

/** Camera clipping distances (m). The sky sphere (350 m) sits inside the far plane. */
const NEAR = 0.1;
const FAR = 400;

/**
 * @typedef {{
 *   renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, rig: Object3D,
 *   setPixelRatio: (ratio: number) => void,
 *   resize: () => void,
 *   render: () => void,
 *   info: () => { drawCalls: number, triangles: number },
 *   onContextLost: (fn: () => void) => void,
 * }} Stage
 *   `resize` fits the canvas and the camera to the container; it does nothing if the size has not changed, so
 *   it is cheap to call often. `info` counts what the last `render` drew (the shadow pass not included).
 *   `onContextLost` calls `fn` when the browser takes the GPU away (a locked phone, memory pressure).
 */

/**
 * @param {HTMLElement} container  the canvas fills it
 * @param {{ antialias?: boolean }} [options]
 * @returns {Stage|null}  null when the browser cannot give a WebGL2 context
 */
export function createStage(container, { antialias = true } = {}) {
  const canvas = document.createElement('canvas');
  let context = null;
  try {
    // No alpha: the sky covers every pixel, and an opaque canvas is cheaper for the page to composite.
    context = canvas.getContext('webgl2', { alpha: false, antialias, depth: true, stencil: false });
  } catch {
    context = null;
  }
  if (!context) return null;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, context, antialias });
  } catch (error) {
    console.warn('[stage] WebGL2 is there but the renderer could not start:', error);
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.enabled = false; // the quality tier decides
  container.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(fovForAspect(1), 1, NEAR, FAR);
  const rig = new Object3D();
  rig.add(camera);
  scene.add(rig);

  let width = 0;
  let height = 0;
  function resize() {
    // An in-app browser can report a size of 0 for a moment while it lays the page out.
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    renderer,
    scene,
    camera,
    rig,
    setPixelRatio(ratio) {
      renderer.setPixelRatio(ratio);
    },
    resize,
    render() {
      renderer.render(scene, camera);
    },
    info() {
      return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    onContextLost(fn) {
      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault(); // lets the browser give the context back later
        fn();
      });
    },
  };
}
