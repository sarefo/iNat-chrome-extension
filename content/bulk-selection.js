// Function to select all visible observations
function selectAllObservations() {
  if (!bulkSelectionMode || !bulkAnnotationMode) return;

  const observations = document.querySelectorAll('.thumbnail a[href*="/observations/"]');
  observations.forEach((observationElement) => {
    const href = observationElement.getAttribute('href');
    if (!href || !href.includes('/observations/')) return;

    const observationDiv = observationElement.closest('.observation.observation-grid-cell');
    if (!observationDiv) return;

    const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];

    if (!selectedObservations.has(observationId)) {
      selectedObservations.add(observationId);
      markSelected(observationDiv);
    }
  });

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
  if (!bulkSelectionMode) return;

  event.preventDefault();
  event.stopPropagation();

  const href = observationElement.getAttribute('href');
  if (!href || !href.includes('/observations/')) return;

  const observationDiv = observationElement.closest('.observation.observation-grid-cell');
  if (!observationDiv) return;

  const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];

  if (event.ctrlKey) {
    // Ctrl+click: deselect (if selected) and open in new tab
    if (selectedObservations.has(observationId)) {
      selectedObservations.delete(observationId);
      markDeselected(observationDiv);
      saveCurrentCollection();
      updateSelectionUI();
    }
    window.open(`https://www.inaturalist.org/observations/${observationId}`, '_blank');
    return;
  }

  if (selectedObservations.has(observationId)) {
    selectedObservations.delete(observationId);
    markDeselected(observationDiv);
  } else {
    selectedObservations.add(observationId);
    markSelected(observationDiv);
  }

  saveCurrentCollection();
  updateSelectionUI();
}

// Ctrl+right-click: deselect (if selected) and open observation in new tab
function handleObservationContextMenu(event, observationElement) {
  if (!bulkSelectionMode) return;
  if (!event.ctrlKey) return; // only intercept Ctrl+right-click

  event.preventDefault();
  event.stopPropagation();

  const href = observationElement.getAttribute('href');
  if (!href || !href.includes('/observations/')) return;

  const observationDiv = observationElement.closest('.observation.observation-grid-cell');
  const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];

  if (selectedObservations.has(observationId)) {
    selectedObservations.delete(observationId);
    if (observationDiv) markDeselected(observationDiv);
    saveCurrentCollection();
    updateSelectionUI();
  }

  window.open(`https://www.inaturalist.org/observations/${observationId}`, '_blank');
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
    element._contextMenuHandler = (event) => {
      handleObservationContextMenu(event, element);
    };

    element.addEventListener('click', element._clickHandler);
    element.addEventListener('contextmenu', element._contextMenuHandler);
    element._hasClickHandler = true;
  });
}
