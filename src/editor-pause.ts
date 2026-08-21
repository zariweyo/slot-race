const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const nativePerformanceNow = performance.now.bind(performance);

let pauseStartedAt = 0;
let accumulatedPauseMs = 0;
let nextId = 1;
const pauseReasons = new Set<string>();
const isPaused = (): boolean => pauseReasons.size > 0;

const gameNow = (): number => nativePerformanceNow() - accumulatedPauseMs;

Object.defineProperty(performance, 'now', {
  configurable: true,
  value: gameNow,
});

const queued = new Map<number, FrameRequestCallback>();
const live = new Map<number, number>();

const schedule = (id: number, callback: FrameRequestCallback): void => {
  const nativeId = nativeRequestAnimationFrame((timestamp) => {
    live.delete(id);
    if (isPaused()) {
      queued.set(id, callback);
      return;
    }
    callback(timestamp - accumulatedPauseMs);
  });
  live.set(id, nativeId);
};

window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  const id = nextId++;
  if (isPaused()) queued.set(id, callback);
  else schedule(id, callback);
  return id;
}) as typeof window.requestAnimationFrame;

window.cancelAnimationFrame = ((id: number): void => {
  queued.delete(id);
  const nativeId = live.get(id);
  if (nativeId !== undefined) {
    live.delete(id);
    nativeCancelAnimationFrame(nativeId);
  }
}) as typeof window.cancelAnimationFrame;

const pause = (reason: string): void => {
  const wasPaused = isPaused();
  pauseReasons.add(reason);
  if (wasPaused) return;
  pauseStartedAt = nativePerformanceNow();
};

const resume = (reason: string): void => {
  if (!pauseReasons.has(reason)) return;
  pauseReasons.delete(reason);
  if (isPaused()) return;

  accumulatedPauseMs += nativePerformanceNow() - pauseStartedAt;
  const pending = [...queued.entries()];
  queued.clear();
  for (const [id, callback] of pending) schedule(id, callback);
};

window.addEventListener('photon:pause', ((event: CustomEvent<{ reason?: string }>) => {
  pause(event.detail?.reason ?? 'external');
}) as EventListener);
window.addEventListener('photon:resume', ((event: CustomEvent<{ reason?: string }>) => {
  resume(event.detail?.reason ?? 'external');
}) as EventListener);

const modal = document.querySelector<HTMLElement>('#track-editor-modal');
if (modal) {
  const sync = (): void => {
    if (modal.classList.contains('open')) pause('editor');
    else resume('editor');
  };

  new MutationObserver(sync).observe(modal, {
    attributes: true,
    attributeFilter: ['class'],
  });
  sync();
}
