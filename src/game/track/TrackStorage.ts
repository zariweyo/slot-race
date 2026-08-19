import type { TrackDefinition } from './TrackCompiler';

const DB_NAME = 'slot-race';
const DB_VERSION = 1;
const STORE = 'tracks';
const ACTIVE_KEY = 'slot-race.active-track';

type StoredTrack = TrackDefinition & { updatedAt: number };

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

export async function saveTrack(definition: TrackDefinition): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ ...structuredClone(definition), updatedAt: Date.now() } satisfies StoredTrack);
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
  if (!result) return null;
  const { updatedAt: _updatedAt, ...definition } = result;
  return definition;
}

export async function listTracks(): Promise<TrackDefinition[]> {
  const db = await openDb();
  const rows = await new Promise<StoredTrack[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredTrack[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error('Unable to list tracks'));
  });
  db.close();
  return rows
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ updatedAt: _updatedAt, ...definition }) => definition);
}

export function getActiveTrackId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveTrackId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export async function loadInitialTrack(fallback: TrackDefinition): Promise<TrackDefinition> {
  const activeId = getActiveTrackId();
  if (activeId) {
    const active = await getTrack(activeId);
    if (active) return active;
  }

  const existing = await getTrack(fallback.id);
  if (existing) {
    setActiveTrackId(existing.id);
    return existing;
  }

  await saveTrack(fallback);
  setActiveTrackId(fallback.id);
  return structuredClone(fallback);
}
