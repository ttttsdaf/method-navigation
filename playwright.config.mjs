import { defineConfig } from '@playwright/test';

const port = 18767;
const baseURL = `http://127.0.0.1:${port}`;
const python = process.env.PYTHON || 'python';
const channel =
  process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === 'win32' && !process.env.CI ? 'msedge' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  use: {
    baseURL,
    channel,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'narrow', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `"${python}" -B serve.py --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
