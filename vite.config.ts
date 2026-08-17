import { defineConfig } from 'vite';

export default defineConfig({
  base: '/slot-race/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
