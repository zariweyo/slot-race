import trackJson from './tracks/neon-long.json';
import { loadInitialTrack } from './game/track/TrackStorage';
import { compileTrack, type TrackDefinition } from './game/track/TrackCompiler';

type Side = 'left' | 'right';
type Point = { x: number; y: number };

const MAX_SPEED = 1900;
const ACCELERATION = 850;
const COAST_DECELERATION = 520;
const WIDTH = 1280;
const HEIGHT = 720;

const moveTowards = (current: number, target: number, delta: number): number => current < target ? Math.min(target, current + delta) : Math.max(target, current - delta);
const projectIso = (x: number, y: number, z = 0): Point => {
  const dx = x - 640;
  const dy = y - 360;
  return { x: 640 + dx * 0.78 - dy * 0.52, y: 385 + dx * 0.26 + dy * 0.36 - z * 1.05 };
};

void (async () => {
  const definition = await loadInitialTrack(trackJson as TrackDefinition);
  const compiled = compileTrack(definition, 8, false);
  const totalLength = compiled.totalLength;
  if (totalLength <= 0) return;

  const bounds = compiled.points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x), maxX: Math.max(acc.maxX, point.x),
    minY: Math.min(acc.minY, point.y), maxY: Math.max(acc.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
  const fitScale = Math.min(980 / worldWidth, 560 / worldHeight);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const laneOffset = definition.road.laneSpacing / 2;

  const wrap = (value: number): number => ((value % totalLength) + totalLength) % totalLength;
  const fitted = (x: number, y: number): Point => ({ x: 640 + (x - centerX) * fitScale, y: 370 + (y - centerY) * fitScale });

  const sampleWorld = (at: number) => {
    const d = wrap(at);
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
    const t = Math.max(0, Math.min(1, (d - a.distance) / span));
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      elevation: a.elevation + (b.elevation - a.elevation) * t,
      segmentIndex: t < 0.5 ? a.segmentIndex : b.segmentIndex,
      segmentType: t < 0.5 ? a.segmentType : b.segmentType,
      curveSign: t < 0.5 ? a.curveSign : b.curveSign,
    };
  };

  const screenAt = (at: number, side: Side): Point => {
    const center = sampleWorld(at);
    const before = sampleWorld(at - 4);
    const after = sampleWorld(at + 4);
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const mag = Math.hypot(dx, dy) || 1;
    const nx = -dy / mag;
    const ny = dx / mag;
    const offset = (side === 'left' ? -laneOffset : laneOffset) * fitScale;
    const p = fitted(center.x, center.y);
    return projectIso(p.x + nx * offset, p.y + ny * offset, center.elevation);
  };

  const sideForCurve = (curveSign: number): Side | null => curveSign > 0 ? 'right' : curveSign < 0 ? 'left' : null;

  const sparkle = (point: Point, side: Side): void => {
    const viewport = document.querySelector<HTMLElement>('#game-viewport');
    if (!viewport) return;
    const host = document.createElement('div');
    host.className = `racing-line-sparks ${side}`;
    host.style.left = `${(point.x / WIDTH) * 100}%`;
    host.style.top = `${(point.y / HEIGHT) * 100}%`;
    host.innerHTML = '<i></i><i></i><i></i><i></i>';
    viewport.appendChild(host);
    window.setTimeout(() => host.remove(), 420);
  };

  const pressed = new Set<string>();
  let selected: Side = 'left';
  let distance = 0;
  let speed = 0;
  let lastTime = 0;
  let rewardedSegment = -1;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') { pressed.add(event.code); selected = 'left'; }
    if (event.code === 'KeyD' || event.code === 'ArrowRight') { pressed.add(event.code); selected = 'right'; }
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => pressed.clear());

  const tick = (timestamp: number): void => {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(40, Math.max(0, timestamp - lastTime)) / 1000;
    lastTime = timestamp;
    const accelerating = pressed.size > 0;
    speed = moveTowards(speed, accelerating ? MAX_SPEED : 0, (accelerating ? ACCELERATION : COAST_DECELERATION) * dt);
    distance = wrap(distance + speed * (definition.speedMultiplier ?? 1) * dt);

    const here = sampleWorld(distance);
    if (here.segmentType === 'curve') {
      const range = compiled.segments.find((segment) => segment.segmentIndex === here.segmentIndex);
      const recommended = sideForCurve(here.curveSign);
      if (range && recommended) {
        const midpoint = range.start + (range.end - range.start) * 0.5;
        if (distance >= midpoint && rewardedSegment !== here.segmentIndex) {
          rewardedSegment = here.segmentIndex;
          if (selected === recommended) sparkle(screenAt(midpoint, recommended), recommended);
        }
      }
    } else {
      rewardedSegment = -1;
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();
