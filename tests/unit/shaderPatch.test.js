// The helpers that patch three.js's own shaders (the sea, the wind, the birds).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addAfter, glslFloat } from '../../site/src/render/shaderPatch.js';

test('a number is written as a GLSL float, whole numbers included', () => {
  assert.equal(glslFloat(2), '2.0');
  assert.equal(glslFloat(-7), '-7.0');
  assert.equal(glslFloat(0.06), '0.06');
  assert.equal(glslFloat(1e-7), '1e-7');
  assert.equal(glslFloat(6.5), '6.5');
});

test('code goes in after each named chunk, in turn', () => {
  const source = 'a\n#include <common>\nb\n#include <begin_vertex>\nc';
  const patched = addAfter('test', source, [['#include <common>', 'uniform float u;'], ['#include <begin_vertex>', 'x += u;']]);
  assert.equal(patched, 'a\n#include <common>\nuniform float u;\nb\n#include <begin_vertex>\nx += u;\nc');
});

test('a chunk three.js no longer has fails loudly, naming who wanted it', () => {
  assert.throws(() => addAfter('birds', 'void main() {}', [['#include <begin_vertex>', 'x;']]), /^Error: birds: the shader has no #include <begin_vertex>$/);
});
