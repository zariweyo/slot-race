# Slot Race — project context

## Goal

`slot-race` is a web-first arcade racing prototype inspired by Scalextric, but the racers are futuristic photons. The intended later target is Angular/Ionic/Capacitor mobile packaging. Multiplayer is planned, probably with Colyseus, synchronizing logical race state (`distance`, `speed`, lane/level) rather than screen x/y.

## Preferred stack

- Vite + TypeScript.
- PixiJS for moving photons, trails, HUD and dynamic effects.
- SVG for the static/semi-static circuit graphics, neon rails, kerbs and curve chevrons.
- GitHub Pages for manual test deployments.

PixiJS replaced Phaser because it was substantially smoother on the target mobile device.

## Performance rules

The current geometry is precalculated at startup. Do not use SVG `getPointAtLength()` repeatedly in the frame loop. A previous implementation doing many SVG geometry queries per frame fell to roughly 25 FPS; a precalculated 4096-sample cache restored a stable ~60 FPS.

The trail is monochrome per player. A dynamic multicolour trail previously collapsed performance to roughly 10 FPS on the test device. Do not reintroduce expensive per-segment trail colour interpolation without profiling.

Use open Pixi paths (`moveTo` + `lineTo`) for trails. Closed polygons previously introduced unwanted lines between the trail endpoints / origin.

## Coordinate/render invariant

The logical viewport is 1280×720. SVG layers and Pixi canvases all fill the same `.game-viewport`, so they receive identical responsive scaling and remain aligned at any viewport size/orientation.

Circuit geometry is compiled in world coordinates, fitted to the viewport, then projected isometrically. Static SVG and dynamic Pixi positions are both derived from the same compiled/cache geometry.

## Track data model

Tracks are persisted as JSON, currently under `src/tracks/`. The active test track is `src/tracks/neon-long.json` (id `neon-levels`).

Track schema version is now **2**. The main segment grammar is deliberately small:

```json
{ "type": "straight", "length": 300 }
{ "type": "curve", "length": 240, "angle": 90 }
{ "type": "up" }
{ "type": "down" }
```

Positive curve angle turns one direction and negative angle the other. `up` and `down` are standardized slots: they do not carry their own length/slope. Global level parameters define them:

```json
"levels": {
  "height": 88,
  "rampLength": 235
}
```

`up` is therefore a straight standardized ramp of `rampLength` that raises the logical level by one. `down` lowers it by one. Curves cannot themselves be ramps in the current grammar.

A closed track must finish at the same level where it starts. Going below level 0 is a compiler error.

## Track compiler

`src/game/track/TrackCompiler.ts` compiles the JSON into:

- sampled world points;
- accumulated distance;
- segment metadata/ranges;
- logical level and continuous elevation;
- render level;
- curve direction;
- detected geometric crossings;
- min/max level.

`up/down` elevation uses a smooth transition between levels. For rendering, a ramp belongs to the higher of the two levels it connects. This keeps the dynamic photon visually above the ramp surface for the entire transition.

## Crossings — no automatic bridges

**There are no bridge objects anymore.**

The compiler detects intersections but never mutates them into bridges. It classifies them:

- `crossing`: both passages intersect at effectively the same elevation; this is a real same-level crossing.
- `overpass`: passages intersect in x/y but have different elevations/levels; the higher track naturally renders above the lower track.

This is a key architectural decision. Complex vertical circuits are built intentionally with `up/down`, not by automatically inventing bridges at intersections.

## Dynamic depth stack

Rendering is generated dynamically from the maximum level in the compiled track. Each logical level gets two interleaved layers:

```text
level 0 SVG   z0
level 0 Pixi  z1
level 1 SVG   z2
level 1 Pixi  z3
level 2 SVG   z4
level 2 Pixi  z5
...
UI            above all levels
```

This replaces the previous fixed `pixi-under / bridge-svg / pixi-over` design.

The photon uses the track point's `renderLevel`; its Pixi representation is visible only in that level's renderer. This naturally supports multiple players on different levels simultaneously.

## Isometric projection

The circuit is logically 2D plus elevation. A shared `projectIso(x, y, z)` maps the compiled world geometry to the screen. `up/down` modify continuous elevation, so photons visibly climb and descend the standardized ramps.

Track lateral offsets (lanes, road shoulders) are derived from the logical/world normal before projection. This avoids the apparent lateral drift that occurred when offsets were applied after isometric projection.

## Circuit visuals

Current visual direction:

- dark futuristic/neon circuit;
- cyan and magenta rails;
- isometric view;
- red/white racing kerbs on curve interiors plus shorter outside-exit kerbs;
- sequential chevrons on curves;
- subtle shadows on standardized ramps so height transitions read visually.

Static track pieces are generated once, so these decorations should not affect frame-loop performance materially.

## Photons and controls

There are currently two local photons for testing:

- cyan: left lane, controlled by left half of screen (`A` / left arrow on keyboard);
- violet: right lane, controlled by right half (`D` / right arrow).

Multitouch is supported so both can accelerate simultaneously.

Photon shape is compact/rounded rather than a sharp spear. Red is reserved as the high-speed heat state and should not be a normal player base colour.

Current physics is a custom 1D model along the compiled circuit. No general physics engine is used. Releasing the control applies fairly strong drag (`coastDrag` currently 520) to reduce inertia.

## Multiplayer direction

The server should synchronize logical state, for example:

```text
playerId
distance
speed
lane
level/state
```

Clients reconstruct x/y/orientation/elevation from the same compiled track. Do not synchronize raw screen coordinates unless a later design requires it.

## Current files of interest

- `pixi.html`: minimal viewport/background + dynamic level stack host.
- `src/pixi-main.ts`: track compilation integration, cache, dynamic SVG/Pixi levels, two-player simulation/rendering.
- `src/game/track/TrackCompiler.ts`: version-2 JSON compiler, ramps, levels and crossing classification.
- `src/tracks/neon-long.json`: current multi-level test circuit.
- `src/styles.css`: shared responsive viewport and dynamic level styles.

## Rollback point

A branch named `V0` was created before the isometric/multi-level experiments, pointing at commit `da6f4828868fcc772f64e92f674c1f9be5751d57`. The connector did not expose tag creation, so `V0` is a branch rather than a Git tag.

## Important mistakes to avoid

1. Do not return to per-frame SVG geometry queries; use/precompute the cache.
2. Do not dynamically multicolour the trail without profiling.
3. Do not independently scale SVG and Pixi layers.
4. Do not apply lane/road offsets after isometric projection; apply them in world space first.
5. Do not automatically convert detected intersections into bridges.
6. Do not solve vertical ordering by moving a single global canvas; each logical level needs independent render depth.
7. Closed circuits must return to their starting logical level.

## Immediate test focus

Deploy the Pages workflow and verify:

- stable ~60 FPS with three logical levels;
- `up` raises level 0→1 and the next `up` raises 1→2;
- `down` returns 2→1 then 1→0;
- photon remains visually attached to each ramp;
- different-level intersections render as natural overpasses;
- same-level intersections remain true crossings;
- both local photons can occupy different levels simultaneously.
