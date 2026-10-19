// Copies the pinned third-party files (Three.js and the fonts) from node_modules into site/,
// so the shipped site has no runtime dependency on npm or on any CDN. Run: npm run vendor
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fromModules = (...parts) => join(root, 'node_modules', ...parts);
const toSite = (...parts) => join(root, 'site', ...parts);

// [fontsource package, file name]
const FONTS = [
  ['cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2'],
  ['cormorant-garamond', 'cormorant-garamond-latin-500-italic.woff2'],
  ['nunito', 'nunito-latin-400-normal.woff2'],
  ['nunito', 'nunito-latin-700-normal.woff2'],
];

// The fonts are under the SIL Open Font License, which asks for its text to travel with the font files.
const FONT_PACKAGES = [...new Set(FONTS.map(([pkg]) => pkg))];

const copies = [
  [fromModules('three', 'build', 'three.module.min.js'), toSite('vendor', 'three.module.min.js')],
  [fromModules('three', 'LICENSE'), toSite('vendor', 'THREE_LICENSE.txt')],
  ...FONTS.map(([pkg, file]) => [fromModules('@fontsource', pkg, 'files', file), toSite('fonts', file)]),
  ...FONT_PACKAGES.map((pkg) => [fromModules('@fontsource', pkg, 'LICENSE'), toSite('fonts', `LICENSE-${pkg}.txt`)]),
];

for (const [from, to] of copies) {
  await mkdir(dirname(to), { recursive: true });
  await copyFile(from, to);
  console.log(`vendored ${relative(root, to)}`);
}
