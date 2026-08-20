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
const DEG = Math.PI / 180;
const SVG_NS = 'http://www.w3.org/2000/svg';

const GAMEPLAY = {
  cruiseSpeed: 1900,
  laneChangeMs: 220,
};

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

type CubeVisual = {
  root: Container;
  trail: Graphics;
  glow: Graphics;
  cube: Graphics;
};

type TrailSample = {
  point: TrackPoint;
  timestamp: number;
};

type Racer = {
  color: number;
  distance: number;
  laneOffset: number;
  laneFrom: number;
  laneTarget: number;
  laneChangeStartedAt: number;
  visuals: Map<number, CubeVisual>;
  trailHistory: TrailSample[];
  laps: number;
  currentLapStartedAt: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
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

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function scaleColor(color: number, factor: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
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

function createCubeVisual(baseColor: number): CubeVisual {
  const root = new Container();
  const trail = new Graphics();
  const glow = new Graphics();
  const cube = new Graphics();
  glow.ellipse(0, 8, 30, 10).fill({ color: baseColor, alpha: 0.16 });
  root.addChild(glow, cube);
  return { root, trail, glow, cube };
}

function drawCube3d(visual: CubeVisual, baseColor: number, yaw: number, pitch: number): void {
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
  for (const face of sideFaces) drawFace(face.ids, face.color, 0.42);
  drawFace([4, 5, 6, 7], scaleColor(baseColor, 1.20), 0.68);
}

async function createPixiApp(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({ width: WIDTH, height: HEIGHT, backgroundAlpha: 0, antialias: true, resolution: 1, autoDensity: false, preference: 'webgl', autoStart: false });
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
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, distance: d, segmentIndex: nearest.segmentIndex, segmentType: nearest.segmentType, curveSign: nearest.curveSign, level: nearest.level, elevation: a.elevation + (b.elevation - a.elevation) * t, renderLevel: nearest.renderLevel, rampDirection: nearest.rampDirection };
}

function svgPath(d: string, stroke: string, width: number, opacity: number, lineCap: 'butt' | 'round' = 'butt'): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', stroke); path.setAttribute('stroke-width', String(width)); path.setAttribute('stroke-linecap', lineCap); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('opacity', String(opacity));
  return path;
}

function svgFill(d: string, fill: string, opacity: number): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path'); path.setAttribute('d', d); path.setAttribute('fill', fill); path.setAttribute('fill-rule', 'evenodd'); path.setAttribute('opacity', String(opacity)); return path;
}

function neonKerb(d: string): SVGPathElement[] {
  const red = svgPath(d, '#ff2945', 6, 0.72, 'butt');
  const white = svgPath(d, '#f7fbff', 6, 0.78, 'butt');
  white.setAttribute('stroke-dasharray', '24 24');
  red.style.filter = 'drop-shadow(0 0 3px rgba(255,41,69,.55))';
  white.style.filter = 'drop-shadow(0 0 3px rgba(255,255,255,.55))';
  return [red, white];
}

async function main(): Promise<void> {
  setBoot('LOADING TRACK...');
  const definition = await loadInitialTrack(trackJson as TrackDefinition);
  const compiled = compileTrack(definition, 5);
  if (compiled.points.length < 4 || compiled.totalLength <= 0) throw new Error('Track compiler produced an empty track');

  const bounds = compiled.points.reduce((acc, p) => ({ minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x), minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min(980 / worldWidth, 560 / worldHeight);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterY = (bounds.minY + bounds.maxY) / 2;
  const toCanvasWorld = (x: number, y: number): Point => ({ x: 640 + (x - worldCenterX) * fitScale, y: 370 + (y - worldCenterY) * fitScale });

  const totalLength = compiled.totalLength;
  const speedMultiplier = definition.speedMultiplier ?? 1;
  const wrap = (distance: number): number => ((distance % totalLength) + totalLength) % totalLength;
  const laneOffset = definition.road.laneSpacing / 2;
  const roadHalfWidth = definition.road.width / 2;
  const autoCloseSegmentIndex = definition.segments.length;
  const autoCloseRange = compiled.segments.find((segment) => segment.segmentIndex === autoCloseSegmentIndex);

  const rawWorld: Array<{ worldX: number; worldY: number; elevation: number; distance: number; x: number; y: number; level: number; renderLevel: number; segmentIndex: number; segmentType: WorldPoint['segmentType']; curveSign: -1 | 0 | 1; curvature: number }> = [];
  for (let i = 0; i < CACHE_SAMPLES; i += 1) {
    const distance = (i / CACHE_SAMPLES) * totalLength;
    const original = worldAt(compiled, distance);
    const fitted = toCanvasWorld(original.x, original.y);
    const projected = projectIso(fitted.x, fitted.y, original.elevation);
    const segment = definition.segments[original.segmentIndex];
    const curvature = segment?.type === 'curve' ? (segment.angle * DEG) / segment.length : 0;
    rawWorld.push({ worldX: fitted.x, worldY: fitted.y, elevation: original.elevation, distance, x: projected.x, y: projected.y, level: original.level, renderLevel: original.renderLevel, segmentIndex: original.segmentIndex, segmentType: original.segmentType, curveSign: original.curveSign, curvature });
  }

  let closeNx = 0; let closeNy = 0;
  if (autoCloseRange) {
    const closeStart = worldAt(compiled, autoCloseRange.start); const closeEnd = worldAt(compiled, autoCloseRange.end - 0.001);
    const startWorld = toCanvasWorld(closeStart.x, closeStart.y); const endWorld = toCanvasWorld(closeEnd.x, closeEnd.y);
    const closeDx = endWorld.x - startWorld.x; const closeDy = endWorld.y - startWorld.y; const closeMag = Math.hypot(closeDx, closeDy) || 1;
    closeNx = -closeDy / closeMag; closeNy = closeDx / closeMag;
  }

  const cache: CachePoint[] = rawWorld.map((p, i) => {
    const before = rawWorld[(i - 1 + CACHE_SAMPLES) % CACHE_SAMPLES]; const after = rawWorld[(i + 1) % CACHE_SAMPLES];
    const worldDx = after.worldX - before.worldX; const worldDy = after.worldY - before.worldY; const worldMag = Math.hypot(worldDx, worldDy) || 1;
    const onAutoClose = autoCloseRange && p.distance >= autoCloseRange.start && p.distance <= autoCloseRange.end;
    const worldNx = onAutoClose ? closeNx : -worldDy / worldMag; const worldNy = onAutoClose ? closeNy : worldDx / worldMag;
    const screenDx = after.x - before.x; const screenDy = after.y - before.y;
    return { ...p, worldNx, worldNy, angle: Math.atan2(screenDy, screenDx) };
  });

  const sample = (distance: number, offset = -laneOffset): TrackPoint => {
    const d = wrap(distance); const exact = (d / totalLength) * CACHE_SAMPLES; const i0 = Math.floor(exact) % CACHE_SAMPLES; const i1 = (i0 + 1) % CACHE_SAMPLES; const t = exact - Math.floor(exact);
    const a = cache[i0]; const b = cache[i1]; const nearest = t < 0.5 ? a : b; const lerp = (x: number, y: number): number => x + (y - x) * t;
    let angleDelta = b.angle - a.angle; if (angleDelta > Math.PI) angleDelta -= Math.PI * 2; if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    const centerWorldX = lerp(a.worldX, b.worldX); const centerWorldY = lerp(a.worldY, b.worldY);
    let worldNx = lerp(a.worldNx, b.worldNx); let worldNy = lerp(a.worldNy, b.worldNy); const normalMag = Math.hypot(worldNx, worldNy) || 1; worldNx /= normalMag; worldNy /= normalMag;
    const worldX = centerWorldX + worldNx * offset; const worldY = centerWorldY + worldNy * offset; const elevation = lerp(a.elevation, b.elevation); const projected = projectIso(worldX, worldY, elevation);
    return { x: projected.x, y: projected.y, angle: a.angle + angleDelta * t, distance: d, elevation, level: nearest.level, renderLevel: nearest.renderLevel, segmentIndex: nearest.segmentIndex, segmentType: nearest.segmentType, curveSign: nearest.curveSign, curvature: nearest.curvature, worldX, worldY };
  };

  const pathForLevel = (level: number, offset: number): string => {
    let d = ''; let drawing = false;
    for (let i = 0; i <= SVG_SAMPLES; i += 1) { const at = (i / SVG_SAMPLES) * totalLength; const p = sample(at, offset); if (p.renderLevel !== level) { drawing = false; continue; } d += `${drawing ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)} `; drawing = true; }
    return d;
  };

  const asphaltForLevel = (level: number): string => {
    let d = ''; let left: Point[] = []; let right: Point[] = [];
    const closeSection = (): void => { if (left.length >= 2) { d += `M${left.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L')} `; d += `L${right.reverse().map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' L')} Z `; } left = []; right = []; };
    for (let i = 0; i <= SVG_SAMPLES; i += 1) { const at = (i / SVG_SAMPLES) * totalLength; const centerPoint = sample(at, 0); if (centerPoint.renderLevel !== level) { closeSection(); continue; } left.push(sample(at, -roadHalfWidth)); right.push(sample(at, roadHalfWidth)); }
    closeSection(); return d;
  };

  const stack = document.querySelector<HTMLDivElement>('#level-stack'); if (!stack) throw new Error('Missing #level-stack'); stack.replaceChildren();
  const levelRenderers: LevelRenderer[] = []; const levelSvgs = new Map<number, SVGSVGElement>(); setBoot(`BUILDING ${compiled.maxLevel + 1} LEVELS...`);
  for (let level = 0; level <= compiled.maxLevel; level += 1) {
    const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svg.setAttribute('class', 'track-level-svg'); svg.style.zIndex = String(level * 2);
    const center = pathForLevel(level, 0); const leftEdge = pathForLevel(level, -roadHalfWidth); const rightEdge = pathForLevel(level, roadHalfWidth); const laneA = pathForLevel(level, -laneOffset); const laneB = pathForLevel(level, laneOffset);
    if (center) { svg.appendChild(svgFill(asphaltForLevel(level), '#ffffff', 0.1)); for (const edge of neonKerb(leftEdge)) svg.appendChild(edge); for (const edge of neonKerb(rightEdge)) svg.appendChild(edge); svg.appendChild(svgPath(laneA, '#010309', 7, 0.82, 'round')); svg.appendChild(svgPath(laneB, '#010309', 7, 0.82, 'round')); svg.appendChild(svgPath(laneA, '#83f8ff', 2.2, 0.90, 'round')); svg.appendChild(svgPath(laneB, '#ff72ee', 2.2, 0.86, 'round')); }
    stack.appendChild(svg); levelSvgs.set(level, svg);
    const host = document.createElement('div'); host.className = 'pixi-level'; host.style.zIndex = String(level * 2 + 1); stack.appendChild(host); const app = await createPixiApp(host); app.stage.sortableChildren = true; levelRenderers.push({ level, app });
  }

  const startPoint = sample(0, 0);
  const startSvg = levelSvgs.get(startPoint.renderLevel);
  const startNormal = cache[0];
  if (startSvg && startNormal) {
    const tangentX = -startNormal.worldNy;
    const tangentY = startNormal.worldNx;
    const drawFinishLine = (forwardOffset: number): void => {
      const centerX = startPoint.worldX + tangentX * forwardOffset;
      const centerY = startPoint.worldY + tangentY * forwardOffset;
      const a = projectIso(
        centerX - startNormal.worldNx * (roadHalfWidth + 3),
        centerY - startNormal.worldNy * (roadHalfWidth + 3),
        startPoint.elevation,
      );
      const b = projectIso(
        centerX + startNormal.worldNx * (roadHalfWidth + 3),
        centerY + startNormal.worldNy * (roadHalfWidth + 3),
        startPoint.elevation,
      );
      const line = svgPath(`M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)}`, '#ffffff', 2.2, 0.96, 'butt');
      line.style.filter = 'drop-shadow(0 0 2px rgba(255,255,255,.65))';
      startSvg.appendChild(line);
    };
    drawFinishLine(-5);
    drawFinishLine(5);
  }

  compiled.segments.filter((segment) => segment.type === 'curve').forEach((segment, curveIndex) => { const svg = levelSvgs.get(segment.renderLevel); if (!svg || segment.curveSign === 0) return; for (let i = 0; i < 5; i += 1) { const p = sample(segment.start + (segment.end - segment.start) * (0.35 + i * 0.06), 0); const text = document.createElementNS(SVG_NS, 'text'); text.textContent = '›››'; text.setAttribute('x', p.x.toFixed(2)); text.setAttribute('y', p.y.toFixed(2)); text.setAttribute('class', `curve-chevron ${curveIndex % 2 === 0 ? 'cyan' : 'magenta'}`); text.setAttribute('transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`); text.style.animationDelay = `${i * 105}ms`; svg.appendChild(text); } });

  const uiHost = document.querySelector<HTMLDivElement>('#pixi-ui'); if (!uiHost) throw new Error('Missing #pixi-ui'); uiHost.style.zIndex = String(compiled.maxLevel * 2 + 3); const uiApp = await createPixiApp(uiHost);
  const racerColor = 0x43f07b; const visuals = new Map<number, CubeVisual>();
  for (const renderer of levelRenderers) { const visual = createCubeVisual(racerColor); visual.trail.zIndex = 0; visual.root.zIndex = 10000; renderer.app.stage.addChild(visual.trail, visual.root); visuals.set(renderer.level, visual); }

  const now = performance.now();
  const raceStartedAt = now;
  const racer: Racer = { color: racerColor, distance: 0, laneOffset: -laneOffset, laneFrom: -laneOffset, laneTarget: -laneOffset, laneChangeStartedAt: now, visuals, trailHistory: [], laps: 0, currentLapStartedAt: now, lastLapMs: null, bestLapMs: null };

  const mainTimer = new Text({ text: '0.000', style: new TextStyle({ fill: '#ffffff', fontSize: 42, fontFamily: 'monospace', fontWeight: '800', align: 'center', stroke: { color: '#07111f', width: 5 } }) }); mainTimer.anchor.set(0.5, 0); mainTimer.position.set(WIDTH / 2, 12); uiApp.stage.addChild(mainTimer);
  const totalTimer = new Text({ text: 'TOTAL 0.000', style: new TextStyle({ fill: '#8feaff', fontSize: 19, fontFamily: 'monospace', fontWeight: '700', align: 'center', stroke: { color: '#07111f', width: 3 } }) }); totalTimer.anchor.set(0.5, 0); totalTimer.position.set(WIDTH / 2, 62); uiApp.stage.addChild(totalTimer);
  const lapHud = new Text({ text: '', style: new TextStyle({ fill: '#cfeff5', fontSize: 16, fontFamily: 'monospace', lineHeight: 22, fontWeight: '700', align: 'center' }) }); lapHud.anchor.set(0.5, 0); lapHud.position.set(WIDTH / 2, 88); uiApp.stage.addChild(lapHud);
  const centerHud = new Text({ text: '', style: new TextStyle({ fill: '#7d97a8', fontSize: 12, fontFamily: 'monospace', align: 'center' }) }); centerHud.anchor.set(0.5, 0); centerHud.position.set(WIDTH / 2, 116); uiApp.stage.addChild(centerHud);

  boot?.remove(); setupTrackEditor({ current: definition });
  const cyanButton = new Graphics(); cyanButton.roundRect(34, HEIGHT - 116, 210, 78, 22).fill({ color: 0x27e7ff, alpha: 0.24 }).stroke({ width: 4, color: 0x27e7ff, alpha: 0.95 }); uiApp.stage.addChild(cyanButton);
  const cyanLabel = new Text({ text: 'CYAN', style: new TextStyle({ fill: '#83f8ff', fontSize: 28, fontWeight: '800', fontFamily: 'monospace' }) }); cyanLabel.anchor.set(0.5); cyanLabel.position.set(139, HEIGHT - 77); uiApp.stage.addChild(cyanLabel);
  const violetButton = new Graphics(); violetButton.roundRect(WIDTH - 244, HEIGHT - 116, 210, 78, 22).fill({ color: 0xb76cff, alpha: 0.24 }).stroke({ width: 4, color: 0xb76cff, alpha: 0.95 }); uiApp.stage.addChild(violetButton);
  const violetLabel = new Text({ text: 'VIOLET', style: new TextStyle({ fill: '#ff9af5', fontSize: 28, fontWeight: '800', fontFamily: 'monospace' }) }); violetLabel.anchor.set(0.5); violetLabel.position.set(WIDTH - 139, HEIGHT - 77); uiApp.stage.addChild(violetLabel);

  const chooseLane = (target: number, timestamp = performance.now()): void => { if (Math.abs(racer.laneTarget - target) < 0.01) return; racer.laneFrom = racer.laneOffset; racer.laneTarget = target; racer.laneChangeStartedAt = timestamp; };
  window.addEventListener('keydown', (event) => { if (event.code === 'KeyA' || event.code === 'ArrowLeft') chooseLane(-laneOffset); if (event.code === 'KeyD' || event.code === 'ArrowRight') chooseLane(laneOffset); });
  const uiCanvas = uiApp.canvas; uiCanvas.style.touchAction = 'none'; uiCanvas.addEventListener('pointerdown', (event) => { const rect = uiCanvas.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * WIDTH; chooseLane(x < WIDTH / 2 ? -laneOffset : laneOffset, performance.now()); });

  const renderRacer = (p: TrackPoint, timestamp: number): void => {
    const look = 14; const behind = sample(racer.distance - look, racer.laneOffset); const ahead = sample(racer.distance + look, racer.laneOffset);
    const worldDx = ahead.worldX - behind.worldX; const worldDy = ahead.worldY - behind.worldY; const yaw = Math.atan2(worldDy, worldDx); const dz = ahead.elevation - behind.elevation; const horizontal = Math.hypot(worldDx, worldDy) || look * 2; const pitch = Math.atan2(dz, horizontal); const horizontalDepth = p.worldX * 0.26 + p.worldY * 0.36;
    racer.trailHistory.push({ point: p, timestamp });
    const trailWindowMs = 185; while (racer.trailHistory.length > 2 && racer.trailHistory[0].timestamp < timestamp - trailWindowMs) racer.trailHistory.shift();
    for (const [level, visual] of racer.visuals) {
      const active = level === p.renderLevel; visual.root.visible = active; visual.trail.visible = active; if (!active) continue;
      visual.root.position.set(p.x, p.y - 3); visual.root.zIndex = 10000 + horizontalDepth; visual.root.scale.set(0.84); visual.glow.alpha = 0.88; drawCube3d(visual, racer.color, yaw, pitch);
      visual.trail.clear(); const historyPoints = racer.trailHistory.map((entry) => entry.point).filter((point) => point.renderLevel === level);
      drawOpenPath(visual.trail, historyPoints, 34, racer.color, 0.07); drawOpenPath(visual.trail, historyPoints, 16, racer.color, 0.17); drawOpenPath(visual.trail, historyPoints, 5, 0xe9ffff, 0.76);
    }
  };

  let frames = 0; let elapsed = 0; let fps = 0; let lastTime = performance.now();
  const tick = (timestamp: number): void => {
    const deltaMs = Math.min(timestamp - lastTime, 40); lastTime = timestamp; const dt = deltaMs / 1000;
    const laneProgress = smoothstep((timestamp - racer.laneChangeStartedAt) / GAMEPLAY.laneChangeMs); racer.laneOffset = racer.laneFrom + (racer.laneTarget - racer.laneFrom) * laneProgress;
    const before = sample(racer.distance, racer.laneOffset); const laneScale = Math.max(0.15, 1 - before.curvature * racer.laneOffset); const centerAdvance = (GAMEPLAY.cruiseSpeed / laneScale) * speedMultiplier * dt; const unwrappedDistance = racer.distance + centerAdvance; const crossedStart = unwrappedDistance >= totalLength; racer.distance = wrap(unwrappedDistance);
    if (crossedStart) { const lapMs = timestamp - racer.currentLapStartedAt; racer.currentLapStartedAt = timestamp; racer.laps += 1; racer.lastLapMs = lapMs; racer.bestLapMs = racer.bestLapMs === null ? lapMs : Math.min(racer.bestLapMs, lapMs); }
    renderRacer(sample(racer.distance, racer.laneOffset), timestamp); for (const renderer of levelRenderers) renderer.app.renderer.render(renderer.app.stage);
    frames += 1; elapsed += deltaMs; if (elapsed >= 500) { fps = (frames * 1000) / elapsed; frames = 0; elapsed = 0; }
    mainTimer.text = formatLap(timestamp - racer.currentLapStartedAt); totalTimer.text = `TOTAL ${formatLap(timestamp - raceStartedAt)}`; lapHud.text = `VUELTA ${racer.laps + 1}   ·   ÚLT ${formatLap(racer.lastLapMs)}   ·   BEST ${formatLap(racer.bestLapMs)}`; centerHud.text = `${definition.name}   ·   FPS ${fps.toFixed(0)}`;
    const onCyan = racer.laneTarget < 0; cyanButton.alpha = onCyan ? 1 : 0.48; violetButton.alpha = onCyan ? 0.48 : 1; uiApp.renderer.render(uiApp.stage); requestAnimationFrame(tick);
  };
  requestAnimationFrame((timestamp) => { lastTime = timestamp; racer.currentLapStartedAt = timestamp; tick(timestamp); });
}

void main().catch(showBootError);
