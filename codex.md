# Slot Race — project context

## Goal

`slot-race` is a web-first arcade slot-racing prototype inspired by Scalextric, with futuristic racers. The intended later target is Angular/Ionic/Capacitor mobile packaging. Multiplayer is planned, probably synchronizing logical race state (`distance`, `speed`, lane/level) rather than screen x/y.

## Current baseline: V1

PixiJS is now the definitive runtime. Phaser and its legacy files/dependencies were removed. The game runs directly from `index.html`; there is no longer a `pixi.html` entrypoint.

A rollback branch named `V1` was created for the consolidated Pixi baseline because the connector did not expose Git tag creation. Earlier pre-isometric work is preserved in branch `V0`.

## Preferred stack

- Vite + TypeScript.
- PixiJS for moving racers, trails, HUD and dynamic effects.
- SVG for static/semi-static circuit graphics, neon rails, borders and curve chevrons.
- IndexedDB for locally saved/loaded user tracks through the track editor.
- GitHub Pages for manual test deployments.
- Intended later integration: Angular/Ionic/Capacitor.

PixiJS replaced Phaser because it was substantially smoother on the target mobile device.

## Performance rules

The current geometry is precalculated at startup. Do not use SVG `getPointAtLength()` repeatedly in the frame loop. A previous implementation doing many SVG geometry queries per frame fell to roughly 25 FPS; a precalculated 4096-sample cache restored a stable ~60 FPS.

The trail is monochrome per player. A dynamic multicolour trail previously collapsed performance to roughly 10 FPS on the test device. Do not reintroduce expensive per-segment trail colour interpolation without profiling.

Use open Pixi paths (`moveTo` + `lineTo`) for trails. Closed polygons previously introduced unwanted lines between trail endpoints/origin.

The current 3D cube racers perform well. Their geometry is tiny: eight logical vertices transformed per frame, with yaw/pitch and isometric projection. Do not add a general 3D engine unless a future requirement genuinely needs one.

## Coordinate/render invariant

The logical viewport is 1280×720. SVG layers and Pixi canvases all fill the same `.game-viewport`, so they receive identical responsive scaling and remain aligned at any viewport size/orientation.

Circuit geometry is compiled in world coordinates, fitted to the viewport, then projected isometrically. Static SVG and dynamic Pixi positions are both derived from the same compiled/cache geometry.

Track lateral offsets (lanes and road shoulders) must be applied in world space before projection.

## Track data model

Tracks are persisted as JSON, currently under `src/tracks/`. The active test track is `src/tracks/neon-long.json` (id `neon-levels`). Tracks can also be created, edited, saved and loaded locally from the in-game track editor using IndexedDB.

Track schema version is **2**. Main segment grammar:

```json
{ "type": "straight", "length": 300 }
{ "type": "curve", "length": 240, "angle": 90 }
{ "type": "up" }
{ "type": "down" }
```

Positive and negative curve angles turn in opposite directions. `up` and `down` are standardized straight ramp slots. Their dimensions come from global level parameters:

```json
"levels": {
  "height": 88,
  "rampLength": 235
}
```

Tracks may define a gameplay speed multiplier:

```json
"speedMultiplier": 1.0
```

`1` is normal, values above 1 make the circuit physically faster, and values below 1 slower. Old saved tracks without the property default to `1`. The value is editable in the track editor.

A closed track must finish at the same logical level where it starts. Going below level 0 is a compiler error.

## Track compiler

`src/game/track/TrackCompiler.ts` compiles JSON into sampled world points, accumulated distance, segment metadata/ranges, logical level, continuous elevation, render level, curve direction, crossings and min/max level.

`up/down` elevation uses a smooth transition between levels. A ramp renders with the higher level it connects so the racer remains visually above the ramp surface during the transition.

The circuit can contain an automatic geometric closing segment when explicit segment geometry does not land exactly on the start. Lane offsets on this auto-close must use a constant normal perpendicular to the closing line; otherwise one rail can form a loop while the other closes correctly.

## Crossings — no automatic bridges

There are no bridge objects. Intersections are detected but never automatically converted into bridges.

- `crossing`: same effective elevation; a real same-level crossing.
- `overpass`: same x/y area but different elevation/level; layer ordering naturally resolves which track is above.

Complex vertical circuits are built intentionally with `up/down`.

## Dynamic vertical depth stack

Each logical level gets two interleaved DOM layers:

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

A racer uses the sampled point's `renderLevel`; its Pixi representation is visible only in that level renderer. This supports racers on different elevations simultaneously.

## Horizontal depth sorting

Now that racers have 3D volume, player draw order cannot be fixed. Within each Pixi level, `stage.sortableChildren` is enabled.

Trails remain at a fixed low z-index because they are visually attached to the road surface. Only cube roots are dynamically depth-sorted. Their horizontal isometric depth is:

```ts
depth = worldX * 0.26 + worldY * 0.36;
```

The cube receives a large base z-index plus this depth. Therefore whichever cube is physically nearer the camera is painted above the other. Do not include elevation in this horizontal depth calculation: vertical ordering is already handled by the independent level stack.

## Isometric projection

The circuit is logically 2D plus elevation. Shared projection:

```ts
screenX = 640 + dx * 0.78 - dy * 0.52;
screenY = 385 + dx * 0.26 + dy * 0.36 - z * 1.05;
```

Dynamic cube geometry must use the same linear projection coefficients as the track. A previous cube implementation used a different projection and caused visible angular misalignment.

## Racers: 3D cubes

The old flat photon body has been replaced experimentally by a small 3D cube while retaining the neon trail.

Each cube is represented by eight local 3D vertices and projected through the same isometric transform as the track. It supports:

- yaw: follows track direction in world coordinates;
- pitch: follows the physical slope of `up/down` ramps;
- three-dimensional face shading and neon colouring;
- a subtle ground glow;
- dynamic horizontal depth sorting against other cubes.

Yaw must be derived from world-space track tangents, not from an already projected screen tangent. Doing the latter effectively projects orientation twice and reverses/misaligns the apparent steering.

Positive pitch must raise the front of the cube when travelling uphill; sign errors previously made uphill look downhill and vice versa.

Side faces are depth-sorted internally and the top face is painted last so the cube does not appear hollow.

## Circuit visuals

Current direction:

- dark futuristic/neon circuit;
- cyan and magenta player rails;
- isometric view;
- road borders are continuous red/white neon racing lines so they cannot be confused with player rails;
- the older discrete curve pianos/kerbs were removed;
- curve chevrons remain;
- border glow is intentionally restrained rather than extremely bright.

Static circuit decoration is generated once and should not materially affect frame-loop performance.

## Physics

There is currently one local racer controlled through Race Script.

Physics is a custom 1D model along the compiled circuit; no general physics engine is used. Race Script runs the racer automatically; the previous hold-to-accelerate rail controls are no longer the intended primary interaction.

Crucially, `player.speed` / current speed means **real linear speed along that player's own rail**, not speed along the centreline. Lane curvature changes how much centreline parameter distance must advance:

```ts
laneScale = 1 - curvature * laneOffset;
centerAdvance = (player.speed / laneScale) * speedMultiplier * dt;
```

This means an inside rail genuinely has less distance to travel around a curve and its racer can move ahead at equal linear speed. Do not revert to simply incrementing both racers by the same centreline distance.

## Race Script

Race Script is the current experimental control model. Instead of manually changing rail while driving, the player programs timed rail-change actions and runs the simulation.

Each action contains:

```ts
{
  timeMs: number,
  rail: 'cyan' | 'violet',
  lap: 'all' | number
}
```

The editor is visible before the race and remains visible during the run. The main flow is:

```text
program → run → observe → pause → edit → resume/restart
```

Rules:

- `all` actions form the base script for every lap.
- A lap-specific action at the same timestamp overrides the global action at that timestamp.
- Actions execute against elapsed time within the current lap.
- Pausing freezes simulation time and allows editing.
- Resuming continues from the same position/time; actions whose timestamps already passed are not replayed.
- Restart returns to lap 1, time 0 and the initial rail, preserving the programmed script.
- Race Script auto-accelerates while running; rail change remains the existing smooth lane transition rather than a teleport.
- The UI shows current lap time and the next pending action.

Current files:

- `src/race-script.ts`: programmer state, action editing, lap/global merging and runtime telemetry.
- `src/race-script.css`: compact floating programmer UI.

## Lap timing and HUD

The HUD shows race telemetry including laps, last lap and best lap.

Because racers start offset from the start line, lap timing should remain coherent with the Race Script lap clock. Script timestamps always reset at a new lap.

## Track editor

The in-game editor is a list-oriented popup for adding/removing/modifying the available segment types and track parameters. It supports creating a new circuit as well as saving/loading tracks in IndexedDB. The current track is shown by default.

`speedMultiplier` is exposed as `Velocidad ×`.

## Multiplayer direction

Synchronize logical state rather than rendered coordinates, for example:

```text
playerId
distance
speed
lane
level/state
```

Clients reconstruct x/y/orientation/elevation/depth from the same compiled track. Do not synchronize raw screen coordinates unless a later design requires it.

## Current files of interest

- `index.html`: definitive game entrypoint and Race Script container.
- `src/pixi-main.ts`: cache, track rendering integration, racer simulation, cube rendering, depth sorting, HUD and physics.
- `src/race-script.ts`: Race Script editor/programmer.
- `src/race-script.css`: Race Script presentation.
- `src/game/track/TrackCompiler.ts`: version-2 compiler, ramps, levels and crossing classification.
- `src/game/track/TrackEditor.ts`: in-game circuit editor.
- `src/game/track/TrackStorage.ts`: IndexedDB persistence/load logic.
- `src/tracks/neon-long.json`: current multi-level test circuit.
- `src/styles.css`: responsive viewport, dynamic levels and editor/UI styling.

## Rollback points

- `V0`: branch preserving the pre-isometric/multi-level baseline; originally points at commit `da6f4828868fcc772f64e92f674c1f9be5751d57`.
- `V1`: branch preserving the consolidated Pixi-only baseline after Phaser removal and `index.html` consolidation. It is a branch rather than a Git tag because tag creation was not exposed by the connector.

## Important mistakes to avoid

1. Do not return to per-frame SVG geometry queries; use/precompute the cache.
2. Do not dynamically multicolour the trail without profiling.
3. Do not independently scale SVG and Pixi layers.
4. Do not apply lane/road offsets after isometric projection.
5. Do not automatically convert intersections into bridges.
6. Do not solve vertical ordering with one global canvas; each logical level needs independent render depth.
7. Do not use fixed player draw order now that racers have height; dynamically sort cube depth within a level.
8. Do not include elevation in horizontal cube depth sorting; DOM level ordering already handles vertical depth.
9. Do not calculate cube yaw from screen-space tangent; use world-space tangent.
10. Cubes and track must share the same projection coefficients.
11. Speed is rail-linear speed; preserve curvature/lane-length correction.
12. Closed circuits must return to their starting logical level.
13. Race Script timing is lap-relative, not total-race-relative.
14. Resume must not replay Race Script actions whose timestamps have already passed.

## Immediate test focus

- Keep stable ~60 FPS with 3D cubes, trails and multiple levels.
- Verify yaw alignment on curves and pitch direction on ramps.
- Verify top cube face remains visible at all headings.
- Verify horizontal cube depth swaps correctly when racers pass in front of/behind each other.
- Verify inside/outside rail length produces the expected positional advantage through curves.
- Verify `speedMultiplier` gives long tracks the desired perceived pace.
- Verify different-level intersections render as natural overpasses and same-level intersections remain crossings.
- Verify Race Script pause/resume/restart semantics and lap-specific overrides.
