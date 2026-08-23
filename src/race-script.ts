export type RaceScriptRail = 'cyan' | 'violet';
export type RaceScriptLap = 'all' | number;

export type RaceScriptAction = {
  id: string;
  timeMs: number;
  rail: RaceScriptRail;
  lap: RaceScriptLap;
};

export type RaceScriptCommand = 'run' | 'pause' | 'restart';

const actions: RaceScriptAction[] = [];
let selectedLap: RaceScriptLap = 'all';
let runtimeState: 'programming' | 'running' | 'paused' = 'programming';

const root = document.querySelector<HTMLElement>('#race-script');
const list = document.querySelector<HTMLDivElement>('#race-script-list');
const addButton = document.querySelector<HTMLButtonElement>('#race-script-add');
const tabs = document.querySelector<HTMLDivElement>('#race-script-tabs');
const runButton = document.querySelector<HTMLButtonElement>('#race-script-run');
const pauseButton = document.querySelector<HTMLButtonElement>('#race-script-pause');
const restartButton = document.querySelector<HTMLButtonElement>('#race-script-restart');
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

function dispatchCommand(command: RaceScriptCommand): void {
  window.dispatchEvent(new CustomEvent<RaceScriptCommand>('race-script-command', { detail: command }));
}

function visibleActions(): Array<RaceScriptAction & { inherited?: boolean }> {
  if (selectedLap === 'all') return actions.filter((action) => action.lap === 'all').sort((a, b) => a.timeMs - b.timeMs);
  return actions
    .filter((action) => action.lap === 'all' || action.lap === selectedLap)
    .map((action) => ({ ...action, inherited: action.lap === 'all' }))
    .sort((a, b) => a.timeMs - b.timeMs || Number(a.inherited) - Number(b.inherited));
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
    time.disabled = Boolean(action.inherited) || runtimeState === 'running';
    time.setAttribute('aria-label', 'Tiempo en segundos');
    time.addEventListener('change', () => {
      action.timeMs = parseSeconds(time.value);
      render();
    });

    const rail = document.createElement('select');
    rail.className = `race-script-rail ${action.rail}`;
    rail.disabled = Boolean(action.inherited) || runtimeState === 'running';
    rail.innerHTML = '<option value="cyan">● CYAN</option><option value="violet">● VIOLET</option>';
    rail.value = action.rail;
    rail.addEventListener('change', () => {
      action.rail = rail.value as RaceScriptRail;
      render();
    });

    const scope = document.createElement('span');
    scope.className = 'race-script-scope';
    scope.textContent = action.lap === 'all' ? 'TODAS' : `V${action.lap}`;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'race-script-remove';
    remove.textContent = '×';
    remove.disabled = Boolean(action.inherited) || runtimeState === 'running';
    remove.setAttribute('aria-label', 'Eliminar acción');
    remove.addEventListener('click', () => {
      const index = actions.findIndex((entry) => entry.id === action.id);
      if (index >= 0) actions.splice(index, 1);
      render();
    });

    row.append(time, rail, scope, remove);
    list.appendChild(row);
  }

  if (addButton) addButton.disabled = runtimeState === 'running';
  if (runButton) {
    runButton.disabled = runtimeState === 'running';
    runButton.textContent = runtimeState === 'paused' ? '▶ RESUME' : '▶ RUN';
  }
  if (pauseButton) pauseButton.disabled = runtimeState !== 'running';
}

function addAction(): void {
  if (runtimeState === 'running') return;
  const targetLap = selectedLap;
  const sameScope = actions.filter((action) => action.lap === targetLap);
  const lastTime = sameScope.reduce((max, action) => Math.max(max, action.timeMs), 0);
  const lastRail = sameScope.sort((a, b) => a.timeMs - b.timeMs).at(-1)?.rail ?? 'cyan';
  actions.push({ id: uid(), timeMs: lastTime + 1000, rail: lastRail === 'cyan' ? 'violet' : 'cyan', lap: targetLap });
  render();
}

addButton?.addEventListener('click', addAction);
runButton?.addEventListener('click', () => dispatchCommand('run'));
pauseButton?.addEventListener('click', () => dispatchCommand('pause'));
restartButton?.addEventListener('click', () => dispatchCommand('restart'));

tabs?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-race-script-lap]');
  if (!button) return;
  const raw = button.dataset.raceScriptLap;
  selectedLap = raw === 'all' ? 'all' : Number(raw);
  for (const tab of tabs.querySelectorAll<HTMLButtonElement>('[data-race-script-lap]')) tab.classList.toggle('active', tab === button);
  render();
});

export function getRaceScriptActionsForLap(lap: number): RaceScriptAction[] {
  const globals = actions.filter((action) => action.lap === 'all');
  const specifics = actions.filter((action) => action.lap === lap);
  const specificTimes = new Set(specifics.map((action) => action.timeMs));
  return [...globals.filter((action) => !specificTimes.has(action.timeMs)), ...specifics]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((action) => ({ ...action }));
}

export function setRaceScriptRuntime(state: 'programming' | 'running' | 'paused'): void {
  runtimeState = state;
  root?.classList.toggle('running', state === 'running');
  root?.classList.toggle('paused', state === 'paused');
  if (status) status.textContent = state.toUpperCase();
  render();
}

export function updateRaceScriptTelemetry(lap: number, elapsedMs: number, next: RaceScriptAction | null): void {
  if (lapReadout) lapReadout.textContent = `LAP ${lap}`;
  if (timeReadout) timeReadout.textContent = formatActionTime(elapsedMs);
  if (nextReadout) nextReadout.textContent = next ? `NEXT  ${formatActionTime(next.timeMs)}  ${next.rail === 'cyan' ? '● CYAN' : '● VIOLET'}` : 'NEXT —';
}

// Give the first prototype an immediately testable sequence.
actions.push(
  { id: uid(), timeMs: 2000, rail: 'violet', lap: 'all' },
  { id: uid(), timeMs: 4000, rail: 'cyan', lap: 'all' },
);
render();
