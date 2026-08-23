import { getRaceScriptActionsForLap, setRaceScriptRuntime, updateRaceScriptTelemetry, type RaceScriptAction, type RaceScriptCommand } from './race-script';

export type RaceScriptRuntimeHooks = {
  chooseRail: (rail: 'cyan' | 'violet', timestamp: number) => void;
  restart: (timestamp: number) => void;
  setRunning: (running: boolean, timestamp: number) => void;
  getLap: () => number;
  getLapElapsedMs: (timestamp: number) => number;
};

export function setupRaceScriptRuntime(hooks: RaceScriptRuntimeHooks): {
  tick: (timestamp: number) => void;
  isRunning: () => boolean;
  resetExecuted: () => void;
} {
  let running = false;
  let executed = new Set<string>();
  let pausedAt = 0;

  const resetExecuted = (): void => {
    executed = new Set<string>();
  };

  const onCommand = (event: Event): void => {
    const command = (event as CustomEvent<RaceScriptCommand>).detail;
    const now = performance.now();
    if (command === 'run') {
      if (running) return;
      running = true;
      if (pausedAt > 0) pausedAt = 0;
      hooks.setRunning(true, now);
      setRaceScriptRuntime('running');
      return;
    }
    if (command === 'pause') {
      if (!running) return;
      running = false;
      pausedAt = now;
      hooks.setRunning(false, now);
      setRaceScriptRuntime('paused');
      return;
    }
    if (command === 'restart') {
      running = false;
      pausedAt = 0;
      resetExecuted();
      hooks.restart(now);
      hooks.setRunning(false, now);
      setRaceScriptRuntime('programming');
    }
  };

  window.addEventListener('race-script-command', onCommand);
  setRaceScriptRuntime('programming');

  const tick = (timestamp: number): void => {
    const lap = hooks.getLap();
    const elapsed = hooks.getLapElapsedMs(timestamp);
    const actions = getRaceScriptActionsForLap(lap);
    let next: RaceScriptAction | null = null;

    if (running) {
      for (const action of actions) {
        const key = `${lap}:${action.id}`;
        if (executed.has(key)) continue;
        if (action.timeMs <= elapsed) {
          hooks.chooseRail(action.rail, timestamp);
          executed.add(key);
          continue;
        }
        next = action;
        break;
      }
    } else {
      next = actions.find((action) => !executed.has(`${lap}:${action.id}`) && action.timeMs > elapsed) ?? null;
    }

    updateRaceScriptTelemetry(lap, elapsed, next);
  };

  return { tick, isRunning: () => running, resetExecuted };
}
