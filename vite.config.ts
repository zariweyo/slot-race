import { defineConfig } from 'vite';

type BuildProcess = {
  env?: Record<string, string | undefined>;
};

const buildProcess = (globalThis as typeof globalThis & { process?: BuildProcess }).process;
const fullCommit =
  buildProcess?.env?.GITHUB_SHA ??
  buildProcess?.env?.VERCEL_GIT_COMMIT_SHA ??
  buildProcess?.env?.CF_PAGES_COMMIT_SHA ??
  buildProcess?.env?.SOURCE_VERSION ??
  buildProcess?.env?.COMMIT_SHA ??
  'dev';
const appVersion = fullCommit === 'dev' ? 'dev' : fullCommit.slice(0, 7);

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
