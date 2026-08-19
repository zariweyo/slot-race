import { defineConfig } from 'vite';

export default defineConfig({
  base: '/slot-race/',
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
