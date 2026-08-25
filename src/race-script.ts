import { SETTINGS } from './settings';

export type RaceScriptRail = 'cyan' | 'violet';
export type RaceScriptLap = 'all' | number;

export type RaceScriptAction = {
  id: string;
  timeMs: number;
  rail: RaceScriptRail;
  lap: RaceScriptLap;
};

const STORAGE_KEY = 'slot-race:race-script:v2';
const PAUSE_REASON = 'race-script-editor';
const RACE_SCRIPT = SETTINGS.raceScript;
const SCRIPT_DURATION_MS = RACE_SCRIPT.timelineDurationMs;
const actions: RaceScriptAction[] = [];
let runtimeState: 'programming' | 'running' | 'paused' = 'programming';
let hasStarted = false;
let currentLap = 1;
let lapStartedAt = 0;
let currentRail: RaceScriptRail = 'cyan';
let executed = new Set<string>();
let nodeMenu: HTMLElement | null = null;

const modal = document.querySelector<HTMLElement>('#race-script-modal');
const root = document.querySelector<HTMLElement>('#race-script');
const openButton = document.querySelector<HTMLButtonElement>('#race-script-open');
const applyButton = document.querySelector<HTMLButtonElement>('#race-script-apply');
const list = document.querySelector<HTMLDivElement>('#race-script-list');
const addButton = document.querySelector<HTMLButtonElement>('#race-script-add');
const duplicateLapSelect = document.querySelector<HTMLSelectElement>('#race-script-duplicate-lap');
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
  actions.push(...createDefaultActions('all'));
  saveActions();
}

function getActionsForLap(lap: number): RaceScriptAction[] {
  const globals = actions.filter((action) => action.lap === 'all');
  const specifics = actions.filter((action) => action.lap === lap);
  const source = specifics.length > 0 ? specifics : globals;
  return source.sort((a, b) => a.timeMs - b.timeMs).map((action) => ({ ...action }));
}

function createDefaultActions(lap: RaceScriptLap): RaceScriptAction[] {
  let previous: RaceScriptRail = 'cyan';
  return RACE_SCRIPT.defaultNodePositions.map((position) => {
    previous = oppositeRail(previous);
    return { id: uid(), timeMs: SCRIPT_DURATION_MS * position, rail: previous, lap };
  });
}

function actionsForScope(lap: RaceScriptLap): RaceScriptAction[] {
  return actions.filter((action) => action.lap === lap).sort((a, b) => a.timeMs - b.timeMs);
}

function railsAt(scopeActions: RaceScriptAction[]): Array<{ from: number; to: number; rail: RaceScriptRail }> {
  const sorted = [...scopeActions].sort((a, b) => a.timeMs - b.timeMs);
  const segments: Array<{ from: number; to: number; rail: RaceScriptRail }> = [];
  let rail: RaceScriptRail = 'cyan';
  let from = 0;
  for (const action of sorted) {
    const to = Math.max(from, Math.min(SCRIPT_DURATION_MS, action.timeMs));
    segments.push({ from, to, rail });
    rail = action.rail;
    from = to;
  }
  segments.push({ from, to: SCRIPT_DURATION_MS, rail });
  return segments.filter((segment) => segment.to > segment.from);
}

function railAt(scopeActions: RaceScriptAction[], timeMs: number): RaceScriptRail {
  let rail: RaceScriptRail = 'cyan';
  for (const action of [...scopeActions].sort((a, b) => a.timeMs - b.timeMs)) {
    if (action.timeMs > timeMs) break;
    rail = action.rail;
  }
  return rail;
}

function oppositeRail(rail: RaceScriptRail): RaceScriptRail {
  return rail === 'cyan' ? 'violet' : 'cyan';
}

function replaceScope(lap: RaceScriptLap, nextActions: RaceScriptAction[]): void {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    if (actions[i].lap === lap) actions.splice(i, 1);
  }
  actions.push(...nextActions);
}

function targetLapCount(): number {
  const text = document.querySelector<SVGTextElement>('.race-session-lap')?.textContent;
  const total = Number(text?.match(/\/\s*(\d+)/)?.[1]);
  return Number.isFinite(total) && total > 0 ? Math.min(RACE_SCRIPT.maxLaps, total) : RACE_SCRIPT.maxLaps;
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
  closeNodeMenu();
  list.replaceChildren();

  if (duplicateLapSelect) {
    const currentValue = duplicateLapSelect.value || '1';
    duplicateLapSelect.replaceChildren();
    const existing = new Set(actions.filter((action) => action.lap !== 'all').map((action) => String(action.lap)));
    for (let lap = 1; lap <= targetLapCount(); lap += 1) {
      const option = document.createElement('option');
      option.value = String(lap);
      option.textContent = existing.has(String(lap)) ? `Vuelta ${lap} · sustituir` : `Vuelta ${lap}`;
      duplicateLapSelect.appendChild(option);
    }
    duplicateLapSelect.value = currentValue;
  }

  const scopes: RaceScriptLap[] = ['all', ...Array.from(new Set(actions.filter((action) => action.lap !== 'all').map((action) => action.lap as number))).sort((a, b) => a - b)];
  for (const scope of scopes) renderBar(scope);
}

function addActionAt(scope: RaceScriptLap, bar: HTMLElement, clientX: number): void {
  const rect = bar.getBoundingClientRect();
  const ratio = clampTimelineRatio((clientX - rect.left) / Math.max(1, rect.width));
  const scopeActions = actionsForScope(scope);
  let timeMs = ratio * SCRIPT_DURATION_MS;
  const minGapMs = RACE_SCRIPT.minNodeGapMs;
  const edgePaddingMs = SCRIPT_DURATION_MS * RACE_SCRIPT.edgePaddingRatio;
  if (scopeActions.some((action) => Math.abs(action.timeMs - timeMs) < minGapMs)) {
    const shiftedRight = clamp(timeMs + minGapMs, edgePaddingMs, SCRIPT_DURATION_MS - edgePaddingMs);
    const shiftedLeft = clamp(timeMs - minGapMs, edgePaddingMs, SCRIPT_DURATION_MS - edgePaddingMs);
    timeMs = scopeActions.every((action) => Math.abs(action.timeMs - shiftedRight) >= minGapMs) ? shiftedRight : shiftedLeft;
  }
  const nextRail = oppositeRail(railAt(scopeActions, timeMs));
  scopeActions.push({ id: uid(), timeMs, rail: nextRail, lap: scope });
  replaceScope(scope, normalizeScope(scopeActions));
  saveActions();
  render();
}

function renderSegments(bar: HTMLElement, scopeActions: RaceScriptAction[]): void {
  for (const segment of bar.querySelectorAll('.race-script-segment')) segment.remove();
  const firstNode = bar.querySelector('.race-script-node, .race-script-node-menu');
  for (const segment of railsAt(scopeActions)) {
    const part = document.createElement('div');
    part.className = `race-script-segment ${segment.rail}`;
    part.style.left = `${(segment.from / SCRIPT_DURATION_MS) * 100}%`;
    part.style.width = `${((segment.to - segment.from) / SCRIPT_DURATION_MS) * 100}%`;
    bar.insertBefore(part, firstNode);
  }
}

function normalizeScope(scopeActions: RaceScriptAction[]): RaceScriptAction[] {
  let previous: RaceScriptRail = 'cyan';
  const edgePaddingMs = SCRIPT_DURATION_MS * RACE_SCRIPT.edgePaddingRatio;
  return scopeActions
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((action) => {
      const rail = oppositeRail(previous);
      previous = rail;
      return {
        ...action,
        rail,
        timeMs: clamp(action.timeMs, edgePaddingMs, SCRIPT_DURATION_MS - edgePaddingMs),
      };
    });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampTimelineRatio(value: number): number {
  return clamp(value, RACE_SCRIPT.edgePaddingRatio, 1 - RACE_SCRIPT.edgePaddingRatio);
}

function isTooCloseToNode(bar: HTMLElement, clientX: number): boolean {
  for (const node of bar.querySelectorAll<HTMLElement>('.race-script-node')) {
    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    if (Math.abs(clientX - centerX) < RACE_SCRIPT.newNodeMinDistancePx) return true;
  }
  return false;
}

function closeNodeMenu(): void {
  nodeMenu?.remove();
  nodeMenu = null;
}

function removeAction(action: RaceScriptAction): void {
  const index = actions.findIndex((entry) => entry.id === action.id);
  if (index >= 0) actions.splice(index, 1);
  saveActions();
  render();
}

function showNodeMenu(action: RaceScriptAction, node: HTMLElement): void {
  closeNodeMenu();
  const bar = node.closest<HTMLElement>('.race-script-rail-bar');
  if (!bar) return;

  const menu = document.createElement('div');
  menu.className = 'race-script-node-menu';
  menu.style.left = node.style.left;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Eliminar';
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    removeAction(action);
  });

  menu.appendChild(remove);
  bar.appendChild(menu);
  nodeMenu = menu;
}

function renderBar(scope: RaceScriptLap): void {
  if (!list) return;
  const scopeActions = actionsForScope(scope);
  const row = document.createElement('section');
  row.className = `race-script-bar-row${scope === 'all' ? ' main' : ''}`;

  const header = document.createElement('header');
  header.className = 'race-script-bar-header';
  const title = document.createElement('strong');
  title.textContent = scope === 'all' ? 'Principal' : `Vuelta ${scope}`;
  const subtitle = document.createElement('span');
  subtitle.textContent = scope === 'all' ? 'Base para todas las vueltas' : 'Secuencia desacoplada';
  header.append(title, subtitle);

  if (scope !== 'all') {
    const removeBar = document.createElement('button');
    removeBar.type = 'button';
    removeBar.className = 'race-script-remove-bar';
    removeBar.textContent = 'QUITAR';
    removeBar.addEventListener('click', () => {
      replaceScope(scope, []);
      saveActions();
      render();
    });
    header.appendChild(removeBar);
  }

  const bar = document.createElement('div');
  bar.className = 'race-script-rail-bar';
  bar.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.race-script-node-menu, .race-script-node')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeNodeMenu();
    if (isTooCloseToNode(bar, event.clientX)) return;
    addActionAt(scope, bar, event.clientX);
  }, { capture: true });

  renderSegments(bar, scopeActions);

  for (const action of scopeActions) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `race-script-node ${action.rail}`;
    node.style.left = `${(action.timeMs / SCRIPT_DURATION_MS) * 100}%`;
    node.setAttribute('aria-label', `Cambio a ${action.rail}`);
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showNodeMenu(action, node);
    });

    node.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      node.setPointerCapture(event.pointerId);
      closeNodeMenu();
      const startX = event.clientX;
      const startY = event.clientY;
      let dragged = false;
      let longPressed = false;
      const longPress = window.setTimeout(() => {
        longPressed = true;
        showNodeMenu(action, node);
      }, RACE_SCRIPT.longPressDurationMs);
      const move = (moveEvent: PointerEvent): void => {
        const moved = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (moved > RACE_SCRIPT.dragStartDistancePx) {
          window.clearTimeout(longPress);
          dragged = true;
        }
        if (longPressed || !dragged) return;
        const rect = bar.getBoundingClientRect();
        const ratio = clampTimelineRatio((moveEvent.clientX - rect.left) / Math.max(1, rect.width));
        action.timeMs = ratio * SCRIPT_DURATION_MS;
        node.style.left = `${ratio * 100}%`;
        renderSegments(bar, actionsForScope(scope));
      };
      const done = (): void => {
        window.clearTimeout(longPress);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', done);
        node.removeEventListener('pointercancel', done);
        if (dragged && !longPressed) {
          replaceScope(scope, normalizeScope(actionsForScope(scope)));
          saveActions();
          render();
        }
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', done);
      node.addEventListener('pointercancel', done);
    });

    bar.appendChild(node);
  }

  row.append(header, bar);
  list.appendChild(row);
}

function duplicateMain(): void {
  const lap = Math.max(1, Math.round(Number(duplicateLapSelect?.value) || 1));
  const main = actionsForScope('all').map((action) => ({ ...action, id: uid(), lap }));
  replaceScope(lap, main.length > 0 ? main : createDefaultActions(lap));
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
  if (nextReadout) nextReadout.textContent = next ? `SIGUIENTE CAMBIO  ${next.rail === 'cyan' ? '● CYAN' : '● VIOLET'}` : 'SIN CAMBIOS PENDIENTES';
  requestAnimationFrame(runtimeTick);
}

addButton?.addEventListener('click', duplicateMain);
openButton?.addEventListener('click', () => showEditor(false));
applyButton?.addEventListener('click', applyAndRun);

loadActions();
setRuntimeState('programming');
requestAnimationFrame(runtimeTick);
