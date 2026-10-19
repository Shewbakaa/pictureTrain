// Screenshot helper for visual checks.
//
//   node scripts/shot.mjs <name> "<query>" [--size 390x844] [--wait 2500] [--click "Begin the ride"]
//   npm run shot -- <name> "<query>" [--size 390x844] [--wait 2500] [--click "Begin the ride"]
//
// Serves the repo root on http://127.0.0.1:4174, opens /site/index.html?<query> in a phone-sized
// Chromium (device pixel ratio 3, touch), waits for the app to report a mode (it gives up after 20 s
// and carries on, so it never hangs), taps the button named by --click once if one is given, waits
// --wait ms more, and writes artifacts/shots/<name>.png.
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { root, withPage } from './lib/serve.mjs';

const PORT = 4174;
const MODE_TIMEOUT_MS = 20_000;
const CLICK_TIMEOUT_MS = 20_000;
const DEFAULTS = { size: '390x844', wait: '2500', click: '' };
const USAGE = 'usage: node scripts/shot.mjs <name> "<query>" [--size 390x844] [--wait 2500] [--click "<button name>"]';

function fail(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (!(key in DEFAULTS)) fail(`unknown option ${arg}`);
    if (i + 1 >= argv.length) fail(`${arg} needs a value`);
    options[key] = argv[++i];
  }

  const [name, query = ''] = positional;
  if (!name) fail('missing <name>');
  if (!/^[\w.-]+$/.test(name)) fail('<name> must be letters, digits, dots, dashes or underscores');
  const size = /^(\d+)x(\d+)$/.exec(options.size);
  if (!size) fail(`--size must look like 390x844, got "${options.size}"`);
  if (!/^\d+$/.test(options.wait)) fail(`--wait must be a number of milliseconds, got "${options.wait}"`);
  return {
    name,
    query: query.replace(/^\?/, ''),
    width: Number(size[1]),
    height: Number(size[2]),
    waitMs: Number(options.wait),
    click: options.click,
  };
}

const { name, query, width, height, waitMs, click } = parseArgs(process.argv.slice(2));
const outFile = join(root, 'artifacts', 'shots', `${name}.png`);

try {
  await withPage({ port: PORT, query, viewport: { width, height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, async (page) => {
    try {
      await page.waitForFunction(() => window.__app && window.__app.state.mode !== null, null, { timeout: MODE_TIMEOUT_MS });
    } catch {
      console.log(`note: app mode is still null after ${MODE_TIMEOUT_MS / 1000} s, taking the shot anyway`);
    }
    if (click) await page.getByRole('button', { name: click }).click({ timeout: CLICK_TIMEOUT_MS });
    await page.waitForTimeout(waitMs);

    await mkdir(dirname(outFile), { recursive: true });
    await page.screenshot({ path: outFile });
    console.log(`wrote ${relative(root, outFile)}`);
  });
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
