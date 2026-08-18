import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';

const WIDTH = 1280;
const HEIGHT = 720;
const LANE_OFFSET = 22;
const PATH_SAMPLES = 1200;
const BRIDGE_HALF_SPAN = 76;
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

function pathPoint(path: SVGPathElement, distance: number): Point {
  const total = path.getTotalLength();
  const d = ((distance % total) + total) % total;
  const p = path.getPointAtLength(d);
  return { x: p.x, y: p.y };
}

function sampledOffsetPath(source: SVGPathElement, offset: number): string {
  const total = source.getTotalLength();
  let d = '';
  for (let i = 0; i <= PATH_SAMPLES; i += 1) {
    const at = (i / PATH_SAMPLES) * total;
    const before = source.getPointAtLength(Math.max(0, at - 1.5));
    const after = source.getPointAtLength(Math.min(total, at + 1.5));
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const mag = Math.hypot(dx, dy) || 1;
    const nx = -dy / mag;
    const ny = dx / mag;
    const p = source.getPointAtLength(at);
    d += `${i === 0 ? 'M' : 'L'}${(p.x + nx * offset).toFixed(2)},${(p.y + ny * offset).toFixed(2)} `;
  }
  return d;
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

function pathSegment(path: SVGPathElement, center: number, halfSpan: number, samples = 70): string {
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const distance = center - halfSpan + ((halfSpan * 2) * i) / samples;
    const p = pathPoint(path, distance);
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
  }
  return d;
}

function offsetSegment(source: SVGPathElement, center: number, halfSpan: number, offset: number, samples = 70): string {
  const total = source.getTotalLength();
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const at = center - halfSpan + ((halfSpan * 2) * i) / samples;
    const wrapped = ((at % total) + total) % total;
    const before = source.getPointAtLength(((wrapped - 1.5) + total) % total);
    const after = source.getPointAtLength((wrapped + 1.5) % total);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const mag = Math.hypot(dx, dy) || 1;
    const nx = -dy / mag;
    const ny = dx / mag;
    const p = source.getPointAtLength(wrapped);
    d += `${i === 0 ? 'M' : 'L'}${(p.x + nx * offset).toFixed(2)},${(p.y + ny * offset).toFixed(2)} `;
  }
  return d;
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
  setBoot('PIXI MODULE LOADED\nBUILDING LAYERED TRACK...');

  const source = document.querySelector<SVGPathElement>('#track-source');
  if (!source) throw new Error('Missing #track-source');

  const sourceD = source.getAttribute('d') ?? '';
  setPath('track-outer-glow', sourceD);
  setPath('track-border', sourceD);
  setPath('track-road', sourceD);
  setPath('track-inner-sheen', sourceD);

  const laneAD = sampledOffsetPath(source, -LANE_OFFSET);
  const laneBD = sampledOffsetPath(source, LANE_OFFSET);
  setPath('lane-a-dark', laneAD);
  setPath('lane-b-dark', laneBD);
  const laneA = setPath('lane-a', laneAD);
  const laneB = setPath('lane-b', laneBD);

  const totalLength = laneA.getTotalLength();
  const wrap = (distance: number): number => ((distance % totalLength) + totalLength) % totalLength;
  const bridgeTopDistance = totalLength * 0.5;
  const bridgeUnderDistance = 0;
  const bridgeEnterAt = bridgeTopDistance - BRIDGE_HALF_SPAN - BRIDGE_ENTRY_LEAD;
  const bridgeExitAt = bridgeTopDistance + BRIDGE_HALF_SPAN + MAX_TRAIL_LENGTH;

  const sample = (distance: number): TrackPoint => {
    const d = wrap(distance);
    const p = laneA.getPointAtLength(d);
    const before = laneA.getPointAtLength(wrap(d - 2));
    const after = laneA.getPointAtLength(wrap(d + 2));
    const onTop = circularDelta(d, bridgeTopDistance, totalLength) <= BRIDGE_HALF_SPAN;
    const under = circularDelta(d, bridgeUnderDistance, totalLength) <= BRIDGE_HALF_SPAN;
    return {
      x: p.x,
      y: p.y,
      angle: Math.atan2(after.y - before.y, after.x - before.x),
      distance: d,
      layer: onTop ? 1 : 0,
      underBridge: under,
    };
  };

  const arrows = document.querySelector<SVGGElement>('#curve-arrows');
  if (arrows) {
    arrows.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    [0.10, 0.29, 0.60, 0.79].forEach((fraction, groupIndex) => {
      for (let i = 0; i < 5; i += 1) {
        const p = sample((fraction + i * 0.012) * totalLength);
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

  const bridgeLayer = document.querySelector<SVGGElement>('#bridge-layer');
  if (!bridgeLayer) throw new Error('Missing #bridge-layer');
  bridgeLayer.replaceChildren();
  const sourceLength = source.getTotalLength();
  const sourceBridgeCenter = sourceLength * 0.5;
  const centerBridge = pathSegment(source, sourceBridgeCenter, BRIDGE_HALF_SPAN, 80);
  const leftShoulder = offsetSegment(source, sourceBridgeCenter, BRIDGE_HALF_SPAN, -ROAD_HALF_WIDTH, 80);
  const rightShoulder = offsetSegment(source, sourceBridgeCenter, BRIDGE_HALF_SPAN, ROAD_HALF_WIDTH, 80);
  const laneABridge = pathSegment(laneA, bridgeTopDistance, BRIDGE_HALF_SPAN, 80);
  const laneBBridge = pathSegment(laneB, laneB.getTotalLength() * 0.5, BRIDGE_HALF_SPAN, 80);
  bridgeLayer.appendChild(createBridgePath(centerBridge, '#0d1625', 144, 0.36, 'bridge-deck'));
  bridgeLayer.appendChild(createBridgePath(leftShoulder, '#4cf4ff', 3.5, 0.84, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(rightShoulder, '#ff54e7', 3.5, 0.72, 'bridge-edge'));
  bridgeLayer.appendChild(createBridgePath(laneABridge, '#b9fdff', 2.6, 1, 'bridge-rail'));
  bridgeLayer.appendChild(createBridgePath(laneBBridge, '#ff9bf3', 2.6, 0.95, 'bridge-rail'));

  setBoot('SVG READY\nINITIALIZING PIXI Z1 / Z3...');
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
    text: 'HOLD SCREEN / SPACE  //  ZONE ENTRY / EXIT SWITCH',
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

    const nowDistanceToExit = Math.max(0, bridgeExitAt - distance);
    const currentLap = (now - lapStart) / 1000;
    const lastText = lastLap > 0 ? (lastLap / 1000).toFixed(3) : '--.---';
    const bestText = Number.isFinite(bestLap) ? (bestLap / 1000).toFixed(3) : '--.---';
    hud.text = `PIXIJS // SVG 8\nFPS ${fps.toFixed(1)}   FRAME ${deltaMs.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nLAP ${lap}   ${currentLap.toFixed(3)}   LAST ${lastText}   BEST ${bestText}\nSPEED ${Math.round(speed * 0.82)}   Z${currentZ}   ${p.underBridge ? 'UNDER' : p.layer === 1 ? 'OVER' : ''}   EXIT ${currentZ === 3 ? nowDistanceToExit.toFixed(0) : '-'}`;
    uiApp.renderer.render(uiApp.stage);

    requestAnimationFrame(tick);
  };

  requestAnimationFrame((now) => {
    lastTime = now;
    tick(now);
  });
}

void main().catch(showBootError);
