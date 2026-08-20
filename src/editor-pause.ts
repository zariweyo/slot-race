const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

let paused = false;
let pauseStartedAt = 0;
let accumulatedPauseMs = 0;
let nextId = 1;

const queued = new Map<number, FrameRequestCallback>();
const live = new Map<number, number>();

const schedule = (id: number, callback: FrameRequestCallback): void => {
  const nativeId = nativeRequestAnimationFrame((timestamp) => {
    live.delete(id);
    if (paused) {
      queued.set(id, callback);
      return;
    }
    callback(timestamp - accumulatedPauseMs);
  });
  live.set(id, nativeId);
};

window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  const id = nextId++;
  if (paused) queued.set(id, callback);
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

const pause = (): void => {
  if (paused) return;
  paused = true;
  pauseStartedAt = performance.now();
};

const resume = (): void => {
  if (!paused) return;
  accumulatedPauseMs += performance.now() - pauseStartedAt;
  paused = false;

  const pending = [...queued.entries()];
  queued.clear();
  for (const [id, callback] of pending) schedule(id, callback);
};

const modal = document.querySelector<HTMLElement>('#track-editor-modal');
if (modal) {
  const sync = (): void => {
    if (modal.classList.contains('open')) pause();
    else resume();
  };

  new MutationObserver(sync).observe(modal, {
    attributes: true,
    attributeFilter: ['class'],
  });
  sync();
}
