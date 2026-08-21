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

const trackEditorFastSelection = {
  name: 'track-editor-fast-selection',
  transform(code: string, id: string): string | null {
    if (!id.includes('/src/game/track/TrackEditor.ts')) return null;

    const original = `          selectedSegment = index;\n          render();`;
    const replacement = `          selectedSegment = index;\n          content.querySelectorAll('.track-editor-map-selected').forEach((node) => node.remove());\n          const fastSelected = svgElement('path');\n          fastSelected.setAttribute('d', d);\n          fastSelected.setAttribute('fill', 'none');\n          fastSelected.setAttribute('stroke', SELECTED_COLOR);\n          fastSelected.setAttribute('stroke-width', String(Math.max(4, roadWidth * 0.32)));\n          fastSelected.setAttribute('stroke-linecap', 'round');\n          fastSelected.setAttribute('class', 'track-editor-map-selected');\n          fastSelected.setAttribute('pointer-events', 'none');\n          fastSelected.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,.9))';\n          content.appendChild(fastSelected);\n          renderList();\n          setTab(activeTab);\n          updateSlotToolbar();`;

    if (!code.includes(original)) return null;
    return code.replace(original, replacement);
  },
};

export default defineConfig({
  base: '/slot-race/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [trackEditorFastSelection],
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
