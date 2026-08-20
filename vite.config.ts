import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

const appVersion = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  base: '/slot-race/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks: {
          pixijs: ['pixi.js'],
        },
      },
    },
  },
});
