import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:4317/site/' },
  // Port 4317, checked at 127.0.0.1 itself (`url`, not `port`): a server another project leaves on [::1]:4173 must
  // not pass for this one (R26).
  webServer: { command: 'python3 scripts/serve.py 4317 --bind 127.0.0.1', url: 'http://127.0.0.1:4317/site/index.html', reuseExistingServer: true, stderr: 'ignore' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'], launchOptions: { args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] } } },
  ],
});
