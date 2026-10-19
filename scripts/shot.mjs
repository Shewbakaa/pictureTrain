// Screenshot helper for visual checks.
//
//   node scripts/shot.mjs <name> "<query>" [--size 390x844] [--wait 2500]
//   npm run shot -- <name> "<query>" [--size 390x844] [--wait 2500]
//
// Serves the repo root on http://127.0.0.1:4174, opens /site/index.html?<query> in a phone-sized
// Chromium (device pixel ratio 3, touch), waits for the app to report a mode (it gives up after 20 s
// and carries on, so it never hangs), waits --wait ms more, and writes artifacts/shots/<name>.png.
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4174;
const MODE_TIMEOUT_MS = 20_000;
const DEFAULTS = { size: '390x844', wait: '2500' };
const USAGE = 'usage: node scripts/shot.mjs <name> "<query>" [--size 390x844] [--wait 2500]';

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
  };
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`http.server exited with code ${server.exitCode}. Is port ${PORT} already in use?`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Nothing answered at ${url} within 10 s.`);
}

const { name, query, width, height, waitMs } = parseArgs(process.argv.slice(2));
const url = `http://127.0.0.1:${PORT}/site/index.html${query ? `?${query}` : ''}`;
const outFile = join(root, 'artifacts', 'shots', `${name}.png`);

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill();
    process.exit(1);
  });
}

let browser;
try {
  await waitForServer(url, server);
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[browser] ${err.message}`));

  const response = await page.goto(url);
  if (!response || !response.ok()) throw new Error(`${url} answered ${response ? response.status() : 'nothing'}`);

  try {
    await page.waitForFunction(() => window.__app && window.__app.state.mode !== null, null, { timeout: MODE_TIMEOUT_MS });
  } catch {
    console.log(`note: app mode is still null after ${MODE_TIMEOUT_MS / 1000} s, taking the shot anyway`);
  }
  await page.waitForTimeout(waitMs);

  await mkdir(dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile });
  console.log(`wrote ${relative(root, outFile)}`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
