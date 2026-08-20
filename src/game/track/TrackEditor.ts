import { compileTrack, type TrackDefinition, type TrackSegment } from './TrackCompiler';
import { listTracks, saveTrack, setActiveTrackId } from './TrackStorage';

type EditorOptions = { current: TrackDefinition };
type Point = { x: number; y: number };
type DragMode = 'length' | 'angle';
type DragState = {
  index: number;
  mode: DragMode;
  startPointer: Point;
  startLength: number;
  startAngle: number;
  tangent: Point;
  angleOrigin: Point;
  startPointerAngle: number;
  scale: number;
};
type GestureState = { startDistance: number; startCenter: Point; startZoom: number; startPan: Point };

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAP_WIDTH = 420;
const MAP_HEIGHT = 300;
const MAP_PADDING = 30;
const LEVEL_COLORS = ['#62efff', '#ff6bdc', '#ffd166', '#7cf29a', '#ff765f', '#b99cff'];
const AUTO_CLOSE_COLOR = '#ff9f43';
const SEGMENT_TYPES: Array<{ type: TrackSegment['type']; label: string }> = [
  { type: 'straight', label: 'Recta' },
  { type: 'curve', label: 'Curva' },
  { type: 'up', label: 'Sube' },
  { type: 'down', label: 'Baja' },
];
const clone = <T>(value: T): T => structuredClone(value);

function createSegment(type: TrackSegment['type']): TrackSegment {
  if (type === 'straight') return { type, length: 520 };
  if (type === 'curve') return { type, length: 360, angle: 90 };
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
  const panel = document.querySelector<HTMLElement>('.track-editor-panel');
  const header = document.querySelector<HTMLElement>('.track-editor-header');
  const closeButton = document.querySelector<HTMLButtonElement>('#track-editor-close');
  const sequence = document.querySelector<HTMLElement>('.track-editor-sequence');
  const preview = document.querySelector<HTMLElement>('.track-editor-preview');
  const workspace = document.querySelector<HTMLElement>('.track-editor-workspace');
  const meta = document.querySelector<HTMLElement>('.track-editor-meta');
  const fileActions = document.querySelector<HTMLElement>('.track-editor-file-actions');
  const footer = document.querySelector<HTMLElement>('.track-editor-footer');
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
  const mapFrame = document.querySelector<HTMLDivElement>('.track-editor-map-frame');
  const mapInfo = document.querySelector<HTMLSpanElement>('#track-editor-map-info');
  const mapError = document.querySelector<HTMLDivElement>('#track-editor-map-error');
  const layerButton = document.querySelector<HTMLButtonElement>('#track-editor-layer');
  const levels = document.querySelector<HTMLDivElement>('#track-editor-levels');

  if (!openButton || !modal || !panel || !header || !closeButton || !sequence || !preview || !workspace || !meta || !fileActions || !footer || !list || !newButton || !duplicateButton || !saveButton || !loadSelect || !loadButton || !nameInput || !idInput || !speedInput || !status || !slotCount || !map || !mapFrame || !mapInfo || !mapError || !layerButton || !levels) {
    console.warn('Track editor markup is incomplete');
    return;
  }

  const headerActions = document.createElement('div');
  headerActions.className = 'track-editor-header-actions';
  const tabs = document.createElement('div');
  tabs.className = 'track-editor-tabs';
  const mapTab = document.createElement('button');
  mapTab.type = 'button'; mapTab.textContent = 'MINIMAP'; mapTab.className = 'active';
  const listTab = document.createElement('button');
  listTab.type = 'button'; listTab.textContent = 'SLOTS';
  tabs.append(mapTab, listTab);
  const settingsButton = document.createElement('button');
  settingsButton.type = 'button'; settingsButton.className = 'track-editor-settings-button'; settingsButton.textContent = '⚙';
  headerActions.append(tabs, settingsButton, closeButton);
  header.appendChild(headerActions);

  const settingsPanel = document.createElement('div');
  settingsPanel.className = 'track-editor-settings-panel';
  const settingsTitle = document.createElement('div');
  settingsTitle.className = 'track-editor-settings-title';
  const settingsCaption = document.createElement('div');
  settingsCaption.innerHTML = '<strong>Ajustes del circuito</strong><span>nombre, guardar, duplicar y cargar</span>';
  const settingsClose = document.createElement('button');
  settingsClose.type = 'button'; settingsClose.textContent = '×';
  settingsTitle.append(settingsCaption, settingsClose);
  settingsPanel.append(settingsTitle, meta, fileActions, footer);
  panel.appendChild(settingsPanel);

  const slotToolbar = document.createElement('div');
  slotToolbar.className = 'track-editor-slot-toolbar'; slotToolbar.hidden = true;
  const slotTitle = document.createElement('span');
  const addSlotButton = document.createElement('button');
  addSlotButton.type = 'button'; addSlotButton.textContent = '+';
  const deleteSlotButton = document.createElement('button');
  deleteSlotButton.type = 'button'; deleteSlotButton.textContent = '×'; deleteSlotButton.className = 'danger';
  slotToolbar.append(slotTitle, addSlotButton, deleteSlotButton);
  mapFrame.appendChild(slotToolbar);

  const addPopup = document.createElement('div');
  addPopup.className = 'track-editor-add-popup'; addPopup.hidden = true;
  const addPopupTitle = document.createElement('strong');
  addPopupTitle.textContent = 'Añadir después'; addPopup.appendChild(addPopupTitle);
  SEGMENT_TYPES.forEach(({ type, label }) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.dataset.type = type; addPopup.appendChild(button);
  });
  mapFrame.appendChild(addPopup);

  let draft = clone(options.current);
  let selectedSegment: number | null = null;
  let visibleLayer: number | null = null;
  let availableLayers = 1;
  let activeTab: 'map' | 'list' = 'map';
  let dragState: DragState | null = null;
  let zoom = 1;
  let pan: Point = { x: 0, y: 0 };
  let gestureState: GestureState | null = null;
  let contentGroup: SVGGElement | null = null;
  let lightRenderTimer: number | null = null;
  const pointers = new Map<number, Point>();

  const setStatus = (message: string, error = false): void => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };
  const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] => document.createElementNS(SVG_NS, tag);
  const pointerPosition = (event: PointerEvent): Point => {
    const rect = map.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * MAP_WIDTH, y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * MAP_HEIGHT };
  };
  const transformValue = (): string => `translate(${pan.x.toFixed(2)} ${pan.y.toFixed(2)}) translate(${MAP_WIDTH / 2} ${MAP_HEIGHT / 2}) scale(${zoom.toFixed(3)}) translate(${-MAP_WIDTH / 2} ${-MAP_HEIGHT / 2})`;
  const applyViewportTransform = (): void => {
    contentGroup?.setAttribute('transform', transformValue());
    mapInfo.textContent = mapInfo.textContent?.replace(/zoom [\d.]+×/, `zoom ${zoom.toFixed(1)}×`) ?? '';
  };

  const setTab = (tab: 'map' | 'list'): void => {
    activeTab = tab;
    mapTab.classList.toggle('active', tab === 'map');
    listTab.classList.toggle('active', tab === 'list');
    preview.classList.toggle('tab-hidden', tab !== 'map');
    sequence.classList.toggle('tab-hidden', tab !== 'list');
    workspace.classList.toggle('map-mode', tab === 'map');
    workspace.classList.toggle('list-mode', tab === 'list');
  };

  const updateSlotToolbar = (): void => {
    const segment = selectedSegment === null ? null : draft.segments[selectedSegment];
    slotToolbar.hidden = !segment || activeTab !== 'map';
    if (!segment || selectedSegment === null) return;
    const details = segment.type === 'curve' ? ` · ${segment.length}u · ${segment.angle}°` : segment.type === 'straight' ? ` · ${segment.length}u` : '';
    slotTitle.textContent = `SLOT ${selectedSegment + 1} · ${segment.type.toUpperCase()}${details}`;
  };

  const renderMap = (light = false): void => {
    map.replaceChildren(); levels.replaceChildren(); mapError.textContent = ''; contentGroup = null;
    try {
      // While dragging, use a much coarser sampling step. Crossing detection remains available,
      // but the point count is drastically smaller, reducing the O(n²) crossing scan.
      const compiled = compileTrack(draft, light ? 28 : 8, false);
      availableLayers = Math.max(1, compiled.maxLevel + 1);
      if (visibleLayer !== null && visibleLayer >= availableLayers) visibleLayer = null;
      if (compiled.points.length === 0) { mapInfo.textContent = 'Sin geometría'; mapError.textContent = 'Añade un slot para comenzar'; return; }

      const bounds = compiled.points.reduce((acc, point) => ({ minX: Math.min(acc.minX, point.x), maxX: Math.max(acc.maxX, point.x), minY: Math.min(acc.minY, point.y), maxY: Math.max(acc.maxY, point.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const height = Math.max(1, bounds.maxY - bounds.minY);
      const baseScale = Math.min((MAP_WIDTH - MAP_PADDING * 2) / width, (MAP_HEIGHT - MAP_PADDING * 2) / height);
      const offsetX = (MAP_WIDTH - width * baseScale) / 2 - bounds.minX * baseScale;
      const offsetY = (MAP_HEIGHT - height * baseScale) / 2 - bounds.minY * baseScale;
      const roadWidth = Math.max(7, Math.min(24, draft.road.width * baseScale));
      const autoCloseSegmentIndex = draft.segments.length;

      const content = svgElement('g'); content.setAttribute('transform', transformValue()); map.appendChild(content); contentGroup = content;
      const mapPoint = (point: { x: number; y: number }): Point => ({ x: point.x * baseScale + offsetX, y: point.y * baseScale + offsetY });
      const pointsBySegment = new Map<number, typeof compiled.points>();
      compiled.points.forEach((point) => {
        const bucket = pointsBySegment.get(point.segmentIndex);
        if (bucket) bucket.push(point); else pointsBySegment.set(point.segmentIndex, [point]);
      });
      const pathFromPoints = (points: Array<{ x: number; y: number }>): string => points.map((point, index) => { const p = mapPoint(point); return `${index === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ');
      const pathForLayer = (layer: number, autoClose: boolean): string => {
        let path = ''; let drawing = false;
        compiled.points.forEach((point) => {
          const isAutoClose = point.segmentIndex === autoCloseSegmentIndex;
          if (point.renderLevel !== layer || isAutoClose !== autoClose) { drawing = false; return; }
          const p = mapPoint(point); path += `${drawing ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)} `; drawing = true;
        });
        return path;
      };

      for (let layer = 0; layer < availableLayers; layer += 1) {
        const color = LEVEL_COLORS[layer % LEVEL_COLORS.length];
        const chip = document.createElement('span'); chip.style.setProperty('--level-color', color); chip.textContent = `Capa ${layer}`; chip.classList.toggle('muted', visibleLayer !== null && visibleLayer !== layer); levels.appendChild(chip);
        if (visibleLayer !== null && visibleLayer !== layer) continue;
        const d = pathForLayer(layer, false);
        if (d) {
          const outline = svgElement('path'); outline.setAttribute('d', d); outline.setAttribute('class', 'track-editor-map-outline'); outline.setAttribute('stroke-width', String(roadWidth + 3)); content.appendChild(outline);
          const track = svgElement('path'); track.setAttribute('d', d); track.setAttribute('class', 'track-editor-map-track'); track.setAttribute('stroke', color); track.setAttribute('stroke-width', String(roadWidth)); track.setAttribute('opacity', visibleLayer === null ? '0.72' : '0.94'); content.appendChild(track);
        }
        const closePath = pathForLayer(layer, true);
        if (closePath) {
          const closure = svgElement('path'); closure.setAttribute('d', closePath); closure.setAttribute('fill', 'none'); closure.setAttribute('stroke', AUTO_CLOSE_COLOR); closure.setAttribute('stroke-width', String(Math.max(5, roadWidth * 0.55))); closure.setAttribute('stroke-dasharray', '10 8'); closure.setAttribute('stroke-linecap', 'round'); content.appendChild(closure);
        }
      }

      draft.segments.forEach((_segment, index) => {
        const segmentPoints = pointsBySegment.get(index) ?? [];
        if (segmentPoints.length < 2) return;
        const layer = segmentPoints[Math.floor(segmentPoints.length / 2)]?.renderLevel ?? 0;
        if (visibleLayer !== null && layer !== visibleLayer) return;
        const d = pathFromPoints(segmentPoints);
        if (selectedSegment === index) {
          const selected = svgElement('path'); selected.setAttribute('d', d); selected.setAttribute('fill', 'none'); selected.setAttribute('stroke', '#fff'); selected.setAttribute('stroke-width', String(Math.max(4, roadWidth * 0.32))); selected.setAttribute('stroke-linecap', 'round'); selected.style.filter = 'drop-shadow(0 0 6px rgba(255,255,255,.9))'; content.appendChild(selected);
        }
        const hit = svgElement('path'); hit.setAttribute('d', d); hit.setAttribute('fill', 'none'); hit.setAttribute('stroke', '#fff'); hit.setAttribute('stroke-width', String(Math.max(34 / zoom, roadWidth + 28 / zoom))); hit.setAttribute('stroke-opacity', '0'); hit.setAttribute('pointer-events', 'stroke');
        hit.addEventListener('pointerdown', (event) => { event.stopPropagation(); selectedSegment = index; render(); });
        content.appendChild(hit);
      });

      if (selectedSegment !== null) {
        const segment = draft.segments[selectedSegment];
        const segmentPoints = pointsBySegment.get(selectedSegment) ?? [];
        if (segment && segmentPoints.length >= 2 && (segment.type === 'straight' || segment.type === 'curve')) {
          const first = mapPoint(segmentPoints[0]);
          const last = mapPoint(segmentPoints[segmentPoints.length - 1]);
          const previous = mapPoint(segmentPoints[Math.max(0, segmentPoints.length - 3)]);
          const tangentMag = Math.hypot(last.x - previous.x, last.y - previous.y) || 1;
          const tangent = { x: (last.x - previous.x) / tangentMag, y: (last.y - previous.y) / tangentMag };
          const createHandle = (position: Point, color: string, mode: DragMode, radius = 10): void => {
            const handle = svgElement('circle'); handle.setAttribute('cx', position.x.toFixed(2)); handle.setAttribute('cy', position.y.toFixed(2)); handle.setAttribute('r', String(radius / zoom)); handle.setAttribute('class', 'track-editor-map-handle'); handle.setAttribute('fill', color); handle.setAttribute('stroke-width', String(3 / zoom));
            handle.addEventListener('pointerdown', (event) => {
              event.stopPropagation();
              const pointer = pointerPosition(event);
              dragState = { index: selectedSegment!, mode, startPointer: pointer, startLength: segment.length, startAngle: segment.type === 'curve' ? segment.angle : 0, tangent, angleOrigin: first, startPointerAngle: Math.atan2(pointer.y - first.y, pointer.x - first.x), scale: baseScale * zoom };
              map.setPointerCapture(event.pointerId);
            });
            content.appendChild(handle);
          };
          createHandle(last, '#7cf29a', 'length', 11);
          if (segment.type === 'curve') {
            const mid = mapPoint(segmentPoints[Math.floor(segmentPoints.length / 2)]);
            const radialX = mid.x - first.x; const radialY = mid.y - first.y; const radialMag = Math.hypot(radialX, radialY) || 1;
            createHandle({ x: mid.x + (radialX / radialMag) * (28 / zoom), y: mid.y + (radialY / radialMag) * (28 / zoom) }, '#ffd166', 'angle', 10);
          }
        }
      }

      const start = compiled.points[0];
      if (start && (visibleLayer === null || start.renderLevel === visibleLayer)) {
        const marker = svgElement('circle'); const p = mapPoint(start); marker.setAttribute('cx', p.x.toFixed(2)); marker.setAttribute('cy', p.y.toFixed(2)); marker.setAttribute('r', String(5 / zoom)); marker.setAttribute('class', 'track-editor-map-start'); content.appendChild(marker);
      }
      layerButton.textContent = visibleLayer === null ? 'CAPAS: TODAS' : `CAPA: ${visibleLayer}`;
      const state = compiled.validation.playable ? 'JUGABLE' : 'NO JUGABLE';
      mapInfo.textContent = `${Math.round(compiled.totalLength)} u · ${state} · zoom ${zoom.toFixed(1)}×${light ? ' · preview' : ''}`;
      if (compiled.validation.reason) mapError.textContent = compiled.validation.reason; else if (compiled.validation.hasAutoClose) mapError.textContent = 'Cierre automático en naranja';
      updateSlotToolbar();
    } catch (error) {
      mapInfo.textContent = 'Geometría inválida'; mapError.textContent = error instanceof Error ? error.message : String(error);
    }
  };

  const scheduleLightRender = (): void => {
    if (lightRenderTimer !== null) return;
    lightRenderTimer = window.setTimeout(() => { lightRenderTimer = null; renderMap(true); }, 50);
  };

  const renderList = (): void => {
    list.replaceChildren(); slotCount.textContent = `${draft.segments.length} ${draft.segments.length === 1 ? 'slot' : 'slots'}`;
    draft.segments.forEach((segment, index) => {
      const row = document.createElement('div'); row.className = 'track-editor-row'; row.classList.toggle('selected', selectedSegment === index);
      row.addEventListener('click', (event) => { if ((event.target as HTMLElement).closest('input,select,button')) return; selectedSegment = index; render(); });
      const order = document.createElement('div'); order.className = 'track-editor-order'; order.textContent = String(index + 1).padStart(2, '0'); row.appendChild(order);
      const type = document.createElement('select');
      SEGMENT_TYPES.forEach(({ type: value, label }) => { const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = segment.type === value; type.appendChild(option); });
      type.addEventListener('change', () => { draft.segments[index] = createSegment(type.value as TrackSegment['type']); selectedSegment = index; render(); }); row.appendChild(type);
      const fields = document.createElement('div'); fields.className = 'track-editor-fields';
      if (segment.type === 'straight' || segment.type === 'curve') {
        const label = document.createElement('label'); label.textContent = 'Largo'; const input = document.createElement('input'); input.type = 'number'; input.min = '20'; input.step = '10'; input.value = String(segment.length); input.addEventListener('input', () => { segment.length = Math.max(20, Number(input.value) || 20); scheduleLightRender(); }); label.appendChild(input); fields.appendChild(label);
      }
      if (segment.type === 'curve') {
        const label = document.createElement('label'); label.textContent = 'Ángulo'; const input = document.createElement('input'); input.type = 'number'; input.step = '5'; input.value = String(segment.angle); input.addEventListener('input', () => { segment.angle = Number(input.value) || 5; scheduleLightRender(); }); label.appendChild(input); fields.appendChild(label);
      }
      if (segment.type === 'up' || segment.type === 'down') fields.textContent = `Rampa fija · ${draft.levels.rampLength}`;
      row.appendChild(fields);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.className = 'danger'; remove.addEventListener('click', () => { draft.segments.splice(index, 1); selectedSegment = null; render(); }); row.appendChild(remove);
      list.appendChild(row);
    });
  };

  const render = (): void => {
    nameInput.value = draft.name; idInput.value = draft.id; speedInput.value = String(draft.speedMultiplier ?? 1);
    renderList(); renderMap(false); setTab(activeTab); updateSlotToolbar();
  };
  const refreshStoredTracks = async (): Promise<void> => {
    const tracks = await listTracks(); loadSelect.replaceChildren();
    tracks.forEach((track) => { const option = document.createElement('option'); option.value = track.id; option.textContent = `${track.name} (${track.id})`; option.selected = track.id === draft.id; loadSelect.appendChild(option); });
  };
  const closeSettings = (): void => settingsPanel.classList.remove('open');
  const closeEditor = (): void => { closeSettings(); modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); };

  mapTab.addEventListener('click', () => { setTab('map'); updateSlotToolbar(); });
  listTab.addEventListener('click', () => { setTab('list'); updateSlotToolbar(); });
  settingsButton.addEventListener('click', async () => { settingsPanel.classList.toggle('open'); await refreshStoredTracks(); });
  settingsClose.addEventListener('click', closeSettings);
  openButton.addEventListener('click', async () => { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); draft = clone(options.current); selectedSegment = null; visibleLayer = null; zoom = 1; pan = { x: 0, y: 0 }; activeTab = 'map'; render(); await refreshStoredTracks(); setStatus('Editando circuito actual'); });
  closeButton.addEventListener('click', closeEditor);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeEditor(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('open')) { if (settingsPanel.classList.contains('open')) closeSettings(); else closeEditor(); } });

  nameInput.addEventListener('input', () => { draft.name = nameInput.value; });
  idInput.addEventListener('input', () => { draft.id = idInput.value; });
  speedInput.addEventListener('input', () => { draft.speedMultiplier = Math.max(0.1, Number(speedInput.value) || 1); });
  newButton.addEventListener('click', () => { draft = createNewTrack(options.current); selectedSegment = 0; zoom = 1; pan = { x: 0, y: 0 }; closeSettings(); render(); setStatus('Nuevo circuito sin guardar'); });
  duplicateButton.addEventListener('click', () => { draft = duplicateTrack(draft); closeSettings(); render(); setStatus('Copia creada. Guarda para conservarla'); });
  layerButton.addEventListener('click', () => { if (visibleLayer === null) visibleLayer = 0; else if (visibleLayer + 1 < availableLayers) visibleLayer += 1; else visibleLayer = null; renderMap(false); });
  saveButton.addEventListener('click', async () => {
    try {
      draft.name = nameInput.value.trim() || 'Circuito sin título'; draft.id = idInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || `track-${Date.now()}`; draft.speedMultiplier = Math.max(0.1, Number(speedInput.value) || 1);
      compileTrack(draft, 8, true); await saveTrack(draft); setActiveTrackId(draft.id); setStatus('Guardado. Cargando circuito…'); window.setTimeout(() => window.location.reload(), 120);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error), true); }
  });
  loadButton.addEventListener('click', () => { if (!loadSelect.value) return; setActiveTrackId(loadSelect.value); setStatus('Cargando circuito…'); window.setTimeout(() => window.location.reload(), 80); });

  addSlotButton.addEventListener('click', () => { if (selectedSegment !== null) addPopup.hidden = !addPopup.hidden; });
  deleteSlotButton.addEventListener('click', () => { if (selectedSegment === null) return; draft.segments.splice(selectedSegment, 1); selectedSegment = draft.segments.length === 0 ? null : Math.min(selectedSegment, draft.segments.length - 1); render(); });
  addPopup.addEventListener('click', (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-type]'); if (!button || selectedSegment === null) return; draft.segments.splice(selectedSegment + 1, 0, createSegment(button.dataset.type as TrackSegment['type'])); selectedSegment += 1; addPopup.hidden = true; render(); });

  map.addEventListener('pointerdown', (event) => {
    const p = pointerPosition(event); pointers.set(event.pointerId, p); map.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      dragState = null;
      const values = [...pointers.values()];
      const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      gestureState = { startDistance: Math.max(1, distance), startCenter: { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 }, startZoom: zoom, startPan: { ...pan } };
    }
  });

  map.addEventListener('pointermove', (event) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, pointerPosition(event));
    if (pointers.size >= 2 && gestureState) {
      const values = [...pointers.values()].slice(0, 2);
      const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y);
      const center = { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
      zoom = Math.max(1, Math.min(5, gestureState.startZoom * distance / gestureState.startDistance));
      pan = { x: gestureState.startPan.x + center.x - gestureState.startCenter.x, y: gestureState.startPan.y + center.y - gestureState.startCenter.y };
      // Crucial optimization: pinch/pan only changes the existing SVG group transform.
      // No track compilation, no node recreation and no new listeners here.
      applyViewportTransform();
      return;
    }
    if (!dragState || pointers.size > 1) return;
    const segment = draft.segments[dragState.index];
    if (!segment || (segment.type !== 'straight' && segment.type !== 'curve')) return;
    const pos = pointerPosition(event);
    if (dragState.mode === 'length') {
      const dx = pos.x - dragState.startPointer.x; const dy = pos.y - dragState.startPointer.y;
      const projected = dx * dragState.tangent.x + dy * dragState.tangent.y;
      segment.length = Math.max(20, Math.round((dragState.startLength + projected / Math.max(0.001, dragState.scale)) / 10) * 10);
    } else if (segment.type === 'curve') {
      const current = Math.atan2(pos.y - dragState.angleOrigin.y, pos.x - dragState.angleOrigin.x);
      let delta = (current - dragState.startPointerAngle) * 180 / Math.PI; if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
      let angle = Math.max(-340, Math.min(340, dragState.startAngle + delta)); if (Math.abs(angle) < 5) angle = angle < 0 ? -5 : 5; segment.angle = Math.round(angle);
    }
    scheduleLightRender();
  });

  const endPointer = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2 && gestureState) {
      gestureState = null;
      // Rebuild once after the gesture so hit areas/handles match the final zoom.
      renderMap(false);
    }
    if (dragState && pointers.size === 0) {
      dragState = null;
      if (lightRenderTimer !== null) { window.clearTimeout(lightRenderTimer); lightRenderTimer = null; }
      render();
    }
  };
  map.addEventListener('pointerup', endPointer);
  map.addEventListener('pointercancel', endPointer);

  render();
}
