// Function to auto-scroll page to reveal all observations
function autoScrollToRevealAllObservations() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting auto-scroll to reveal all observations...');

      const initialScrollY = window.scrollY;
      const initialDocumentHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;
      const paginationDiv = document.querySelector('.pages.col-xs-12');

      console.log(`Initial state: ScrollY=${initialScrollY}, DocHeight=${initialDocumentHeight}, WindowHeight=${windowHeight}, PaginationFound=${!!paginationDiv}`);

      const scrollStep = 800;
      const scrollDelay = 500;
      let scrollCount = 0;
      const maxScrollAttempts = 50;
      let lastScrollY = initialScrollY;
      let stuckCount = 0;

      function isElementInViewport(element) {
        try {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
          );
        } catch (e) {
          console.error('Error checking viewport:', e);
          return false;
        }
      }

      function performScrollStep() {
        try {
          const currentScrollY = window.scrollY;
          const documentHeight = document.documentElement.scrollHeight;

          if (currentScrollY === lastScrollY) {
            stuckCount++;
            console.log(`Scroll stuck at position ${currentScrollY}, stuck count: ${stuckCount}`);
            if (stuckCount >= 3) {
              console.log('Scrolling appears stuck, completing auto-scroll');
              resolve();
              return;
            }
          } else {
            stuckCount = 0;
          }
          lastScrollY = currentScrollY;

          const paginationDiv = document.querySelector('.pages.col-xs-12');
          const isPaginationVisible = paginationDiv && isElementInViewport(paginationDiv);

          console.log(`Scroll step ${scrollCount + 1}: Y=${currentScrollY}, DocHeight=${documentHeight}, WindowHeight=${windowHeight}, PaginationVisible=${isPaginationVisible}`);

          const reachedBottom = currentScrollY + windowHeight >= documentHeight - 50;

          if (reachedBottom || scrollCount >= maxScrollAttempts) {
            console.log(`Auto-scroll completed after ${scrollCount + 1} steps. Reached bottom: ${reachedBottom}`);
            resolve();
            return;
          }

          window.scrollBy(0, scrollStep);
          scrollCount++;

          setTimeout(performScrollStep, scrollDelay);
        } catch (e) {
          console.error('Error in performScrollStep:', e);
          reject(e);
        }
      }

      performScrollStep();
    } catch (e) {
      console.error('Error in autoScrollToRevealAllObservations:', e);
      reject(e);
    }
  });
}

// Function to create bulk mode UI
function createBulkModeUI() {
  console.log('createBulkModeUI called - checking conditions...');

  if (bulkModeButtons || !isObservationsListPage()) {
    console.log('Exiting createBulkModeUI early due to conditions');
    return;
  }

  console.log('Proceeding with bulk mode UI creation...');

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

  const nextPageButton = document.createElement('button');
  nextPageButton.textContent = 'Next Page →';
  nextPageButton.id = 'bulk-next-page-button';
  nextPageButton.style.cssText = `
    background: #9C27B0;
    color: white;
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    white-space: nowrap;
    display: none;
  `;

  buttonRow.appendChild(counter);
  buttonRow.appendChild(selectAllButton);
  buttonRow.appendChild(nextPageButton);
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

  // Start auto-scrolling to reveal all observations
  console.log('About to start auto-scrolling in bulk mode...');
  if (statusText) {
    statusText.textContent = 'Auto-scrolling to reveal all observations...';
    statusText.style.color = '#FF9800';
  }

  function updateNextPageButton() {
    // Try pagination DOM selectors first
    if (document.querySelector('a[rel="next"]') ||
        document.querySelector('.pagination li.next:not(.disabled) a')) {
      nextPageButton.style.display = 'inline-block';
      return;
    }
    // Fallback: iNat shows 96 obs per page; a full page means there are more
    const perPage = parseInt(new URL(window.location.href).searchParams.get('per_page') || '96');
    const obsCount = document.querySelectorAll('.thumbnail a[href*="/observations/"]').length;
    nextPageButton.style.display = obsCount >= perPage ? 'inline-block' : 'none';
  }

  autoScrollToRevealAllObservations().then(() => {
    console.log('Auto-scroll completed, updating UI');
    if (statusText) {
      if (bulkAnnotationMode) {
        statusText.textContent = 'Click observations to select';
        statusText.style.color = '#4CAF50';
      } else {
        statusText.textContent = 'Choose annotation type in popup first';
        statusText.style.color = '#FF9800';
      }
    }
    updateNextPageButton();
  }).catch((error) => {
    console.error('Auto-scroll failed:', error);
    if (statusText) {
      statusText.textContent = bulkAnnotationMode ? 'Click observations to select' : 'Choose annotation type in popup first';
      statusText.style.color = bulkAnnotationMode ? '#4CAF50' : '#FF9800';
    }
    updateNextPageButton();
  });

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

  nextPageButton.addEventListener('click', () => {
    goToNextPage();
  });
}

// Function to exit bulk mode
function exitBulkMode() {
  console.log('Exiting bulk mode');
  chrome.storage.local.remove([STORAGE_KEY_CURRENT]);
  bulkSelectionMode = false;
  bulkAnnotationMode = null;
  selectedObservations.clear();

  // Remove selection styling from all observation divs
  document.querySelectorAll('.observation.observation-grid-cell').forEach(observationDiv => {
    observationDiv.style.border = '';
    observationDiv.style.boxShadow = '';
    observationDiv.style.borderRadius = '';
  });

  // Remove bulk mode UI
  if (bulkModeButtons) {
    bulkModeButtons.remove();
    bulkModeButtons = null;
  }

  // Notify popup
  chrome.runtime.sendMessage({
    action: 'bulkModeExited'
  }, () => {
    if (chrome.runtime.lastError) {
      // Silently ignore
    }
  });
}

// Navigate to the next page, preserving bulk mode state across the navigation
function goToNextPage() {
  const url = new URL(window.location.href);
  const currentPage = parseInt(url.searchParams.get('page') || '1');
  url.searchParams.set('page', currentPage + 1);

  // Persist annotation type + current selections before navigating
  // (saves even with 0 obs so bulk mode is restored on the new page)
  const data = {
    annotationType: bulkAnnotationMode,
    observations: Array.from(selectedObservations),
    lastUpdated: Date.now()
  };
  chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: data }, () => {
    window.location.href = url.toString();
  });
}
