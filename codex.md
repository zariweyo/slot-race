# Slot Race — project context

## Goal

`slot-race` is a proof of concept for a fast arcade slot-racing game inspired by Scalextric, but with a futuristic photon theme instead of cars. The long-term direction is web first, with later integration into Angular/Ionic/Capacitor for Android and potentially iOS.

The core interaction is intentionally simple: one acceleration control. Holding accelerates; releasing reduces speed through drag/inertia. The player should feel that the photon is moving extremely fast and is managing speed at the limit rather than steering freely.

Multiplayer is a future requirement. Colyseus is the likely server option. The client should ideally synchronize logical progress (`distance`, `speed`, `lane`, state/layer) rather than raw x/y coordinates.

## Technology direction

### Current preferred stack

- Vite + TypeScript.
- PixiJS for dynamic rendering: photon, trail, dynamic game effects.
- SVG for static/semi-static track graphics and lightweight CSS/SVG animations.
- GitHub Pages for manual test deployment.
- Phaser implementation still exists as the original prototype, but PixiJS performed significantly better on the target device and is now the preferred direction.

### Why PixiJS + SVG

The track is mostly static and benefits from SVG:

- crisp curves at any resolution;
- easy neon/glow effects;
- easy animated curve chevrons;
- lower per-frame GPU/render cost than rebuilding all track geometry in Pixi;
- good fit for Angular/Ionic because both SVG and Pixi remain web-native.

PixiJS is used for moving elements because it gave much better runtime smoothness than the Phaser version on mobile.

## Main test page

The current Pixi prototype is built from `pixi.html` and `src/pixi-main.ts`.

Vite is configured as a multi-page app so both the original main page and `pixi.html` are built.

PixiJS is intentionally forced into its own Rollup chunk. This is important: there was a Vite/PixiJS initialization issue where `Application.init()` could remain pending indefinitely when bundled badly with top-level await. Keep the Pixi manual chunk unless there is a verified reason to remove it.

## Visual direction

The art direction is futuristic neon rather than retro.

Track:

- dark futuristic surface;
- cyan/magenta rail lighting;
- glow effects;
- animated sequential `>>>` chevrons on dangerous curves, like illuminated road chevrons;
- SVG handles these static/basic animated elements.

Photon:

- pointed water-drop / projectile silhouette;
- no drift;
- always constrained to its rail for now;
- strong visible trail;
- trail currently MUST remain monochrome for performance;
- photon base color can vary per player in future;
- red is reserved as a speed/limit state and should not be an available base player color;
- the photon tip/body may migrate toward red at very high speed, but avoid expensive per-segment trail color gradients.

## Performance findings

### Phaser

The first Phaser implementation showed progressive jank on mobile. Fixed timestep and render interpolation did not solve it. Disabling only the trail also did not remove the issue. SVG/PixiJS was tested as an alternative.

### PixiJS

PixiJS performed dramatically better in the same browser/device and is the current direction.

Important performance lesson:

- a dynamic multicolor trail caused FPS to collapse to roughly 10 FPS on the test device;
- reverting the trail to a single color restored good rendering performance;
- do not reintroduce per-frame multi-segment color interpolation without profiling it first.

The trail should use open paths (`moveTo` + `lineTo`). Earlier use of polygon drawing closed the geometry and caused visual lines from trail end to start and from `(0,0)` to rails.

## Coordinate system and alignment

Alignment between SVG track and Pixi photon is critical.

Current invariant:

- logical viewport is exactly `1280 × 720`;
- SVG uses `viewBox="0 0 1280 720"`;
- Pixi renderer uses `1280 × 720`;
- SVG and Pixi layers fill the SAME `.game-viewport` container;
- `.game-viewport` is fixed to a 16:9 aspect ratio and scales as one unit;
- do not independently size SVG and canvas using different object-fit/scale rules.

The visible lane SVG path is authoritative for photon movement. The photon should read the exact visible lane (`#lane-a`) with `getTotalLength()` and `getPointAtLength()` rather than recomputing an approximate mathematical path separately.

This is intended to keep the photon centered on the rail at any viewport size/orientation.

## Current circuit

The current desired test circuit is a simple figure-eight, not the later large multi-bridge experimental track.

The figure-eight is visually preferred and should remain the baseline until bridge layering is solved cleanly.

There is one crossing/bridge at the center.

Bridge goals:

- one branch passes visually above the other;
- deck is translucent enough that the lower road remains faintly visible;
- bridge only has strong edges at the upper road shoulders, not thick caps/borders across the road ends;
- upper rails should be crisp and obvious;
- lower rails should appear attenuated through/under the bridge.

## Depth / bridge architecture

This is the current architectural experiment and the most important unfinished issue.

Desired generalized depth model:

```text
z0  SVG base track
z1  Pixi-under dynamic layer
z2  SVG bridge / level-2 track structure
z3  Pixi-over dynamic layer
z4  UI/input
```

For future complex tracks this should generalize to more alternating SVG/Pixi levels.

Each photon should conceptually have:

```ts
currentZ
futureZ
```

The track has zones that determine which visual layer a photon should occupy. A look-ahead detector checks a point ahead on the rail and computes `futureZ` before the photon reaches a bridge. This avoids changing depth too late at the exact crossing.

Example conceptual track metadata:

```ts
type TrackZone = {
  start: number;
  end: number;
  zIndex: number;
};
```

For multiplayer, each player must be able to occupy a different level simultaneously. Do NOT solve this by changing the z-index of a single global canvas or bridge SVG. The eventual architecture must allow one player below a bridge while another is above it.

Current implementation uses two Pixi layers/canvases (`pixi-under`, `pixi-over`) interleaved around the SVG bridge. Simulation remains shared. The photon/trail is switched between visual layers based on current/future Z.

## Current depth bug under investigation

Even though HUD/debug state correctly reports `UNDER BRIDGE` and `OVER BRIDGE`, the photon has still visually appeared under the bridge in the over-pass case.

A diagnostic was added to isolate whether this is a DOM/CSS stacking issue or a renderer-selection issue.

`pixi-over` currently contains a large translucent red rectangle labeled:

```text
Z3 TEST
```

This marker is intentionally temporary.

Interpretation:

- if `Z3 TEST` appears ABOVE the SVG bridge, the DOM stacking order is correct and the bug is in photon/renderer assignment;
- if `Z3 TEST` appears BELOW the bridge, there is a CSS stacking-context/order problem.

The relevant intended DOM sibling order is:

```html
<svg class="track-svg">...</svg>     <!-- z0 -->
<div class="pixi-under"></div>       <!-- z1 -->
<svg class="bridge-svg">...</svg>    <!-- z2 -->
<div class="pixi-over"></div>        <!-- z3 -->
<div class="pixi-ui"></div>          <!-- z4 -->
```

All of these must remain direct siblings inside the same `.game-viewport` stacking context. Avoid applying `transform`, `opacity`, `filter`, or other stacking-context-generating CSS to the layer containers themselves unless deliberately needed and understood.

## Physics/current feel

The game currently does not use a general physics engine. It uses a custom 1D model along the track path.

Conceptually:

```ts
speed += acceleration * dt;
distance += speed * dt;
```

The SVG path converts `distance` to x/y/orientation.

Current general design goals:

- very high maximum speed;
- acceleration should not be so aggressive that the player instantly reaches max speed;
- releasing should reduce speed more noticeably than in the earliest versions;
- no drift while using photons;
- no derail/off-track mechanic for now; that will be designed later.

The coast drag was increased from the earlier low value to reduce inertia.

## Multiplayer direction

Future Colyseus synchronization should favor logical race state rather than positions:

```text
playerId
distance
speed
lane
state
currentZ/futureZ (or enough track metadata to derive them locally)
```

Clients reconstruct x/y/angle from the same authoritative SVG path.

This helps bandwidth and keeps interpolation deterministic and visually aligned with each client's responsive track.

Multiple photons will have different base colors. Red is excluded as a base color because red indicates high-speed/limit heat state.

Each photon's trail should move with the same visual depth layer as that photon.

## UI/game data already present

The prototype includes or has included:

- lap counter;
- current lap time;
- last lap;
- best lap;
- time format using seconds with milliseconds;
- FPS/frame-time diagnostics during performance work.

These diagnostics can remain while the rendering architecture is unstable.

## Deployment

GitHub Pages deployment is intentionally manual (`workflow_dispatch`) rather than deploying every push. This was chosen after workflow runs accumulated/stuck during rapid iteration.

The user manually runs the Pages workflow when a version is ready to test.

## Important mistakes to avoid repeating

1. Do not use Phaser `Graphics.bezierCurveTo`; it is not a CanvasRenderingContext2D API wrapper and caused TypeScript build failures.
2. Do not use Pixi `poly()` for trails/rails that must remain open; it can introduce closing lines.
3. Do not duplicate track geometry independently in SVG and Pixi. Use the visible SVG lane path as authority.
4. Do not give SVG and Pixi independent responsive sizing rules.
5. Do not make the trail dynamically multicolor per segment without profiling; this caused severe FPS loss.
6. Do not solve multiplayer bridge depth by globally moving one canvas above/below the bridge; players need independent depth levels.
7. Keep the current figure-eight baseline while diagnosing layering; the large multi-bridge experimental circuit was rejected visually.

## Immediate next step

Deploy the current Pages build and inspect the red `Z3 TEST` marker.

Then:

- marker above bridge → debug which Pixi app/canvas is actually drawing the photon when `futureZ` changes;
- marker below bridge → inspect computed stacking contexts and DOM layer ordering before touching game logic.

Once bridge depth works reliably, remove the red diagnostic marker and continue with generalized track-depth metadata for future complex circuits.
