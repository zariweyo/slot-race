import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';
import trackJson from './tracks/neon-long.json';
import { setupTrackEditor } from './game/track/TrackEditor';
import { loadInitialTrack } from './game/track/TrackStorage';
import {
  compileTrack,
  type CompiledTrack,
  type TrackDefinition,
  type WorldPoint,
} from './game/track/TrackCompiler';

const WIDTH = 1280;
const HEIGHT = 720;
const CACHE_SAMPLES = 4096;
const SVG_SAMPLES = 1600;
const TRAIL_SCALE = 0.70;
const DEG = Math.PI / 180;

const PHYSICS = {
  acceleration: 760,
  coastDrag: 520,
  maxSpeed: 2350,
};

const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };
type Vec3 = { x: number; y: number; z: number };

type TrackPoint = Point & {
  angle: number;
  distance: number;
  elevation: number;
  level: number;
  renderLevel: number;
  segmentIndex: number;
  segmentType: WorldPoint['segmentType'];
  curveSign: -1 | 0 | 1;
  curvature: number;
  worldX: number;
  worldY: number;
};

type CachePoint = TrackPoint & {
  worldNx: number;
  worldNy: number;
};

type PhotonVisual = {
  root: Container;
  trail: Graphics;
  glow: Graphics;
  cube: Graphics;
};

type Player = {
  id: 1 | 2;
  color: number;
  laneOffset: number;
  distance: number;
  speed: number;
  throttle: boolean;
  visuals: Map<number, PhotonVisual>;
  laps: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  lapStartedAt: number;
  lapArmed: boolean;
};

type LevelRenderer = {
  level: number;
  app: Application;
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

function scaleColor(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

function colorHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function formatLap(ms: number | null): string {
  if (ms === null) return '--.---';
  return `${Math.floor(ms / 1000)}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
}

function projectIso(x: number, y: number, z = 0): Point {
  const dx = x - 640;
  const dy = y - 360;
  return {
    x: 640 + dx * 0.78 - dy * 0.52,
    y: 385 + dx * 0.26 + dy * 0.36 - z * 1.05,
  };
}

function drawOpenPath(graphics: Graphics, points: Point[], width: number, color: number, alpha: number): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
  graphics.stroke({ width, color, alpha });
}

function createPhotonVisual(baseColor: number): PhotonVisual {
  const root = new Container();
  const trail = new Graphics();
  const glow = new Graphics();
  const cube = new Graphics();
  glow.ellipse(0, 8, 30, 10).fill({ color: baseColor, alpha: 0.16 });
  root.addChild(glow, cube);
  return { root, trail, glow, cube };
}

function drawCube3d(visual: PhotonVisual, baseColor: number, yaw: number, pitch: number, ratio: number): void {
  const half = 15;
  const height = 28;
  const vertices: Vec3[] = [
    { x: -half, y: -half, z: 0 }, { x: half, y: -half, z: 0 },
    { x: half, y: half, z: 0 }, { x: -half, y: half, z: 0 },
    { x: -half, y: -half, z: height }, { x: half, y: -half, z: height },
    { x: half, y: half, z: height }, { x: -half, y: half, z: height },
  ];

  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const projected = vertices.map((v): Point => {
    const pitchedX = v.x * cp - v.z * sp;
    const pitchedZ = v.x * sp + v.z * cp;
    const worldX = pitchedX * cy - v.y * sy;
    const worldY = pitchedX * sy + v.y * cy;
    return {
      x: worldX * 0.78 - worldY * 0.52,
      y: worldX * 0.26 + worldY * 0.36 - pitchedZ * 1.05,
    };
  });

  const sideFaces = [
    { ids: [0, 1, 5, 4], color: scaleColor(baseColor, 0.72) },
    { ids: [1, 2, 6, 5], color: scaleColor(baseColor, 0.50) },
    { ids: [2, 3, 7, 6], color: scaleColor(baseColor, 0.62) },
    { ids: [3, 0, 4, 7], color: scaleColor(baseColor, 0.82) },
  ];

  sideFaces.sort((a, b) => {
    const ay = a.ids.reduce((sum, id) => sum + projected[id].y, 0) / a.ids.length;
    const by = b.ids.reduce((sum, id) => sum + projected[id].y, 0) / b.ids.length;
    return ay - by;
  });

  const drawFace = (ids: number[], color: number, edgeAlpha: number): void => {
    const first = projected[ids[0]];
    visual.cube.moveTo(first.x, first.y);
    for (let i = 1; i < ids.length; i += 1) {
      const p = projected[ids[i]];
      visual.cube.lineTo(p.x, p.y);
    }
    visual.cube.lineTo(first.x, first.y);
    visual.cube.fill({ color, alpha: 0.98 });
    visual.cube.stroke({ width: 1.2, color: 0xffffff, alpha: edgeAlpha });
  };

  visual.cube.clear();
  for (const face of sideFaces) drawFace(face.ids, face.color, 0.30 + ratio * 0.22);
  drawFace([4, 5, 6, 7], scaleColor(baseColor, 1.20), 0.48 + ratio * 0.26);
}

async function createPixiApp(host: HTMLElement): Promise<Application> {
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
  const nearest = t < 0.5 ? a : b;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    distance: d,
    segmentIndex: nearest.segmentIndex,
    segmentType: nearest.segmentType,
    curveSign: nearest.curveSign,
    level: nearest.level,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
    renderLevel: nearest.renderLevel,
    rampDirection: nearest.rampDirection,
  };
}

function svgPath(d: string, stroke: string, width: number, opacity: number, lineCap: 'butt' | 'round' = 'butt'): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', stroke);
  path.setAttribute('stroke-width', String(width));
  path.setAttribute('stroke-linecap', lineCap);
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', String(opacity));
  return path;
}

function svgFill(d: string, fill: string, opacity: number): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', fill);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('opacity', String(opacity));
  return path;
}

function neonKerb(d: string): SVGPathElement[] {
  const red = svgPath(d, '#ff2945', 6, 0.96, 'butt');
  const white = svgPath(d, '#f7fbff', 6, 1, 'butt');
  white.setAttribute('stroke-dasharray', '24 24');
  white.setAttribute('stroke-dashoffset', '0');
  red.style.filter = 'drop-shadow(0 0 5px rgba(255,41,69,.8))';
  white.style.filter = 'drop-shadow(0 0 5px rgba(255,255,255,.9))';
  return [red, white];
}

async function main(): Promise<void> {
  setBoot('LOADING TRACK...');

  const definition = await loadInitialTrack(trackJson as TrackDefinition);
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
  const fitScale = Math.min(980 / worldWidth, 560 / worldHeight);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterY = (bounds.minY + bounds.maxY) / 2;
  const toCanvasWorld = (x: number, y: number): Point => ({
    x: 640 + (x - worldCenterX) * fitScale,
    y: 370 + (y - worldCenterY) * fitScale,
  });

  const totalLength = compiled.totalLength;
  const speedMultiplier = definition.speedMultiplier ?? 1;
  const wrap = (distance: number): number => ((distance % totalLength) + totalLength) % totalLength;
  const laneOffset = definition.road.laneSpacing / 2;
  const roadHalfWidth = definition.road.width / 2;
  const autoCloseSegmentIndex = definition.segments.length;
  const autoCloseRange = compiled.segments.find((segment) => segment.segmentIndex === autoCloseSegmentIndex);

  const rawWorld: Array<{
    worldX: number;
    worldY: number;
    elevation: number;
    distance: number;
    x: number;
    y: number;
    level: number;
    renderLevel: number;
    segmentIndex: number;
    segmentType: WorldPoint['segmentType'];
    curveSign: -1 | 0 | 1;
    curvature: number;
  }> = [];

  for (let i = 0; i < CACHE_SAMPLES; i += 1) {
    const distance = (i / CACHE_SAMPLES) * totalLength;
    const original = worldAt(compiled, distance);
    const fitted = toCanvasWorld(original.x, original.y);
    const projected = projectIso(fitted.x, fitted.y, original.elevation);
    const segment = definition.segments[original.segmentIndex];
    const curvature = segment?.type === 'curve' ? (segment.angle * DEG) / segment.length : 0;
    rawWorld.push({
      worldX: fitted.x,
      worldY: fitted.y,
      elevation: original.elevation,
      distance,
      x: projected.x,
      y: projected.y,
      level: original.level,
      renderLevel: original.renderLevel,
      segmentIndex: original.segmentIndex,
      segmentType: original.segmentType,
      curveSign: original.curveSign,
      curvature,
    });
  }

  let closeNx = 0;
  let closeNy = 0;
  if (autoCloseRange) {
    const closeStart = worldAt(compiled, autoCloseRange.start);
    const closeEnd = worldAt(compiled, autoCloseRange.end - 0.001);
    const startWorld = toCanvasWorld(closeStart.x, closeStart.y);
    const endWorld = toCanvasWorld(closeEnd.x, closeEnd.y);
    const closeDx = endWorld.x - startWorld.x;
    const closeDy = endWorld.y - startWorld.y;
    const closeMag = Math.hypot(closeDx, closeDy) || 1;
    closeNx = -closeDy / closeMag;
    closeNy = closeDx / closeMag;
  }

  const cache: CachePoint[] = rawWorld.map((p, i) => {
    const before = rawWorld[(i - 1 + CACHE_SAMPLES) % CACHE_SAMPLES];
    const after = rawWorld[(i + 1) % CACHE_SAMPLES];
    const worldDx = after.worldX - before.worldX;
    const worldDy = after.worldY - before.worldY;
    const worldMag = Math.hypot(worldDx, worldDy) || 1;
    const onAutoClose = autoCloseRange && p.distance >= autoCloseRange.start && p.distance <= autoCloseRange.end;
    const worldNx = onAutoClose ? closeNx : -worldDy / worldMag;
    const worldNy = onAutoClose ? closeNy : worldDx / worldMag;
    const screenDx = after.x - before.x;
    const screenDy = after.y - before.y;
    return {
      ...p,
      worldNx,
      worldNy,
      angle: Math.atan2(screenDy, screenDx),
    };
  });

  const sample = (distance: number, offset = -laneOffset): TrackPoint => {
    const d = wrap(distance);
    const exact = (d / totalLength) * CACHE_SAMPLES;
    const i0 = Math.floor(exact) % CACHE_SAMPLES;
    const i1 = (i0 + 1) % CACHE_SAMPLES;
    const t = exact - Math.floor(exact);
    const a = cache[i0];
    const b = cache[i1];
    const nearest = t < 0.5 ? a : b;
    const lerp = (x: number, y: number): number => x + (y - x) * t;
    let angleDelta = b.angle - a.angle;
    if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    const centerWorldX = lerp(a.worldX, b.worldX);
    const centerWorldY = lerp(a.worldY, b.worldY);
    let worldNx = lerp(a.worldNx, b.worldNx);
    let worldNy = lerp(a.worldNy, b.worldNy);
    const normalMag = Math.hypot(worldNx, worldNy) || 1;
    worldNx /= normalMag;
    worldNy /= normalMag;
    const worldX = centerWorldX + worldNx * offset;
    const worldY = centerWorldY + worldNy * offset;
    const elevation = lerp(a.elevation, b.elevation);
    const projected = projectIso(worldX, worldY, elevation);
    return {
      x: projected.x,
      y: projected.y,
      angle: a.angle + angleDelta * t,
      distance: d,
      elevation,
      level: nearest.level,
      renderLevel: nearest.renderLevel,
      segmentIndex: nearest.segmentIndex,
      segmentType: nearest.segmentType,
      curveSign: nearest.curveSign,
      curvature: nearest.curvature,
      worldX,
      worldY,
    };
  };

  const pathForLevel = (level: number, offset: number): string => {
    let d = '';
    let drawing = false;
    for (let i = 0; i <= SVG_SAMPLES; i += 1) {
      const at = (i / SVG_SAMPLES) * totalLength;
      const p = sample(at, offset);
      if (p.renderLevel !== level) {
        drawing = false;
        continue;
      }
      d += `${drawing ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
      drawing = true;
    }
    return d;
  };

  const asphaltForLevel = (level: number): string => {
    let d = '';
    let left: Point[] = [];
    let right: Point[] = [];

    const closeSection = (): void => {
      if (left.length >= 2) {
        d += `M${left.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L')} `;
        d += `L${right.reverse().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L')} Z `;
      }
      left = [];
      right = [];
    };

    for (let i = 0; i <= SVG_SAMPLES; i += 1) {
      const at = (i / SVG_SAMPLES) * totalLength;
      const centerPoint = sample(at, 0);
      if (centerPoint.renderLevel !== level) {
        closeSection();
        continue;
      }
      left.push(sample(at, -roadHalfWidth));
      right.push(sample(at, roadHalfWidth));
    }
    closeSection();
    return d;
  };

  const stack = document.querySelector<HTMLDivElement>('#level-stack');
  if (!stack) throw new Error('Missing #level-stack');
  stack.replaceChildren();

  const levelRenderers: LevelRenderer[] = [];
  const levelSvgs = new Map<number, SVGSVGElement>();

  setBoot(`BUILDING ${compiled.maxLevel + 1} LEVELS...`);

  for (let level = 0; level <= compiled.maxLevel; level += 1) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'track-level-svg');
    svg.style.zIndex = String(level * 2);

    const center = pathForLevel(level, 0);
    const leftEdge = pathForLevel(level, -roadHalfWidth);
    const rightEdge = pathForLevel(level, roadHalfWidth);
    const laneA = pathForLevel(level, -laneOffset);
    const laneB = pathForLevel(level, laneOffset);
    if (center) {
      svg.appendChild(svgFill(asphaltForLevel(level), '#ffffff', 0.1));
      for (const edge of neonKerb(leftEdge)) svg.appendChild(edge);
      for (const edge of neonKerb(rightEdge)) svg.appendChild(edge);
      svg.appendChild(svgPath(laneA, '#010309', 7, 0.82, 'round'));
      svg.appendChild(svgPath(laneB, '#010309', 7, 0.82, 'round'));
      svg.appendChild(svgPath(laneA, '#83f8ff', 2.2, 0.90, 'round'));
      svg.appendChild(svgPath(laneB, '#ff72ee', 2.2, 0.86, 'round'));
    }

    stack.appendChild(svg);
    levelSvgs.set(level, svg);

    const host = document.createElement('div');
    host.className = 'pixi-level';
    host.style.zIndex = String(level * 2 + 1);
    stack.appendChild(host);
    const app = await createPixiApp(host);
    app.stage.sortableChildren = true;
    levelRenderers.push({ level, app });
  }

  compiled.segments.filter((segment) => segment.type === 'curve').forEach((segment, curveIndex) => {
    const svg = levelSvgs.get(segment.renderLevel);
    if (!svg || segment.curveSign === 0) return;
    for (let i = 0; i < 5; i += 1) {
      const p = sample(segment.start + (segment.end - segment.start) * (0.35 + i * 0.06), 0);
      const text = document.createElementNS(SVG_NS, 'text');
      text.textContent = '›››';
      text.setAttribute('x', p.x.toFixed(2));
      text.setAttribute('y', p.y.toFixed(2));
      text.setAttribute('class', `curve-chevron ${curveIndex % 2 === 0 ? 'cyan' : 'magenta'}`);
      text.setAttribute('transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      text.style.animationDelay = `${i * 105}ms`;
      svg.appendChild(text);
    }
  });

  const uiHost = document.querySelector<HTMLDivElement>('#pixi-ui');
  if (!uiHost) throw new Error('Missing #pixi-ui');
  uiHost.style.zIndex = String(compiled.maxLevel * 2 + 3);
  const uiApp = await createPixiApp(uiHost);

  const makePlayer = (id: 1 | 2, color: number, offset: number, distance: number): Player => {
    const visuals = new Map<number, PhotonVisual>();
    for (const renderer of levelRenderers) {
      const visual = createPhotonVisual(color);
      visual.trail.zIndex = 0;
      visual.root.zIndex = 10000;
      renderer.app.stage.addChild(visual.trail, visual.root);
      visuals.set(renderer.level, visual);
    }
    return {
      id,
      color,
      laneOffset: offset,
      distance,
      speed: 0,
      throttle: false,
      visuals,
      laps: 0,
      lastLapMs: null,
      bestLapMs: null,
      lapStartedAt: performance.now(),
      lapArmed: false,
    };
  };

  const players: Player[] = [
    makePlayer(1, 0x27e7ff, -laneOffset, 90),
    makePlayer(2, 0xb76cff, laneOffset, 35),
  ];

  const cyanHud = new Text({
    text: '',
    style: new TextStyle({ fill: colorHex(players[0].color), fontSize: 16, fontFamily: 'monospace', lineHeight: 22, fontWeight: '700' }),
  });
  cyanHud.position.set(24, 20);
  uiApp.stage.addChild(cyanHud);

  const violetHud = new Text({
    text: '',
    style: new TextStyle({ fill: colorHex(players[1].color), fontSize: 16, fontFamily: 'monospace', lineHeight: 22, fontWeight: '700', align: 'right' }),
  });
  violetHud.anchor.set(1, 0);
  violetHud.position.set(WIDTH - 24, 20);
  uiApp.stage.addChild(violetHud);

  const centerHud = new Text({
    text: '',
    style: new TextStyle({ fill: '#cfeff5', fontSize: 13, fontFamily: 'monospace', align: 'center' }),
  });
  centerHud.anchor.set(0.5, 0);
  centerHud.position.set(WIDTH / 2, 22);
  uiApp.stage.addChild(centerHud);

  boot?.remove();
  setupTrackEditor({ current: definition });

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
    if (event.clientX - rect.left < rect.width / 2) leftPointers.add(event.pointerId);
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

  const renderPlayer = (player: Player, p: TrackPoint, ratio: number): void => {
    const look = 14;
    const behind = sample(player.distance - look, player.laneOffset);
    const ahead = sample(player.distance + look, player.laneOffset);
    const worldDx = ahead.worldX - behind.worldX;
    const worldDy = ahead.worldY - behind.worldY;
    const yaw = Math.atan2(worldDy, worldDx);
    const dz = ahead.elevation - behind.elevation;
    const horizontal = Math.hypot(worldDx, worldDy) || look * 2;
    const pitch = Math.atan2(dz, horizontal);
    const horizontalDepth = p.worldX * 0.26 + p.worldY * 0.36;

    for (const [level, visual] of player.visuals) {
      const active = level === p.renderLevel;
      visual.root.visible = active;
      visual.trail.visible = active;
      if (!active) continue;

      visual.root.position.set(p.x, p.y - 3);
      visual.root.rotation = 0;
      visual.root.zIndex = 10000 + horizontalDepth;
      const scale = 0.78 + ratio * 0.07;
      visual.root.scale.set(scale);
      visual.glow.alpha = 0.62 + ratio * 0.28;
      drawCube3d(visual, player.color, yaw, pitch, ratio);

      visual.trail.clear();
      if (ratio <= 0.02) continue;
      const wakeLength = (40 + ratio * 520) * TRAIL_SCALE;
      const points: TrackPoint[] = [];
      for (let i = 24; i >= 0; i -= 1) {
        points.push(sample(player.distance - wakeLength * (i / 24), player.laneOffset));
      }
      drawOpenPath(visual.trail, points, 28 + ratio * 12, player.color, 0.07 + ratio * 0.04);
      drawOpenPath(visual.trail, points, 11 + ratio * 7, player.color, 0.18 + ratio * 0.11);
      drawOpenPath(visual.trail, points, 3 + ratio * 3, 0xe9ffff, 0.64 + ratio * 0.22);
    }
  };

  let frames = 0;
  let elapsed = 0;
  let fps = 0;
  let lastTime = performance.now();

  const tick = (now: number): void => {
    const deltaMs = Math.min(now - lastTime, 40);
    lastTime = now;
    const dt = deltaMs / 1000;

    for (const player of players) {
      player.speed += (player.throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
      player.speed = Math.max(0, Math.min(PHYSICS.maxSpeed, player.speed));

      const beforeDistance = player.distance;
      const before = sample(beforeDistance, player.laneOffset);
      const laneScale = Math.max(0.15, 1 - before.curvature * player.laneOffset);
      const centerAdvance = (player.speed / laneScale) * speedMultiplier * dt;
      const unwrappedDistance = beforeDistance + centerAdvance;
      const crossedStart = unwrappedDistance >= totalLength;
      player.distance = wrap(unwrappedDistance);

      if (crossedStart) {
        if (!player.lapArmed) {
          player.lapArmed = true;
          player.lapStartedAt = now;
        } else {
          const lapMs = now - player.lapStartedAt;
          player.lapStartedAt = now;
          player.laps += 1;
          player.lastLapMs = lapMs;
          player.bestLapMs = player.bestLapMs === null ? lapMs : Math.min(player.bestLapMs, lapMs);
        }
      }

      const p = sample(player.distance, player.laneOffset);
      renderPlayer(player, p, clamp01(player.speed / PHYSICS.maxSpeed));
    }

    for (const renderer of levelRenderers) renderer.app.renderer.render(renderer.app.stage);

    frames += 1;
    elapsed += deltaMs;
    if (elapsed >= 500) {
      fps = (frames * 1000) / elapsed;
      frames = 0;
      elapsed = 0;
    }

    cyanHud.text = `CYAN\nVUELTAS ${players[0].laps}\nULT ${formatLap(players[0].lastLapMs)}\nBEST ${formatLap(players[0].bestLapMs)}`;
    violetHud.text = `VIOLET\nVUELTAS ${players[1].laps}\nULT ${formatLap(players[1].lastLapMs)}\nBEST ${formatLap(players[1].bestLapMs)}`;
    centerHud.text = `${definition.name}\nFPS ${fps.toFixed(0)}`;

    uiApp.renderer.render(uiApp.stage);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame((now) => {
    lastTime = now;
    players.forEach((player) => { player.lapStartedAt = now; });
    tick(now);
  });
}

void main().catch(showBootError);
