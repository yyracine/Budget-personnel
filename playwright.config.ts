import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Chrome est utilisé par défaut ; PLAYWRIGHT_CHANNEL=msedge permet d’utiliser Edge. */
const CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 120_000,
    actionTimeout: 30_000,
    locale: 'fr-FR',
    timezoneId: 'Africa/Abidjan',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: CHANNEL },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
