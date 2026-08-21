import trackJson from './tracks/neon-long.json';
import { compileTrack, type TrackDefinition } from './game/track/TrackCompiler';

const definition = trackJson as TrackDefinition;
const compiled = compileTrack(definition, 8, false);
const totalLength = compiled.totalLength;
const MAX_SPEED = 1900;
const ACCELERATION = 850;
const COAST_DECELERATION = 520;
const LOOKAHEAD = 420;

type Side = 'left' | 'right';

const pressed = new Set<string>();
let selected: Side = 'left';
let distance = 0;
let speed = 0;
let lastTime = 0;
let guidedSegment = -1;
let rewardedSegment = -1;

const buttons = {
  left: document.querySelector<HTMLButtonElement>('[data-rail-control="left"]'),
  right: document.querySelector<HTMLButtonElement>('[data-rail-control="right"]'),
};

const wrap = (value: number): number => ((value % totalLength) + totalLength) % totalLength;
const moveTowards = (current: number, target: number, delta: number): number => current < target ? Math.min(target, current + delta) : Math.max(target, current - delta);

const pointAt = (at: number) => {
  const d = wrap(at);
  const points = compiled.points;
  let lo = 0;
  let hi = points.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].distance <= d) lo = mid;
    else hi = mid;
  }
  return points[lo];
};

const sideForCurve = (curveSign: number): Side | null => {
  if (curveSign === 0) return null;
  // Positive curve turns left: negative normal offset is the inside lane.
  return curveSign > 0 ? 'left' : 'right';
};

const railPaths = (side: Side): SVGPathElement[] => {
  const stroke = side === 'left' ? '#83f8ff' : '#ff72ee';
  return Array.from(document.querySelectorAll<SVGPathElement>(`.track-level-svg path[stroke="${stroke}"]`));
};

const clearGuidance = (): void => {
  buttons.left?.classList.remove('is-recommended');
  buttons.right?.classList.remove('is-recommended');
  for (const path of railPaths('left')) path.classList.remove('racing-line-recommended');
  for (const path of railPaths('right')) path.classList.remove('racing-line-recommended');
};

const guide = (side: Side, segmentIndex: number): void => {
  if (guidedSegment === segmentIndex) return;
  guidedSegment = segmentIndex;
  clearGuidance();
  buttons[side]?.classList.add('is-recommended');
  for (const path of railPaths(side)) path.classList.add('racing-line-recommended');
};

const sparkle = (side: Side): void => {
  const button = buttons[side];
  const viewport = document.querySelector<HTMLElement>('#game-viewport');
  if (!button || !viewport) return;
  const buttonRect = button.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const x = side === 'left' ? buttonRect.right - viewportRect.left + 28 : buttonRect.left - viewportRect.left - 28;
  const y = viewportRect.height * 0.54;
  const host = document.createElement('div');
  host.className = `racing-line-sparks ${side}`;
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  host.innerHTML = '<i></i><i></i><i></i><i></i>';
  viewport.appendChild(host);
  window.setTimeout(() => host.remove(), 420);
};

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.code === 'KeyA' || event.code === 'ArrowLeft') { pressed.add(event.code); selected = 'left'; }
  if (event.code === 'KeyD' || event.code === 'ArrowRight') { pressed.add(event.code); selected = 'right'; }
};
const onKeyUp = (event: KeyboardEvent): void => { pressed.delete(event.code); };
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', () => pressed.clear());

const tick = (timestamp: number): void => {
  if (!lastTime) lastTime = timestamp;
  const dt = Math.min(40, Math.max(0, timestamp - lastTime)) / 1000;
  lastTime = timestamp;
  const accelerating = pressed.size > 0;
  speed = moveTowards(speed, accelerating ? MAX_SPEED : 0, (accelerating ? ACCELERATION : COAST_DECELERATION) * dt);
  distance = wrap(distance + speed * (definition.speedMultiplier ?? 1) * dt);

  const here = pointAt(distance);
  const ahead = pointAt(distance + LOOKAHEAD);
  const candidate = here.segmentType === 'curve' ? here : ahead.segmentType === 'curve' ? ahead : null;
  const recommended = candidate ? sideForCurve(candidate.curveSign) : null;

  if (candidate && recommended) {
    guide(recommended, candidate.segmentIndex);
    if (here.segmentType === 'curve' && here.segmentIndex === candidate.segmentIndex && selected === recommended && rewardedSegment !== candidate.segmentIndex) {
      rewardedSegment = candidate.segmentIndex;
      sparkle(recommended);
    }
  } else {
    guidedSegment = -1;
    clearGuidance();
  }

  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
