# Slot Race

V1 of a lightweight futuristic slot-racing prototype built with PixiJS + TypeScript.

## What is included

- PixiJS as the single game renderer.
- Isometric multi-level cyclic tracks generated from JSON.
- Standard track slots: `straight`, `curve`, `up`, `down`.
- Two local photons with independent throttle controls.
- Precached track sampling for stable 60 FPS rendering.
- Dynamic SVG/Pixi depth layers for multiple height levels.
- Track crossings and overpasses derived from geometry.
- Built-in track editor with create, edit, save and load actions.
- Track persistence in IndexedDB.
- GitHub Pages deployment through GitHub Actions.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Controls

- Left half / `A` / `←`: cyan photon.
- Right half / `D` / `→`: violet photon.
- Use **Editor de pista** to edit or create circuits.

## Architecture

```text
src/
  game/
    track/
      TrackCompiler.ts
      TrackEditor.ts
      TrackStorage.ts
  tracks/
    neon-long.json
  pixi-main.ts
  styles.css
index.html
```

The track is stored as semantic JSON rather than SVG or arbitrary points. At startup it is compiled into logical geometry, levels and crossings, then precached for rendering. SVG renders the static track layers while PixiJS renders photons, trails and UI.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys the Vite build to GitHub Pages and can also be launched manually from GitHub Actions.
