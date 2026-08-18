import { defineConfig } from 'vite';

export default defineConfig({
  base: '/slot-race/',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        pixi: 'pixi.html',
      },
    },
  },
});
