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
  // Se prueba la versión compilada servida por el servidor real (backend/) en modo pruebas:
  // cada prueba usa su propio hotel en memoria, así corren en paralelo sin mezclar datos.
  webServer: {
    command: 'npx vite build --outDir .test-dist --emptyOutDir && node ../backend/src/index.js',
    url: 'http://localhost:4180/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_DEMO: '1',
      MONARCA_TEST: '1',
      PORT: '4180',
      HOST: '127.0.0.1',
      STATIC_DIR: '.test-dist',
      // El servidor y el navegador deben estar en la misma zona horaria (fechas de "hoy")
      TZ: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  },
});
