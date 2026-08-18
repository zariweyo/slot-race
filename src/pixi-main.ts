import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';

const WIDTH = 1280;
const HEIGHT = 720;
const CENTER_X = WIDTH / 2;
const CENTER_Y = 360;
const FIGURE_A = 430;
const FIGURE_B = 205;
const LANE_OFFSET = 20;
const ROAD_HALF_WIDTH = 77;
const TABLE_SAMPLES = 1800;

const PHYSICS = {
  acceleration: 520,
  coastDrag: 82,
  maxSpeed: 1580,
};

type TrackPoint = {
  x: number;
  y: number;
  angle: number;
  nx: number;
  ny: number;
  t: number;
};

const boot = document.querySelector<HTMLDivElement>('#pixi-boot');
const setBoot = (message: string): void => {
  if (boot) boot.textContent = message;
};

function showBootError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (boot) {
    boot.textContent = `PIXI STARTUP ERROR\n\n${message}`;
    boot.style.color = '#ff6b9d';
  }
  console.error('Pixi startup failed:', error);
}

function rawPoint(t: number, offset = 0): TrackPoint {
  const x = CENTER_X + FIGURE_A * Math.sin(t);
  const y = CENTER_Y + FIGURE_B * Math.sin(2 * t);
  const dx = FIGURE_A * Math.cos(t);
  const dy = 2 * FIGURE_B * Math.cos(2 * t);
  const mag = Math.hypot(dx, dy) || 1;
  const nx = -dy / mag;
  const ny = dx / mag;

  return {
    x: x + nx * offset,
    y: y + ny * offset,
    angle: Math.atan2(dy, dx),
    nx,
    ny,
    t,
  };
}

const cumulative = new Float64Array(TABLE_SAMPLES + 1);
for (let i = 1; i <= TABLE_SAMPLES; i += 1) {
  const previous = rawPoint(((i - 1) / TABLE_SAMPLES) * Math.PI * 2);
  const current = rawPoint((i / TABLE_SAMPLES) * Math.PI * 2);
  cumulative[i] = cumulative[i - 1] + Math.hypot(current.x - previous.x, current.y - previous.y);
}
const totalLength = cumulative[TABLE_SAMPLES];

function wrapDistance(distance: number): number {
  return ((distance % totalLength) + totalLength) % totalLength;
}

function tAtDistance(distance: number): number {
  const d = wrapDistance(distance);
  let low = 0;
  let high = TABLE_SAMPLES;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] <= d) low = mid;
    else high = mid;
  }

  const span = cumulative[high] - cumulative[low] || 1;
  const f = (d - cumulative[low]) / span;
  return ((low + f) / TABLE_SAMPLES) * Math.PI * 2;
}

function sample(distance: number, lane = 0): TrackPoint {
  const offset = lane === 0 ? -LANE_OFFSET : LANE_OFFSET;
  return rawPoint(tAtDistance(distance), offset);
}

function svgPath(offset: number, fromT = 0, toT = Math.PI * 2, samples = 900, close = true): string {
  let d = '';
  for (let i = 0; i <= samples; i += 1) {
    const t = fromT + ((toT - fromT) * i) / samples;
    const p = rawPoint(t, offset);
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
  }
  return close ? `${d}Z` : d;
}

function setPath(id: string, d: string): void {
  document.querySelector<SVGPathElement>(`#${id}`)?.setAttribute('d', d);
}

function buildSvgTrack(): void {
  const center = svgPath(0);
  const laneA = svgPath(-LANE_OFFSET);
  const laneB = svgPath(LANE_OFFSET);

  setPath('track-outer-glow', center);
  setPath('track-border', center);
  setPath('track-road', center);
  setPath('track-inner-sheen', center);
  setPath('track-edge-cyan', svgPath(-ROAD_HALF_WIDTH));
  setPath('track-edge-magenta', svgPath(ROAD_HALF_WIDTH));
  setPath('lane-a-dark', laneA);
  setPath('lane-b-dark', laneB);
  setPath('lane-a', laneA);
  setPath('lane-b', laneB);

  // The second crossing (t≈π) is explicitly redrawn on top as an elevated bridge.
  const bridgeFrom = Math.PI - 0.18;
  const bridgeTo = Math.PI + 0.18;
  setPath('bridge-under-shadow', svgPath(0, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-border', svgPath(0, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-road', svgPath(0, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-cyan', svgPath(-ROAD_HALF_WIDTH, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-magenta', svgPath(ROAD_HALF_WIDTH, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-lane-a-dark', svgPath(-LANE_OFFSET, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-lane-b-dark', svgPath(LANE_OFFSET, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-lane-a', svgPath(-LANE_OFFSET, bridgeFrom, bridgeTo, 90, false));
  setPath('bridge-lane-b', svgPath(LANE_OFFSET, bridgeFrom, bridgeTo, 90, false));

  const arrows = document.querySelector<SVGGElement>('#curve-arrows');
  if (arrows) {
    const ns = 'http://www.w3.org/2000/svg';
    const groups = [
      { start: 0.36, color: 'cyan' },
      { start: 1.84, color: 'magenta' },
      { start: 3.50, color: 'cyan' },
      { start: 5.00, color: 'magenta' },
    ];

    groups.forEach((group, groupIndex) => {
      for (let i = 0; i < 5; i += 1) {
        const t = group.start + i * 0.105;
        const p = rawPoint(t, 0);
        const text = document.createElementNS(ns, 'text');
        text.textContent = '›››';
        text.setAttribute('x', p.x.toFixed(2));
        text.setAttribute('y', p.y.toFixed(2));
        text.setAttribute('class', `curve-chevron ${group.color}`);
        text.setAttribute('transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
        text.style.animationDelay = `${i * 105 + groupIndex * 35}ms`;
        arrows.appendChild(text);
      }
    });
  }

  const decor = document.querySelector<SVGGElement>('#track-decor');
  if (decor) {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 30; i += 1) {
      const t = (i / 30) * Math.PI * 2;
      const side = i % 2 === 0 ? -1 : 1;
      const p = rawPoint(t, side * 97);
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', p.x.toFixed(2));
      circle.setAttribute('cy', p.y.toFixed(2));
      circle.setAttribute('r', i % 3 === 0 ? '3.4' : '2.2');
      circle.setAttribute('fill', side < 0 ? '#55f6ff' : '#ff52e5');
      circle.setAttribute('class', 'energy-node');
      circle.setAttribute('opacity', '.55');
      circle.style.animationDelay = `${(i % 9) * 120}ms`;
      decor.appendChild(circle);
    }
  }
}

function drawOpenPath(graphics: Graphics, points: TrackPoint[], width: number, color: number, alpha: number): void {
  if (points.length < 2) return;
  graphics.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    graphics.lineTo(points[i].x, points[i].y);
  }
  graphics.stroke({ width, color, alpha });
}

async function main(): Promise<void> {
  setBoot('PIXI MODULE LOADED\nBUILDING SVG CIRCUIT...');
  buildSvgTrack();

  const app = new Application();
  setBoot('SVG READY\nINITIALIZING PIXI WEBGL...');

  await app.init({
    width: WIDTH,
    height: HEIGHT,
    backgroundAlpha: 0,
    antialias: true,
    resolution: 1,
    autoDensity: true,
    preference: 'webgl',
  });

  const host = document.querySelector<HTMLDivElement>('#pixi-layer');
  if (!host) throw new Error('Missing #pixi-layer container');
  host.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const trail = new Graphics();
  app.stage.addChild(trail);

  const photon = new Container();
  const glow = new Graphics();
  glow.ellipse(-5, 0, 55, 24).fill({ color: 0x00dfff, alpha: 0.18 });
  const body = new Graphics();
  body.poly([
    42, 0, 24, -7, 6, -11, -13, -10, -29, -5, -38, 0,
    -29, 5, -13, 10, 6, 11, 24, 7,
  ]).fill({ color: 0x8ffbff, alpha: 0.98 });
  body.poly([36, 0, 17, -3.7, -4, -5.5, -24, 0, -4, 5.5, 17, 3.7]).fill({ color: 0xffffff, alpha: 1 });
  photon.addChild(glow, body);
  app.stage.addChild(photon);

  const hud = new Text({
    text: '',
    style: new TextStyle({ fill: '#dffcff', fontSize: 17, fontFamily: 'monospace', lineHeight: 23 }),
  });
  hud.position.set(26, 24);
  app.stage.addChild(hud);

  const note = new Text({
    text: 'HOLD SCREEN / SPACE  //  PHOTON LOCKED TO RAIL',
    style: new TextStyle({ fill: '#72e9f7', fontSize: 13, fontFamily: 'Arial' }),
  });
  note.position.set(26, HEIGHT - 38);
  app.stage.addChild(note);

  boot?.remove();

  let distance = 80;
  let speed = 0;
  let throttle = false;
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

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') throttle = true;
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') throttle = false;
  });
  app.canvas.addEventListener('pointerdown', () => { throttle = true; });
  window.addEventListener('pointerup', () => { throttle = false; });
  window.addEventListener('pointercancel', () => { throttle = false; });

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.04);
    speed += (throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
    speed = Math.max(0, Math.min(PHYSICS.maxSpeed, speed));

    previousDistance = distance;
    distance = wrapDistance(distance + speed * dt);
    if (speed > 50 && distance < previousDistance) {
      const now = performance.now();
      lastLap = now - lapStart;
      bestLap = Math.min(bestLap, lastLap);
      lapStart = now;
      lap += 1;
    }

    const p = sample(distance, 0);
    photon.position.set(p.x, p.y);
    photon.rotation = p.angle;

    trail.clear();
    const ratio = Math.max(0, Math.min(1, speed / PHYSICS.maxSpeed));
    if (ratio > 0.02) {
      const wakeLength = 35 + ratio * 470;
      const segments = 28;
      const points: TrackPoint[] = [];
      for (let i = segments; i >= 0; i -= 1) {
        points.push(sample(distance - wakeLength * (i / segments), 0));
      }
      drawOpenPath(trail, points, 34 + ratio * 16, 0x006dff, 0.09 + ratio * 0.04);
      drawOpenPath(trail, points, 15 + ratio * 10, 0x00dfff, 0.22 + ratio * 0.10);
      drawOpenPath(trail, points, 4 + ratio * 4, 0xd9ffff, 0.72 + ratio * 0.22);
    }

    frames += 1;
    elapsed += ticker.deltaMS;
    maxWindow += ticker.deltaMS;
    maxFrame = Math.max(maxFrame, ticker.deltaMS);
    if (elapsed >= 500) {
      fps = (frames * 1000) / elapsed;
      frames = 0;
      elapsed = 0;
    }
    if (maxWindow >= 5000) {
      maxWindow = 0;
      maxFrame = ticker.deltaMS;
    }

    const now = performance.now();
    const currentLap = (now - lapStart) / 1000;
    const lastText = lastLap > 0 ? `${(lastLap / 1000).toFixed(3)}` : '--.---';
    const bestText = Number.isFinite(bestLap) ? `${(bestLap / 1000).toFixed(3)}` : '--.---';
    hud.text = `PIXIJS  //  SVG TRACK\nFPS ${fps.toFixed(1)}   FRAME ${ticker.deltaMS.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nLAP ${lap}   ${currentLap.toFixed(3)}   LAST ${lastText}   BEST ${bestText}\nSPEED ${Math.round(speed * 0.82)}`;
  });
}

void main().catch(showBootError);
