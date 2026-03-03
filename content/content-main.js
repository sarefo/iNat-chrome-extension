function showAnnotatedToast() {
  const existing = document.getElementById('innat-annotated-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'innat-annotated-toast';
  toast.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 999999;
    background: #2e7d32; color: #fff; font-size: 14px; font-weight: 600;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; cursor: default;
    animation: innat-fadein 0.2s ease;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes innat-fadein { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes innat-fadeout { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.head.appendChild(style);

  const label = document.createElement('span');
  label.textContent = 'Annotated!';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload?';
  reloadBtn.style.cssText = `
    background: rgba(255,255,255,0.25); border: 1px solid rgba(255,255,255,0.5);
    color: #fff; border-radius: 4px; padding: 2px 8px;
    font-size: 13px; font-weight: 600; cursor: pointer;
  `;
  reloadBtn.addEventListener('click', () => location.reload());

  toast.appendChild(label);
  toast.appendChild(reloadBtn);
  document.body.appendChild(toast);

  const dismiss = () => {
    toast.style.animation = 'innat-fadeout 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  };

  toast.addEventListener('click', e => { if (e.target !== reloadBtn) dismiss(); });
}

// Single message listener for all content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request.action);

  // Provide JWT from page meta tag (used by background api-annotator.js)
  if (request.action === 'getJwt') {
    const jwt = document.querySelector('meta[name="inaturalist-api-token"]')?.content;
    sendResponse({ jwt: jwt || null });
    return true;
  }

  if (request.action === 'bulkProcessingProgress') {
    handleBulkProgressUpdate(request); // from bulk-ui.js
    sendResponse({ received: true });
    return true;
  }

  if (request.action === 'getBulkModeStatus') {
    sendResponse({
      active: bulkSelectionMode,
      annotationType: bulkAnnotationMode,
      selectedCount: selectedObservations.size
    });
    return true;
  }

  if (request.action === 'toggleBulkMode') {
    console.log('toggleBulkMode action received');
    if (!isObservationsListPage()) {
      sendResponse({ success: false, message: 'Not on a supported observations page' });
      return true;
    }

    if (bulkModeButtons) {
      exitBulkMode();
      sendResponse({ success: true, message: 'Bulk mode disabled' });
    } else {
      console.log('Creating bulk mode UI from toggleBulkMode');
      createBulkModeUI();
      setupObservationClickHandlers();
      sendResponse({ success: true, message: 'Bulk mode enabled - click observations to select them' });
    }
    return true;
  }

  if (request.action === 'setBulkAnnotationType') {
    console.log('setBulkAnnotationType action received with mode:', request.mode);
    if (!isObservationsListPage()) {
      sendResponse({ success: false, message: 'Not on a supported observations page' });
      return true;
    }

    bulkAnnotationMode = request.mode;

    if (!bulkModeButtons) {
      console.log('Creating bulk mode UI from setBulkAnnotationType');
      createBulkModeUI();
      setupObservationClickHandlers();
    }

    bulkSelectionMode = true;
    updateSelectionUI();

    sendResponse({ success: true, message: `Annotation type set to ${getAnnotationDisplayName(request.mode)}` });
    return true;
  }

  if (request.action === 'processBulkSelection') {
    if (!bulkSelectionMode || selectedObservations.size === 0) {
      sendResponse({ success: false, message: 'No observations selected or bulk mode not active' });
      return true;
    }

    processBulkSelection(request.mode || bulkAnnotationMode || 'adult-alive');
    sendResponse({ success: true, message: `Processing ${selectedObservations.size} observations with ${request.mode || bulkAnnotationMode || 'adult-alive'} annotations` });
    return true;
  }

  // Single-observation fill actions (from popup buttons on observation pages)
  const fillActions = {
    'fillFieldsAlive':                { mode: 'adult-alive',             description: 'adult alive organism' },
    'fillFieldsDead':                 { mode: 'adult-dead',              description: 'adult dead organism' },
    'fillFieldsJuvenile':             { mode: 'juvenile',                description: 'juvenile organism' },
    'fillFieldsJuvenileDead':         { mode: 'juvenile-dead',           description: 'juvenile dead organism' },
    'fillFieldsAgeUnknown':           { mode: 'age-unknown',             description: 'age unknown organism' },
    'fillFieldsPlantFlowers':         { mode: 'plant-flowers',           description: 'plant with flowers and green leaves' },
    'fillFieldsPlantFruits':          { mode: 'plant-fruits',            description: 'plant with fruits/seeds and green leaves' },
    'fillFieldsPlantNoFlowersFruits': { mode: 'plant-no-flowers-fruits', description: 'plant with no flowers/fruits and green leaves' },
  };

  if (fillActions[request.action]) {
    const { mode } = fillActions[request.action];

    if (!window.location.pathname.includes('/observations/')) {
      sendResponse({ success: false, error: 'Not on an observation page' });
      return true;
    }

    const obsId = window.location.pathname.split('/observations/')[1]?.split('/')[0];
    const jwt = document.querySelector('meta[name="inaturalist-api-token"]')?.content;

    if (!obsId || !jwt) {
      sendResponse({ success: false, error: 'Could not get observation ID or JWT' });
      return true;
    }

    chrome.runtime.sendMessage({ action: 'annotateSingleObs', obsId, mode, jwt }, response => {
      if (response?.success) {
        showAnnotatedToast();
      }
      sendResponse(response || { success: false, error: 'No response from background' });
    });

    return true;
  }
});

// Initialization: restore state and set up observers on observations list pages
if (isObservationsListPage()) {
  console.log('On supported observations list page');

  // Restore in-progress accumulator from storage (handles page navigation)
  chrome.storage.local.get([STORAGE_KEY_CURRENT], result => {
    const stored = result[STORAGE_KEY_CURRENT];
    if (!stored || !stored.annotationType) return; // annotation type is enough to restore
    selectedObservations = new Set(stored.observations || []);
    bulkAnnotationMode = stored.annotationType;
    bulkSelectionMode = true;
    // Wait for iNat to render observations before creating UI + auto-scrolling.
    // On next-page navigation the storage callback fires before React has populated
    // the grid, so auto-scroll would complete instantly on an empty page.
    waitForObservations(() => {
      createBulkModeUI();
      setupObservationClickHandlers();
      setTimeout(() => {
        highlightRestoredObservations();
        updateSelectionUI();
      }, 500);
    });
  });

  function waitForObservations(callback, maxWaitMs = 10000) {
    const deadline = Date.now() + maxWaitMs;
    function check() {
      if (document.querySelectorAll('.thumbnail a[href*="/observations/"]').length > 0) {
        callback();
      } else if (Date.now() < deadline) {
        setTimeout(check, 300);
      } else {
        console.log('waitForObservations timed out, proceeding anyway');
        callback();
      }
    }
    check();
  }

  // Re-setup handlers when page content changes (for pagination)
  let setupTimeout = null;
  const observer = new MutationObserver((mutations) => {
    if (!bulkSelectionMode || setupTimeout) return;

    let hasNewContent = false;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 &&
              (node.querySelector && node.querySelector('.thumbnail a[href*="/observations/"]'))) {
            hasNewContent = true;
          }
        });
      }
    });

    if (hasNewContent) {
      setupTimeout = setTimeout(() => {
        setupObservationClickHandlers();
        setupTimeout = null;
      }, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}
