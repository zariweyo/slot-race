import { compileTrack, type TrackDefinition, type TrackSegment } from './TrackCompiler';
import { listTracks, saveTrack, setActiveTrackId } from './TrackStorage';

type EditorOptions = {
  current: TrackDefinition;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_WIDTH = 420;
const MAP_HEIGHT = 300;
const MAP_PADDING = 26;
const LEVEL_COLORS = ['#62efff', '#ff6bdc', '#ffd166', '#7cf29a', '#ff765f', '#b99cff'];
const SEGMENT_TYPES: Array<{ type: TrackSegment['type']; label: string }> = [
  { type: 'straight', label: 'Recta' },
  { type: 'curve', label: 'Curva' },
  { type: 'up', label: 'Sube' },
  { type: 'down', label: 'Baja' },
];

const clone = <T>(value: T): T => structuredClone(value);

function segmentLabel(segment: TrackSegment): string {
  if (segment.type === 'straight') return `Recta · ${segment.length}`;
  if (segment.type === 'curve') return `Curva · ${segment.length} · ${segment.angle}°`;
  return segment.type === 'up' ? 'Sube' : 'Baja';
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
    speedMultiplier: 1,
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

function duplicateTrack(source: TrackDefinition): TrackDefinition {
  const copy = clone(source);
  const stamp = Date.now().toString(36);
  copy.id = `${source.id || 'track'}-copy-${stamp}`;
  copy.name = `${source.name || 'Circuito'} copia`;
  return copy;
}

export function setupTrackEditor(options: EditorOptions): void {
  const openButton = document.querySelector<HTMLButtonElement>('#track-editor-open');
  const modal = document.querySelector<HTMLDivElement>('#track-editor-modal');
  const closeButton = document.querySelector<HTMLButtonElement>('#track-editor-close');
  const list = document.querySelector<HTMLDivElement>('#track-editor-list');
  const newButton = document.querySelector<HTMLButtonElement>('#track-editor-new');
  const duplicateButton = document.querySelector<HTMLButtonElement>('#track-editor-duplicate');
  const saveButton = document.querySelector<HTMLButtonElement>('#track-editor-save');
  const loadSelect = document.querySelector<HTMLSelectElement>('#track-editor-load-select');
  const loadButton = document.querySelector<HTMLButtonElement>('#track-editor-load');
  const nameInput = document.querySelector<HTMLInputElement>('#track-editor-name');
  const idInput = document.querySelector<HTMLInputElement>('#track-editor-id');
  const speedInput = document.querySelector<HTMLInputElement>('#track-editor-speed');
  const status = document.querySelector<HTMLDivElement>('#track-editor-status');
  const slotCount = document.querySelector<HTMLSpanElement>('#track-editor-slot-count');
  const map = document.querySelector<SVGSVGElement>('#track-editor-map');
  const mapInfo = document.querySelector<HTMLSpanElement>('#track-editor-map-info');
  const mapError = document.querySelector<HTMLDivElement>('#track-editor-map-error');
  const layerButton = document.querySelector<HTMLButtonElement>('#track-editor-layer');
  const levels = document.querySelector<HTMLDivElement>('#track-editor-levels');

  if (!openButton || !modal || !closeButton || !list || !newButton || !duplicateButton || !saveButton || !loadSelect || !loadButton || !nameInput || !idInput || !speedInput || !status || !slotCount || !map || !mapInfo || !mapError || !layerButton || !levels) {
    console.warn('Track editor markup is incomplete');
    return;
  }

  let draft = clone(options.current);
  let insertAfter: number | null = null;
  let visibleLayer: number | null = null;
  let availableLayers = 1;

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };

  const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => (
    document.createElementNS(SVG_NS, tag)
  );

  const renderMap = (): void => {
    map.replaceChildren();
    levels.replaceChildren();
    mapError.textContent = '';

    try {
      const compiled = compileTrack(draft, 8);
      availableLayers = compiled.maxLevel + 1;
      if (visibleLayer !== null && visibleLayer >= availableLayers) visibleLayer = null;

      const bounds = compiled.points.reduce((acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minY: Math.min(acc.minY, point.y),
        maxY: Math.max(acc.maxY, point.y),
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);
      const scale = Math.min((MAP_WIDTH - MAP_PADDING * 2) / width, (MAP_HEIGHT - MAP_PADDING * 2) / height);
      const offsetX = (MAP_WIDTH - width * scale) / 2 - bounds.minX * scale;
      const offsetY = (MAP_HEIGHT - height * scale) / 2 - bounds.minY * scale;
      const roadWidth = Math.max(7, Math.min(28, draft.road.width * scale));

      const pathForLayer = (layer: number): string => {
        let path = '';
        let drawing = false;
        compiled.points.forEach((point) => {
          if (point.renderLevel !== layer) {
            drawing = false;
            return;
          }
          const x = point.x * scale + offsetX;
          const y = point.y * scale + offsetY;
          path += `${drawing ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
          drawing = true;
        });
        return path;
      };

      for (let layer = 0; layer < availableLayers; layer += 1) {
        const color = LEVEL_COLORS[layer % LEVEL_COLORS.length];
        const chip = document.createElement('span');
        chip.style.setProperty('--level-color', color);
        chip.textContent = `Capa ${layer}`;
        chip.classList.toggle('muted', visibleLayer !== null && visibleLayer !== layer);
        levels.appendChild(chip);

        if (visibleLayer !== null && visibleLayer !== layer) continue;
        const d = pathForLayer(layer);
        if (!d) continue;

        const outline = svgElement('path');
        outline.setAttribute('d', d);
        outline.setAttribute('class', 'track-editor-map-outline');
        outline.setAttribute('stroke-width', String(roadWidth + 3));
        map.appendChild(outline);

        const track = svgElement('path');
        track.setAttribute('d', d);
        track.setAttribute('class', 'track-editor-map-track');
        track.setAttribute('stroke', color);
        track.setAttribute('stroke-width', String(roadWidth));
        track.setAttribute('opacity', visibleLayer === null ? '0.72' : '0.92');
        map.appendChild(track);
      }

      const start = compiled.points[0];
      if (start && (visibleLayer === null || start.renderLevel === visibleLayer)) {
        const marker = svgElement('circle');
        marker.setAttribute('cx', (start.x * scale + offsetX).toFixed(2));
        marker.setAttribute('cy', (start.y * scale + offsetY).toFixed(2));
        marker.setAttribute('r', '5');
        marker.setAttribute('class', 'track-editor-map-start');
        map.appendChild(marker);
      }

      layerButton.textContent = visibleLayer === null ? 'CAPAS: TODAS' : `CAPA: ${visibleLayer}`;
      mapInfo.textContent = `${Math.round(compiled.totalLength)} u · ${availableLayers} ${availableLayers === 1 ? 'capa' : 'capas'}`;
    } catch (error) {
      availableLayers = 1;
      visibleLayer = null;
      layerButton.textContent = 'CAPAS: TODAS';
      mapInfo.textContent = 'Vista no disponible';
      mapError.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  const createInsertMenu = (index: number): HTMLDivElement => {
    const menu = document.createElement('div');
    menu.className = 'track-editor-insert-menu';
    const label = document.createElement('span');
    label.textContent = 'Añadir debajo';
    menu.appendChild(label);
    SEGMENT_TYPES.forEach(({ type, label: typeLabel }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = typeLabel;
      button.addEventListener('click', () => {
        draft.segments.splice(index + 1, 0, createSegment(type));
        insertAfter = null;
        render();
      });
      menu.appendChild(button);
    });
    return menu;
  };

  const render = (): void => {
    nameInput.value = draft.name;
    idInput.value = draft.id;
    speedInput.value = String(draft.speedMultiplier ?? 1);
    slotCount.textContent = `${draft.segments.length} ${draft.segments.length === 1 ? 'slot' : 'slots'}`;
    list.replaceChildren();

    draft.segments.forEach((segment, index) => {
      const row = document.createElement('div');
      row.className = 'track-editor-row';

      const order = document.createElement('div');
      order.className = 'track-editor-order';
      order.textContent = String(index + 1).padStart(2, '0');
      row.appendChild(order);

      const type = document.createElement('select');
      type.setAttribute('aria-label', `Tipo del slot ${index + 1}`);
      SEGMENT_TYPES.forEach(({ type: value, label }) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
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
        const lengthLabel = document.createElement('label');
        lengthLabel.textContent = 'Largo';
        const length = document.createElement('input');
        length.type = 'number';
        length.min = '20';
        length.step = '10';
        length.value = String(segment.length);
        length.addEventListener('input', () => {
          if (segment.type === 'straight' || segment.type === 'curve') segment.length = Math.max(20, Number(length.value) || 20);
          renderMap();
        });
        lengthLabel.appendChild(length);
        fields.appendChild(lengthLabel);
      }
      if (segment.type === 'curve') {
        const angleLabel = document.createElement('label');
        angleLabel.textContent = 'Ángulo';
        const angle = document.createElement('input');
        angle.type = 'number';
        angle.step = '5';
        angle.value = String(segment.angle);
        angle.addEventListener('input', () => {
          segment.angle = Number(angle.value) || 0;
          renderMap();
        });
        angleLabel.appendChild(angle);
        fields.appendChild(angleLabel);
      }
      if (segment.type === 'up' || segment.type === 'down') {
        const fixed = document.createElement('span');
        fixed.className = 'track-editor-fixed';
        fixed.textContent = `${segmentLabel(segment)} · ${draft.levels.rampLength}`;
        fields.appendChild(fixed);
      }
      row.appendChild(fields);

      const controls = document.createElement('div');
      controls.className = 'track-editor-controls';
      const up = document.createElement('button');
      up.type = 'button';
      up.textContent = '↑';
      up.title = 'Mover arriba';
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        [draft.segments[index - 1], draft.segments[index]] = [draft.segments[index], draft.segments[index - 1]];
        render();
      });
      const down = document.createElement('button');
      down.type = 'button';
      down.textContent = '↓';
      down.title = 'Mover abajo';
      down.disabled = index === draft.segments.length - 1;
      down.addEventListener('click', () => {
        [draft.segments[index], draft.segments[index + 1]] = [draft.segments[index + 1], draft.segments[index]];
        render();
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+';
      add.title = 'Añadir slot debajo';
      add.className = 'add';
      add.setAttribute('aria-expanded', String(insertAfter === index));
      add.addEventListener('click', () => {
        insertAfter = insertAfter === index ? null : index;
        render();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Eliminar slot';
      remove.className = 'danger';
      remove.addEventListener('click', () => {
        draft.segments.splice(index, 1);
        insertAfter = null;
        render();
      });
      controls.append(up, down, add, remove);
      row.appendChild(controls);
      list.appendChild(row);

      if (insertAfter === index) list.appendChild(createInsertMenu(index));
    });

    if (draft.segments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'track-editor-empty';
      empty.textContent = 'El circuito no tiene slots';
      empty.appendChild(createInsertMenu(-1));
      list.appendChild(empty);
    }

    renderMap();
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

  const closeEditor = (): void => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  openButton.addEventListener('click', async () => {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    draft = clone(options.current);
    insertAfter = null;
    visibleLayer = null;
    render();
    await refreshStoredTracks();
    setStatus('Editando circuito actual');
  });

  closeButton.addEventListener('click', closeEditor);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeEditor();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) closeEditor();
  });

  nameInput.addEventListener('input', () => { draft.name = nameInput.value; });
  idInput.addEventListener('input', () => { draft.id = idInput.value; });
  speedInput.addEventListener('input', () => { draft.speedMultiplier = Math.max(0.1, Number(speedInput.value) || 1); });

  newButton.addEventListener('click', () => {
    draft = createNewTrack(options.current);
    insertAfter = null;
    visibleLayer = null;
    render();
    setStatus('Nuevo circuito sin guardar');
  });

  duplicateButton.addEventListener('click', () => {
    draft = duplicateTrack(draft);
    insertAfter = null;
    render();
    setStatus('Copia creada. Guarda para conservarla');
  });

  layerButton.addEventListener('click', () => {
    if (visibleLayer === null) visibleLayer = 0;
    else if (visibleLayer + 1 < availableLayers) visibleLayer += 1;
    else visibleLayer = null;
    renderMap();
  });

  saveButton.addEventListener('click', async () => {
    try {
      draft.name = nameInput.value.trim() || 'Circuito sin título';
      draft.id = idInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || `track-${Date.now()}`;
      draft.speedMultiplier = Math.max(0.1, Number(speedInput.value) || 1);
      compileTrack(draft, 8);
      await saveTrack(draft);
      setActiveTrackId(draft.id);
      setStatus('Guardado. Cargando circuito…');
      window.setTimeout(() => window.location.reload(), 120);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  });

  loadButton.addEventListener('click', () => {
    if (!loadSelect.value) return;
    setActiveTrackId(loadSelect.value);
    setStatus('Cargando circuito…');
    window.setTimeout(() => window.location.reload(), 80);
  });

  render();
}
