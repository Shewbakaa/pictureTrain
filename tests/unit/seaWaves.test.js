// The sea's waves (site/src/world/seaWaves.js): the JS mirror of the shaders' shapes, the clock that keeps them
// in time with the waves she hears, and the material's patch of three.js's own Lambert shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crestDepth, crestLife, followWave, SEA_MATERIAL, SEA_WAVES, seaRise, surge, updateSea, wavePhase,
} from '../../site/src/world/seaWaves.js';
import { DRESSING } from '../../site/src/world/dressing.js';
import { TERRAIN } from '../../site/src/world/terrain.js';
import { ShaderLib, UniformsUtils } from '../../site/src/three.js';

const phases = (step = 0.002) => Array.from({ length: Math.round(1 / step) }, (_, i) => i * step);

test('no wave ever covers ground a prop may stand on', () => {
  // The dressing keeps every prop on ground at least DRY high (10 cm above the still sea), so the sea, however its
  // waves move it, must stay below that wherever the ground is that high.
  const room = DRESSING.DRY - TERRAIN.WATER_LEVEL;
  let most = -Infinity;
  for (let depth = -1; depth <= -room; depth += 0.01) {
    for (const phase of phases(0.005)) {
      for (let time = 0; time < 30; time += 0.73) most = Math.max(most, seaRise(400, 15, depth, time, phase, 400));
    }
  }
  assert.ok(most < room - 0.01, `the water rises ${most.toFixed(3)} m over dry ground, ${room} m would wet a prop`);
});

test('a wave draws back as it builds, then rushes up the sand as it breaks, and slides back, smoothly round', () => {
  const { BREAK, RUSHED, DRAW, RUN } = SEA_WAVES;
  assert.ok(Math.abs(surge(BREAK - 1e-9) + DRAW) < 1e-6, 'drawn furthest back as it breaks');
  assert.ok(Math.abs(surge(RUSHED) - RUN) < 1e-9, 'furthest up the sand');
  let last = surge(0);
  for (const phase of [...phases(), 1 - 1e-9]) {
    assert.ok(Math.abs(surge(phase) - last) < 0.004, `no jump at ${phase}`);
    last = surge(phase);
  }
  assert.ok(Math.abs(surge(1 - 1e-9) - surge(0)) < 1e-6, 'one wave ends where the next begins');
});

test('the coming crest rolls in from deep water to the waterline, and is gone as it breaks', () => {
  assert.equal(crestDepth(0), SEA_WAVES.CREST_FROM);
  assert.equal(crestDepth(SEA_WAVES.BREAK), 0);
  for (const phase of phases()) {
    if (phase > 0) assert.ok(crestDepth(phase) <= crestDepth(phase - 0.002), 'it only comes in');
    if (phase >= SEA_WAVES.BREAK) assert.equal(crestLife(phase), 0);
  }
  assert.equal(crestLife(0), 0);
  assert.ok(crestLife(0.5 * SEA_WAVES.BREAK) > 0.99, 'whole on its way in');
});

test('out in the bay the sea swells and moves; by the waterline it only rises and falls with the waves', () => {
  const at = (depth, time) => seaRise(400, 40, depth, time, 0.3, 400);
  const deep = [0, 1, 2, 3].map((time) => at(1.9, time));
  assert.ok(Math.max(...deep) - Math.min(...deep) > 0.05, `the bay moves: ${deep}`);
  assert.ok(Math.max(...deep.map(Math.abs)) <= SEA_WAVES.SWELL + 1e-9);
  const shallow = [0, 1, 2, 3].map((time) => at(0.1, time));
  assert.ok(Math.max(...shallow) - Math.min(...shallow) < 1e-9, 'no swell in the shallows, only the wave');
});

test('each wave runs along the beach at a slant: a little later further on', () => {
  assert.equal(wavePhase(2.25, 400, 400), 0.25, 'where she is, the wave is where the count says');
  assert.ok(Math.abs(wavePhase(2.25, 400 + SEA_WAVES.LAG / 4, 400)) < 1e-9, 'a quarter of LAG on, a quarter wave behind');
  assert.ok(Math.abs(wavePhase(2.25, 400 + SEA_WAVES.LAG, 400) - 0.25) < 1e-9, 'a whole wave behind LAG on');
});

test('with none heard the waves keep their own time, one every PERIOD seconds', () => {
  let wave = 0;
  for (let i = 0; i < 600; i++) wave = followWave(wave, 1 / 60, NaN);
  assert.ok(Math.abs(wave - 10 / SEA_WAVES.PERIOD) < 1e-9);
});

test('the seen waves fall in with the heard ones gently, the shorter way round, and then keep with them', () => {
  const { PERIOD, SLEW } = SEA_WAVES;
  const dt = 1 / 60;
  // Heard waves of 9.6 s, a third of a wave ahead of the seen ones.
  let heard = 5 + 1 / 3;
  let wave = 0;
  let caught = null;
  for (let i = 0; i < 60 * 30; i++) {
    heard += dt / 9.6;
    const before = wave;
    wave = followWave(wave, dt, heard);
    const speed = (wave - before) / dt;
    assert.ok(Math.abs(speed - 1 / PERIOD) <= SLEW + 1e-9, `never more than SLEW faster or slower: ${speed}`);
    const off = Math.abs(heard - wave - Math.round(heard - wave));
    if (caught === null && off < 1e-3) caught = i * dt;
    if (caught !== null) assert.ok(off < 1e-3, 'and stays in step');
  }
  assert.ok(caught !== null && caught < 10, `in step after ${caught} s`);

  // A heard wave just behind the seen one (0.9 against 0.05 of a wave): the seen one waits, it does not run on.
  const next = followWave(7.05, 0.1, 3.9);
  assert.ok(next < 7.05 + 0.1 / PERIOD, `it slowed: ${next}`);
});

test('the sea material moves and foams three.js\'s own Lambert shaders, compiled once for every sea', () => {
  const shader = {
    uniforms: UniformsUtils.clone(ShaderLib.lambert.uniforms),
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  SEA_MATERIAL.onBeforeCompile(shader);
  assert.match(shader.vertexShader, /attribute vec3 seaPlace;/);
  assert.match(shader.vertexShader, /#include <begin_vertex>\s+vSeaPlace = seaPlace;\s+vSeaRise = seaRise\(seaPlace\);\s+transformed\.y \+= vSeaRise;/);
  assert.match(shader.fragmentShader, /#include <color_fragment>\s+\{[\s\S]*diffuseColor\.rgb = mix\(diffuseColor\.rgb, uSeaFoam/);
  assert.equal(SEA_MATERIAL.flatShading, true, 'shaded from the moved faces');
  assert.equal(SEA_MATERIAL.vertexColors, true);
  assert.equal(SEA_MATERIAL.customProgramCacheKey(), 'sea-waves');
  updateSea(12.5, 3.25, 400);
  assert.equal(shader.uniforms.uSeaTime.value, 12.5);
  assert.equal(shader.uniforms.uSeaWave.value, 3.25);
  assert.equal(shader.uniforms.uSeaHere.value, 400);
  assert.ok(shader.uniforms.uSeaFoam.value.r > 0.8, 'the foam is near white');
});
