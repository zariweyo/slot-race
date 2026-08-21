type TrackSettings = {
  laps: number;
  laneSpacing: number;
};

const SETTINGS_PREFIX = 'slot-race.track-settings.';
const DB_NAME = 'slot-race';
const DB_VERSION = 1;
const STORE = 'tracks';

const meta = document.querySelector<HTMLElement>('.track-editor-meta');
const idInput = document.querySelector<HTMLInputElement>('#track-editor-id');
const saveButton = document.querySelector<HTMLButtonElement>('#track-editor-save');
const openButton = document.querySelector<HTMLButtonElement>('#track-editor-open');

const lapsInput = document.createElement('input');
lapsInput.id = 'track-editor-laps';
lapsInput.type = 'number';
lapsInput.min = '1';
lapsInput.max = '99';
lapsInput.step = '1';
lapsInput.value = '3';

const spacingInput = document.createElement('input');
spacingInput.id = 'track-editor-lane-spacing';
spacingInput.type = 'number';
spacingInput.min = '10';
spacingInput.max = '140';
spacingInput.step = '5';
spacingInput.value = '100';

const createField = (text: string, input: HTMLInputElement): HTMLLabelElement => {
  const label = document.createElement('label');
  label.className = 'track-editor-extra-setting';
  label.append(text, input);
  return label;
};

if (meta) {
  meta.classList.add('has-extra-settings');
  meta.append(
    createField('Vueltas', lapsInput),
    createField('Separación raíles', spacingInput),
  );

  const style = document.createElement('style');
  style.textContent = `
    .track-editor-meta.has-extra-settings {
      grid-template-columns: minmax(170px, 1.35fr) minmax(145px, 1fr) 92px 72px 118px;
    }
    .track-editor-meta.has-extra-settings .track-editor-extra-setting input { width: 100%; }
    @media (max-width: 900px) {
      .track-editor-meta.has-extra-settings {
        grid-template-columns: minmax(145px, 1.2fr) minmax(125px, 1fr) 82px 68px 105px;
        gap: 5px;
      }
    }
  `;
  document.head.appendChild(style);
}

const keyFor = (id: string): string => `${SETTINGS_PREFIX}${id}`;

const readOverride = (id: string): TrackSettings | null => {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<TrackSettings>;
    if (!Number.isFinite(value.laps) || !Number.isFinite(value.laneSpacing)) return null;
    return {
      laps: Math.max(1, Math.round(value.laps!)),
      laneSpacing: Math.max(10, Number(value.laneSpacing)),
    };
  } catch {
    return null;
  }
};

const readStoredTrack = (id: string): Promise<{ laps?: number; road?: { laneSpacing?: number } } | null> => new Promise((resolve) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onerror = () => resolve(null);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
  };
  request.onsuccess = () => {
    const db = request.result;
    const get = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    get.onerror = () => { db.close(); resolve(null); };
    get.onsuccess = () => { const value = get.result ?? null; db.close(); resolve(value); };
  };
});

const sync = async (): Promise<void> => {
  const id = idInput?.value.trim();
  if (!id) return;
  const override = readOverride(id);
  const stored = await readStoredTrack(id);
  lapsInput.value = String(override?.laps ?? stored?.laps ?? 3);
  spacingInput.value = String(override?.laneSpacing ?? stored?.road?.laneSpacing ?? 100);
};

const persist = (): void => {
  const id = idInput?.value.trim();
  if (!id) return;
  const settings: TrackSettings = {
    laps: Math.max(1, Math.round(Number(lapsInput.value) || 3)),
    laneSpacing: Math.max(10, Number(spacingInput.value) || 100),
  };
  lapsInput.value = String(settings.laps);
  spacingInput.value = String(settings.laneSpacing);
  localStorage.setItem(keyFor(id), JSON.stringify(settings));
};

saveButton?.addEventListener('click', persist);
openButton?.addEventListener('click', () => { window.setTimeout(() => { void sync(); }, 0); });
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('.track-editor-settings-button, #track-editor-new, #track-editor-duplicate')) {
    window.setTimeout(() => { void sync(); }, 0);
  }
});

lapsInput.addEventListener('change', persist);
spacingInput.addEventListener('change', persist);
