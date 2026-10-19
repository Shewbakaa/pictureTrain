// Run the suite with `npm run test:e2e -- <files>`, or set PW_DISABLE_TS_ESM=1 when calling `npx playwright test`.
// Playwright 1.49's ESM loader deadlocks on Node 25 (the run hangs with no output); this variable skips it,
// which is fine here because the specs are plain JS. Remove it after upgrading Playwright to 1.55.1 or later.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:4173/site/' },
  webServer: { command: 'python3 -m http.server 4173 --bind 127.0.0.1', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'], launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } } },
  ],
});
