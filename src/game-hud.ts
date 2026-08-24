import './game-hud.css';

const viewport = document.querySelector<HTMLElement>('#game-viewport');

if (viewport) {
  const raceScriptOpen = document.querySelector<HTMLButtonElement>('#race-script-open');

  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'race-hud-control';
  control.setAttribute('aria-label', 'Abrir Race Script');
  control.innerHTML = '<span id="game-lap-time" class="game-lap-time">00.000</span>';
  viewport.appendChild(control);

  const lapTime = control.querySelector<HTMLElement>('#game-lap-time');

  let started = false;
  let lapStartedAt = 0;
  let currentLap = 1;
  let sessionLap: SVGTextElement | null = null;
  let lapObserver: MutationObserver | null = null;

  const formatLap = (ms: number): string => {
    const value = Math.max(0, Math.floor(ms));
    const seconds = Math.floor(value / 1000);
    const millis = value % 1000;
    return `${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  };

  const startIfNeeded = (): void => {
    if (started) return;
    started = true;
    lapStartedAt = performance.now();
  };

  const syncLap = (): void => {
    const match = sessionLap?.textContent?.match(/VUELTA\s+(\d+)/i);
    if (!match) return;
    const lap = Number(match[1]);
    if (!Number.isFinite(lap) || lap < 1 || lap === currentLap) return;
    currentLap = lap;
    lapStartedAt = performance.now();
  };

  const integrateSessionHud = (): void => {
    const nextLap = document.querySelector<SVGTextElement>('.race-session-lap');
    const sessionHud = document.querySelector<SVGSVGElement>('.race-session-svg');
    const sessionTotal = document.querySelector<SVGTextElement>('.race-session-total');
    const sessionStats = document.querySelector<SVGTextElement>('.race-session-stats');

    sessionHud?.classList.add('race-session-hud-integrated');
    sessionTotal?.classList.add('race-session-total-hidden');
    nextLap?.setAttribute('y', '92');
    sessionStats?.setAttribute('y', '116');

    if (nextLap && nextLap !== sessionLap) {
      lapObserver?.disconnect();
      sessionLap = nextLap;
      lapObserver = new MutationObserver(syncLap);
      lapObserver.observe(sessionLap, { childList: true, characterData: true, subtree: true });
      syncLap();
    }
  };

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft' || event.code === 'KeyD' || event.code === 'ArrowRight') startIfNeeded();
  });

  control.addEventListener('click', () => raceScriptOpen?.click());

  const tick = (timestamp: number): void => {
    syncLap();
    if (started && lapTime) lapTime.textContent = formatLap(timestamp - lapStartedAt);
    requestAnimationFrame(tick);
  };

  new MutationObserver(integrateSessionHud).observe(viewport, { childList: true, subtree: true });
  integrateSessionHud();
  requestAnimationFrame(tick);
}
