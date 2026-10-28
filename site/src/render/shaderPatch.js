// What the materials that patch three.js's own shaders share (the sea's waves, the wind in the foliage, the birds'
// wings): numbers written into GLSL, and code added after one of three.js's chunks, which fails loudly if a newer
// three.js has renamed it rather than quietly leaving the effect out.
//
// Pure and DOM-free, so the Node unit tests can import it.

/** `x` as a GLSL float literal: a whole number gets its '.0'. */
export function glslFloat(x) {
  const text = String(x);
  return /[.e]/.test(text) ? text : `${text}.0`;
}

/**
 * `source` (a three.js shader) with code added after its chunks: each addition is a chunk, which must be in it, and
 * the code to add after it, in turn.
 * @param {string} who  the module patching, named in the error if a chunk is missing
 * @param {string} source
 * @param {Array<[string, string]>} additions
 */
export function addAfter(who, source, additions) {
  return additions.reduce((text, [chunk, code]) => {
    if (!text.includes(chunk)) throw new Error(`${who}: the shader has no ${chunk}`);
    return text.replace(chunk, `${chunk}\n${code}`);
  }, source);
}
