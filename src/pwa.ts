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

export function registerPwa(): void {
  ensureLink('manifest', '/manifest.webmanifest');
  ensureLink('icon', '/pwa-icon.svg');
  ensureMeta('mobile-web-app-capable', 'yes');
  ensureMeta('apple-mobile-web-app-capable', 'yes');
  ensureMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  ensureMeta('apple-mobile-web-app-title', 'Photon Circuit');
  ensureMeta('theme-color', '#010207');

  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('PWA service worker registration failed', error);
    });
  }, { once: true });
}

registerPwa();
