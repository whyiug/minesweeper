import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], launchOptions: process.env.LIGHT_MINES_WEBKIT_EXECUTABLE_PATH ? { executablePath: process.env.LIGHT_MINES_WEBKIT_EXECUTABLE_PATH } : undefined } },
  ],
  webServer: { command: 'npm run dev -- --port 4173 --strictPort --mode e2e', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000 },
});
