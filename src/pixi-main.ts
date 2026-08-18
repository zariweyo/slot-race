import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import './styles.css';

const WIDTH = 1600;
const HEIGHT = 900;
const LANE_OFFSET = 18;
const ROAD_HALF_WIDTH = 58;
const PATH_SAMPLES = 1500;
const BRIDGE_HALF_SPAN = 88;

const PHYSICS = {
  acceleration: 760,
  coastDrag: 110,
  maxSpeed: 2350,
};

const PHOTON = {
  baseColor: 0x27e7ff,
  limitColor: 0xff2638,
};

type TrackPoint = {
  x: number;
  y: number;
  angle: number;
  nx: number;
  ny: number;
  distance: number;
  layer: 0 | 1;
  underBridge: boolean;
};

type BridgeDefinition = {
  topDistance: number;
  underDistance: number;
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

function createSvgPath(className: string, stroke: string, width: number, opacity = 1): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', stroke);
  path.setAttribute('stroke-width', String(width));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('opacity', String(opacity));
  if (className) path.setAttribute('class', className);
  return path;
}

async function main(): Promise<void> {
  setBoot('PIXI MODULE LOADED\nREADING SVG TRACK...');

  const source = document.querySelector<SVGPathElement>('#track-source');
  if (!source) throw new Error('Missing #track-source');
  const totalLength = source.getTotalLength();

  const wrapDistance = (distance: number): number => ((distance % totalLength) + totalLength) % totalLength;

  const centerPoint = (distance: number): TrackPoint => {
    const d = wrapDistance(distance);
    const epsilon = 2;
    const p = source.getPointAtLength(d);
    const before = source.getPointAtLength(wrapDistance(d - epsilon));
    const after = source.getPointAtLength(wrapDistance(d + epsilon));
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const nx = -dy / magnitude;
    const ny = dx / magnitude;
    return {
      x: p.x,
      y: p.y,
      angle: Math.atan2(dy, dx),
      nx,
      ny,
      distance: d,
      layer: 0,
      underBridge: false,
    };
  };

  const findDistanceNear = (expectedFraction: number, x: number, y: number): number => {
    let bestDistance = expectedFraction * totalLength;
    let bestError = Number.POSITIVE_INFINITY;
    const windowFraction = 0.07;
    for (let i = 0; i <= 260; i += 1) {
      const fraction = expectedFraction - windowFraction + (windowFraction * 2 * i) / 260;
      const distance = wrapDistance(fraction * totalLength);
      const p = source.getPointAtLength(distance);
      const error = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (error < bestError) {
        bestError = error;
        bestDistance = distance;
      }
    }
    return bestDistance;
  };

  const bridgeTargets = [
    { x: 430, y: 450, top: 1 / 8, under: 7 / 8 },
    { x: 750, y: 450, top: 2 / 8, under: 6 / 8 },
    { x: 1070, y: 450, top: 3 / 8, under: 5 / 8 },
  ];

  const bridges: BridgeDefinition[] = bridgeTargets.map((bridge) => ({
    topDistance: findDistanceNear(bridge.top, bridge.x, bridge.y),
    underDistance: findDistanceNear(bridge.under, bridge.x, bridge.y),
  }));

  const circularDelta = (a: number, b: number): number => {
    let delta = Math.abs(wrapDistance(a) - wrapDistance(b));
    if (delta > totalLength / 2) delta = totalLength - delta;
    return delta;
  };

  const bridgeState = (distance: number): { layer: 0 | 1; underBridge: boolean } => {
    for (const bridge of bridges) {
      if (circularDelta(distance, bridge.topDistance) <= BRIDGE_HALF_SPAN) {
        return { layer: 1, underBridge: false };
      }
      if (circularDelta(distance, bridge.underDistance) <= BRIDGE_HALF_SPAN) {
        return { layer: 0, underBridge: true };
      }
    }
    return { layer: 0, underBridge: false };
  };

  const sample = (distance: number, lane = 0): TrackPoint => {
    const center = centerPoint(distance);
    const laneOffset = lane === 0 ? -LANE_OFFSET : LANE_OFFSET;
    const state = bridgeState(center.distance);
    return {
      ...center,
      x: center.x + center.nx * laneOffset,
      y: center.y + center.ny * laneOffset,
      layer: state.layer,
      underBridge: state.underBridge,
    };
  };

  const sampledPath = (offset: number, startDistance = 0, endDistance = totalLength, samples = PATH_SAMPLES): string => {
    let d = '';
    for (let i = 0; i <= samples; i += 1) {
      const distance = startDistance + ((endDistance - startDistance) * i) / samples;
      const p = centerPoint(distance);
      const x = p.x + p.nx * offset;
      const y = p.y + p.ny * offset;
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
    }
    return d;
  };

  const setPath = (id: string, d: string): void => {
    document.querySelector<SVGPathElement>(`#${id}`)?.setAttribute('d', d);
  };

  const sourceD = source.getAttribute('d') ?? '';
  setPath('track-outer-glow', sourceD);
  setPath('track-border', sourceD);
  setPath('track-road', sourceD);
  setPath('track-inner-sheen', sourceD);
  setPath('lane-a-dark', sampledPath(-LANE_OFFSET));
  setPath('lane-b-dark', sampledPath(LANE_OFFSET));
  setPath('lane-a', sampledPath(-LANE_OFFSET));
  setPath('lane-b', sampledPath(LANE_OFFSET));

  const arrows = document.querySelector<SVGGElement>('#curve-arrows');
  if (arrows) {
    arrows.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const groups = [0.055, 0.18, 0.315, 0.455, 0.57, 0.695, 0.82, 0.945];
    groups.forEach((startFraction, groupIndex) => {
      for (let i = 0; i < 4; i += 1) {
        const p = centerPoint((startFraction + i * 0.011) * totalLength);
        const text = document.createElementNS(ns, 'text');
        text.textContent = '›››';
        text.setAttribute('x', p.x.toFixed(2));
        text.setAttribute('y', p.y.toFixed(2));
        text.setAttribute('class', `curve-chevron ${groupIndex % 2 === 0 ? 'cyan' : 'magenta'}`);
        text.setAttribute('transform', `rotate(${(p.angle * 180 / Math.PI).toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
        text.style.animationDelay = `${i * 105 + (groupIndex % 3) * 30}ms`;
        arrows.appendChild(text);
      }
    });
  }

  const decor = document.querySelector<SVGGElement>('#track-decor');
  if (decor) {
    decor.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 44; i += 1) {
      const distance = (i / 44) * totalLength;
      const p = centerPoint(distance);
      const side = i % 2 === 0 ? -1 : 1;
      const x = p.x + p.nx * side * 80;
      const y = p.y + p.ny * side * 80;
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', x.toFixed(2));
      circle.setAttribute('cy', y.toFixed(2));
      circle.setAttribute('r', i % 4 === 0 ? '3.2' : '2');
      circle.setAttribute('fill', side < 0 ? '#55f6ff' : '#ff52e5');
      circle.setAttribute('class', 'energy-node');
      circle.style.animationDelay = `${(i % 10) * 110}ms`;
      decor.appendChild(circle);
    }
  }

  const bridgeLayer = document.querySelector<SVGGElement>('#bridge-layer');
  if (!bridgeLayer) throw new Error('Missing #bridge-layer');
  bridgeLayer.replaceChildren();

  for (const bridge of bridges) {
    const centerD = sampledPath(0, bridge.topDistance - BRIDGE_HALF_SPAN, bridge.topDistance + BRIDGE_HALF_SPAN, 72);
    const laneAD = sampledPath(-LANE_OFFSET, bridge.topDistance - BRIDGE_HALF_SPAN, bridge.topDistance + BRIDGE_HALF_SPAN, 72);
    const laneBD = sampledPath(LANE_OFFSET, bridge.topDistance - BRIDGE_HALF_SPAN, bridge.topDistance + BRIDGE_HALF_SPAN, 72);
    const leftEdgeD = sampledPath(-ROAD_HALF_WIDTH, bridge.topDistance - BRIDGE_HALF_SPAN, bridge.topDistance + BRIDGE_HALF_SPAN, 72);
    const rightEdgeD = sampledPath(ROAD_HALF_WIDTH, bridge.topDistance - BRIDGE_HALF_SPAN, bridge.topDistance + BRIDGE_HALF_SPAN, 72);

    const shadow = createSvgPath('bridge-shadow', '#00040b', 146, 0.64);
    shadow.setAttribute('d', centerD);
    bridgeLayer.appendChild(shadow);

    const border = createSvgPath('bridge-deck', '#263b59', 132, 0.86);
    border.setAttribute('d', centerD);
    bridgeLayer.appendChild(border);

    const deck = createSvgPath('bridge-deck', '#0b1524', 118, 0.76);
    deck.setAttribute('d', centerD);
    bridgeLayer.appendChild(deck);

    const leftEdge = createSvgPath('bridge-rail', '#52f5ff', 3.2, 0.95);
    leftEdge.setAttribute('d', leftEdgeD);
    bridgeLayer.appendChild(leftEdge);

    const rightEdge = createSvgPath('bridge-rail', '#ff52e7', 3.2, 0.88);
    rightEdge.setAttribute('d', rightEdgeD);
    bridgeLayer.appendChild(rightEdge);

    const laneA = createSvgPath('bridge-rail', '#b5fdff', 2, 0.96);
    laneA.setAttribute('d', laneAD);
    bridgeLayer.appendChild(laneA);

    const laneB = createSvgPath('bridge-rail', '#ff9bf2', 2, 0.90);
    laneB.setAttribute('d', laneBD);
    bridgeLayer.appendChild(laneB);
  }

  setBoot('SVG TRACK READY\nINITIALIZING PIXI WEBGL...');

  const app = new Application();
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
  const bridgeSvg = document.querySelector<SVGSVGElement>('#bridge-svg');
  if (!host) throw new Error('Missing #pixi-layer container');
  host.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const trail = new Graphics();
  app.stage.addChild(trail);

  const photon = new Container();
  const glow = new Graphics();
  glow.ellipse(-5, 0, 64, 28).fill({ color: 0xffffff, alpha: 0.18 });
  glow.tint = PHOTON.baseColor;

  const body = new Graphics();
  body.poly([
    46, 0, 27, -8, 7, -12, -14, -11, -32, -5, -41, 0,
    -32, 5, -14, 11, 7, 12, 27, 8,
  ]).fill({ color: PHOTON.baseColor, alpha: 0.98 });
  body.poly([34, 0, 16, -3.6, -5, -5.2, -25, 0, -5, 5.2, 16, 3.6]).fill({ color: 0xffffff, alpha: 0.98 });

  const tip = new Graphics();
  tip.poly([48, 0, 24, -7.2, 24, 7.2]).fill({ color: 0xffffff, alpha: 1 });
  tip.tint = PHOTON.baseColor;

  photon.addChild(glow, body, tip);
  app.stage.addChild(photon);

  const hud = new Text({
    text: '',
    style: new TextStyle({ fill: '#dffcff', fontSize: 17, fontFamily: 'monospace', lineHeight: 23 }),
  });
  hud.position.set(26, 24);
  app.stage.addChild(hud);

  const note = new Text({
    text: 'HOLD SCREEN / SPACE  //  SVG PATH AUTHORITY  //  3 BRIDGES',
    style: new TextStyle({ fill: '#72e9f7', fontSize: 13, fontFamily: 'Arial' }),
  });
  note.position.set(26, HEIGHT - 38);
  app.stage.addChild(note);

  boot?.remove();

  let distance = 40;
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

  const drawOpenPath = (graphics: Graphics, points: TrackPoint[], width: number, color: number, alpha: number): void => {
    if (points.length < 2) return;
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i].x, points[i].y);
    graphics.stroke({ width, color, alpha, cap: 'round', join: 'round' });
  };

  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.04);
    speed += (throttle ? PHYSICS.acceleration : -PHYSICS.coastDrag) * dt;
    speed = Math.max(0, Math.min(PHYSICS.maxSpeed, speed));

    previousDistance = distance;
    distance = wrapDistance(distance + speed * dt);
    if (speed > 80 && distance < previousDistance) {
      const now = performance.now();
      lastLap = now - lapStart;
      bestLap = Math.min(bestLap, lastLap);
      lapStart = now;
      lap += 1;
    }

    const p = sample(distance, 0);
    photon.position.set(p.x, p.y);
    photon.rotation = p.angle;

    // Single-player z-switch for now. TrackPoint.layer is already ready for per-player layering later.
    if (bridgeSvg) bridgeSvg.style.zIndex = p.layer === 1 ? '1' : '3';

    const ratio = clamp01(speed / PHYSICS.maxSpeed);
    const heat = clamp01((ratio - 0.58) / 0.42);
    const heatColor = mixColor(PHOTON.baseColor, PHOTON.limitColor, heat);
    tip.tint = heatColor;
    glow.tint = mixColor(PHOTON.baseColor, PHOTON.limitColor, heat * 0.72);
    photon.alpha = p.underBridge ? 0.34 : 1;

    trail.clear();
    trail.alpha = p.underBridge ? 0.28 : 1;
    if (ratio > 0.015) {
      const wakeLength = 45 + ratio * 620;
      const segments = 34;
      const points: TrackPoint[] = [];
      for (let i = segments; i >= 0; i -= 1) {
        points.push(sample(distance - wakeLength * (i / segments), 0));
      }

      drawOpenPath(trail, points, 38 + ratio * 18, PHOTON.baseColor, 0.07 + ratio * 0.05);
      drawOpenPath(trail, points, 17 + ratio * 11, PHOTON.baseColor, 0.18 + ratio * 0.10);
      drawOpenPath(trail, points, 4 + ratio * 4, 0xdfffff, 0.62 + ratio * 0.24);

      if (heat > 0.01) {
        const hotStart = Math.max(0, Math.floor(points.length * (0.62 - heat * 0.18)));
        const hotPoints = points.slice(hotStart);
        drawOpenPath(trail, hotPoints, 20 + ratio * 10, heatColor, 0.16 + heat * 0.22);
        drawOpenPath(trail, hotPoints, 5 + ratio * 4, mixColor(0xffffff, PHOTON.limitColor, heat), 0.55 + heat * 0.35);
      }
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
    const levelText = p.layer === 1 ? 'BRIDGE' : p.underBridge ? 'UNDER' : 'GROUND';
    hud.text = `PIXIJS  //  SVG TRACK\nFPS ${fps.toFixed(1)}   FRAME ${ticker.deltaMS.toFixed(1)} ms   MAX ${maxFrame.toFixed(1)}\nLAP ${lap}   ${currentLap.toFixed(3)}   LAST ${lastText}   BEST ${bestText}\nSPEED ${Math.round(speed * 0.82)}   HEAT ${Math.round(heat * 100)}%   ${levelText}`;
  });
}

void main().catch(showBootError);
