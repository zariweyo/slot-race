import './pwa';

type RailSide = 'left' | 'right';

const buttons = new Map<RailSide, HTMLButtonElement>();
const pressed = new Set<RailSide>();
let selected: RailSide = 'left';

const codeFor = (side: RailSide): 'KeyA' | 'KeyD' => side === 'left' ? 'KeyA' : 'KeyD';

const syncClasses = (): void => {
  for (const [side, button] of buttons) {
    button.classList.toggle('is-selected', selected === side);
    button.classList.toggle('is-pressed', pressed.has(side));
  }
};

const sendKey = (type: 'keydown' | 'keyup', side: RailSide): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code: codeFor(side), bubbles: true }));
};

const release = (side: RailSide): void => {
  if (!pressed.delete(side)) return;
  sendKey('keyup', side);
  syncClasses();
};

const bind = (side: RailSide): void => {
  const button = document.querySelector<HTMLButtonElement>(`[data-rail-control="${side}"]`);
  if (!button) return;
  buttons.set(side, button);

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    selected = side;
    if (!pressed.has(side)) {
      pressed.add(side);
      sendKey('keydown', side);
    }
    try { button.setPointerCapture(event.pointerId); } catch { /* no-op */ }
    syncClasses();
  });

  button.addEventListener('pointerup', () => release(side));
  button.addEventListener('pointercancel', () => release(side));
  button.addEventListener('lostpointercapture', () => release(side));
  button.addEventListener('contextmenu', (event) => event.preventDefault());
};

bind('left');
bind('right');
syncClasses();

window.addEventListener('blur', () => {
  release('left');
  release('right');
});
