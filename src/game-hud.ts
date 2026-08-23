import './game-hud.css';

const viewport = document.querySelector<HTMLElement>('#game-viewport');

if (viewport) {
  const hud = document.createElement('div');
  hud.className = 'game-time-hud';
  hud.innerHTML = `
    <div id="game-lap-time" class="game-lap-time">00.000</div>
    <div id="game-total-time" class="game-total-time">TOTAL 00:00.000</div>
  `;
  viewport.appendChild(hud);

  const lapTime = hud.querySelector<HTMLElement>('#game-lap-time');
  const totalTime = hud.querySelector<HTMLElement>('#game-total-time');
  const sessionLap = document.querySelector<SVGTextElement>('.race-session-lap');

  let started = false;
  let raceStartedAt = 0;
  let lapStartedAt = 0;
  let currentLap = 1;

  const formatLap = (ms: number): string => {
    const value = Math.max(0, Math.floor(ms));
    const seconds = Math.floor(value / 1000);
    const millis = value % 1000;
    return `${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const formatTotal = (ms: number): string => {
    const value = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(value / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    const millis = value % 1000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const startIfNeeded = (): void => {
    if (started) return;
    const now = performance.now();
    started = true;
    raceStartedAt = now;
    lapStartedAt = now;
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft' || event.code === 'KeyD' || event.code === 'ArrowRight') startIfNeeded();
  });

  const syncLap = (): void => {
    const match = sessionLap?.textContent?.match(/VUELTA\s+(\d+)/i);
    if (!match) return;
    const lap = Number(match[1]);
    if (!Number.isFinite(lap) || lap < 1 || lap === currentLap) return;
    currentLap = lap;
    lapStartedAt = performance.now();
  };

  if (sessionLap) new MutationObserver(syncLap).observe(sessionLap, { childList: true, characterData: true, subtree: true });

  const tick = (timestamp: number): void => {
    syncLap();
    if (started) {
      if (lapTime) lapTime.textContent = formatLap(timestamp - lapStartedAt);
      if (totalTime) totalTime.textContent = `TOTAL ${formatTotal(timestamp - raceStartedAt)}`;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
