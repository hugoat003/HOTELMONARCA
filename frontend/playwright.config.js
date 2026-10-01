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
  projects: [
    { name: 'funcional', testIgnore: /visual\.spec\.js/ },
    { name: 'visual', testMatch: /visual\.spec\.js/ },
  ],
  // Se prueba la versión compilada (como la que se instala), no el servidor de desarrollo:
  // así no hay recargas en caliente a mitad de una prueba.
  webServer: {
    command:
      'npx vite build --outDir .test-dist --emptyOutDir && npx vite preview --outDir .test-dist --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_DEMO: '1' },
  },
});
