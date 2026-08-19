import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';
import trackJson from './tracks/neon-long.json';
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

const PHYSICS = {
  acceleration: 760,
  coastDrag: 520,
  maxSpeed: 2350,
};

const LIMIT_COLOR = 0xff2638;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Point = { x: number; y: number };

type TrackPoint = Point & {
  angle: number;
  distance: number;
  elevation: number;
  level: number;
  renderLevel: number;
  segmentIndex: number;
  segmentType: WorldPoint['segmentType'];
  curveSign: -1 | 0 | 1;
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
  color: number;
  laneOffset: number;
  distance: number;
  speed: number;
  throttle: boolean;
  visuals: Map<number, PhotonVisual>;
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

function projectIso(x: number, y: number, z = 0): Point {
  const dx = x - 640;
  const dy = y - 360;
  return {
    x: 640 + dx * 0.86 - dy * 0.42,
    y: 385 + dx * 0.20 + dy * 0.48 - z * 0.90,
  };
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

function svgPath(d: string, stroke: string, width: number, opacity: number, filter?: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', stroke);
  path.setAttribute('stroke-width', String(width));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', String(opacity));
  if (filter) path.setAttribute('filter', filter);
  return path;
}

async function main(): Promise<void> {
  setBoot('COMPILING MULTI-LEVEL TRACK...');

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
  const fitScale = Math.min(900 / worldWidth, 500 / worldHeight);
  const worldCenterX = (bounds.minX + bounds.maxX) / 2;
  const worldCenterY = (bounds.minY + bounds.maxY) / 2;
  const toCanvasWorld = (x: number, y: number): Point => ({
    x: 640 + (x - worldCenterX) * fitScale,
    y: 370 + (y - worldCenterY) * fitScale,
  });

  const totalLength = compiled.totalLength;
  const wrap = (distance: number): number => ((distance % totalLength) + totalLength) % totalLength;
  const laneOffset = definition.road.laneSpacing / 2;
  const roadHalfWidth = definition.road.width / 2;

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
  }> = [];

  for (let i = 0; i < CACHE_SAMPLES; i += 1) {
    const distance = (i / CACHE_SAMPLES) * totalLength;
    const original = worldAt(compiled, distance);
    const fitted = toCanvasWorld(original.x, original.y);
    const projected = projectIso(fitted.x, fitted.y, original.elevation);
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
    });
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
      elevation,
      level: nearest.level,
      renderLevel: nearest.renderLevel,
      segmentIndex: nearest.segmentIndex,
      segmentType: nearest.segmentType,
      curveSign: nearest.curveSign,
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

  const pathRange = (start: number, end: number, offset: number, samples = 24): string => {
    let d = '';
    for (let i = 0; i <= samples; i += 1) {
      const at = start + ((end - start) * i) / samples;
      const p = sample(at, offset);
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    }
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
    const laneA = pathForLevel(level, -laneOffset);
    const laneB = pathForLevel(level, laneOffset);
    if (center) {
      svg.appendChild(svgPath(center, '#4a25ff', 180, 0.08));
      svg.appendChild(svgPath(center, '#182941', 164, 1));
      svg.appendChild(svgPath(center, '#0d1625', 148, 0.98));
      svg.appendChild(svgPath(center, '#174d74', 118, 0.18));
      svg.appendChild(svgPath(laneA, '#010309', 7, 1));
      svg.appendChild(svgPath(laneB, '#010309', 7, 1));
      svg.appendChild(svgPath(laneA, '#83f8ff', 2.2, 0.96));
      svg.appendChild(svgPath(laneB, '#ff72ee', 2.2, 0.90));
    }

    const label = document.createElementNS(SVG_NS, 'text');
    label.textContent = `LEVEL ${level}`;
    label.setAttribute('x', String(1080));
    label.setAttribute('y', String(55 + level * 22));
    label.setAttribute('class', 'level-label');
    svg.appendChild(label);

    stack.appendChild(svg);
    levelSvgs.set(level, svg);

    const host = document.createElement('div');
    host.className = 'pixi-level';
    host.style.zIndex = String(level * 2 + 1);
    stack.appendChild(host);
    const app = await createPixiApp(host);
    levelRenderers.push({ level, app });
  }

  // Curves are always level in the JSON grammar, so their kerbs belong to one SVG level.
  compiled.segments.filter((segment) => segment.type === 'curve').forEach((segment, curveIndex) => {
    const svg = levelSvgs.get(segment.renderLevel);
    if (!svg || segment.curveSign === 0) return;
    const sign = segment.curveSign;
    const interiorOffset = sign * (roadHalfWidth + 5);
    const exteriorOffset = -interiorOffset;
    const blocks = Math.max(8, Math.round((segment.end - segment.start) / 22));
    const blockSpan = (segment.end - segment.start) / blocks;
    for (let i = 0; i < blocks; i += 1) {
      const start = segment.start + blockSpan * i;
      const end = start + blockSpan * 0.90;
      const kerb = svgPath(pathRange(start, end, interiorOffset, 5), i % 2 === 0 ? '#ff334f' : '#f5f8ff', 11, 0.92);
      kerb.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(kerb);
    }
    const exitStart = segment.end - (segment.end - segment.start) * 0.20;
    for (let i = 0; i < 5; i += 1) {
      const start = exitStart + ((segment.end - exitStart) * i) / 5;
      const end = exitStart + ((segment.end - exitStart) * (i + 0.88)) / 5;
      const kerb = svgPath(pathRange(start, end, exteriorOffset, 5), i % 2 === 0 ? '#ff334f' : '#f5f8ff', 11, 0.88);
      kerb.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(kerb);
    }

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

  // Give standardized up/down ramps a subtle shadow so the height change reads clearly.
  compiled.segments.filter((segment) => segment.type === 'up' || segment.type === 'down').forEach((segment) => {
    const svg = levelSvgs.get(segment.renderLevel);
    if (!svg) return;
    const shadow = svgPath(pathRange(segment.start, segment.end, 0, 60), '#00030a', 154, 0.22);
    shadow.setAttribute('transform', 'translate(0 12)');
    svg.insertBefore(shadow, svg.firstChild);
  });

  const uiHost = document.querySelector<HTMLDivElement>('#pixi-ui');
  if (!uiHost) throw new Error('Missing #pixi-ui');
  uiHost.style.zIndex = String(compiled.maxLevel * 2 + 3);
  const uiApp = await createPixiApp(uiHost);

  const makePlayer = (id: 1 | 2, color: number, offset: number, distance: number): Player => {
    const visuals = new Map<number, PhotonVisual>();
    for (const renderer of levelRenderers) {
      const visual = createPhotonVisual();
      renderer.app.stage.addChild(visual.trail, visual.root);
      visuals.set(renderer.level, visual);
    }
    return { id, color, laneOffset: offset, distance, speed: 0, throttle: false, visuals };
  };

  const players: Player[] = [
    makePlayer(1, 0x27e7ff, -laneOffset, 90),
    makePlayer(2, 0xb76cff, laneOffset, 35),
  ];

  const hud = new Text({
    text: '',
    style: new TextStyle({ fill: '#dffcff', fontSize: 15, fontFamily: 'monospace', lineHeight: 21 }),
  });
  hud.position.set(24, 22);
  uiApp.stage.addChild(hud);

  const note = new Text({
    text: 'LEFT HALF = CYAN   //   RIGHT HALF = VIOLET   //   UP/DOWN ARE STANDARD TRACK SLOTS',
    style: new TextStyle({ fill: '#72e9f7', fontSize: 12, fontFamily: 'Arial' }),
  });
  note.position.set(24, HEIGHT - 34);
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
    for (const [level, visual] of player.visuals) {
      const active = level === p.renderLevel;
      visual.root.visible = active;
      visual.trail.visible = active;
      if (!active) continue;
      visual.root.position.set(p.x, p.y);
      visual.root.rotation = p.angle;
      rebuildPhoton(visual, ratio, player.color);
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
  let maxFrame = 0;
  let maxWindow = 0;
  let lastTime = performance.now();

  const sameLevelCrossings = compiled.crossings.filter((crossing) => crossing.mode === 'crossing').length;
  const overpasses = compiled.crossings.filter((crossing) => crossing.mode === 'overpass').length;

  const tick = (now: number): void => {
    const deltaMs = Math.min(now - lastTime, 40);
    lastTime = now;
    const dt = deltaMs / 1000;

    for (const player of players) {
      player.speed += (player.throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
      player.speed = Math.max(0, Math.min(PHYSICS.maxSpeed, player.speed));
      player.distance = wrap(player.distance + player.speed * dt);
      const p = sample(player.distance, player.laneOffset);
      renderPlayer(player, p, clamp01(player.speed / PHYSICS.maxSpeed));
    }

    for (const renderer of levelRenderers) renderer.app.renderer.render(renderer.app.stage);

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
    hud.text = `TRACK ${definition.id}  ${Math.round(totalLength)}m  LEVELS ${compiled.maxLevel + 1}\nFPS ${fps.toFixed(1)}   FRAME ${deltaMs.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nCROSSINGS ${sameLevelCrossings}   OVERPASSES ${overpasses}\nCYAN   ${Math.round(players[0].speed * 0.82)}   L${p1.level} RZ${p1.renderLevel * 2 + 1} H${p1.elevation.toFixed(0)}\nVIOLET ${Math.round(players[1].speed * 0.82)}   L${p2.level} RZ${p2.renderLevel * 2 + 1} H${p2.elevation.toFixed(0)}`;
    uiApp.renderer.render(uiApp.stage);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame((now) => {
    lastTime = now;
    tick(now);
  });
}

void main().catch(showBootError);
