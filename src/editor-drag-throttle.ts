const MAP_SELECTOR = '#track-editor-map';

type DeferredPointerMove = {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  pressure: number;
};

const activePointers = new Set<number>();
let deferredMove: DeferredPointerMove | null = null;
let replayingDeferredMove = false;

const isMapEvent = (event: Event): boolean => {
  const target = event.target;
  return target instanceof Element && (target.matches(MAP_SELECTOR) || target.closest(MAP_SELECTOR) !== null);
};

window.addEventListener('pointerdown', (event) => {
  if (!isMapEvent(event)) return;
  activePointers.add(event.pointerId);
  if (activePointers.size === 1) deferredMove = null;
}, { capture: true });

window.addEventListener('pointermove', (event) => {
  if (!isMapEvent(event) || replayingDeferredMove) return;

  // Pinch/pan is already cheap inside TrackEditor because it only updates the
  // transform of the existing SVG group. Keep two-finger gestures fully live.
  if (activePointers.size >= 2) return;
  if (activePointers.size !== 1) return;

  // A one-finger slot edit used to compile the complete track and rebuild the SVG
  // on every pointermove. On mobile that creates sustained CPU/GC pressure and can
  // make Chrome terminate the tab. Keep only the latest position and apply it once
  // immediately before pointerup instead.
  deferredMove = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    pressure: event.pressure,
  };
  event.stopPropagation();
}, { capture: true });

window.addEventListener('pointerup', (event) => {
  if (!activePointers.has(event.pointerId)) return;

  if (activePointers.size === 1 && deferredMove?.pointerId === event.pointerId) {
    const map = document.querySelector<SVGSVGElement>(MAP_SELECTOR);
    if (map) {
      replayingDeferredMove = true;
      map.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: deferredMove.pointerId,
        pointerType: deferredMove.pointerType,
        clientX: deferredMove.clientX,
        clientY: deferredMove.clientY,
        button: deferredMove.button,
        buttons: deferredMove.buttons,
        pressure: deferredMove.pressure,
      }));
      replayingDeferredMove = false;
    }
  }

  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) deferredMove = null;
}, { capture: true });

window.addEventListener('pointercancel', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.delete(event.pointerId);
  if (activePointers.size === 0) deferredMove = null;
}, { capture: true });

window.addEventListener('blur', () => {
  activePointers.clear();
  deferredMove = null;
  replayingDeferredMove = false;
});
