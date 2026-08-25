export type RaceScriptRail = 'cyan' | 'violet';
export type RaceScriptLap = 'all' | number;

export type RaceScriptAction = {
  id: string;
  timeMs: number;
  rail: RaceScriptRail;
  lap: RaceScriptLap;
};

const STORAGE_KEY = 'slot-race:race-script:v1';
const PAUSE_REASON = 'race-script-editor';
const actions: RaceScriptAction[] = [];
let selectedLap: RaceScriptLap = 'all';
let runtimeState: 'programming' | 'running' | 'paused' = 'programming';
let hasStarted = false;
let currentLap = 1;
let lapStartedAt = 0;
let currentRail: RaceScriptRail = 'cyan';
let executed = new Set<string>();

const modal = document.querySelector<HTMLElement>('#race-script-modal');
const root = document.querySelector<HTMLElement>('#race-script');
const openButton = document.querySelector<HTMLButtonElement>('#race-script-open');
const applyButton = document.querySelector<HTMLButtonElement>('#race-script-apply');
const list = document.querySelector<HTMLDivElement>('#race-script-list');
const addButton = document.querySelector<HTMLButtonElement>('#race-script-add');
const tabs = document.querySelector<HTMLDivElement>('#race-script-tabs');
const status = document.querySelector<HTMLElement>('#race-script-status');
const lapReadout = document.querySelector<HTMLElement>('#race-script-lap');
const timeReadout = document.querySelector<HTMLElement>('#race-script-time');
const nextReadout = document.querySelector<HTMLElement>('#race-script-next');

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatActionTime(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const seconds = Math.floor(safe / 1000);
  const millis = safe % 1000;
  return `${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function parseSeconds(value: string): number {
  const numeric = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 1000)) : 0;
}

function saveActions(): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
}

function loadActions(): void {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]') as RaceScriptAction[];
    if (Array.isArray(saved) && saved.length > 0) {
      actions.push(...saved.filter((action) => action && typeof action.timeMs === 'number' && (action.rail === 'cyan' || action.rail === 'violet')));
      return;
    }
  } catch {
    // Ignore malformed prototype state and start with a useful sample.
  }
  actions.push(
    { id: uid(), timeMs: 2000, rail: 'violet', lap: 'all' },
    { id: uid(), timeMs: 4000, rail: 'cyan', lap: 'all' },
  );
  saveActions();
}

function getActionsForLap(lap: number): RaceScriptAction[] {
  const globals = actions.filter((action) => action.lap === 'all');
  const specifics = actions.filter((action) => action.lap === lap);
  const specificTimes = new Set(specifics.map((action) => action.timeMs));
  return [...globals.filter((action) => !specificTimes.has(action.timeMs)), ...specifics]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((action) => ({ ...action }));
}

function visibleActions(): Array<RaceScriptAction & { inherited?: boolean }> {
  if (selectedLap === 'all') return actions.filter((action) => action.lap === 'all').sort((a, b) => a.timeMs - b.timeMs);
  return actions
    .filter((action) => action.lap === 'all' || action.lap === selectedLap)
    .map((action) => ({ ...action, inherited: action.lap === 'all' }))
    .sort((a, b) => a.timeMs - b.timeMs || Number(a.inherited) - Number(b.inherited));
}

function setRuntimeState(state: 'programming' | 'running' | 'paused'): void {
  runtimeState = state;
  root?.classList.toggle('running', state === 'running');
  root?.classList.toggle('paused', state === 'paused');
  if (status) status.textContent = state.toUpperCase();
  if (applyButton) applyButton.textContent = hasStarted ? 'APLICAR Y REANUDAR' : 'APLICAR Y CORRER';
  render();
}

function keyboard(code: 'KeyA' | 'KeyD', type: 'keydown' | 'keyup'): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'KeyA' ? 'a' : 'd', bubbles: true }));
}

function releaseRail(): void {
  keyboard('KeyA', 'keyup');
  keyboard('KeyD', 'keyup');
}

function pressRail(rail: RaceScriptRail): void {
  releaseRail();
  currentRail = rail;
  keyboard(rail === 'cyan' ? 'KeyA' : 'KeyD', 'keydown');
}

function elapsedLapMs(now = performance.now()): number {
  return hasStarted ? Math.max(0, now - lapStartedAt) : 0;
}

function markPastActionsAsHandled(now: number): void {
  const elapsed = elapsedLapMs(now);
  for (const action of getActionsForLap(currentLap)) {
    if (action.timeMs <= elapsed) executed.add(`${currentLap}:${action.id}`);
  }
}

function showEditor(initial = false): void {
  if (!modal) return;
  if (!initial && runtimeState === 'running') {
    releaseRail();
    setRuntimeState('paused');
  }
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  window.dispatchEvent(new CustomEvent('photon:pause', { detail: { reason: PAUSE_REASON } }));
}

function applyAndRun(): void {
  saveActions();
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
  window.dispatchEvent(new CustomEvent('photon:resume', { detail: { reason: PAUSE_REASON } }));

  const now = performance.now();
  if (!hasStarted) {
    hasStarted = true;
    currentLap = 1;
    lapStartedAt = now;
    executed = new Set<string>();
  } else {
    markPastActionsAsHandled(now);
  }

  setRuntimeState('running');
  pressRail(currentRail);
}

function render(): void {
  if (!list) return;
  list.replaceChildren();
  const visible = visibleActions();

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'race-script-empty';
    empty.textContent = selectedLap === 'all' ? 'Sin acciones. Añade el primer cambio de rail.' : 'Sin acciones específicas para esta vuelta.';
    list.appendChild(empty);
  }

  for (const action of visible) {
    const row = document.createElement('div');
    row.className = `race-script-row${action.inherited ? ' inherited' : ''}`;
    row.dataset.id = action.id;

    const time = document.createElement('input');
    time.className = 'race-script-time-input';
    time.type = 'number';
    time.min = '0';
    time.step = '0.001';
    time.value = (action.timeMs / 1000).toFixed(3);
    time.disabled = Boolean(action.inherited);
    time.setAttribute('aria-label', 'Tiempo en segundos');
    time.addEventListener('change', () => {
      action.timeMs = parseSeconds(time.value);
      saveActions();
      render();
    });

    const rail = document.createElement('select');
    rail.className = `race-script-rail ${action.rail}`;
    rail.disabled = Boolean(action.inherited);
    rail.innerHTML = '<option value="cyan">● CYAN</option><option value="violet">● VIOLET</option>';
    rail.value = action.rail;
    rail.addEventListener('change', () => {
      action.rail = rail.value as RaceScriptRail;
      rail.className = `race-script-rail ${action.rail}`;
      saveActions();
    });

    const scope = document.createElement('span');
    scope.className = 'race-script-scope';
    scope.textContent = action.lap === 'all' ? 'TODAS' : `V${action.lap}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'race-script-remove';
    remove.textContent = '×';
    remove.disabled = Boolean(action.inherited);
    remove.setAttribute('aria-label', 'Eliminar acción');
    remove.addEventListener('click', () => {
      const index = actions.findIndex((entry) => entry.id === action.id);
      if (index >= 0) actions.splice(index, 1);
      saveActions();
      render();
    });

    row.append(time, rail, scope, remove);
    list.appendChild(row);
  }
}

function addAction(): void {
  const targetLap = selectedLap;
  const sameScope = actions.filter((action) => action.lap === targetLap).sort((a, b) => a.timeMs - b.timeMs);
  const lastTime = sameScope.at(-1)?.timeMs ?? 0;
  const lastRail = sameScope.at(-1)?.rail ?? 'cyan';
  actions.push({ id: uid(), timeMs: lastTime + 1000, rail: lastRail === 'cyan' ? 'violet' : 'cyan', lap: targetLap });
  saveActions();
  render();
}

function syncLapFromHud(timestamp: number): void {
  const hudLap = document.querySelector<SVGTextElement>('.race-session-lap');
  const match = hudLap?.textContent?.match(/(?:VUELTA\s+)?(\d+)\s*(?:\/|$)/i);
  if (!match) return;
  const lap = Number(match[1]);
  if (!Number.isFinite(lap) || lap < 1 || lap === currentLap) return;
  currentLap = lap;
  lapStartedAt = timestamp;
}

function runtimeTick(timestamp: number): void {
  syncLapFromHud(timestamp);
  const elapsed = elapsedLapMs(timestamp);
  const script = getActionsForLap(currentLap);
  let next: RaceScriptAction | null = null;

  if (runtimeState === 'running') {
    for (const action of script) {
      const key = `${currentLap}:${action.id}`;
      if (executed.has(key)) continue;
      if (action.timeMs <= elapsed) {
        pressRail(action.rail);
        executed.add(key);
        continue;
      }
      next = action;
      break;
    }
  } else {
    next = script.find((action) => !executed.has(`${currentLap}:${action.id}`) && action.timeMs > elapsed) ?? null;
  }

  if (lapReadout) lapReadout.textContent = `LAP ${currentLap}`;
  if (timeReadout) timeReadout.textContent = formatActionTime(elapsed);
  if (nextReadout) nextReadout.textContent = next ? `NEXT  ${formatActionTime(next.timeMs)}  ${next.rail === 'cyan' ? '● CYAN' : '● VIOLET'}` : 'NEXT —';
  requestAnimationFrame(runtimeTick);
}

addButton?.addEventListener('click', addAction);
openButton?.addEventListener('click', () => showEditor(false));
applyButton?.addEventListener('click', applyAndRun);

tabs?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-race-script-lap]');
  if (!button) return;
  const raw = button.dataset.raceScriptLap;
  selectedLap = raw === 'all' ? 'all' : Number(raw);
  for (const tab of tabs.querySelectorAll<HTMLButtonElement>('[data-race-script-lap]')) tab.classList.toggle('active', tab === button);
  render();
});

loadActions();
setRuntimeState('programming');
requestAnimationFrame(runtimeTick);
