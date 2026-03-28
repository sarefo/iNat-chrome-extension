// Shift-mode overlay: shown when shift+clicking an observation in bulk mode.
// Annotates the individual observation without deselecting it or opening a new tab.

const SHIFT_OVERLAY_OPTIONS = [
  { key: 'sex-female',       label: '♀ Female',        color: '#AD1457', textColor: '#fff' },
  { key: 'mating',           label: '❤️ Mating',       color: '#6A1B9A', textColor: '#fff' },
  { key: 'sex-male',         label: '♂ Male',          color: '#1565C0', textColor: '#fff' },
  { key: 'eop-egg',          label: '🥚 Egg',           color: '#F57F17', textColor: '#fff' },
  { key: 'eop-molt',         label: '🪲 Molt',          color: '#6D4C41', textColor: '#fff' },
  { key: 'life-pupa',        label: '🐛 Pupa',          color: '#558B2F', textColor: '#fff' },
  { key: 'eop-construction', label: '🏗 Constr.',       color: '#4E342E', textColor: '#fff' },
  { key: 'eop-gall',         label: '🌿 Gall',          color: '#2E7D32', textColor: '#fff' },
  { key: 'eop-track',        label: '👣 Track',         color: '#37474F', textColor: '#fff' },
];

let activeShiftOverlay = null;
let shiftOutsideClickHandler = null;
let shiftEscHandler = null;

function removeShiftOverlay() {
  if (activeShiftOverlay) {
    activeShiftOverlay.remove();
    activeShiftOverlay = null;
  }
  if (shiftOutsideClickHandler) {
    document.removeEventListener('click', shiftOutsideClickHandler, true);
    shiftOutsideClickHandler = null;
  }
  if (shiftEscHandler) {
    document.removeEventListener('keydown', shiftEscHandler);
    shiftEscHandler = null;
  }
}

function showShiftOverlay(observationId, observationDiv) {
  removeShiftOverlay();

  const overlay = document.createElement('div');
  overlay.id = 'innat-shift-overlay';

  // Position: try to the right of the observation, clamped to viewport
  const rect = observationDiv.getBoundingClientRect();
  let top = rect.top + rect.height / 2 - 100;
  let left = rect.right + 8;

  // Clamp to viewport
  const overlayWidth = 198;
  const overlayHeight = 220;
  if (left + overlayWidth > window.innerWidth) left = rect.left - overlayWidth - 8;
  if (top < 8) top = 8;
  if (top + overlayHeight > window.innerHeight) top = window.innerHeight - overlayHeight - 8;

  overlay.style.cssText = `
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    z-index: 10001;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    padding: 8px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    width: ${overlayWidth}px;
    font-family: Arial, sans-serif;
  `;

  const title = document.createElement('div');
  title.textContent = `obs #${observationId}`;
  title.style.cssText = `
    font-size: 10px;
    color: #888;
    text-align: center;
    padding-bottom: 5px;
    border-bottom: 1px solid #eee;
    margin-bottom: 2px;
    grid-column: 1 / -1;
  `;
  overlay.appendChild(title);

  SHIFT_OVERLAY_OPTIONS.forEach(({ key, label, color, textColor }) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      background: ${color};
      color: ${textColor};
      border: none;
      padding: 6px 4px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 11px;
      font-weight: bold;
      text-align: center;
      width: 100%;
    `;
    btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.15)'; });
    btn.addEventListener('mouseleave', () => { btn.style.filter = ''; });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeShiftOverlay();
      applyShiftAnnotation(observationId, observationDiv, key, label);
    });
    overlay.appendChild(btn);
  });

  document.body.appendChild(overlay);
  activeShiftOverlay = overlay;

  // Attach close-on-outside-click and ESC after a brief delay to avoid
  // the triggering shift+click immediately dismissing the overlay
  setTimeout(() => {
    shiftOutsideClickHandler = (e) => {
      if (!overlay.contains(e.target)) removeShiftOverlay();
    };
    shiftEscHandler = (e) => {
      if (e.key === 'Escape') removeShiftOverlay();
    };
    document.addEventListener('click', shiftOutsideClickHandler, true);
    document.addEventListener('keydown', shiftEscHandler);
  }, 50);
}

function applyShiftAnnotation(observationId, observationDiv, key, label) {
  // Brief purple pulse to indicate shift action in progress
  const originalOutline = observationDiv.style.outline;
  observationDiv.style.outline = '3px solid #6A1B9A';

  if (key === 'mating') {
    // Observation field (not a controlled annotation)
    const jwt = document.querySelector('meta[name="inaturalist-api-token"]')?.content;
    chrome.runtime.sendMessage({
      action: 'postObservationField',
      obsId: observationId,
      fieldId: 6637,
      value: 'yes',
      jwt: jwt || null
    }, response => {
      if (response?.success) {
        showShiftToast(`${label} ✓`);
        observationDiv.style.outline = '3px solid #6A1B9A';
      } else {
        showShiftToast(`Failed: ${response?.error || 'unknown error'}`, true);
        observationDiv.style.outline = '3px solid #f44336';
      }
      setTimeout(() => { observationDiv.style.outline = originalOutline; }, 2500);
    });
  } else {
    // Standard controlled annotation
    chrome.runtime.sendMessage({
      action: 'quickAnnotateObs',
      obsId: observationId,
      mode: key
    }, response => {
      if (response?.success) {
        showShiftToast(`${label} ✓`);
        observationDiv.style.outline = '3px solid #4CAF50';
      } else {
        showShiftToast(`Failed: ${response?.error || 'unknown error'}`, true);
        observationDiv.style.outline = '3px solid #f44336';
      }
      setTimeout(() => { observationDiv.style.outline = originalOutline; }, 2500);
    });
  }
}

function showShiftToast(message, isError = false) {
  const existing = document.getElementById('innat-shift-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'innat-shift-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 60px;
    right: 16px;
    z-index: 999999;
    background: ${isError ? '#c62828' : '#4527A0'};
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    padding: 9px 14px;
    pointer-events: none;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}
