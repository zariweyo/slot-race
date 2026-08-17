# Slot Race

Version zero of a lightweight slot-car racing game built with Phaser + TypeScript.

## What is included

- Two-lane oval slot track, with one active car in v0.
- One-button throttle: hold to accelerate, release to coast with inertia.
- Curve grip model with progressive drift before the car leaves the slot.
- Off-track animation, automatic respawn, blinking recovery period, and race continuation.
- Lap counter, current lap time, last lap, best lap and speed HUD.
- Top-down Le Mans-style prototype car drawn directly with Phaser graphics.
- Responsive browser layout suitable for desktop and mobile.
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

- Desktop: hold `Space` or the red accelerate button.
- Touch: hold the red accelerate button.

## Architecture

```text
src/
  game/
    entities/      # Car and future race entities
    scenes/        # Phaser scenes
    systems/       # Lap timing and future game systems
    track/         # Track geometry and sampling
    config.ts      # Gameplay tuning
  main.ts
  styles.css
```

The oval is parametric rather than image-based. Cars are represented by distance along a lane, which keeps the model ready for a future authoritative multiplayer server (for example Colyseus) without synchronizing arbitrary x/y positions.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys on every push to `main` and can also be launched manually with **Actions → Deploy GitHub Pages → Run workflow**.
