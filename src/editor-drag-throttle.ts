const MAP_SELECTOR = '#track-editor-map';
const DRAG_INTERVAL_MS = 120;

const activePointers = new Set<number>();
let lastSinglePointerMoveAt = 0;

const isMapEvent = (event: Event): boolean => {
  const target = event.target;
  return target instanceof Element && (target.matches(MAP_SELECTOR) || target.closest(MAP_SELECTOR) !== null);
};

window.addEventListener('pointerdown', (event) => {
  if (!isMapEvent(event)) return;
  activePointers.add(event.pointerId);
  if (activePointers.size === 1) lastSinglePointerMoveAt = 0;
}, { capture: true });

window.addEventListener('pointermove', (event) => {
  if (!isMapEvent(event)) return;

  // Two-finger gestures are cheap in TrackEditor: they only update the SVG group
  // transform, so keep them fully responsive.
  if (activePointers.size >= 2) return;
  if (activePointers.size !== 1) return;

  const now = Date.now();
  if (now - lastSinglePointerMoveAt < DRAG_INTERVAL_MS) {
    event.stopPropagation();
    return;
  }
  lastSinglePointerMoveAt = now;
}, { capture: true });

const releasePointer = (event: PointerEvent): void => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) lastSinglePointerMoveAt = 0;
};

window.addEventListener('pointerup', releasePointer, { capture: true });
window.addEventListener('pointercancel', releasePointer, { capture: true });
window.addEventListener('blur', () => {
  activePointers.clear();
  lastSinglePointerMoveAt = 0;
});
