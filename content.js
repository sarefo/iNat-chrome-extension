function fillObservationFields(mode = 'adult-alive') {
  let fieldsFound = 0;
  
  // Wait for page to be fully loaded
  setTimeout(() => {
    // Function to click dropdown and select option
    function selectDropdownOption(dropdown, optionText) {
      try {
        // Click the dropdown to open it
        dropdown.click();
        
        // Wait a moment for dropdown to open, then find and click the option
        setTimeout(() => {
          const dropdownMenu = dropdown.nextElementSibling;
          if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
            const options = dropdownMenu.querySelectorAll('a[role="menuitem"]');
            
            for (const option of options) {
              if (option.textContent.trim().toLowerCase() === optionText.toLowerCase()) {
                option.click();
                fieldsFound++;
                return true;
              }
            }
          }
          return false;
        }, 100);
      } catch (error) {
        console.error('Error selecting dropdown option:', error);
        return false;
      }
    }

    // Function to find and select the best juvenile life stage
    function selectJuvenileLifeStage(dropdown) {
      try {
        dropdown.click();
        
        setTimeout(() => {
          const dropdownMenu = dropdown.nextElementSibling;
          if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
            const options = dropdownMenu.querySelectorAll('a[role="menuitem"]');
            
            // Priority order for juvenile life stages
            const juvenileOptions = ['larva', 'nymph', 'juvenile'];
            
            for (const juvenileType of juvenileOptions) {
              for (const option of options) {
                const optionText = option.textContent.trim().toLowerCase();
                if (optionText === juvenileType) {
                  option.click();
                  fieldsFound++;
                  return true;
                }
              }
            }
          }
          return false;
        }, 100);
      } catch (error) {
        console.error('Error selecting juvenile life stage:', error);
        return false;
      }
    }
    
    // Find the annotations table
    const annotationsTable = document.querySelector('.Annotations table');
    if (!annotationsTable) {
      console.log('Annotations table not found');
      return;
    }
    
    // Get all rows in the table body
    const rows = annotationsTable.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
      const attributeCell = row.querySelector('td.attribute div');
      if (!attributeCell) return;
      
      const attributeTitle = attributeCell.getAttribute('title') || attributeCell.textContent.trim();
      const dropdown = row.querySelector('button.dropdown-toggle');
      
      if (!dropdown) return;
      
      // Check which field this is and fill accordingly
      if (attributeTitle.includes('Alive or Dead')) {
        const aliveOrDead = (mode === 'adult-dead' || mode === 'juvenile-dead') ? 'Dead' : 'Alive';
        selectDropdownOption(dropdown, aliveOrDead);
      } else if (attributeTitle.includes('Evidence of Presence')) {
        selectDropdownOption(dropdown, 'Organism');
      } else if (attributeTitle.includes('Life Stage')) {
        if (mode === 'juvenile' || mode === 'juvenile-dead') {
          selectJuvenileLifeStage(dropdown);
        } else if (mode === 'age-unknown') {
          // Skip life stage for age unknown
        } else {
          selectDropdownOption(dropdown, 'Adult');
        }
      }
    });
    
  }, 200); // Quick page load wait
  
  return fieldsFound;
}

// Alternative function that uses direct DOM manipulation
function fillObservationFieldsAlternative(mode = 'adult-alive') {
  let fieldsFound = 0;
  
  try {
    // Look for annotations section
    const annotationsSection = document.querySelector('.Annotations');
    if (!annotationsSection) {
      console.log('Annotations section not found');
      return 0;
    }
    
    // Find all dropdown buttons in the annotations section
    const dropdowns = annotationsSection.querySelectorAll('button.dropdown-toggle');
    
    dropdowns.forEach((dropdown, index) => {
      // Find the parent row to get context
      const row = dropdown.closest('tr');
      if (!row) return;
      
      const attributeCell = row.querySelector('td.attribute');
      if (!attributeCell) return;
      
      const attributeText = attributeCell.textContent.toLowerCase();
      
      // Simulate clicking the dropdown and selecting the appropriate option
      if (attributeText.includes('alive') || attributeText.includes('dead')) {
        // For "Alive or Dead" field
        setTimeout(() => {
          dropdown.click();
          setTimeout(() => {
            const targetOption = (mode === 'adult-dead' || mode === 'juvenile-dead') ? 
              document.querySelector('a[title*="Dead"]') : 
              document.querySelector('a[title*="living"]');
            if (targetOption) {
              targetOption.click();
              fieldsFound++;
            }
          }, 150);
        }, index * 300);
        
      } else if (attributeText.includes('evidence')) {
        // For "Evidence of Presence" field
        setTimeout(() => {
          dropdown.click();
          setTimeout(() => {
            const organismOption = document.querySelector('a[title*="Whole or partial organism"]');
            if (organismOption) {
              organismOption.click();
              fieldsFound++;
            }
          }, 150);
        }, index * 300);
        
      } else if (attributeText.includes('life') && attributeText.includes('stage')) {
        // For "Life Stage" field
        setTimeout(() => {
          dropdown.click();
          setTimeout(() => {
            if (mode === 'juvenile' || mode === 'juvenile-dead') {
              // Look for juvenile life stages in priority order
              const juvenileSelectors = [
                'a[title*="larva"]', 'a[title*="Larva"]',
                'a[title*="nymph"]', 'a[title*="Nymph"]', 
                'a[title*="juvenile"]', 'a[title*="Juvenile"]'
              ];
              
              let found = false;
              for (const selector of juvenileSelectors) {
                const juvenileOption = document.querySelector(selector);
                if (juvenileOption) {
                  juvenileOption.click();
                  fieldsFound++;
                  found = true;
                  break;
                }
              }
            } else if (mode === 'age-unknown') {
              // Skip life stage for age unknown
            } else {
              const adultOption = document.querySelector('a[title="Adult"]');
              if (adultOption) {
                adultOption.click();
                fieldsFound++;
              }
            }
          }, 150);
        }, index * 300);
      }
    });
    
  } catch (error) {
    console.error('Error in fillObservationFieldsAlternative:', error);
  }
  
  return fieldsFound;
}

// Global variables for bulk selection mode
let bulkSelectionMode = false;
let selectedObservations = new Set();
let bulkModeButtons = null;
let bulkAnnotationMode = 'adult-alive'; // Default mode

// Function to check if we're on a supported observations list page
function isObservationsListPage() {
  const url = window.location.href;
  return url.includes('/observations?') && 
         url.includes('taxon_id=47120') && 
         url.includes('user_id=') && 
         url.includes('without_term_id=17');
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
  
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = `
    display: flex;
    gap: 10px;
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
  buttonRow.appendChild(processButton);
  buttonRow.appendChild(cancelButton);
  
  container.appendChild(statusText);
  container.appendChild(annotationDisplay);
  container.appendChild(buttonRow);
  
  document.body.appendChild(container);
  bulkModeButtons = container;
  
  // Start selection mode only if annotation type is set
  bulkSelectionMode = !!bulkAnnotationMode;
  
  // Event listeners
  processButton.addEventListener('click', () => {
    if (selectedObservations.size > 0 && bulkAnnotationMode) {
      processBulkSelection(bulkAnnotationMode);
    }
  });
  
  cancelButton.addEventListener('click', () => {
    exitBulkMode();
  });
}

// Function to get display name for annotation mode
function getAnnotationDisplayName(mode) {
  switch(mode) {
    case 'adult-alive': return '🦆 Adult Live';
    case 'adult-dead': return '💀 Adult Dead';
    case 'juvenile': return '🐛 Juvenile';
    case 'juvenile-dead': return '💀 Juvenile Dead';
    case 'age-unknown': return '❓ Age Unknown';
    default: return 'Unknown';
  }
}

// Function to update selection UI
function updateSelectionUI() {
  const counter = document.getElementById('selection-counter');
  const processButton = document.getElementById('bulk-process-button');
  const statusText = document.getElementById('bulk-status-text');
  const annotationDisplay = document.getElementById('annotation-display');
  
  if (counter) {
    counter.textContent = `${selectedObservations.size} selected`;
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
    // Ignore any errors if popup isn't open
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
  
  // Extract just the numeric ID from href like "/observations/259115368"
  const observationId = href.split('/observations/')[1].split('?')[0].split('#')[0];
  console.log('Observation ID:', observationId);
  
  if (selectedObservations.has(observationId)) {
    selectedObservations.delete(observationId);
    observationElement.style.border = '';
    observationElement.style.boxShadow = '';
    console.log('Deselected observation:', observationId);
  } else {
    selectedObservations.add(observationId);
    observationElement.style.border = '3px solid #4CAF50';
    observationElement.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.5)';
    console.log('Selected observation:', observationId);
  }
  
  updateSelectionUI();
}

// Function to process bulk selection
async function processBulkSelection(mode = 'adult-alive') {
  if (selectedObservations.size === 0) return;
  
  const counter = document.getElementById('selection-counter');
  const statusText = document.getElementById('bulk-status-text');
  
  if (statusText) {
    statusText.textContent = 'Processing observations...';
    statusText.style.color = '#FF9800';
  }
  
  let processed = 0;
  const total = selectedObservations.size;
  
  for (const observationId of selectedObservations) {
    const startTime = Date.now();
    
    try {
      await processObservation(observationId, mode);
      processed++;
      
      if (counter) {
        counter.textContent = `${processed}/${total} processed`;
      }
      
      // Smart rate limiting: only wait if processing took less than 1 second
      if (processed < total) {
        const processingTime = Date.now() - startTime;
        const minimumInterval = 1000; // 1 second minimum between requests
        
        if (processingTime < minimumInterval) {
          const waitTime = minimumInterval - processingTime;
          console.log(`Waiting ${waitTime}ms to maintain rate limit`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          console.log(`Processing took ${processingTime}ms, no additional wait needed`);
        }
      }
    } catch (error) {
      console.error(`Error processing observation ${observationId}:`, error);
    }
  }
  
  // Reset UI
  if (counter) {
    counter.textContent = `Completed: ${processed}/${total}`;
  }
  
  if (statusText) {
    statusText.textContent = `Completed processing ${processed} observations`;
    statusText.style.color = '#4CAF50';
  }
  
  setTimeout(() => {
    exitBulkMode();
  }, 3000);
}

// Function to process individual observation
async function processObservation(observationId, mode = 'adult-alive') {
  return new Promise((resolve, reject) => {
    console.log(`Processing observation: ${observationId} with mode: ${mode}`);
    
    // Use chrome.tabs API through background script to open and process
    chrome.runtime.sendMessage({
      action: 'processObservationInNewTab',
      observationId: observationId,
      url: `https://www.inaturalist.org/observations/${observationId}`,
      mode: mode
    }, (response) => {
      if (response && response.success) {
        console.log(`Successfully processed observation ${observationId}`);
      } else {
        console.error(`Failed to process observation ${observationId}:`, response?.error);
      }
      resolve();
    });
  });
}

// Function to exit bulk mode
function exitBulkMode() {
  console.log('Exiting bulk mode');
  bulkSelectionMode = false;
  bulkAnnotationMode = null;
  selectedObservations.clear();
  
  // Remove selection styling from all observations
  document.querySelectorAll('.thumbnail a[href*="/observations/"]').forEach(element => {
    element.style.border = '';
    element.style.boxShadow = '';
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
    
    // Create new handler
    element._clickHandler = (event) => {
      handleObservationClick(event, element);
    };
    
    element.addEventListener('click', element._clickHandler);
    element._hasClickHandler = true;
  });
}

// Message listener for processing individual observations
window.addEventListener('message', (event) => {
  if (event.data.type === 'observationProcessed') {
    console.log(`Processed observation ${event.data.observationId}, fields found: ${event.data.fieldsFound}`);
  } else if (event.data.type === 'fillFields') {
    // Handle fill request from bulk processor
    const mode = event.data.mode || 'adult-alive';
    let fieldsFound = fillObservationFields(mode);
    if (fieldsFound === 0) {
      fieldsFound = fillObservationFieldsAlternative(mode);
    }
    console.log(`Filled ${fieldsFound} fields in observation`);
  }
});

// Only initialize observation click handlers, don't show UI automatically
if (isObservationsListPage()) {
  console.log('On supported observations list page');
  
  // Re-setup handlers when page content changes (for pagination)
  let setupTimeout = null;
  const observer = new MutationObserver((mutations) => {
    // Only process if bulk mode is active and we haven't scheduled a setup already
    if (!bulkSelectionMode || setupTimeout) return;
    
    let hasNewContent = false;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        // Check if any added nodes contain observation links
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && // Element node
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'toggleBulkMode') {
    if (!isObservationsListPage()) {
      sendResponse({success: false, message: 'Not on a supported observations page'});
      return;
    }
    
    if (bulkModeButtons) {
      exitBulkMode();
      sendResponse({success: true, message: 'Bulk mode disabled'});
    } else {
      createBulkModeUI();
      setupObservationClickHandlers();
      sendResponse({success: true, message: 'Bulk mode enabled - click observations to select them'});
    }
    return;
  }
  
  if (request.action === 'setBulkAnnotationType') {
    if (!isObservationsListPage()) {
      sendResponse({success: false, message: 'Not on a supported observations page'});
      return;
    }
    
    bulkAnnotationMode = request.mode;
    
    // Create UI if it doesn't exist
    if (!bulkModeButtons) {
      createBulkModeUI();
      setupObservationClickHandlers();
    }
    
    // Enable selection mode
    bulkSelectionMode = true;
    updateSelectionUI();
    
    sendResponse({success: true, message: `Annotation type set to ${getAnnotationDisplayName(request.mode)}`});
    return;
  }
  
  if (request.action === 'processBulkSelection') {
    if (!bulkSelectionMode || selectedObservations.size === 0) {
      sendResponse({success: false, message: 'No observations selected or bulk mode not active'});
      return;
    }
    
    processBulkSelection(request.mode || bulkAnnotationMode || 'adult-alive');
    sendResponse({success: true, message: `Processing ${selectedObservations.size} observations with ${request.mode || bulkAnnotationMode || 'adult-alive'} annotations`});
    return;
  }
  
  if (request.action === 'fillFieldsAlive' || request.action === 'fillFieldsDead' || request.action === 'fillFieldsJuvenile' || request.action === 'fillFieldsJuvenileDead' || request.action === 'fillFieldsAgeUnknown') {
    try {
      // Check if we're on an observation page
      if (!window.location.pathname.includes('/observations/')) {
        sendResponse({success: false, error: 'Not on an observation page'});
        return;
      }
      
      // Determine the mode based on the action
      let mode;
      let description;
      switch (request.action) {
        case 'fillFieldsAlive':
          mode = 'adult-alive';
          description = 'adult alive organism';
          break;
        case 'fillFieldsDead':
          mode = 'adult-dead';
          description = 'adult dead organism';
          break;
        case 'fillFieldsJuvenile':
          mode = 'juvenile';
          description = 'juvenile organism';
          break;
        case 'fillFieldsJuvenileDead':
          mode = 'juvenile-dead';
          description = 'juvenile dead organism';
          break;
        case 'fillFieldsAgeUnknown':
          mode = 'age-unknown';
          description = 'age unknown organism';
          break;
      }
      
      // Try the main method first
      let fieldsFound = fillObservationFields(mode);
      
      // If that didn't work, try the alternative method
      if (fieldsFound === 0) {
        fieldsFound = fillObservationFieldsAlternative(mode);
      }
      
      // Give some time for the operations to complete
      setTimeout(() => {
        sendResponse({
          success: true, 
          fieldsFound: fieldsFound,
          message: `Attempted to fill ${fieldsFound} fields for ${description}`
        });
      }, 2000);
      
      return true; // Will respond asynchronously
      
    } catch (error) {
      console.error('Error filling fields:', error);
      sendResponse({success: false, error: error.message});
    }
  }
});

// Add some debugging to see what's available on the page
console.log('iNaturalist Auto Filler extension loaded');

// Check if we're on the right page
if (window.location.hostname.includes('inaturalist.org')) {
  console.log('On iNaturalist page:', window.location.pathname);
  
  // Log available annotations
  setTimeout(() => {
    const annotations = document.querySelector('.Annotations');
    if (annotations) {
      console.log('Annotations section found');
      const dropdowns = annotations.querySelectorAll('button.dropdown-toggle');
      console.log('Found', dropdowns.length, 'dropdown buttons');
    } else {
      console.log('No annotations section found');
    }
  }, 1000);
}
