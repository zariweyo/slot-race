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
  const raceScriptTime = document.querySelector<HTMLElement>('#race-script-time');
  const raceSessionTotal = document.querySelector<SVGTextElement>('.race-session-total');

  const sync = (): void => {
    if (lapTime && raceScriptTime?.textContent) lapTime.textContent = raceScriptTime.textContent;
    if (totalTime && raceSessionTotal?.textContent) totalTime.textContent = `TOTAL ${raceSessionTotal.textContent}`;
  };

  if (raceScriptTime) new MutationObserver(sync).observe(raceScriptTime, { childList: true, characterData: true, subtree: true });
  if (raceSessionTotal) {
    raceSessionTotal.classList.add('race-session-total-hidden');
    new MutationObserver(sync).observe(raceSessionTotal, { childList: true, characterData: true, subtree: true });
  }

  sync();
}
