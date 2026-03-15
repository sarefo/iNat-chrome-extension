// Remove lazy-loading from all images (existing and future) so thumbnails load
// as soon as their DOM cards are added, without needing to scroll into view.
function stripLazyLoading() {
  function eagerify(img) {
    if (img.loading === 'lazy') img.loading = 'eager';
    // Handle data-src patterns (lazysizes / custom loaders)
    if (img.dataset.src && !img.getAttribute('src')) img.src = img.dataset.src;
    if (img.dataset.srcset && !img.getAttribute('srcset')) img.srcset = img.dataset.srcset;
  }
  document.querySelectorAll('img').forEach(eagerify);
  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'IMG') { eagerify(node); continue; }
        node.querySelectorAll('img').forEach(eagerify);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

// Count unique observation IDs currently rendered on the page
function countLoadedObservations() {
  const ids = new Set();
  document.querySelectorAll('.thumbnail a[href*="/observations/"]').forEach(link => {
    const href = link.getAttribute('href');
    const id = href.split('/observations/')[1]?.split('?')[0]?.split('#')[0];
    if (id && /^\d+$/.test(id)) ids.add(id);
  });
  return ids.size;
}

// If bulkTaxonId is set but missing from the current URL, redirect with it restored.
// Returns true if a redirect was initiated (caller should abort further work).
function checkAndFixTaxonId() {
  if (!bulkTaxonId) return false;
  const current = new URL(window.location.href);
  if (current.searchParams.get('taxon_id')) return false; // already correct

  // taxon_id was stripped by iNat — rebuild the URL and redirect
  current.searchParams.set('taxon_id', bulkTaxonId);
  console.log(`[bulk] taxon_id missing at scroll time, redirecting to: ${current}`);
  const data = {
    annotationType: bulkAnnotationMode,
    observations: Array.from(selectedObservations),
    lastUpdated: Date.now(),
    jumpedToLastPage: bulkJumpedToLastPage,
    totalObservations: bulkTotalObservations,
    taxonId: bulkTaxonId
  };
  chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: data }, () => {
    window.location.href = current.toString();
  });
  return true;
}

// Return how many observations we expect on the current page, or 0 if unknown
function getExpectedObservationCount() {
  if (!bulkTotalObservations) return 0;
  const currentPage = parseInt(new URL(window.location.href).searchParams.get('page') || '1', 10);
  const lastPage = Math.ceil(bulkTotalObservations / 96);
  if (currentPage < lastPage) return 96;
  return bulkTotalObservations - (lastPage - 1) * 96;
}

// Function to auto-scroll page to reveal all observations
function autoScrollToRevealAllObservations(expectedCount = 0) {
  stripLazyLoading();
  return new Promise((resolve) => {
    const windowHeight = window.innerHeight;
    const scrollStep = 600;
    const scrollDelay = 300;
    // How long to wait at the bottom for iNat to lazy-load the next batch
    const loadWaitTime = 5000;
    let scrollCount = 0;
    const maxScrollAttempts = 150;

    function performScrollStep() {
      if (scrollCount >= maxScrollAttempts) {
        resolve();
        return;
      }

      const currentScrollY = window.scrollY;
      const documentHeight = document.documentElement.scrollHeight;
      const reachedBottom = currentScrollY + windowHeight >= documentHeight - 100;
      const allLoaded = expectedCount > 0 && countLoadedObservations() >= expectedCount;

      if (reachedBottom) {
        if (allLoaded) {
          resolve();
          return;
        }
        // At the bottom but not all loaded yet — wait for iNat lazy-loading
        const heightBeforeWait = documentHeight;
        setTimeout(() => {
          const newHeight = document.documentElement.scrollHeight;
          if (newHeight > heightBeforeWait) {
            scrollCount++;
            performScrollStep();
          } else {
            resolve();
          }
        }, loadWaitTime);
        return;
      }

      // Not at bottom yet — keep scrolling regardless of whether all are loaded
      window.scrollBy(0, scrollStep);
      scrollCount++;
      setTimeout(performScrollStep, scrollDelay);
    }

    performScrollStep();
  });
}

// Function to create bulk mode UI
function createBulkModeUI() {
  if (bulkModeButtons || !isObservationsListPage()) return;

  const container = document.createElement('div');
  container.id = 'bulk-mode-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: Arial, sans-serif;
    display: flex;
    gap: 10px;
    align-items: center;
    flex-direction: column;
    min-width: 200px;
  `;

  const statusText = document.createElement('div');
  statusText.id = 'bulk-status-text';
  statusText.textContent = bulkAnnotationMode ? 'Click observations to select' : 'Choose annotation type in popup first';
  statusText.style.cssText = `
    color: ${bulkAnnotationMode ? '#4CAF50' : '#FF9800'};
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 10px;
    text-align: center;
  `;

  const annotationDisplay = document.createElement('div');
  annotationDisplay.id = 'annotation-display';
  annotationDisplay.textContent = bulkAnnotationMode ? getAnnotationDisplayName(bulkAnnotationMode) : 'No annotation type selected';
  annotationDisplay.style.cssText = `
    background: ${bulkAnnotationMode ? '#e8f5e8' : '#fff3e0'};
    border: 2px solid ${bulkAnnotationMode ? '#4CAF50' : '#FF9800'};
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: bold;
    color: ${bulkAnnotationMode ? '#2E7D32' : '#F57C00'};
    margin-bottom: 10px;
    text-align: center;
  `;

  const accumulatedCounter = document.createElement('div');
  accumulatedCounter.id = 'accumulated-counter';
  accumulatedCounter.textContent = selectedObservations.size > 0 ? `${selectedObservations.size} selected across pages` : '';
  accumulatedCounter.style.cssText = `
    color: #2196F3;
    font-size: 11px;
    text-align: center;
    margin-bottom: 8px;
    display: ${selectedObservations.size > 0 ? 'block' : 'none'};
  `;

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = `
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  `;

  const counter = document.createElement('span');
  counter.id = 'selection-counter';
  counter.textContent = '0 selected';
  counter.style.cssText = `
    color: #666;
    font-size: 12px;
    flex: 1;
  `;

  const selectAllButton = document.createElement('button');
  selectAllButton.textContent = 'Select All';
  selectAllButton.id = 'bulk-select-all-button';
  selectAllButton.style.cssText = `
    background: #FF9800;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
  `;

  const saveQueueButton = document.createElement('button');
  saveQueueButton.textContent = 'Save Queue';
  saveQueueButton.id = 'bulk-save-queue-button';
  saveQueueButton.style.cssText = `
    background: #FF5722;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
  `;

  const processButton = document.createElement('button');
  processButton.textContent = 'Process';
  processButton.id = 'bulk-process-button';
  processButton.disabled = true;
  processButton.style.cssText = `
    background: #2196F3;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    opacity: 0.5;
  `;

  const cancelButton = document.createElement('button');
  cancelButton.textContent = '✕';
  cancelButton.id = 'bulk-cancel-button';
  cancelButton.style.cssText = `
    background: #f44336;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  `;

  const prevPageButton = document.createElement('button');
  prevPageButton.textContent = '← Prev Page';
  prevPageButton.id = 'bulk-prev-page-button';
  prevPageButton.style.cssText = `
    background: #9C27B0;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
  `;

  buttonRow.appendChild(counter);
  buttonRow.appendChild(prevPageButton);
  buttonRow.appendChild(selectAllButton);
  buttonRow.appendChild(saveQueueButton);
  buttonRow.appendChild(processButton);
  buttonRow.appendChild(cancelButton);

  container.appendChild(statusText);
  container.appendChild(annotationDisplay);
  container.appendChild(accumulatedCounter);
  container.appendChild(buttonRow);

  document.body.appendChild(container);
  bulkModeButtons = container;

  // Start selection mode only if annotation type is set
  bulkSelectionMode = !!bulkAnnotationMode;

  function updatePrevPageButton() {
    const currentPage = parseInt(new URL(window.location.href).searchParams.get('page') || '1', 10);
    const enabled = currentPage > 1;
    prevPageButton.disabled = !enabled;
    prevPageButton.style.opacity = enabled ? '1' : '0.4';
    prevPageButton.style.cursor = enabled ? 'pointer' : 'default';
  }

  function setReadyStatus() {
    if (statusText) {
      statusText.textContent = bulkAnnotationMode ? 'Click observations to select' : 'Choose annotation type in popup first';
      statusText.style.color = bulkAnnotationMode ? '#4CAF50' : '#FF9800';
    }
    updatePrevPageButton();
    triggerPrevPagePreload();
  }

  function doAutoScroll() {
    if (checkAndFixTaxonId()) return; // wrong URL — redirect in progress
    const expected = getExpectedObservationCount();
    if (expected > 0 && countLoadedObservations() >= expected) {
      setReadyStatus();
      return;
    }
    statusText.textContent = 'Auto-scrolling to reveal all observations...';
    statusText.style.color = '#FF9800';
    autoScrollToRevealAllObservations(expected).then(setReadyStatus).catch(setReadyStatus);
  }

  const currentPage = parseInt(new URL(window.location.href).searchParams.get('page') || '1', 10);
  if (currentPage === 1 && !bulkJumpedToLastPage) {
    // On page 1: read total observation count and jump straight to the last page.
    // No need to auto-scroll — we just need the stat element.
    statusText.textContent = 'Reading observation count...';
    statusText.style.color = '#FF9800';

    function waitForStatAndJump(attemptsLeft) {
      const el = document.querySelector('.stat-value.ng-binding');
      const total = el ? parseInt(el.textContent.trim().replace(/[^0-9]/g, ''), 10) : 0;

      if (!total && attemptsLeft > 0) {
        setTimeout(() => waitForStatAndJump(attemptsLeft - 1), 500);
        return;
      }

      const taxonId = new URL(window.location.href).searchParams.get('taxon_id') || '';
      if (total > 96) {
        const lastPage = Math.ceil(total / 96);
        const url = new URL(window.location.href);
        url.searchParams.set('page', lastPage);
        const data = {
          annotationType: bulkAnnotationMode,
          observations: Array.from(selectedObservations),
          lastUpdated: Date.now(),
          jumpedToLastPage: true,
          expectedUrl: url.toString(),
          totalObservations: total,
          taxonId: taxonId
        };
        chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: data }, () => {
          window.location.href = url.toString();
        });
      } else {
        // All observations fit on one page — auto-scroll and stay here
        bulkJumpedToLastPage = true;
        bulkTotalObservations = total;
        bulkTaxonId = taxonId;
        doAutoScroll();
      }
    }

    waitForStatAndJump(10); // retry up to 5 seconds
  } else {
    // On a working page (> 1) — auto-scroll to reveal all observations
    doAutoScroll();
  }

  // Event listeners
  processButton.addEventListener('click', () => {
    if (selectedObservations.size > 0 && bulkAnnotationMode) {
      processBulkSelection(bulkAnnotationMode);
    }
  });

  selectAllButton.addEventListener('click', () => {
    selectAllObservations();
  });

  saveQueueButton.addEventListener('click', async () => {
    if (selectedObservations.size === 0) return;
    await saveAsNamedQueue();
    chrome.runtime.sendMessage({ action: 'queueUpdated' }, () => {
      if (chrome.runtime.lastError) { /* popup may be closed */ }
    });
    exitBulkMode();
  });

  cancelButton.addEventListener('click', () => {
    exitBulkMode();
  });

  prevPageButton.addEventListener('click', () => {
    goToPrevPage();
  });
}

// Function to exit bulk mode
function exitBulkMode() {
  chrome.storage.local.remove([STORAGE_KEY_CURRENT]);
  bulkSelectionMode = false;
  bulkAnnotationMode = null;
  selectedObservations.clear();

  // Remove selection styling from all observation divs
  document.querySelectorAll('.observation.observation-grid-cell').forEach(markDeselected);

  // Remove bulk mode UI
  if (bulkModeButtons) {
    bulkModeButtons.remove();
    bulkModeButtons = null;
  }

  // Close any background preload tab
  chrome.runtime.sendMessage({ action: 'closePreloadTab' }, () => { void chrome.runtime.lastError; });

  // Notify popup
  chrome.runtime.sendMessage({
    action: 'bulkModeExited'
  }, () => {
    if (chrome.runtime.lastError) {
      // Silently ignore
    }
  });
}

// Open the previous page in a background tab so it's ready when the user navigates there
function triggerPrevPagePreload() {
  const url = new URL(window.location.href);
  const currentPage = parseInt(url.searchParams.get('page') || '1', 10);
  if (currentPage <= 1) return;
  if (!bulkTotalObservations) return;
  const prevUrl = new URL(url.toString());
  prevUrl.searchParams.set('page', currentPage - 1);
  if (bulkTaxonId) prevUrl.searchParams.set('taxon_id', bulkTaxonId);
  chrome.runtime.sendMessage({
    action: 'openPreloadTab',
    url: prevUrl.toString(),
    totalObservations: bulkTotalObservations,
    targetPage: currentPage - 1
  }, () => { void chrome.runtime.lastError; });
}

// Navigate to the previous page, preserving bulk mode state across the navigation
function goToPrevPage() {
  const url = new URL(window.location.href);
  const currentPage = parseInt(url.searchParams.get('page') || '1');
  if (currentPage <= 1) return;
  url.searchParams.set('page', currentPage - 1);
  // Proactively ensure taxon_id is in the target URL (iNat sometimes strips it)
  if (bulkTaxonId && !url.searchParams.get('taxon_id')) {
    url.searchParams.set('taxon_id', bulkTaxonId);
  }

  const data = {
    annotationType: bulkAnnotationMode,
    observations: Array.from(selectedObservations),
    lastUpdated: Date.now(),
    jumpedToLastPage: true,
    expectedUrl: url.toString(),   // used to detect taxon-filter stripping by iNat
    totalObservations: bulkTotalObservations,
    taxonId: bulkTaxonId
  };
  chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: data }, () => {
    chrome.runtime.sendMessage({ action: 'switchToPreloadTab' }, response => {
      if (!response?.success) {
        // No preload tab available — fall back to normal navigation
        window.location.href = url.toString();
      }
    });
  });
}
