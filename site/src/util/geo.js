// The toolkit for models built in code: the scenery props, and later the cabin and the little figures.
//
// A model is a handful of simple coloured parts (boxes, cones, spheres...), each placed with a position, a
// rotation and a scale, merged into one geometry. The result is triangle soup (non-indexed): every triangle
// has its own three vertices, carrying the triangle's face normal and the colour of its part. That gives the
// faceted low-poly look with any material (no `flatShading` needed) and one draw call per model, or per batch
// of instances.
//
// Colours are '#rrggbb' sRGB hex (or a THREE.Color) and go through THREE.Color, so the vertex colours are linear.
//
// Pure and DOM-free (only Three's maths and geometry classes are used), so the Node unit tests can import it.

import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, SRGBColorSpace, Vector3 } from '../three.js';
import { rngRange } from './rng.js';

/**
 * @typedef {{ position?: number[], rotation?: Array<number|string>, scale?: number|number[] }} Transform
 *   `position` is [x, y, z] in metres. `rotation` is [x, y, z] Euler angles in radians, in Three's default XYZ
 *   order unless a fourth item names another ('YXZ', ...). `scale` is one factor for all three axes or [x, y, z].
 *   A part is scaled first, then rotated, then moved.
 * @typedef {{ geometry: BufferGeometry, color: Color, matrix: Matrix4 }} Part
 *   One coloured piece of a model. Its geometry is only read, when the parts are merged, so one geometry can
 *   serve any number of parts.
 */

// Scratch objects, so building a model allocates little beyond its own arrays.
const _corner = new Vector3();
const _hsl = { h: 0, s: 0, l: 0 };

/** How a mirroring transform lists a triangle's corners, so that it still faces outwards. */
const MIRRORED_CORNERS = [0, 2, 1];

/** The matrix of a Transform. */
function matrixOf({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const factors = typeof scale === 'number' ? [scale, scale, scale] : scale;
  return new Matrix4().compose(
    new Vector3().fromArray(position),
    new Quaternion().setFromEuler(new Euler().fromArray(rotation)),
    new Vector3().fromArray(factors),
  );
}

/** How many vertices a geometry draws: three per triangle. */
const cornerCount = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count);

/**
 * One coloured part of a model.
 * @param {BufferGeometry} geometry  any of Three's geometries (indexed or not); it is not changed
 * @param {string|Color} colorHex  '#rrggbb' sRGB, or a THREE.Color
 * @param {Transform} [transform]
 * @returns {Part}
 */
export function part(geometry, colorHex, transform = {}) {
  return { geometry, color: new Color(colorHex), matrix: matrixOf(transform) };
}

/**
 * The same parts moved together as one piece: `transform` is applied after each part's own placement, as if the
 * parts had been glued together first. Handy for building something at the origin and then placing it.
 * @param {Part[]} parts  not changed
 * @param {Transform} transform
 * @returns {Part[]}
 */
export function moveParts(parts, transform) {
  const matrix = matrixOf(transform);
  return parts.map((p) => ({ geometry: p.geometry, color: p.color, matrix: matrix.clone().multiply(p.matrix) }));
}

/**
 * All the parts as one non-indexed geometry with `position`, flat `normal` and linear `color` attributes and its
 * bounding box and sphere computed.
 * @param {Part[]} parts
 * @returns {BufferGeometry}
 */
export function mergeParts(parts) {
  let count = 0;
  for (const { geometry } of parts) count += cornerCount(geometry);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let at = 0;
  for (const { geometry, color, matrix } of parts) {
    const source = geometry.attributes.position;
    const { index } = geometry;
    // A mirroring scale turns every triangle inside out; listing its corners the other way round turns it back.
    const mirrored = matrix.determinant() < 0;
    const corners = cornerCount(geometry);
    for (let i = 0; i < corners; i++) {
      const k = mirrored ? i - (i % 3) + MIRRORED_CORNERS[i % 3] : i;
      _corner.fromBufferAttribute(source, index ? index.getX(k) : k).applyMatrix4(matrix).toArray(positions, at * 3);
      color.toArray(colors, at * 3);
      at++;
    }
  }
  return triangleSoup(positions, colors);
}

/**
 * Triangle soup from flat lists of corners, three numbers per corner: each triangle's corners in turn
 * (counter-clockwise seen from the side it faces) and their linear colours. The result is a non-indexed geometry
 * with `position`, flat `normal` and `color` attributes and its bounding box and sphere computed, like `mergeParts`
 * gives. For shapes built straight from points, such as the ground and the track.
 * @param {Float32Array|number[]} positions
 * @param {Float32Array|number[]} colors
 * @returns {BufferGeometry}
 */
export function triangleSoup(positions, colors) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions instanceof Float32Array ? positions : new Float32Array(positions), 3));
  geometry.setAttribute('color', new BufferAttribute(colors instanceof Float32Array ? colors : new Float32Array(colors), 3));
  // On triangle soup no vertex is shared, so this gives each triangle's corners that triangle's own face normal.
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** How many triangles a geometry draws, indexed or not. */
export function triangleCount(geometry) {
  return cornerCount(geometry) / 3;
}

/**
 * `hex` nudged a little, so that clumps of the same foliage are not all one flat colour. Lightness and saturation
 * move by up to `amount` (on a 0 to 1 scale, in sRGB, where the eye judges them) and the hue by up to a third of
 * that. Takes three numbers from `rng`, so a seeded rng gives the same colours every time.
 * @param {string|Color} hex
 * @param {() => number} rng
 * @param {number} [amount]
 * @returns {Color}  linear, like every THREE.Color
 */
export function jitterColor(hex, rng, amount = 0.06) {
  const color = new Color(hex);
  color.getHSL(_hsl, SRGBColorSpace);
  const hue = _hsl.h + rngRange(rng, -amount, amount) / 3;
  const saturation = _hsl.s + rngRange(rng, -amount, amount);
  const lightness = _hsl.l + rngRange(rng, -amount, amount);
  return color.setHSL(hue, saturation, lightness, SRGBColorSpace); // wraps the hue and clamps the rest to 0..1
}
