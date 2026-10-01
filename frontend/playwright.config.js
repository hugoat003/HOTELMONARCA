import { defineConfig } from '@playwright/test';

// Pruebas de punta a punta con el Chrome instalado en la computadora.
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 6_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4180',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 6_000,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    env: { VITE_DEMO: '1' },
  },
});
