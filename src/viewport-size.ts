const root = document.documentElement;

const updateViewportSize = (): void => {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const gameWidth = Math.min(width, height * 16 / 9);
  const gameHeight = Math.min(height, width * 9 / 16);
  const uiScale = Math.max(0.55, Math.min(1, Math.min(gameWidth / 900, gameHeight / 500)));
  const modalScale = Math.max(0.62, Math.min(1, Math.min(width / 760, height / 620)));

  root.style.setProperty('--slot-vw', `${width}px`);
  root.style.setProperty('--slot-vh', `${height}px`);
  root.style.setProperty('--slot-ui-scale', uiScale.toFixed(3));
  root.style.setProperty('--slot-modal-scale', modalScale.toFixed(3));
};

updateViewportSize();
window.visualViewport?.addEventListener('resize', updateViewportSize);
window.visualViewport?.addEventListener('scroll', updateViewportSize);
window.addEventListener('resize', updateViewportSize);
window.addEventListener('orientationchange', () => window.setTimeout(updateViewportSize, 250));
