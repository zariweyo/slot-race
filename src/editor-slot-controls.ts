const editorList = document.querySelector<HTMLElement>('#track-editor-list');
const mapFrame = document.querySelector<HTMLElement>('.track-editor-map-frame');

if (editorList && mapFrame) {
  const controls = document.createElement('div');
  controls.className = 'track-editor-parameter-controls';
  controls.hidden = true;
  mapFrame.appendChild(controls);

  const findSelectedRow = (): HTMLElement | null => editorList.querySelector<HTMLElement>('.track-editor-row.selected');

  const buildSlider = (
    labelText: string,
    sourceInput: HTMLInputElement,
    min: number,
    max: number,
    step: number,
    suffix: string,
  ): HTMLElement => {
    const row = document.createElement('label');
    row.className = 'track-editor-parameter-row';

    const head = document.createElement('span');
    head.className = 'track-editor-parameter-head';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = `${sourceInput.value}${suffix}`;
    head.append(label, value);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = sourceInput.value;
    slider.className = 'track-editor-parameter-slider';

    // Visual feedback is local and cheap. The actual track is rebuilt only once,
    // when the user releases the slider and the native change event fires.
    slider.addEventListener('input', () => {
      value.textContent = `${slider.value}${suffix}`;
    });

    slider.addEventListener('change', () => {
      sourceInput.value = slider.value;
      sourceInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    row.append(head, slider);
    return row;
  };

  const sync = (): void => {
    const selected = findSelectedRow();
    controls.replaceChildren();
    controls.hidden = true;
    if (!selected) return;

    const typeSelect = selected.querySelector<HTMLSelectElement>('select');
    if (!typeSelect) return;
    const type = typeSelect.value;
    if (type === 'up' || type === 'down') return;

    const inputs = [...selected.querySelectorAll<HTMLInputElement>('.track-editor-fields input[type="number"]')];
    if (inputs.length === 0) return;

    const title = document.createElement('div');
    title.className = 'track-editor-parameter-title';
    title.textContent = 'AJUSTAR SLOT';
    controls.appendChild(title);

    const lengthInput = inputs[0];
    const currentLength = Math.max(20, Number(lengthInput.value) || 20);
    const lengthMax = Math.max(2000, Math.ceil(currentLength / 500) * 500);
    controls.appendChild(buildSlider('Longitud', lengthInput, 20, lengthMax, 10, ' u'));

    if (type === 'curve' && inputs[1]) {
      const angleInput = inputs[1];
      const angle = Math.max(-180, Math.min(180, Number(angleInput.value) || 0));
      angleInput.value = String(angle);
      controls.appendChild(buildSlider('Ángulo', angleInput, -180, 180, 1, '°'));
    }

    controls.hidden = false;
  };

  const observer = new MutationObserver(() => queueMicrotask(sync));
  observer.observe(editorList, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  editorList.addEventListener('change', () => queueMicrotask(sync));
  document.querySelector('#track-editor-open')?.addEventListener('click', () => queueMicrotask(sync));

  sync();
}
