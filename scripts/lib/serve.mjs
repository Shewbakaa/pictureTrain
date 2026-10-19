// What scripts/shot.mjs and scripts/og-image.mjs share: serve the repo root, open the site in a Chromium page,
// hand the page over, and tidy up (close the browser, stop the server) however it ends.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/** The repo root, which is what gets served: the site lives at /site/. */
export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SERVER_WAIT_MS = 10_000;

async function waitForServer(url, server, port) {
  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`http.server exited with code ${server.exitCode}. Is port ${port} already in use?`);
    }
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Nothing answered at ${url} within ${SERVER_WAIT_MS / 1000} s.`);
}

/**
 * Serves the repo root on 127.0.0.1:`port`, opens `/site/index.html` (with `query`, if any) in a Chromium page
 * and calls `run(page)` once the page has loaded. The browser and the server are always closed afterwards; an
 * error from any step is thrown to the caller after that, so each script decides how to report it.
 *
 * @param {{ port: number, query?: string, viewport: { width: number, height: number },
 *           deviceScaleFactor?: number, hasTouch?: boolean, isMobile?: boolean }} options
 * @param {(page: import('@playwright/test').Page) => Promise<void>} run
 */
export async function withPage({ port, query = '', viewport, deviceScaleFactor = 1, hasTouch = false, isMobile = false }, run) {
  const url = `http://127.0.0.1:${port}/site/index.html${query ? `?${query}` : ''}`;

  const server = spawn('python3', ['scripts/serve.py', String(port), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const stop = () => {
    server.kill();
    process.exit(1);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);

  let browser;
  try {
    await waitForServer(url, server, port);
    browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
    const context = await browser.newContext({ viewport, deviceScaleFactor, hasTouch, isMobile });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[browser] ${msg.text()}`);
    });
    page.on('pageerror', (err) => console.error(`[browser] ${err.message}`));

    const response = await page.goto(url);
    if (!response || !response.ok()) throw new Error(`${url} answered ${response ? response.status() : 'nothing'}`);

    await run(page);
  } finally {
    await browser?.close();
    server.kill();
    for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, stop);
  }
}
