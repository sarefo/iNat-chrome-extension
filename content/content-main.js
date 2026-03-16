let isPreloadTabPending = false; // true when this tab was opened as a preload tab

// If stored.expectedUrl has a taxon_id that the current URL is missing (iNat stripping),
// redirect to the correct URL. Returns true if a redirect was initiated.
function restoreTaxonIdIfStripped(stored) {
  if (!stored.expectedUrl) return false;
  const expected = new URL(stored.expectedUrl);
  const current = new URL(window.location.href);
  const expectedTaxonId = expected.searchParams.get('taxon_id');
  if (!expectedTaxonId || current.searchParams.get('taxon_id')) {
    // URL looks correct — clear expectedUrl so stale data doesn't persist
    const cleanData = Object.assign({}, stored);
    delete cleanData.expectedUrl;
    chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: cleanData });
    return false;
  }
  console.log(`[bulk] taxon_id stripped by iNat, retrying: ${stored.expectedUrl}`);
  const retryData = Object.assign({}, stored);
  delete retryData.expectedUrl; // prevent infinite redirect loop
  chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: retryData }, () => {
    window.location.href = stored.expectedUrl;
  });
  return true;
}

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

  toast.appendChild(label);
  document.body.appendChild(toast);

  const dismiss = () => {
    toast.style.animation = 'innat-fadeout 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  };

  setTimeout(dismiss, 3000);
  toast.addEventListener('click', dismiss);
}

// Labels we know iNat displays for each mode — used as immediate fallback
const ANNOTATION_DISPLAY_LABELS = {
  'adult-alive':             { 'Life Stage': 'Adult',    'Alive or Dead': 'Alive', 'Evidence of Presence': 'Organism' },
  'adult-dead':              { 'Life Stage': 'Adult',    'Alive or Dead': 'Dead',  'Evidence of Presence': 'Organism' },
  'juvenile':                { 'Life Stage': 'Juvenile', 'Alive or Dead': 'Alive', 'Evidence of Presence': 'Organism' },
  'juvenile-dead':           { 'Life Stage': 'Juvenile', 'Alive or Dead': 'Dead',  'Evidence of Presence': 'Organism' },
  'molt':                    {                           'Alive or Dead': 'Dead',  'Evidence of Presence': 'Molt' },
  'age-unknown':             {                           'Alive or Dead': 'Alive', 'Evidence of Presence': 'Organism' },
  'plant-flowers':           { 'Flowers': 'Flowers',          'Fruit': 'Flowers',          'Leaves': 'Green Leaves' },
  'plant-fruits':            { 'Flowers': 'Fruits or Seeds',  'Fruit': 'Fruits or Seeds',  'Leaves': 'Green Leaves' },
  'plant-no-flowers-fruits': { 'Flowers': 'No Flowers or Fruits', 'Fruit': 'No Flowers or Fruits', 'Leaves': 'Green Leaves' },
};

function applyAnnotationLabelsToDOM(labelMap) {
  const annotationsTable = document.querySelector('.Annotations table');
  if (!annotationsTable) return false;

  const rows = annotationsTable.querySelectorAll('tbody tr');
  let updated = 0;

  rows.forEach(row => {
    const attrDiv = row.querySelector('td.attribute div');
    if (!attrDiv) return;

    const attrLabel = (attrDiv.getAttribute('title') || attrDiv.textContent).trim();
    const matchKey = Object.keys(labelMap).find(k => attrLabel.includes(k));
    if (!matchKey) return;

    const valueLabel = labelMap[matchKey];

    // If already showing a value label (already annotated state), update it
    const valueSpan = row.querySelector('td.value span.value-label');
    if (valueSpan) {
      valueSpan.textContent = valueLabel;
      updated++;
      return;
    }

    // If showing a dropdown button (unannotated state), update its label
    const dropdown = row.querySelector('button.dropdown-toggle');
    if (dropdown) {
      // Try a non-whitespace text node first (classic Bootstrap: "Select <span class=caret>")
      let found = false;
      for (const node of dropdown.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          node.textContent = valueLabel + ' ';
          found = true;
          break;
        }
      }
      // Fall back to updating the non-caret child span (React style: "<span>Select</span><span class=caret>")
      if (!found) {
        const labelSpan = [...dropdown.children].find(el => !el.classList.contains('caret'));
        if (labelSpan) labelSpan.textContent = valueLabel;
      }
      updated++;
    }
  });

  return updated > 0;
}

function refreshAnnotationSection(mode) {
  const knownLabels = ANNOTATION_DISPLAY_LABELS[mode];
  if (knownLabels) applyAnnotationLabelsToDOM(knownLabels);
}

// Single message listener for all content script messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Extract taxon ID from the current page (works on observation and taxa pages)
  if (request.action === 'getTaxonId') {
    const link = document.querySelector('a[href*="/taxa/"]');
    const match = link?.href.match(/\/taxa\/(\d+)/);
    sendResponse({ taxonId: match ? match[1] : null });
    return true;
  }

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

  if (request.action === 'activatePreload') {
    if (isPreloadTabPending && !bulkModeButtons) {
      isPreloadTabPending = false;
      chrome.storage.local.get([STORAGE_KEY_CURRENT], fresh => activatePreloadTab(fresh[STORAGE_KEY_CURRENT]));
    }
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
    if (!isObservationsListPage()) {
      sendResponse({ success: false, message: 'Not on a supported observations page' });
      return true;
    }

    if (bulkModeButtons) {
      exitBulkMode();
      sendResponse({ success: true, message: 'Bulk mode disabled' });
    } else {
      createBulkModeUI();
      setupObservationClickHandlers();
      sendResponse({ success: true, message: 'Bulk mode enabled - click observations to select them' });
    }
    return true;
  }

  if (request.action === 'setBulkAnnotationType') {
    if (!isObservationsListPage()) {
      sendResponse({ success: false, message: 'Not on a supported observations page' });
      return true;
    }

    bulkAnnotationMode = request.mode;

    if (!bulkModeButtons) {
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
    'fillFieldsMolt':                 { mode: 'molt',                    description: 'molt' },
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
        refreshAnnotationSection(mode);
      }
      sendResponse(response || { success: false, error: 'No response from background' });
    });

    return true;
  }
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

// Called when a preload tab becomes active: restore state and launch bulk UI
function activatePreloadTab(stored) {
  if (!stored || !stored.annotationType) return;

  if (restoreTaxonIdIfStripped(stored)) return;

  selectedObservations = new Set(stored.observations || []);
  bulkAnnotationMode = stored.annotationType;
  bulkJumpedToLastPage = stored.jumpedToLastPage || false;
  bulkTotalObservations = stored.totalObservations || 0;
  bulkTaxonId = stored.taxonId || '';
  bulkSelectionMode = true;

  waitForObservations(() => {
    createBulkModeUI();
    setupObservationClickHandlers();
    setTimeout(() => {
      highlightRestoredObservations();
      updateSelectionUI();
    }, 500);
  });
}

// Initialization: restore state and set up observers on observations list pages
if (isObservationsListPage()) {
  // Restore in-progress accumulator from storage (handles page navigation)
  chrome.storage.local.get([STORAGE_KEY_CURRENT, 'innat_preload'], result => {
    const stored = result[STORAGE_KEY_CURRENT];
    const preload = result.innat_preload;

    // Detect if this tab was opened as a preload tab (background tab for next navigation).
    // A preload entry is valid for up to 1 hour; match on the page number.
    if (preload?.tabId && preload?.url && preload?.createdAt && Date.now() - preload.createdAt < 3600000) {
      try {
        const preloadPage = new URL(preload.url).searchParams.get('page');
        const currentPage = new URL(window.location.href).searchParams.get('page');
        if (preloadPage && preloadPage === currentPage) {
          // The background service worker injects the visibilityState spoof into the
          // main world via chrome.scripting.executeScript once this tab finishes loading,
          // so iNat's scroll handlers treat this hidden tab as visible.
          isPreloadTabPending = true;

          // Strip lazy-loading immediately so images load as cards are added to DOM.
          stripLazyLoading();

          // Start scrolling immediately in the background.
          const lastPage = Math.ceil(preload.totalObservations / 96);
          const expectedCount = preload.targetPage < lastPage ? 96
            : preload.totalObservations - (lastPage - 1) * 96;
          waitForObservations(() => autoScrollToRevealAllObservations(expectedCount));

          // Primary activation: background sends 'activatePreload' message (handled above).
          // Fallback: visibilitychange in case the message is delayed or lost.
          // Content scripts read document.hidden from the real C++ state, unaffected
          // by the MAIN-world spoof, so it correctly reflects actual tab visibility.
          document.addEventListener('visibilitychange', () => {
            if (document.hidden || !isPreloadTabPending || bulkModeButtons) return;
            isPreloadTabPending = false;
            chrome.storage.local.get([STORAGE_KEY_CURRENT], fresh => activatePreloadTab(fresh[STORAGE_KEY_CURRENT]));
          });
          return;
        }
      } catch (e) { /* ignore URL parse errors */ }
    }

    if (!stored || !stored.annotationType) return; // annotation type is enough to restore

    // iNat sometimes strips taxon_id when serving a paginated page — detect and retry.
    if (restoreTaxonIdIfStripped(stored)) return;

    selectedObservations = new Set(stored.observations || []);
    bulkAnnotationMode = stored.annotationType;
    bulkJumpedToLastPage = stored.jumpedToLastPage || false;
    bulkTotalObservations = stored.totalObservations || 0;
    bulkTaxonId = stored.taxonId || '';
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
