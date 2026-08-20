const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';
const BASE_URL = import.meta.env.BASE_URL || '/';

const ensureLink = (rel: string, href: string): void => {
  if (document.head.querySelector(`link[rel="${rel}"]`)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  document.head.appendChild(link);
};

const ensureMeta = (name: string, content: string): void => {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (existing) {
    existing.content = content;
    return;
  }
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
};

const showBuildVersion = (): void => {
  const viewport = document.querySelector<HTMLElement>('#game-viewport');
  if (!viewport || viewport.querySelector('.app-build-version')) return;
  const badge = document.createElement('div');
  badge.className = 'app-build-version';
  badge.textContent = APP_VERSION;
  badge.title = `Build ${APP_VERSION}`;
  Object.assign(badge.style, {
    position: 'absolute',
    left: '50%',
    bottom: '5px',
    transform: 'translateX(-50%)',
    zIndex: '1200',
    pointerEvents: 'none',
    color: 'rgba(180, 220, 232, .48)',
    font: '700 8px monospace',
    letterSpacing: '1px',
  });
  viewport.appendChild(badge);
};

export function registerPwa(): void {
  ensureLink('manifest', `${BASE_URL}manifest.webmanifest`);
  ensureLink('icon', `${BASE_URL}pwa-icon.svg`);
  ensureMeta('mobile-web-app-capable', 'yes');
  ensureMeta('apple-mobile-web-app-capable', 'yes');
  ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  ensureMeta('apple-mobile-web-app-title', 'Photon Circuit');
  ensureMeta('theme-color', '#010207');
  document.documentElement.dataset.appVersion = APP_VERSION;
  showBuildVersion();

  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const workerUrl = `${BASE_URL}sw.js?v=${encodeURIComponent(APP_VERSION)}`;
    navigator.serviceWorker.register(workerUrl, { scope: BASE_URL }).catch((error) => {
      console.warn('PWA service worker registration failed', error);
    });
  }, { once: true });
}

registerPwa();
