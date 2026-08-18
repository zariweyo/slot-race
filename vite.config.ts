import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/slot-race/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pixi: resolve(__dirname, 'pixi.html'),
      },
    },
  },
});
