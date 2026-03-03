// Global state for bulk selection mode
let bulkSelectionMode = false;
let selectedObservations = new Set();
let bulkModeButtons = null;
let bulkAnnotationMode = 'adult-alive'; // Default mode

// Function to check if we're on a supported observations list page
function isObservationsListPage() {
  const url = window.location.href;
  return url.includes('/observations?') ||
         (url.includes('/observations') && window.location.search.length > 0) ||
         url.includes('/observations/export') ||
         url.includes('/observations/identify');
}

// Function to get display name for annotation mode
function getAnnotationDisplayName(mode) {
  switch(mode) {
    case 'adult-alive': return '🦆 Adult Live';
    case 'adult-dead': return '💀 Adult Dead';
    case 'juvenile': return '🐛 Juvenile';
    case 'juvenile-dead': return '💀 Juvenile Dead';
    case 'age-unknown': return '❓ Age Unknown';
    case 'plant-flowers': return '🌼 Flowers + Green Leaves';
    case 'plant-fruits': return '🍇 Fruits + Green Leaves';
    case 'plant-no-flowers-fruits': return '🍇❌ No Flowers/Fruits + Green Leaves';
    default: return 'Unknown';
  }
}

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

  buttonRow.appendChild(counter);
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

  // Start auto-scrolling to reveal all observations
  console.log('About to start auto-scrolling in bulk mode...');
  if (statusText) {
    statusText.textContent = 'Auto-scrolling to reveal all observations...';
    statusText.style.color = '#FF9800';
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
  }).catch((error) => {
    console.error('Auto-scroll failed:', error);
    if (statusText) {
      statusText.textContent = bulkAnnotationMode ? 'Click observations to select' : 'Choose annotation type in popup first';
      statusText.style.color = bulkAnnotationMode ? '#4CAF50' : '#FF9800';
    }
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
}

// Function to select all visible observations
function selectAllObservations() {
  if (!bulkSelectionMode || !bulkAnnotationMode) return;

  const observations = document.querySelectorAll('.thumbnail a[href*="/observations/"]');
  console.log(`Found ${observations.length} observations to select`);

  observations.forEach((observationElement) => {
    const href = observationElement.getAttribute('href');
    if (!href || !href.includes('/observations/')) return;

    const observationDiv = observationElement.closest('.observation.observation-grid-cell');
    if (!observationDiv) return;

    const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];

    if (!selectedObservations.has(observationId)) {
      selectedObservations.add(observationId);
      observationDiv.style.border = '3px solid #4CAF50';
      observationDiv.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
      observationDiv.style.borderRadius = '8px';
    }
  });

  console.log(`Selected ${selectedObservations.size} total observations`);
  saveCurrentCollection();
  updateSelectionUI();
}

// Count how many selected observations are visible on the current page (deduplicated)
function countPageSelections() {
  const pageIds = new Set();
  document.querySelectorAll('.thumbnail a[href*="/observations/"]').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const raw = href.split('/observations/')[1];
    if (!raw) return;
    const id = raw.split('?')[0].split('#')[0];
    if (/^\d+$/.test(id)) pageIds.add(id); // only numeric IDs (observation pages)
  });
  let count = 0;
  pageIds.forEach(id => { if (selectedObservations.has(id)) count++; });
  return count;
}

// Function to update selection UI
function updateSelectionUI() {
  const counter = document.getElementById('selection-counter');
  const processButton = document.getElementById('bulk-process-button');
  const statusText = document.getElementById('bulk-status-text');
  const annotationDisplay = document.getElementById('annotation-display');
  const accumulatedCounter = document.getElementById('accumulated-counter');

  if (counter) {
    const pageCount = countPageSelections();
    const totalCount = selectedObservations.size;
    counter.textContent = `${pageCount} this page  |  ${totalCount} total`;
  }

  if (accumulatedCounter) {
    const total = selectedObservations.size;
    accumulatedCounter.textContent = total > 0 ? `${total} selected across pages` : '';
    accumulatedCounter.style.display = total > 0 ? 'block' : 'none';
  }

  if (processButton) {
    processButton.disabled = selectedObservations.size === 0 || !bulkAnnotationMode;
    processButton.style.opacity = processButton.disabled ? '0.5' : '1';
  }

  if (statusText) {
    if (!bulkAnnotationMode) {
      statusText.textContent = 'Choose annotation type in popup first';
      statusText.style.color = '#FF9800';
    } else if (selectedObservations.size === 0) {
      statusText.textContent = 'Click observations to select';
      statusText.style.color = '#4CAF50';
    } else {
      statusText.textContent = `${selectedObservations.size} observations selected`;
      statusText.style.color = '#2196F3';
    }
  }

  if (annotationDisplay && bulkAnnotationMode) {
    annotationDisplay.textContent = getAnnotationDisplayName(bulkAnnotationMode);
    annotationDisplay.style.background = '#e8f5e8';
    annotationDisplay.style.borderColor = '#4CAF50';
    annotationDisplay.style.color = '#2E7D32';
  }

  // Send update to popup if it's open
  chrome.runtime.sendMessage({
    action: 'bulkModeUpdate',
    selectedCount: selectedObservations.size,
    active: bulkSelectionMode,
    annotationType: bulkAnnotationMode
  }, () => {
    if (chrome.runtime.lastError) {
      // Silently ignore
    }
  });
}

// Function to handle observation click in bulk mode
function handleObservationClick(event, observationElement) {
  console.log('Observation clicked, bulk mode:', bulkSelectionMode);
  if (!bulkSelectionMode) return;

  event.preventDefault();
  event.stopPropagation();

  const href = observationElement.getAttribute('href');
  console.log('Observation href:', href);
  if (!href || !href.includes('/observations/')) return;

  const observationDiv = observationElement.closest('.observation.observation-grid-cell');
  if (!observationDiv) {
    console.warn('Could not find parent observation div');
    return;
  }

  const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];
  console.log('Observation ID:', observationId);

  if (selectedObservations.has(observationId)) {
    selectedObservations.delete(observationId);
    observationDiv.style.border = '';
    observationDiv.style.boxShadow = '';
    observationDiv.style.borderRadius = '';
    console.log('Deselected observation:', observationId);
  } else {
    selectedObservations.add(observationId);
    observationDiv.style.border = '3px solid #4CAF50';
    observationDiv.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
    observationDiv.style.borderRadius = '8px';
    console.log('Selected observation:', observationId);
  }

  saveCurrentCollection();
  updateSelectionUI();
}

// Function to process bulk selection
async function processBulkSelection(mode = 'adult-alive') {
  if (selectedObservations.size === 0) return;

  const counter = document.getElementById('selection-counter');
  const statusText = document.getElementById('bulk-status-text');

  if (statusText) {
    statusText.textContent = 'Processing...';
    statusText.style.color = '#FF9800';
  }

  const total = selectedObservations.size;
  const observationIds = Array.from(selectedObservations);

  // Set up progress tracking
  const progressTracker = {
    total: total,
    completed: 0,
    errors: 0,
    updateUI: function() {
      if (counter) {
        counter.textContent = `${this.completed}/${this.total} processed${this.errors > 0 ? ` (${this.errors} errors)` : ''}`;
      }

      if (statusText) {
        if (this.completed < this.total) {
          statusText.textContent = `Processing observations... ${this.completed}/${this.total}`;
          statusText.style.color = '#FF9800';
        } else {
          if (this.errors > 0) {
            statusText.textContent = `Completed processing ${this.completed - this.errors} observations (${this.errors} failed)`;
            statusText.style.color = '#FF9800';
          } else {
            statusText.textContent = `Successfully processed all ${this.completed} observations!`;
            statusText.style.color = '#4CAF50';
          }
        }
      }
    }
  };

  try {
    // Read JWT directly from the page — avoids background having to query tabs
    const jwt = document.querySelector('meta[name="inaturalist-api-token"]')?.content || null;

    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'processBulkObservationsStaggered',
        observations: observationIds,
        mode: mode,
        jwt: jwt
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          const results = response.results;
          const processed = results.filter(r => !r.error).length;
          const errors = results.filter(r => r.error).length;

          progressTracker.completed = processed + errors;
          progressTracker.errors = errors;
          progressTracker.updateUI();

          console.log(`Processing completed: ${processed} successful, ${errors} errors`);
          resolve(results);
        } else {
          reject(new Error(response.error));
        }
      });
    });

  } catch (error) {
    console.error('Error in bulk processing:', error);

    if (statusText) {
      statusText.textContent = `Error: ${error.message}`;
      statusText.style.color = '#f44336';
    }

    if (counter) {
      counter.textContent = 'Processing failed';
    }

    // Still exit after delay even on error
    setTimeout(() => {
      exitBulkMode();
    }, 5000);
  }
}

// Helper function to format elapsed time
function formatElapsedTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    return `${remainingSeconds}s`;
  }
}

// Handle bulk processing progress updates from background script
function handleBulkProgressUpdate(request) {
  console.log(`Progress update received: ${request.completed}/${request.total} (${request.verified || 0} verified, ${request.errors} errors, ${request.remaining} remaining)`);

  const counter = document.getElementById('selection-counter');
  const statusText = document.getElementById('bulk-status-text');

  if (counter) {
    counter.textContent = `${request.completed}/${request.total} observations`;
    console.log(`Updated counter: ${counter.textContent}`);
  } else {
    console.warn('Counter element not found');
  }

  if (statusText) {
    const isComplete = request.isComplete || (request.completed >= request.total && request.remaining === 0);

    if (isComplete) {
      const verifiedCount = request.verified || 0;
      const failedCount = request.errors || 0;
      const unverifiedCount = request.completed - verifiedCount - failedCount;
      const totalTimeText = request.elapsedTime ? ` in ${formatElapsedTime(request.elapsedTime)}` : '';

      console.log(`Showing completion message: ${verifiedCount} verified, ${failedCount} failed, ${unverifiedCount} unverified`);

      if (verifiedCount === request.total) {
        statusText.textContent = `Successfully verified all ${verifiedCount} observations${totalTimeText}!`;
        statusText.style.color = '#4CAF50';
      } else if (verifiedCount > 0) {
        statusText.textContent = `Verified ${verifiedCount}/${request.total} observations${totalTimeText}${failedCount > 0 ? ` (${failedCount} failed, ${unverifiedCount} unverified)` : ` (${unverifiedCount} unverified)`}`;
        statusText.style.color = '#FF9800';
      } else {
        statusText.textContent = `Processed ${request.total} observations${totalTimeText} (${failedCount} failed)`;
        statusText.style.color = '#f44336';
      }

      // Auto-close overlay after showing final results
      console.log('All processing complete, scheduling overlay close in 7 seconds');
      setTimeout(() => {
        console.log('Auto-closing overlay after completion');
        exitBulkMode();
      }, 7000);
    } else {
      const verifiedText = request.verified !== undefined ? ` (${request.verified} verified)` : '';
      const timeText = request.elapsedTime ? ` • ${formatElapsedTime(request.elapsedTime)}` : '';
      statusText.textContent = `Processing observations... ${request.completed}/${request.total}${verifiedText}${timeText}`;
      statusText.style.color = '#FF9800';
    }
    console.log(`Updated status: ${statusText.textContent}`);
  } else {
    console.warn('Status text element not found');
  }
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

// Function to setup observation click handlers
function setupObservationClickHandlers() {
  if (!isObservationsListPage()) return;

  const observations = document.querySelectorAll('.thumbnail a[href*="/observations/"]');

  observations.forEach((element) => {
    // Skip if already has handler
    if (element._hasClickHandler) return;

    element._clickHandler = (event) => {
      handleObservationClick(event, element);
    };

    element.addEventListener('click', element._clickHandler);
    element._hasClickHandler = true;
  });
}
