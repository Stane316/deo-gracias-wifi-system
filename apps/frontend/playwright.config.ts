import { defineConfig, devices } from '@playwright/test';

/** IMP-27 — vrais scénarios navigateur sur le portail public. */
export default defineConfig({
  testDir: './e2e',
  timeout: 15_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0',
    cwd: '.',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
