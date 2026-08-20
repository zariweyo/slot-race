function setupEditorUiEnhancements(): void {
  const injectStyles = (): void => {
    if (document.querySelector('#track-editor-landscape-overrides')) return;
    const style = document.createElement('style');
    style.id = 'track-editor-landscape-overrides';
    style.textContent = `
      .track-editor-top-controls {
        position: absolute;
        z-index: 20;
        top: 8px;
        left: 8px;
        right: 8px;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        pointer-events: none;
      }
      .track-editor-top-controls > * { pointer-events: auto; }
      .track-editor-top-controls .track-editor-slot-toolbar {
        position: static;
        max-width: min(58vw, 420px);
        margin: 0;
      }
      .track-editor-map-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px;
        border: 1px solid rgba(101,245,255,.32);
        border-radius: 8px;
        background: rgba(3,11,21,.9);
        backdrop-filter: blur(8px);
        box-shadow: 0 8px 24px rgba(0,0,0,.28);
      }
      .track-editor-map-actions button {
        min-width: 34px;
        min-height: 32px;
        padding: 0 8px;
        font-size: 11px;
      }
      .track-editor-map-actions .track-editor-settings-button,
      .track-editor-map-actions .track-editor-close {
        width: 34px;
        padding: 0;
        font-size: 16px !important;
      }
      .track-editor-add-popup { top: 56px !important; }
      @media (orientation: landscape) and (max-height: 520px) {
        .track-editor-header { min-height: 38px; padding: 4px 8px; }
        .track-editor-header > div:first-child { display: none; }
        .track-editor-header-actions { width: 100%; }
        .track-editor-map-frame { margin-top: 0; }
        .track-editor-top-controls { top: 5px; left: 5px; right: 5px; }
        .track-editor-top-controls .track-editor-slot-toolbar { max-width: 54vw; padding: 4px 5px; }
        .track-editor-top-controls .track-editor-slot-toolbar span { max-width: 160px; }
        .track-editor-map-actions { gap: 4px; padding: 4px; }
        .track-editor-map-actions button { min-height: 30px; }
        .track-editor-preview .track-editor-section-head { min-height: 30px; padding: 3px 8px; }
        .track-editor-add-popup { top: 48px !important; }
      }
    `;
    document.head.appendChild(style);
  };

  const setCurveAngleAfterInsert = (angle: number): void => {
    queueMicrotask(() => {
      const selectedRow = document.querySelector<HTMLDivElement>('#track-editor-list .track-editor-row.selected');
      const inputs = selectedRow?.querySelectorAll<HTMLInputElement>('input');
      const angleInput = inputs && inputs.length > 1 ? inputs[1] : null;
      if (!angleInput) return;
      angleInput.value = String(angle);
      angleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const trySetup = (): boolean => {
    const mapFrame = document.querySelector<HTMLDivElement>('.track-editor-map-frame');
    const slotToolbar = document.querySelector<HTMLDivElement>('.track-editor-slot-toolbar');
    const addPopup = document.querySelector<HTMLDivElement>('.track-editor-add-popup');
    const settingsButton = document.querySelector<HTMLButtonElement>('.track-editor-settings-button');
    const layerButton = document.querySelector<HTMLButtonElement>('#track-editor-layer');
    const closeButton = document.querySelector<HTMLButtonElement>('#track-editor-close');
    if (!mapFrame || !slotToolbar || !addPopup || !settingsButton || !layerButton || !closeButton) return false;
    if (mapFrame.querySelector('.track-editor-top-controls')) return true;

    injectStyles();

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
      const left = originalCurve;
      left.textContent = 'Curva izq';
      left.dataset.turn = 'left';

      const right = left.cloneNode(true) as HTMLButtonElement;
      right.textContent = 'Curva der';
      right.dataset.turn = 'right';
      left.after(right);

      right.addEventListener('click', () => setCurveAngleAfterInsert(-90));
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
