import type { TrackDefinition } from './TrackCompiler';

const DB_NAME = 'slot-race';
const DB_VERSION = 1;
const STORE = 'tracks';
const ACTIVE_KEY = 'slot-race.active-track';
const SETTINGS_PREFIX = 'slot-race.track-settings.';
const RAIL_EDGE_MARGIN_RATIO = 0.70;

type StoredTrack = TrackDefinition & { updatedAt: number };
type TrackSettings = { laps?: number; laneSpacing?: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'));
  });
}

function stripMetadata(row: StoredTrack): TrackDefinition {
  const definition = structuredClone(row) as Partial<StoredTrack>;
  delete definition.updatedAt;
  return definition as TrackDefinition;
}

function settingsFor(id: string): TrackSettings | null {
  try {
    const raw = localStorage.getItem(`${SETTINGS_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as TrackSettings;
  } catch {
    return null;
  }
}

function applySettings(definition: TrackDefinition): TrackDefinition {
  const settings = settingsFor(definition.id);
  const laps = settings && Number.isFinite(settings.laps) ? Math.max(1, Math.round(settings.laps!)) : definition.laps;
  const laneSpacing = settings && Number.isFinite(settings.laneSpacing) ? Math.max(10, Number(settings.laneSpacing)) : definition.road.laneSpacing;
  const railMargin = laneSpacing * RAIL_EDGE_MARGIN_RATIO;
  return {
    ...definition,
    laps,
    road: {
      ...definition.road,
      width: laneSpacing + railMargin * 2,
      laneSpacing,
    },
  };
}

export async function saveTrack(definition: TrackDefinition): Promise<void> {
  const prepared = applySettings(structuredClone(definition));
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...prepared, updatedAt: Date.now() } satisfies StoredTrack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save track'));
  });
  db.close();
}

export async function getTrack(id: string): Promise<TrackDefinition | null> {
  const db = await openDb();
  const result = await new Promise<StoredTrack | undefined>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredTrack | undefined);
    request.onerror = () => reject(request.error ?? new Error('Unable to load track'));
  });
  db.close();
  return result ? applySettings(stripMetadata(result)) : null;
}

export async function listTracks(): Promise<TrackDefinition[]> {
  const db = await openDb();
  const rows = await new Promise<StoredTrack[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredTrack[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('Unable to list tracks'));
  });
  db.close();
  return rows.sort((a, b) => b.updatedAt - a.updatedAt).map(stripMetadata).map(applySettings);
}

export function getActiveTrackId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveTrackId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

function refreshBundledTrack(stored: TrackDefinition, fallback: TrackDefinition): TrackDefinition {
  if (stored.id !== fallback.id) return stored;
  if (stored.laps !== undefined && stored.road.laneSpacing > 0) return stored;
  return {
    ...stored,
    laps: stored.laps ?? fallback.laps ?? 3,
    road: {
      ...stored.road,
      laneSpacing: stored.road.laneSpacing > 0 ? stored.road.laneSpacing : fallback.road.laneSpacing,
    },
  };
}

export async function loadInitialTrack(fallback: TrackDefinition): Promise<TrackDefinition> {
  const activeId = getActiveTrackId();
  if (activeId) {
    const active = await getTrack(activeId);
    if (active) {
      const refreshed = applySettings(refreshBundledTrack(active, fallback));
      if (refreshed !== active) await saveTrack(refreshed);
      return refreshed;
    }
  }

  const existing = await getTrack(fallback.id);
  if (existing) {
    const refreshed = applySettings(refreshBundledTrack(existing, fallback));
    await saveTrack(refreshed);
    setActiveTrackId(refreshed.id);
    return refreshed;
  }

  const initial = applySettings(structuredClone(fallback));
  await saveTrack(initial);
  setActiveTrackId(initial.id);
  return initial;
}
