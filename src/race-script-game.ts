import { getRaceScriptActionsForLap, setRaceScriptRuntime, updateRaceScriptTelemetry, type RaceScriptAction, type RaceScriptCommand } from './race-script';

export type RaceScriptGameBridge = {
  tick(timestamp: number): void;
  isRunning(): boolean;
  onLapStarted(): void;
};

export function createRaceScriptGameBridge(options: {
  chooseRail: (rail: 'cyan' | 'violet', timestamp: number) => void;
  restart: (timestamp: number) => void;
  onRunStateChanged: (running: boolean, timestamp: number) => void;
  getLap: () => number;
  getLapElapsedMs: (timestamp: number) => number;
}): RaceScriptGameBridge {
  let running = false;
  let executed = new Set<string>();

  const onCommand = (event: Event): void => {
    const command = (event as CustomEvent<RaceScriptCommand>).detail;
    const now = performance.now();

    if (command === 'run') {
      if (running) return;
      running = true;
      options.onRunStateChanged(true, now);
      setRaceScriptRuntime('running');
      return;
    }

    if (command === 'pause') {
      if (!running) return;
      running = false;
      options.onRunStateChanged(false, now);
      setRaceScriptRuntime('paused');
      return;
    }

    if (command === 'restart') {
      running = false;
      executed = new Set<string>();
      options.restart(now);
      options.onRunStateChanged(false, now);
      setRaceScriptRuntime('programming');
    }
  };

  window.addEventListener('race-script-command', onCommand);
  setRaceScriptRuntime('programming');

  return {
    tick(timestamp: number): void {
      const lap = options.getLap();
      const elapsed = options.getLapElapsedMs(timestamp);
      const actions = getRaceScriptActionsForLap(lap);
      let next: RaceScriptAction | null = null;

      if (running) {
        for (const action of actions) {
          const key = `${lap}:${action.id}`;
          if (executed.has(key)) continue;
          if (action.timeMs <= elapsed) {
            options.chooseRail(action.rail, timestamp);
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
    },
    isRunning(): boolean {
      return running;
    },
    onLapStarted(): void {
      // Keys include the lap number, so previous-lap executions naturally remain isolated.
    },
  };
}
