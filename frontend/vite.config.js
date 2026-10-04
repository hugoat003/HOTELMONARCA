import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const shared = fileURLToPath(new URL('../shared', import.meta.url));
// Servidor del hotel en desarrollo (npm run dev en backend/)
const api = process.env.MONARCA_API || 'http://localhost:3000';

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'sin-git';
  }
})();

export default defineConfig(({ command }) => {
  // Identificador de esta compilación. El servidor lo anuncia y las pantallas que tengan otro
  // muestran "Hay una versión nueva". En desarrollo es "dev" y no se compara.
  const build = command === 'build' ? `${commit}-${Date.now().toString(36)}` : 'dev';
  return {
    plugins: [
      react(),
      {
        name: 'monarca-version',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ build, commit, builtAt: new Date().toISOString() }, null, 2),
          });
        },
      },
    ],
    define: { __BUILD_ID__: JSON.stringify(build) },
    resolve: { alias: { '@shared': shared } },
    server: {
      fs: { allow: ['..'] },
      proxy: {
        '/api': api,
        '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
      },
    },
  };
});
