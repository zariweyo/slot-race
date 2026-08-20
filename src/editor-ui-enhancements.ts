function setupEditorUiEnhancements(): void {
  const trySetup = (): boolean => {
    const mapFrame = document.querySelector<HTMLDivElement>('.track-editor-map-frame');
    const slotToolbar = document.querySelector<HTMLDivElement>('.track-editor-slot-toolbar');
    const addPopup = document.querySelector<HTMLDivElement>('.track-editor-add-popup');
    const settingsButton = document.querySelector<HTMLButtonElement>('.track-editor-settings-button');
    const layerButton = document.querySelector<HTMLButtonElement>('#track-editor-layer');
    const closeButton = document.querySelector<HTMLButtonElement>('#track-editor-close');
    if (!mapFrame || !slotToolbar || !addPopup || !settingsButton || !layerButton || !closeButton) return false;
    if (mapFrame.querySelector('.track-editor-top-controls')) return true;

    const topControls = document.createElement('div');
    topControls.className = 'track-editor-top-controls';
    const rightControls = document.createElement('div');
    rightControls.className = 'track-editor-map-actions';

    settingsButton.title = 'Ajustes';
    layerButton.title = 'Cambiar capa';
    closeButton.title = 'Cerrar editor';
    rightControls.append(settingsButton, layerButton, closeButton);
    topControls.append(slotToolbar, rightControls);
    mapFrame.appendChild(topControls);

    const originalCurve = addPopup.querySelector<HTMLButtonElement>('button[data-type="curve"]');
    if (originalCurve) {
      const right = originalCurve;
      right.textContent = 'Curva der';
      right.dataset.turn = 'right';

      const left = right.cloneNode(true) as HTMLButtonElement;
      left.textContent = 'Curva izq';
      left.dataset.turn = 'left';
      right.after(left);

      left.addEventListener('click', () => {
        queueMicrotask(() => {
          const selectedRow = document.querySelector<HTMLDivElement>('#track-editor-list .track-editor-row.selected');
          const inputs = selectedRow?.querySelectorAll<HTMLInputElement>('input');
          const angleInput = inputs && inputs.length > 1 ? inputs[1] : null;
          if (!angleInput) return;
          angleInput.value = '-90';
          angleInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    }

    return true;
  };

  if (trySetup()) return;
  const observer = new MutationObserver(() => {
    if (trySetup()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

setupEditorUiEnhancements();
