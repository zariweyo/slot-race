import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';

const WIDTH = 1280;
const HEIGHT = 720;
const LANE_OFFSET = 22;
const CACHE_SAMPLES = 4096;
const SVG_SAMPLES = 1400;
const BRIDGE_PLATEAU_HALF = 88;
const BRIDGE_RAMP_LENGTH = 235;
const BRIDGE_HEIGHT = 88;
const ROAD_HALF_WIDTH = 73;
const BRIDGE_ENTRY_LEAD = 115;
const TRAIL_SCALE = 0.70;
const MAX_TRAIL_LENGTH = (40 + 520) * TRAIL_SCALE;

const PHYSICS = {
  acceleration: 760,
  coastDrag: 260,
  maxSpeed: 2350,
};

const PHOTON = {
  baseColor: 0x27e7ff,
  limitColor: 0xff2638,
};

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

function rebuildPhoton(visual: PhotonVisual, ratio: number): void {
  const heat = clamp01((ratio - 0.58) / 0.42);
  const bodyColor = mixColor(PHOTON.baseColor, 0xff7a36, heat * 0.42);
  const tipColor = mixColor(PHOTON.baseColor, PHOTON.limitColor, heat);
  visual.glow.clear().ellipse(-5, 0, 58, 26).fill({ color: tipColor, alpha: 0.12 + ratio * 0.10 });
  visual.body.clear().poly([
    42, 0, 24, -7, 6, -11, -13, -10, -29, -5, -38, 0,
    -29, 5, -13, 10, 6, 11, 24, 7,
  ]).fill({ color: bodyColor, alpha: 0.98 });
  visual.body.poly([30, 0, 14, -3.5, -5, -5, -24, 0, -5, 5, 14, 3.5]).fill({ color: 0xffffff, alpha: 0.9 });
  visual.tip.clear().poly([42, 0, 25, -6, 25, 6]).fill({ color: tipColor, alpha: 1 });
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

async function main(): Promise<void> {
  setBoot('PIXI MODULE LOADED\nPRECACHING ISOMETRIC TRACK...');

  const source = document.querySelector<SVGPathElement>('#track-source');
  if (!source) throw new Error('Missing #track-source');

  const sourceLength = source.getTotalLength();
  const wrap = (distance: number): number => ((distance % sourceLength) + sourceLength) % sourceLength;
  const bridgeTopDistance = sourceLength * 0.5;
  const bridgeUnderDistance = 0;

  const elevationAt = (distance: number): number => {
    const delta = circularDelta(wrap(distance), bridgeTopDistance, sourceLength);
    if (delta <= BRIDGE_PLATEAU_HALF) return BRIDGE_HEIGHT;
    if (delta >= BRIDGE_PLATEAU_HALF + BRIDGE_RAMP_LENGTH) return 0;
    const rampProgress = 1 - (delta - BRIDGE_PLATEAU_HALF) / BRIDGE_RAMP_LENGTH;
    return BRIDGE_HEIGHT * smoothstep(rampProgress);
  };

  const rawWorld: Array<{ worldX: number; worldY: number; elevation: number; distance: number; x: number; y: number }> = [];
  for (let i = 0; i < CACHE_SAMPLES; i += 1) {
    const distance = (i / CACHE_SAMPLES) * sourceLength;
    const p = source.getPointAtLength(distance);
    const elevation = elevationAt(distance);
    const projected = projectIso(p.x, p.y, elevation);
    rawWorld.push({ worldX: p.x, worldY: p.y, elevation, distance, ...projected });
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
    const layer: 0 | 1 = circularDelta(p.distance, bridgeTopDistance, sourceLength) <= BRIDGE_PLATEAU_HALF ? 1 : 0;
    const underBridge = circularDelta(p.distance, bridgeUnderDistance, sourceLength) <= BRIDGE_PLATEAU_HALF;
    return { ...p, worldNx, worldNy, angle, layer, underBridge };
  });

  const sample = (distance: number, laneOffset = -LANE_OFFSET): TrackPoint => {
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
    const projected = projectIso(worldX + worldNx * laneOffset, worldY + worldNy * laneOffset, elevation);

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

  const sampledPath = (
    offset = 0,
    start = 0,
    end = sourceLength,
    samples = SVG_SAMPLES,
    yShift = 0,
  ): string => {
    let d = '';
    for (let i = 0; i <= samples; i += 1) {
      const at = start + ((end - start) * i) / samples;
      const p = sample(at, offset);
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${(p.y + yShift).toFixed(2)} `;
    }
    return d;
  };

  const centerD = sampledPath(0);
  const laneAD = sampledPath(-LANE_OFFSET);
  const laneBD = sampledPath(LANE_OFFSET);
  setPath('track-outer-glow', centerD);
  setPath('track-border', centerD);
  setPath('track-road', centerD);
  setPath('track-inner-sheen', centerD);
  setPath('lane-a-dark', laneAD);
  setPath('lane-b-dark', laneBD);
  setPath('lane-a', laneAD);
  setPath('lane-b', laneBD);

  const arrows = document.querySelector<SVGGElement>('#curve-arrows');
  if (arrows) {
    arrows.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    [0.10, 0.29, 0.60, 0.79].forEach((fraction, groupIndex) => {
      for (let i = 0; i < 5; i += 1) {
        const p = sample((fraction + i * 0.012) * sourceLength);
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

  // Racing kerbs: long interior runs in each main bend, plus a shorter exterior exit strip.
  const decor = document.querySelector<SVGGElement>('#track-decor');
  if (decor) {
    decor.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const addKerbRun = (startFraction: number, endFraction: number, side: -1 | 1, blocks: number): void => {
      const blockSpan = ((endFraction - startFraction) * sourceLength) / blocks;
      for (let i = 0; i < blocks; i += 1) {
        const start = startFraction * sourceLength + blockSpan * i;
        const end = start + blockSpan * 0.92;
        const kerb = document.createElementNS(ns, 'path');
        kerb.setAttribute('d', sampledPath(side * (ROAD_HALF_WIDTH + 5), start, end, 6));
        kerb.setAttribute('fill', 'none');
        kerb.setAttribute('stroke', i % 2 === 0 ? '#ff334f' : '#f5f8ff');
        kerb.setAttribute('stroke-width', '11');
        kerb.setAttribute('stroke-linecap', 'butt');
        kerb.setAttribute('opacity', '.92');
        decor.appendChild(kerb);
      }
    };

    // Right loop: inner kerb, then a short outside strip on exit.
    addKerbRun(0.105, 0.305, -1, 18);
    addKerbRun(0.305, 0.345, 1, 5);
    // Left loop mirrors the treatment.
    addKerbRun(0.605, 0.805, 1, 18);
    addKerbRun(0.805, 0.845, -1, 5);
  }

  const bridgeLayer = document.querySelector<SVGGElement>('#bridge-layer');
  if (!bridgeLayer) throw new Error('Missing #bridge-layer');
  bridgeLayer.replaceChildren();

  const plateauStart = bridgeTopDistance - BRIDGE_PLATEAU_HALF;
  const plateauEnd = bridgeTopDistance + BRIDGE_PLATEAU_HALF;
  const rampStart = plateauStart - BRIDGE_RAMP_LENGTH;
  const rampEnd = plateauEnd + BRIDGE_RAMP_LENGTH;

  // Shadow and a faint full-length ramp surface make the elevation legible.
  const bridgeShadow = sampledPath(0, rampStart, rampEnd, 190, 14);
  const rampDeck = sampledPath(0, rampStart, rampEnd, 190);
  const rampLeft = sampledPath(-ROAD_HALF_WIDTH, rampStart, rampEnd, 190);
  const rampRight = sampledPath(ROAD_HALF_WIDTH, rampStart, rampEnd, 190);
  bridgeLayer.appendChild(createBridgePath(bridgeShadow, '#00030a', 154, 0.24, 'bridge-shadow'));
  bridgeLayer.appendChild(createBridgePath(rampDeck, '#162337', 146, 0.18, 'bridge-ramp-deck'));
  bridgeLayer.appendChild(createBridgePath(rampLeft, '#34b8c5', 3, 0.48, 'bridge-ramp-edge'));
  bridgeLayer.appendChild(createBridgePath(rampRight, '#b53aa8', 3, 0.42, 'bridge-ramp-edge'));

  const bridgeCenter = sampledPath(0, plateauStart, plateauEnd, 100);
  const bridgeLeft = sampledPath(-ROAD_HALF_WIDTH, plateauStart, plateauEnd, 100);
  const bridgeRight = sampledPath(ROAD_HALF_WIDTH, plateauStart, plateauEnd, 100);
  const bridgeLaneA = sampledPath(-LANE_OFFSET, plateauStart, plateauEnd, 100);
  const bridgeLaneB = sampledPath(LANE_OFFSET, plateauStart, plateauEnd, 100);

  // Plateau is roughly 15% more opaque than the previous prototype.
  bridgeLayer.appendChild(createBridgePath(bridgeCenter, '#111d2e', 144, 0.50, 'bridge-deck'));
  bridgeLayer.appendChild(createBridgePath(bridgeLeft, '#4cf4ff', 3.5, 0.92, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(bridgeRight, '#ff54e7', 3.5, 0.82, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(bridgeLaneA, '#b9fdff', 2.7, 1, 'bridge-rail'));
  bridgeLayer.appendChild(createBridgePath(bridgeLaneB, '#ff9bf3', 2.7, 0.96, 'bridge-rail'));

  const bridgeEnterAt = bridgeTopDistance - BRIDGE_PLATEAU_HALF - BRIDGE_RAMP_LENGTH - BRIDGE_ENTRY_LEAD;
  const bridgeExitAt = bridgeTopDistance + BRIDGE_PLATEAU_HALF + BRIDGE_RAMP_LENGTH + MAX_TRAIL_LENGTH;

  setBoot('CACHE READY\nINITIALIZING PIXI LAYERS...');
  const underApp = await createLayer('pixi-under');
  const overApp = await createLayer('pixi-over');
  const uiApp = await createLayer('pixi-ui');

  const underVisual = createPhotonVisual();
  const overVisual = createPhotonVisual();
  underApp.stage.addChild(underVisual.trail, underVisual.root);
  overApp.stage.addChild(overVisual.trail, overVisual.root);

  const hud = new Text({
    text: '',
    style: new TextStyle({ fill: '#dffcff', fontSize: 17, fontFamily: 'monospace', lineHeight: 23 }),
  });
  hud.position.set(26, 24);
  uiApp.stage.addChild(hud);

  const note = new Text({
    text: 'HOLD SCREEN / SPACE  //  PRECACHED ISO TRACK',
    style: new TextStyle({ fill: '#72e9f7', fontSize: 13, fontFamily: 'Arial' }),
  });
  note.position.set(26, HEIGHT - 38);
  uiApp.stage.addChild(note);

  boot?.remove();

  let distance = 90;
  let speed = 0;
  let throttle = false;
  let currentZ: 1 | 3 = 1;
  let frames = 0;
  let elapsed = 0;
  let fps = 0;
  let maxFrame = 0;
  let maxWindow = 0;
  let lap = 1;
  let previousDistance = distance;
  let lapStart = performance.now();
  let lastLap = 0;
  let bestLap = Number.POSITIVE_INFINITY;
  let lastTime = performance.now();

  const setThrottle = (value: boolean): void => { throttle = value; };
  window.addEventListener('keydown', (event) => { if (event.code === 'Space') setThrottle(true); });
  window.addEventListener('keyup', (event) => { if (event.code === 'Space') setThrottle(false); });
  const uiCanvas = uiApp.canvas;
  uiCanvas.style.touchAction = 'none';
  uiCanvas.addEventListener('pointerdown', () => setThrottle(true));
  window.addEventListener('pointerup', () => setThrottle(false));
  window.addEventListener('pointercancel', () => setThrottle(false));

  const renderVisual = (visual: PhotonVisual, p: TrackPoint, ratio: number, active: boolean): void => {
    visual.root.visible = active;
    visual.trail.visible = active;
    if (!active) return;
    visual.root.position.set(p.x, p.y);
    visual.root.rotation = p.angle;
    visual.root.alpha = p.underBridge ? 0.45 : 1;
    rebuildPhoton(visual, ratio);
    visual.trail.clear();
    if (ratio <= 0.02) return;
    const wakeLength = (40 + ratio * 520) * TRAIL_SCALE;
    const points: TrackPoint[] = [];
    for (let i = 30; i >= 0; i -= 1) points.push(sample(distance - wakeLength * (i / 30)));
    const alphaScale = p.underBridge ? 0.38 : 1;
    drawOpenPath(visual.trail, points, 34 + ratio * 15, PHOTON.baseColor, (0.08 + ratio * 0.04) * alphaScale);
    drawOpenPath(visual.trail, points, 14 + ratio * 9, PHOTON.baseColor, (0.20 + ratio * 0.12) * alphaScale);
    drawOpenPath(visual.trail, points, 4 + ratio * 4, 0xe9ffff, (0.70 + ratio * 0.24) * alphaScale);
  };

  const tick = (now: number): void => {
    const deltaMs = Math.min(now - lastTime, 40);
    lastTime = now;
    const dt = deltaMs / 1000;

    speed += (throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
    speed = Math.max(0, Math.min(PHYSICS.maxSpeed, speed));
    previousDistance = distance;
    distance = wrap(distance + speed * dt);

    if (speed > 50 && distance < previousDistance) {
      lastLap = now - lapStart;
      bestLap = Math.min(bestLap, lastLap);
      lapStart = now;
      lap += 1;
    }

    const p = sample(distance);
    currentZ = distance >= bridgeEnterAt && distance <= bridgeExitAt ? 3 : 1;

    const ratio = clamp01(speed / PHYSICS.maxSpeed);
    renderVisual(underVisual, p, ratio, currentZ === 1);
    renderVisual(overVisual, p, ratio, currentZ === 3);
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

    const currentLap = (now - lapStart) / 1000;
    const lastText = lastLap > 0 ? (lastLap / 1000).toFixed(3) : '--.---';
    const bestText = Number.isFinite(bestLap) ? (bestLap / 1000).toFixed(3) : '--.---';
    hud.text = `PIXIJS // ISO SVG 8 CACHE\nFPS ${fps.toFixed(1)}   FRAME ${deltaMs.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nLAP ${lap}   ${currentLap.toFixed(3)}   LAST ${lastText}   BEST ${bestText}\nSPEED ${Math.round(speed * 0.82)}   Z${currentZ}   HEIGHT ${p.elevation.toFixed(0)}   ${p.underBridge ? 'UNDER' : p.layer === 1 ? 'OVER' : ''}`;
    uiApp.renderer.render(uiApp.stage);
    requestAnimationFrame(tick);
  };

  requestAnimationFrame((now) => {
    lastTime = now;
    tick(now);
  });
}

void main().catch(showBootError);
