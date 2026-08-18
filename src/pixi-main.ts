import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';
import trackJson from './tracks/neon-long.json';
import { compileTrack, type CompiledTrack, type TrackDefinition, type WorldPoint } from './game/track/TrackCompiler';

const WIDTH = 1280;
const HEIGHT = 720;
const CACHE_SAMPLES = 4096;
const SVG_SAMPLES = 1400;
const BRIDGE_ENTRY_LEAD = 115;
const TRAIL_SCALE = 0.70;
const MAX_TRAIL_LENGTH = (40 + 520) * TRAIL_SCALE;

const PHYSICS = {
  acceleration: 760,
  coastDrag: 520,
  maxSpeed: 2350,
};

const LIMIT_COLOR = 0xff2638;

type Point = { x: number; y: number };
type TrackPoint = Point & {
  angle: number;
  distance: number;
  layer: 0 | 1;
  underBridge: boolean;
  elevation: number;
};

type CachePoint = TrackPoint & {
  worldX: number;
  worldY: number;
  worldNx: number;
  worldNy: number;
};

type PhotonVisual = {
  root: Container;
  trail: Graphics;
  glow: Graphics;
  body: Graphics;
  tip: Graphics;
};

type Player = {
  id: 1 | 2;
  name: string;
  color: number;
  laneOffset: number;
  distance: number;
  speed: number;
  throttle: boolean;
  currentZ: 1 | 3;
  underVisual: PhotonVisual;
  overVisual: PhotonVisual;
};

type CurveRange = {
  start: number;
  end: number;
  sign: -1 | 1;
};

const boot = document.querySelector<HTMLDivElement>('#pixi-boot');
const setBoot = (message: string): void => { if (boot) boot.textContent = message; };

function showBootError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (boot) {
    boot.textContent = `PIXI STARTUP ERROR\n\n${message}`;
    boot.style.color = '#ff6b9d';
  }
  console.error('Pixi startup failed:', error);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mixColor(from: number, to: number, amount: number): number {
  const t = clamp01(amount);
  const fr = (from >> 16) & 0xff;
  const fg = (from >> 8) & 0xff;
  const fb = from & 0xff;
  const tr = (to >> 16) & 0xff;
  const tg = (to >> 8) & 0xff;
  const tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

function circularDelta(a: number, b: number, length: number): number {
  let delta = Math.abs(a - b);
  if (delta > length / 2) delta = length - delta;
  return delta;
}

function projectIso(x: number, y: number, z = 0): Point {
  const dx = x - 640;
  const dy = y - 360;
  return {
    x: 640 + dx * 0.86 - dy * 0.42,
    y: 385 + dx * 0.20 + dy * 0.48 - z * 0.90,
  };
}

function setPath(id: string, d: string): SVGPathElement {
  const path = document.querySelector<SVGPathElement>(`#${id}`);
  if (!path) throw new Error(`Missing #${id}`);
  path.setAttribute('d', d);
  return path;
}

function createBridgePath(d: string, stroke: string, width: number, opacity: number, className = ''): SVGPathElement {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', stroke);
  p.setAttribute('stroke-width', String(width));
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  p.setAttribute('opacity', String(opacity));
  if (className) p.setAttribute('class', className);
  return p;
}

function drawOpenPath(graphics: Graphics, points: Point[], width: number, color: number, alpha: number): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
  graphics.stroke({ width, color, alpha });
}

function createPhotonVisual(): PhotonVisual {
  const root = new Container();
  const trail = new Graphics();
  const glow = new Graphics();
  const body = new Graphics();
  const tip = new Graphics();
  root.addChild(glow, body, tip);
  return { root, trail, glow, body, tip };
}

function rebuildPhoton(visual: PhotonVisual, ratio: number, baseColor: number): void {
  const heat = clamp01((ratio - 0.58) / 0.42);
  const bodyColor = mixColor(baseColor, 0xff7a36, heat * 0.40);
  const tipColor = mixColor(baseColor, LIMIT_COLOR, heat);
  visual.glow.clear().ellipse(-2, 0, 40, 20).fill({ color: tipColor, alpha: 0.12 + ratio * 0.10 });
  visual.body.clear().ellipse(-3, 0, 25, 11).fill({ color: bodyColor, alpha: 0.98 });
  visual.body.ellipse(2, 0, 15, 6).fill({ color: 0xffffff, alpha: 0.72 });
  visual.tip.clear().circle(18, 0, 5.5).fill({ color: tipColor, alpha: 1 });
}

async function createLayer(hostId: string): Promise<Application> {
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    backgroundAlpha: 0,
    antialias: true,
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
    autoStart: false,
  });
  const host = document.querySelector<HTMLDivElement>(`#${hostId}`);
  if (!host) throw new Error(`Missing #${hostId}`);
  host.appendChild(app.canvas);
  app.canvas.width = WIDTH;
  app.canvas.height = HEIGHT;
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';
  return app;
}

function worldAt(compiled: CompiledTrack, distance: number): WorldPoint {
  const total = compiled.totalLength;
  const d = ((distance % total) + total) % total;
  const points = compiled.points;
  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distance <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[Math.min(lo + 1, points.length - 1)];
  const span = Math.max(1e-6, b.distance - a.distance);
  const t = clamp01((d - a.distance) / span);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    distance: d,
    segmentIndex: t < 0.5 ? a.segmentIndex : b.segmentIndex,
    segmentType: t < 0.5 ? a.segmentType : b.segmentType,
    curveSign: t < 0.5 ? a.curveSign : b.curveSign,
  };
}

function curveRanges(compiled: CompiledTrack): CurveRange[] {
  const ranges: CurveRange[] = [];
  let active: CurveRange | null = null;
  for (const point of compiled.points) {
    if (point.segmentType === 'curve' && point.curveSign !== 0) {
      if (!active || active.sign !== point.curveSign || point.distance - active.end > 20) {
        if (active) ranges.push(active);
        active = { start: point.distance, end: point.distance, sign: point.curveSign };
      } else {
        active.end = point.distance;
      }
    } else if (active) {
      ranges.push(active);
      active = null;
    }
  }
  if (active) ranges.push(active);
  return ranges.filter((range) => range.end - range.start > 50);
}

async function main(): Promise<void> {
  setBoot('PIXI MODULE LOADED\nCOMPILING TRACK JSON...');

  const definition = trackJson as TrackDefinition;
  const compiled = compileTrack(definition, 5);
  if (compiled.points.length < 4 || compiled.totalLength <= 0) throw new Error('Track compiler produced an empty track');

  const bounds = compiled.points.reduce(
    (acc, p) => ({
      minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
      minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min(900 / worldWidth, 520 / worldHeight);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterY = (bounds.minY + bounds.maxY) / 2;

  const toCanvasWorld = (x: number, y: number): Point => ({
    x: 640 + (x - worldCenterX) * fitScale,
    y: 360 + (y - worldCenterY) * fitScale,
  });

  const sourceLength = compiled.totalLength;
  const wrap = (distance: number): number => ((distance % sourceLength) + sourceLength) % sourceLength;
  const laneOffset = definition.road.laneSpacing / 2;
  const roadHalfWidth = definition.road.width / 2;
  const bridgeHeight = definition.bridge.height;
  const bridgeRampLength = definition.bridge.rampLength;
  const bridgePlateauHalf = definition.bridge.plateauLength / 2;

  const bridgeCrossing = compiled.crossings.find((crossing) => crossing.mode === 'bridge');
  const bridgeTopDistance = bridgeCrossing
    ? (bridgeCrossing.above === 'a' ? bridgeCrossing.distanceA : bridgeCrossing.distanceB)
    : sourceLength * 0.5;
  const bridgeUnderDistance = bridgeCrossing
    ? (bridgeCrossing.above === 'a' ? bridgeCrossing.distanceB : bridgeCrossing.distanceA)
    : 0;

  const elevationAt = (distance: number): number => {
    const delta = circularDelta(wrap(distance), bridgeTopDistance, sourceLength);
    if (delta <= bridgePlateauHalf) return bridgeHeight;
    if (delta >= bridgePlateauHalf + bridgeRampLength) return 0;
    const rampProgress = 1 - (delta - bridgePlateauHalf) / bridgeRampLength;
    return bridgeHeight * smoothstep(rampProgress);
  };

  const rawWorld: Array<{ worldX: number; worldY: number; elevation: number; distance: number; x: number; y: number }> = [];
  for (let i = 0; i < CACHE_SAMPLES; i += 1) {
    const distance = (i / CACHE_SAMPLES) * sourceLength;
    const original = worldAt(compiled, distance);
    const fitted = toCanvasWorld(original.x, original.y);
    const elevation = elevationAt(distance);
    const projected = projectIso(fitted.x, fitted.y, elevation);
    rawWorld.push({ worldX: fitted.x, worldY: fitted.y, elevation, distance, ...projected });
  }

  const cache: CachePoint[] = rawWorld.map((p, i) => {
    const before = rawWorld[(i - 1 + CACHE_SAMPLES) % CACHE_SAMPLES];
    const after = rawWorld[(i + 1) % CACHE_SAMPLES];
    const worldDx = after.worldX - before.worldX;
    const worldDy = after.worldY - before.worldY;
    const worldMag = Math.hypot(worldDx, worldDy) || 1;
    const worldNx = -worldDy / worldMag;
    const worldNy = worldDx / worldMag;
    const screenDx = after.x - before.x;
    const screenDy = after.y - before.y;
    const angle = Math.atan2(screenDy, screenDx);
    const layer: 0 | 1 = circularDelta(p.distance, bridgeTopDistance, sourceLength) <= bridgePlateauHalf ? 1 : 0;
    const underBridge = circularDelta(p.distance, bridgeUnderDistance, sourceLength) <= bridgePlateauHalf;
    return { ...p, worldNx, worldNy, angle, layer, underBridge };
  });

  const sample = (distance: number, offset = -laneOffset): TrackPoint => {
    const d = wrap(distance);
    const exact = (d / sourceLength) * CACHE_SAMPLES;
    const i0 = Math.floor(exact) % CACHE_SAMPLES;
    const i1 = (i0 + 1) % CACHE_SAMPLES;
    const t = exact - Math.floor(exact);
    const a = cache[i0];
    const b = cache[i1];
    const lerp = (x: number, y: number): number => x + (y - x) * t;
    let angleDelta = b.angle - a.angle;
    if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    const worldX = lerp(a.worldX, b.worldX);
    const worldY = lerp(a.worldY, b.worldY);
    let worldNx = lerp(a.worldNx, b.worldNx);
    let worldNy = lerp(a.worldNy, b.worldNy);
    const normalMag = Math.hypot(worldNx, worldNy) || 1;
    worldNx /= normalMag;
    worldNy /= normalMag;
    const elevation = lerp(a.elevation, b.elevation);
    const projected = projectIso(worldX + worldNx * offset, worldY + worldNy * offset, elevation);
    return {
      x: projected.x,
      y: projected.y,
      angle: a.angle + angleDelta * t,
      distance: d,
      layer: t < 0.5 ? a.layer : b.layer,
      underBridge: t < 0.5 ? a.underBridge : b.underBridge,
      elevation,
    };
  };

  const sampledPath = (offset = 0, start = 0, end = sourceLength, samples = SVG_SAMPLES, yShift = 0): string => {
    let d = '';
    for (let i = 0; i <= samples; i += 1) {
      const at = start + ((end - start) * i) / samples;
      const p = sample(at, offset);
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${(p.y + yShift).toFixed(2)} `;
    }
    return d;
  };

  const centerD = sampledPath(0);
  const laneAD = sampledPath(-laneOffset);
  const laneBD = sampledPath(laneOffset);
  setPath('track-outer-glow', centerD);
  setPath('track-border', centerD);
  setPath('track-road', centerD);
  setPath('track-inner-sheen', centerD);
  setPath('lane-a-dark', laneAD);
  setPath('lane-b-dark', laneBD);
  setPath('lane-a', laneAD);
  setPath('lane-b', laneBD);

  const curves = curveRanges(compiled);
  const arrows = document.querySelector<SVGGElement>('#curve-arrows');
  if (arrows) {
    arrows.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    curves.forEach((curve, groupIndex) => {
      const span = curve.end - curve.start;
      for (let i = 0; i < 5; i += 1) {
        const p = sample(curve.start + span * (0.20 + i * 0.12));
        const text = document.createElementNS(ns, 'text');
        text.textContent = '›››';
        text.setAttribute('x', p.x.toFixed(2));
        text.setAttribute('y', p.y.toFixed(2));
        text.setAttribute('class', `curve-chevron ${groupIndex % 2 === 0 ? 'cyan' : 'magenta'}`);
        text.setAttribute('transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
        text.style.animationDelay = `${i * 105 + groupIndex * 30}ms`;
        arrows.appendChild(text);
      }
    });
  }

  const decor = document.querySelector<SVGGElement>('#track-decor');
  if (decor) {
    decor.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const addKerbRun = (start: number, end: number, side: -1 | 1, blocks: number): void => {
      const blockSpan = (end - start) / blocks;
      for (let i = 0; i < blocks; i += 1) {
        const blockStart = start + blockSpan * i;
        const blockEnd = blockStart + blockSpan * 0.92;
        const kerb = document.createElementNS(ns, 'path');
        kerb.setAttribute('d', sampledPath(side * (roadHalfWidth + 5), blockStart, blockEnd, 6));
        kerb.setAttribute('fill', 'none');
        kerb.setAttribute('stroke', i % 2 === 0 ? '#ff334f' : '#f5f8ff');
        kerb.setAttribute('stroke-width', '11');
        kerb.setAttribute('stroke-linecap', 'butt');
        kerb.setAttribute('opacity', '.92');
        decor.appendChild(kerb);
      }
    };
    curves.forEach((curve) => {
      const span = curve.end - curve.start;
      const inside: -1 | 1 = curve.sign > 0 ? 1 : -1;
      addKerbRun(curve.start + span * 0.08, curve.end - span * 0.10, inside, Math.max(8, Math.round(span / 22)));
      addKerbRun(curve.end - span * 0.08, Math.min(sourceLength, curve.end + span * 0.12), inside === 1 ? -1 : 1, 5);
    });
  }

  const bridgeLayer = document.querySelector<SVGGElement>('#bridge-layer');
  if (!bridgeLayer) throw new Error('Missing #bridge-layer');
  bridgeLayer.replaceChildren();
  const plateauStart = bridgeTopDistance - bridgePlateauHalf;
  const plateauEnd = bridgeTopDistance + bridgePlateauHalf;
  const rampStart = plateauStart - bridgeRampLength;
  const rampEnd = plateauEnd + bridgeRampLength;
  bridgeLayer.appendChild(createBridgePath(sampledPath(0, rampStart, rampEnd, 190, 14), '#00030a', definition.road.width + 8, 0.24, 'bridge-shadow'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(0, rampStart, rampEnd, 190), '#162337', definition.road.width, 0.18, 'bridge-ramp-deck'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(-roadHalfWidth, rampStart, rampEnd, 190), '#34b8c5', 3, 0.48, 'bridge-ramp-edge'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(roadHalfWidth, rampStart, rampEnd, 190), '#b53aa8', 3, 0.42, 'bridge-ramp-edge'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(0, plateauStart, plateauEnd, 100), '#111d2e', definition.road.width - 2, definition.bridge.opacity, 'bridge-deck'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(-roadHalfWidth, plateauStart, plateauEnd, 100), '#4cf4ff', 3.5, 0.92, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(roadHalfWidth, plateauStart, plateauEnd, 100), '#ff54e7', 3.5, 0.82, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(-laneOffset, plateauStart, plateauEnd, 100), '#b9fdff', 2.7, 1, 'bridge-rail'));
  bridgeLayer.appendChild(createBridgePath(sampledPath(laneOffset, plateauStart, plateauEnd, 100), '#ff9bf3', 2.7, 0.96, 'bridge-rail'));

  const bridgeEnterAt = bridgeTopDistance - bridgePlateauHalf - bridgeRampLength - BRIDGE_ENTRY_LEAD;
  const bridgeExitAt = bridgeTopDistance + bridgePlateauHalf + bridgeRampLength + MAX_TRAIL_LENGTH;

  setBoot('TRACK JSON READY\nINITIALIZING TWO-PLAYER PIXI LAYERS...');
  const underApp = await createLayer('pixi-under');
  const overApp = await createLayer('pixi-over');
  const uiApp = await createLayer('pixi-ui');

  const makePlayer = (id: 1 | 2, name: string, color: number, playerLaneOffset: number, distance: number): Player => {
    const underVisual = createPhotonVisual();
    const overVisual = createPhotonVisual();
    underApp.stage.addChild(underVisual.trail, underVisual.root);
    overApp.stage.addChild(overVisual.trail, overVisual.root);
    return { id, name, color, laneOffset: playerLaneOffset, distance, speed: 0, throttle: false, currentZ: 1, underVisual, overVisual };
  };

  const players: Player[] = [
    makePlayer(1, 'LEFT', 0x27e7ff, -laneOffset, 90),
    makePlayer(2, 'RIGHT', 0xb76cff, laneOffset, 35),
  ];

  const hud = new Text({
    text: '',
    style: new TextStyle({ fill: '#dffcff', fontSize: 16, fontFamily: 'monospace', lineHeight: 22 }),
  });
  hud.position.set(26, 24);
  uiApp.stage.addChild(hud);

  const note = new Text({
    text: `${definition.name.toUpperCase()}   //   LEFT=CYAN   RIGHT=VIOLET`,
    style: new TextStyle({ fill: '#72e9f7', fontSize: 13, fontFamily: 'Arial' }),
  });
  note.position.set(26, HEIGHT - 38);
  uiApp.stage.addChild(note);

  boot?.remove();

  const keyState = { left: false, right: false };
  const leftPointers = new Set<number>();
  const rightPointers = new Set<number>();
  const refreshThrottle = (): void => {
    players[0].throttle = keyState.left || leftPointers.size > 0;
    players[1].throttle = keyState.right || rightPointers.size > 0;
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') keyState.left = true;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') keyState.right = true;
    refreshThrottle();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') keyState.left = false;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') keyState.right = false;
    refreshThrottle();
  });

  const uiCanvas = uiApp.canvas;
  uiCanvas.style.touchAction = 'none';
  uiCanvas.addEventListener('pointerdown', (event) => {
    uiCanvas.setPointerCapture?.(event.pointerId);
    const rect = uiCanvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    if (localX < rect.width / 2) leftPointers.add(event.pointerId);
    else rightPointers.add(event.pointerId);
    refreshThrottle();
  });
  const releasePointer = (event: PointerEvent): void => {
    leftPointers.delete(event.pointerId);
    rightPointers.delete(event.pointerId);
    refreshThrottle();
  };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  const renderVisual = (player: Player, visual: PhotonVisual, p: TrackPoint, ratio: number, active: boolean): void => {
    visual.root.visible = active;
    visual.trail.visible = active;
    if (!active) return;
    visual.root.position.set(p.x, p.y);
    visual.root.rotation = p.angle;
    visual.root.alpha = p.underBridge ? 0.45 : 1;
    rebuildPhoton(visual, ratio, player.color);
    visual.trail.clear();
    if (ratio <= 0.02) return;
    const wakeLength = (40 + ratio * 520) * TRAIL_SCALE;
    const points: TrackPoint[] = [];
    for (let i = 24; i >= 0; i -= 1) points.push(sample(player.distance - wakeLength * (i / 24), player.laneOffset));
    const alphaScale = p.underBridge ? 0.38 : 1;
    drawOpenPath(visual.trail, points, 28 + ratio * 12, player.color, (0.07 + ratio * 0.04) * alphaScale);
    drawOpenPath(visual.trail, points, 11 + ratio * 7, player.color, (0.18 + ratio * 0.11) * alphaScale);
    drawOpenPath(visual.trail, points, 3 + ratio * 3, 0xe9ffff, (0.64 + ratio * 0.22) * alphaScale);
  };

  let frames = 0;
  let elapsed = 0;
  let fps = 0;
  let maxFrame = 0;
  let maxWindow = 0;
  let lastTime = performance.now();

  const inBridgeRenderZone = (distance: number): boolean => {
    const d = wrap(distance);
    if (bridgeEnterAt <= bridgeExitAt) return d >= bridgeEnterAt && d <= bridgeExitAt;
    return d >= bridgeEnterAt || d <= bridgeExitAt;
  };

  const tick = (now: number): void => {
    const deltaMs = Math.min(now - lastTime, 40);
    lastTime = now;
    const dt = deltaMs / 1000;

    for (const player of players) {
      player.speed += (player.throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
      player.speed = Math.max(0, Math.min(PHYSICS.maxSpeed, player.speed));
      player.distance = wrap(player.distance + player.speed * dt);
      player.currentZ = inBridgeRenderZone(player.distance) ? 3 : 1;
      const p = sample(player.distance, player.laneOffset);
      const ratio = clamp01(player.speed / PHYSICS.maxSpeed);
      renderVisual(player, player.underVisual, p, ratio, player.currentZ === 1);
      renderVisual(player, player.overVisual, p, ratio, player.currentZ === 3);
    }

    underApp.renderer.render(underApp.stage);
    overApp.renderer.render(overApp.stage);

    frames += 1;
    elapsed += deltaMs;
    maxWindow += deltaMs;
    maxFrame = Math.max(maxFrame, deltaMs);
    if (elapsed >= 500) {
      fps = (frames * 1000) / elapsed;
      frames = 0;
      elapsed = 0;
    }
    if (maxWindow >= 5000) {
      maxWindow = 0;
      maxFrame = deltaMs;
    }

    const p1 = sample(players[0].distance, players[0].laneOffset);
    const p2 = sample(players[1].distance, players[1].laneOffset);
    hud.text = `TRACK ${definition.id}  ${Math.round(sourceLength)}m  CROSSINGS ${compiled.crossings.length}\nFPS ${fps.toFixed(1)}   FRAME ${deltaMs.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nCYAN   ${Math.round(players[0].speed * 0.82)}   Z${players[0].currentZ} H${p1.elevation.toFixed(0)} ${players[0].throttle ? 'THRUST' : 'COAST'}\nVIOLET ${Math.round(players[1].speed * 0.82)}   Z${players[1].currentZ} H${p2.elevation.toFixed(0)} ${players[1].throttle ? 'THRUST' : 'COAST'}`;
    uiApp.renderer.render(uiApp.stage);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame((now) => {
    lastTime = now;
    tick(now);
  });
}

void main().catch(showBootError);
