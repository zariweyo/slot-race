export function registerPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('PWA service worker registration failed', error);
    });
  }, { once: true });
}

registerPwa();
