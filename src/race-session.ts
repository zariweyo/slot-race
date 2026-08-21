import trackJson from './tracks/neon-long.json';
import { loadInitialTrack } from './game/track/TrackStorage';
import { compileTrack, type TrackDefinition } from './game/track/TrackCompiler';

type Side = 'left' | 'right';
type RacePoint = { distance: number; curvature: number };

const MAX_SPEED = 1900;
const ACCELERATION = 850;
const COAST_DECELERATION = 520;
const LANE_CHANGE_MS = 220;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const smoothstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const moveTowards = (current: number, target: number, maxDelta: number): number => current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);
const formatTime = (ms: number): string => {
  const value = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(value / 60000);
  const seconds = Math.floor((value % 60000) / 1000);
  const millis = value % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

const svg = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => document.createElementNS('http://www.w3.org/2000/svg', tag);

const createHud = (laps: number): { root: SVGSVGElement; total: SVGTextElement; lap: SVGTextElement } | null => {
  const viewport = document.querySelector<HTMLElement>('#game-viewport');
  if (!viewport) return null;
  const root = svg('svg');
  root.setAttribute('viewBox', '0 0 1280 720');
  root.setAttribute('class', 'race-session-svg');
  root.setAttribute('aria-hidden', 'true');

  const plate = svg('path');
  plate.setAttribute('d', 'M455 12 H825 Q846 12 852 34 L840 119 Q837 135 817 135 H463 Q443 135 440 119 L428 34 Q434 12 455 12 Z');
  plate.setAttribute('class', 'race-session-hud-plate');
  root.appendChild(plate);

  const total = svg('text');
  total.setAttribute('x', '640');
  total.setAttribute('y', '58');
  total.setAttribute('class', 'race-session-total');
  total.textContent = '00:00.000';
  root.appendChild(total);

  const lap = svg('text');
  lap.setAttribute('x', '640');
  lap.setAttribute('y', '95');
  lap.setAttribute('class', 'race-session-lap');
  lap.textContent = `VUELTA 1 / ${laps}`;
  root.appendChild(lap);

  const hint = svg('text');
  hint.setAttribute('x', '640');
  hint.setAttribute('y', '120');
  hint.setAttribute('class', 'race-session-hint');
  hint.textContent = 'PULSA UN CONTROL PARA EMPEZAR';
  root.appendChild(hint);

  viewport.appendChild(root);
  return { root, total, lap };
};

const showResults = (totalMs: number, bestLapMs: number | null, laps: number): void => {
  const viewport = document.querySelector<HTMLElement>('#game-viewport');
  if (!viewport) return;

  const overlay = svg('svg');
  overlay.setAttribute('viewBox', '0 0 1280 720');
  overlay.setAttribute('class', 'race-results-svg');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Resultado de carrera');

  const defs = svg('defs');
  defs.innerHTML = `
    <linearGradient id="raceResultBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#061628" stop-opacity=".98"/>
      <stop offset="1" stop-color="#160825" stop-opacity=".98"/>
    </linearGradient>
    <linearGradient id="raceResultStroke" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#4ef6ff"/>
      <stop offset=".5" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d06cff"/>
    </linearGradient>
    <filter id="raceResultGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
  overlay.appendChild(defs);

  const shade = svg('rect');
  shade.setAttribute('width', '1280');
  shade.setAttribute('height', '720');
  shade.setAttribute('class', 'race-results-shade');
  overlay.appendChild(shade);

  const card = svg('path');
  card.setAttribute('d', 'M360 160 H920 Q955 160 965 195 L940 530 Q935 560 900 560 H380 Q345 560 340 530 L315 195 Q325 160 360 160 Z');
  card.setAttribute('fill', 'url(#raceResultBg)');
  card.setAttribute('stroke', 'url(#raceResultStroke)');
  card.setAttribute('stroke-width', '3');
  card.setAttribute('filter', 'url(#raceResultGlow)');
  overlay.appendChild(card);

  const title = svg('text');
  title.setAttribute('x', '640');
  title.setAttribute('y', '238');
  title.setAttribute('class', 'race-results-title');
  title.textContent = 'RACE COMPLETE';
  overlay.appendChild(title);

  const subtitle = svg('text');
  subtitle.setAttribute('x', '640');
  subtitle.setAttribute('y', '278');
  subtitle.setAttribute('class', 'race-results-subtitle');
  subtitle.textContent = `${laps} VUELTAS COMPLETADAS`;
  overlay.appendChild(subtitle);

  const totalLabel = svg('text');
  totalLabel.setAttribute('x', '640');
  totalLabel.setAttribute('y', '345');
  totalLabel.setAttribute('class', 'race-results-label');
  totalLabel.textContent = 'TIEMPO TOTAL';
  overlay.appendChild(totalLabel);

  const total = svg('text');
  total.setAttribute('x', '640');
  total.setAttribute('y', '407');
  total.setAttribute('class', 'race-results-total');
  total.textContent = formatTime(totalMs);
  overlay.appendChild(total);

  const bestLabel = svg('text');
  bestLabel.setAttribute('x', '640');
  bestLabel.setAttribute('y', '456');
  bestLabel.setAttribute('class', 'race-results-label');
  bestLabel.textContent = 'MEJOR VUELTA';
  overlay.appendChild(bestLabel);

  const best = svg('text');
  best.setAttribute('x', '640');
  best.setAttribute('y', '501');
  best.setAttribute('class', 'race-results-best');
  best.textContent = bestLapMs === null ? '--:--.---' : formatTime(bestLapMs);
  overlay.appendChild(best);

  const restart = svg('g');
  restart.setAttribute('class', 'race-results-restart');
  restart.setAttribute('role', 'button');
  restart.setAttribute('tabindex', '0');
  const restartBg = svg('rect');
  restartBg.setAttribute('x', '520');
  restartBg.setAttribute('y', '525');
  restartBg.setAttribute('width', '240');
  restartBg.setAttribute('height', '54');
  restartBg.setAttribute('rx', '27');
  const restartText = svg('text');
  restartText.setAttribute('x', '640');
  restartText.setAttribute('y', '559');
  restartText.textContent = 'REINICIAR';
  restart.append(restartBg, restartText);
  const reload = (): void => window.location.reload();
  restart.addEventListener('click', reload);
  restart.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') reload(); });
  overlay.appendChild(restart);

  viewport.appendChild(overlay);
};

void (async () => {
  const definition = await loadInitialTrack(trackJson as TrackDefinition);
  const compiled = compileTrack(definition, 8, false);
  const totalLength = compiled.totalLength;
  const targetLaps = Math.max(1, Math.round(definition.laps ?? 3));
  const laneOffset = definition.road.laneSpacing / 2;
  const speedMultiplier = definition.speedMultiplier ?? 1;
  const hud = createHud(targetLaps);
  if (!hud || totalLength <= 0) return;

  let selected: Side = 'left';
  let lane = -laneOffset;
  let laneFrom = lane;
  let laneTarget = lane;
  let laneChangeStartedAt = 0;
  let distance = 0;
  let currentSpeed = 0;
  let lastFrame = 0;
  let started = false;
  let finished = false;
  let raceStartedAt = 0;
  let lapStartedAt = 0;
  let completedLaps = 0;
  let bestLapMs: number | null = null;
  const pressed = new Set<string>();

  const pointAt = (at: number): RacePoint => {
    const d = ((at % totalLength) + totalLength) % totalLength;
    const points = compiled.points;
    let lo = 0;
    let hi = points.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].distance <= d) lo = mid;
      else hi = mid;
    }
    const point = points[lo];
    const segment = definition.segments[point.segmentIndex];
    const curvature = segment?.type === 'curve' ? (segment.angle * Math.PI / 180) / segment.length : 0;
    return { distance: d, curvature };
  };

  const chooseLane = (side: Side, timestamp: number): void => {
    selected = side;
    const target = side === 'left' ? -laneOffset : laneOffset;
    if (Math.abs(laneTarget - target) < 0.01) return;
    laneFrom = lane;
    laneTarget = target;
    laneChangeStartedAt = timestamp;
  };

  const startRace = (timestamp: number): void => {
    if (started || finished) return;
    started = true;
    raceStartedAt = timestamp;
    lapStartedAt = timestamp;
    hud.root.classList.add('started');
  };

  window.addEventListener('keydown', (event) => {
    if (finished) return;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      pressed.add(event.code);
      startRace(performance.now());
      chooseLane('left', performance.now());
    }
    if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      pressed.add(event.code);
      startRace(performance.now());
      chooseLane('right', performance.now());
    }
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => pressed.clear());

  const tick = (timestamp: number): void => {
    if (!lastFrame) lastFrame = timestamp;
    const deltaMs = Math.min(40, Math.max(0, timestamp - lastFrame));
    lastFrame = timestamp;

    if (!finished) {
      const laneProgress = smoothstep((timestamp - laneChangeStartedAt) / LANE_CHANGE_MS);
      lane = laneFrom + (laneTarget - laneFrom) * laneProgress;
      const accelerating = started && pressed.size > 0;
      const targetSpeed = accelerating ? MAX_SPEED : 0;
      currentSpeed = moveTowards(currentSpeed, targetSpeed, (accelerating ? ACCELERATION : COAST_DECELERATION) * deltaMs / 1000);

      if (started) {
        const before = pointAt(distance);
        const laneScale = Math.max(0.15, 1 - before.curvature * lane);
        const advance = (currentSpeed / laneScale) * speedMultiplier * deltaMs / 1000;
        const unwrapped = distance + advance;
        const crossed = unwrapped >= totalLength;
        distance = unwrapped % totalLength;

        if (crossed) {
          const lapMs = timestamp - lapStartedAt;
          lapStartedAt = timestamp;
          completedLaps += 1;
          bestLapMs = bestLapMs === null ? lapMs : Math.min(bestLapMs, lapMs);
          if (completedLaps >= targetLaps) {
            finished = true;
            const totalMs = timestamp - raceStartedAt;
            hud.total.textContent = formatTime(totalMs);
            hud.lap.textContent = `FINAL · ${targetLaps} / ${targetLaps}`;
            showResults(totalMs, bestLapMs, targetLaps);
            window.dispatchEvent(new CustomEvent('photon:pause', { detail: { reason: 'race-finished' } }));
            return;
          }
        }

        hud.total.textContent = formatTime(timestamp - raceStartedAt);
        hud.lap.textContent = `VUELTA ${Math.min(targetLaps, completedLaps + 1)} / ${targetLaps}`;
      }
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
})();
