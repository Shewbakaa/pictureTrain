// The finale on a bare stage, for the unit tests: a scene, a camera in her seat on its rig, the train seen from
// outside, and the finale at a Day 365 station 960 m along a track that runs straight through it.
import { createFinale } from '../../site/src/finale/finale.js';
import { createTrainExterior } from '../../site/src/train/exterior.js';
import { createTrackPath } from '../../site/src/world/trackPath.js';
import * as THREE from '../../site/src/three.js';

export const LOOKS = { her: { skin: '#f2c9a5', hair: '#3b2416', outfit: '#e98aa6' }, you: { skin: '#e8b994', hair: '#2a1a10', outfit: '#5b7fc4' } };

/** The track the finale tests use: straight at the start and through the station at 960 m. */
export const FINALE_PATH = createTrackPath(1030, 7, { straightRanges: [[0, 120], [870, 1100]] });

/** A fresh finale on its own stage, on `path`, with `content` (its `characters` are LOOKS unless it gives them). */
export function finaleOnStage(path = FINALE_PATH, content = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(80, 390 / 844, 0.1, 400);
  const rig = new THREE.Object3D();
  rig.add(camera);
  scene.add(rig);
  const cabin = { shown: true, setVisible(v) { this.shown = v; } };
  const exterior = createTrainExterior();
  const finale = createFinale({ stage: { scene, camera, rig }, path, layout: { finaleDistance: 960 }, content: { characters: LOOKS, ...content }, cabin, exterior });
  return { scene, camera, rig, cabin, exterior, finale };
}
