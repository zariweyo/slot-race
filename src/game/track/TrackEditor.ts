import { compileTrack, type TrackDefinition, type TrackSegment } from './TrackCompiler';
import { listTracks, saveTrack, setActiveTrackId } from './TrackStorage';

type EditorOptions = {
  current: TrackDefinition;
};

const clone = <T>(value: T): T => structuredClone(value);

function segmentLabel(segment: TrackSegment): string {
  if (segment.type === 'straight') return `Straight · ${segment.length}`;
  if (segment.type === 'curve') return `Curve · ${segment.length} · ${segment.angle}°`;
  return segment.type === 'up' ? 'Up' : 'Down';
}

function createSegment(type: TrackSegment['type']): TrackSegment {
  if (type === 'straight') return { type, length: 520 };
  if (type === 'curve') return { type, length: 360, angle: 180 };
  return { type };
}

function createNewTrack(current: TrackDefinition): TrackDefinition {
  const stamp = Date.now().toString(36);
  return {
    version: current.version,
    id: `track-${stamp}`,
    name: 'Nuevo circuito',
    closed: true,
    autoClose: true,
    start: { x: 0, y: 0, heading: 0, level: 0 },
    road: clone(current.road),
    levels: clone(current.levels),
    segments: [
      { type: 'straight', length: 520 },
      { type: 'curve', length: 377, angle: 180 },
      { type: 'straight', length: 520 },
      { type: 'curve', length: 377, angle: 180 },
    ],
  };
}

export function setupTrackEditor(options: EditorOptions): void {
  const openButton = document.querySelector<HTMLButtonElement>('#track-editor-open');
  const modal = document.querySelector<HTMLDivElement>('#track-editor-modal');
  const closeButton = document.querySelector<HTMLButtonElement>('#track-editor-close');
  const list = document.querySelector<HTMLDivElement>('#track-editor-list');
  const newButton = document.querySelector<HTMLButtonElement>('#track-editor-new');
  const addSelect = document.querySelector<HTMLSelectElement>('#track-editor-add-type');
  const addButton = document.querySelector<HTMLButtonElement>('#track-editor-add');
  const saveButton = document.querySelector<HTMLButtonElement>('#track-editor-save');
  const loadSelect = document.querySelector<HTMLSelectElement>('#track-editor-load-select');
  const loadButton = document.querySelector<HTMLButtonElement>('#track-editor-load');
  const nameInput = document.querySelector<HTMLInputElement>('#track-editor-name');
  const idInput = document.querySelector<HTMLInputElement>('#track-editor-id');
  const status = document.querySelector<HTMLDivElement>('#track-editor-status');

  if (!openButton || !modal || !closeButton || !list || !newButton || !addSelect || !addButton || !saveButton || !loadSelect || !loadButton || !nameInput || !idInput || !status) {
    console.warn('Track editor markup is incomplete');
    return;
  }

  let draft = clone(options.current);

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };

  const render = (): void => {
    nameInput.value = draft.name;
    idInput.value = draft.id;
    list.replaceChildren();

    draft.segments.forEach((segment, index) => {
      const row = document.createElement('div');
      row.className = 'track-editor-row';

      const order = document.createElement('div');
      order.className = 'track-editor-order';
      order.textContent = String(index + 1).padStart(2, '0');
      row.appendChild(order);

      const type = document.createElement('select');
      ['straight', 'curve', 'up', 'down'].forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value.toUpperCase();
        option.selected = segment.type === value;
        type.appendChild(option);
      });
      type.addEventListener('change', () => {
        draft.segments[index] = createSegment(type.value as TrackSegment['type']);
        render();
      });
      row.appendChild(type);

      const fields = document.createElement('div');
      fields.className = 'track-editor-fields';
      if (segment.type === 'straight' || segment.type === 'curve') {
        const length = document.createElement('input');
        length.type = 'number';
        length.min = '20';
        length.step = '10';
        length.value = String(segment.length);
        length.title = 'Length';
        length.addEventListener('change', () => {
          const value = Math.max(20, Number(length.value) || 20);
          if (segment.type === 'straight' || segment.type === 'curve') segment.length = value;
        });
        fields.appendChild(length);
      }
      if (segment.type === 'curve') {
        const angle = document.createElement('input');
        angle.type = 'number';
        angle.step = '5';
        angle.value = String(segment.angle);
        angle.title = 'Angle in degrees (+left / -right)';
        angle.addEventListener('change', () => {
          segment.angle = Number(angle.value) || 0;
        });
        fields.appendChild(angle);
      }
      if (segment.type === 'up' || segment.type === 'down') {
        const fixed = document.createElement('span');
        fixed.className = 'track-editor-fixed';
        fixed.textContent = `${segmentLabel(segment)} · fixed ${draft.levels.rampLength}`;
        fields.appendChild(fixed);
      }
      row.appendChild(fields);

      const controls = document.createElement('div');
      controls.className = 'track-editor-controls';
      const up = document.createElement('button');
      up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [draft.segments[index - 1], draft.segments[index]] = [draft.segments[index], draft.segments[index - 1]];
        render();
      });
      const down = document.createElement('button');
      down.textContent = '↓';
      down.disabled = index === draft.segments.length - 1;
      down.addEventListener('click', () => {
        [draft.segments[index], draft.segments[index + 1]] = [draft.segments[index + 1], draft.segments[index]];
        render();
      });
      const remove = document.createElement('button');
      remove.textContent = '×';
      remove.className = 'danger';
      remove.addEventListener('click', () => {
        draft.segments.splice(index, 1);
        render();
      });
      controls.append(up, down, remove);
      row.appendChild(controls);
      list.appendChild(row);
    });
  };

  const refreshStoredTracks = async (): Promise<void> => {
    const tracks = await listTracks();
    loadSelect.replaceChildren();
    tracks.forEach((track) => {
      const option = document.createElement('option');
      option.value = track.id;
      option.textContent = `${track.name} (${track.id})`;
      option.selected = track.id === draft.id;
      loadSelect.appendChild(option);
    });
  };

  openButton.addEventListener('click', async () => {
    modal.classList.add('open');
    draft = clone(options.current);
    render();
    await refreshStoredTracks();
    setStatus('Editing current circuit');
  });

  closeButton.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.classList.remove('open');
  });

  newButton.addEventListener('click', () => {
    draft = createNewTrack(options.current);
    render();
    setStatus('Nuevo circuito sin guardar');
  });

  addButton.addEventListener('click', () => {
    draft.segments.push(createSegment(addSelect.value as TrackSegment['type']));
    render();
  });

  saveButton.addEventListener('click', async () => {
    try {
      draft.name = nameInput.value.trim() || 'Untitled Track';
      draft.id = idInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || `track-${Date.now()}`;
      compileTrack(draft, 8);
      await saveTrack(draft);
      setActiveTrackId(draft.id);
      setStatus('Saved. Loading circuit…');
      window.setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  });

  loadButton.addEventListener('click', () => {
    if (!loadSelect.value) return;
    setActiveTrackId(loadSelect.value);
    setStatus('Loading circuit…');
    window.setTimeout(() => window.location.reload(), 80);
  });

  render();
}
