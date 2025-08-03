document.addEventListener('DOMContentLoaded', function() {
  const fillButtonAlive = document.getElementById('fillFieldsAlive');
  const fillButtonDead = document.getElementById('fillFieldsDead');
  const fillButtonJuvenile = document.getElementById('fillFieldsJuvenile');
  const fillButtonJuvenileDead = document.getElementById('fillFieldsJuvenileDead');
  const fillButtonAgeUnknown = document.getElementById('fillFieldsAgeUnknown');
  const openUrlButton = document.getElementById('openUrl');
  const toggleBulkModeButton = document.getElementById('toggleBulkMode');
  const bulkCounter = document.getElementById('bulkCounter');
  const startBulkProcessButton = document.getElementById('startBulkProcess');
  const statusDiv = document.getElementById('status');
  
  let bulkModeActive = false;
  let selectedAnnotationType = null;
  let selectedCount = 0;
  
  // Check if bulk mode is already active when popup opens
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getBulkModeStatus'}, function(response) {
      if (response && response.active) {
        bulkModeActive = true;
        selectedAnnotationType = response.annotationType;
        selectedCount = response.selectedCount || 0;
        updateBulkModeUI();
      }
    });
  });
  const usernameDisplay = document.getElementById('username-display');
  const usernameInput = document.getElementById('username-input');
  
  let currentUsername = 'portioid';
  
  if (!usernameDisplay || !usernameInput) {
    console.error('Username elements not found');
    return;
  }
  
  chrome.storage.sync.get(['username'], function(result) {
    if (result.username) {
      currentUsername = result.username;
      usernameDisplay.textContent = currentUsername;
    }
  });

  // Normal functionality for fillButtonAlive is now handled above in the bulk mode section

  // Normal functionality for fillButtonDead is now handled above in the bulk mode section

  // Normal functionality for fillButtonJuvenile is now handled above in the bulk mode section

  // Normal functionality for fillButtonJuvenileDead is now handled above in the bulk mode section

  // Normal functionality for fillButtonAgeUnknown is now handled above in the bulk mode section

  openUrlButton.addEventListener('click', function() {
    chrome.tabs.create({
      url: `https://www.inaturalist.org/observations?taxon_id=1&user_id=${currentUsername}&without_term_id=17`
    });
  });

  toggleBulkModeButton.addEventListener('click', function() {
    if (bulkModeActive) {
      // Exit bulk mode
      statusDiv.textContent = 'Exiting bulk mode...';
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'toggleBulkMode'}, function(response) {
          bulkModeActive = false;
          selectedAnnotationType = null;
          selectedCount = 0;
          updateBulkModeUI();
          statusDiv.textContent = 'Bulk mode disabled';
          statusDiv.style.color = 'green';
        });
      });
    } else {
      // Enter bulk mode - just update UI, don't create overlay yet
      bulkModeActive = true;
      selectedAnnotationType = null;
      selectedCount = 0;
      updateBulkModeUI();
      statusDiv.textContent = 'Step 1: Choose annotation type above';
      statusDiv.style.color = '#666';
    }
  });
  
  // Function to update bulk mode UI
  function updateBulkModeUI() {
    if (bulkModeActive) {
      document.body.classList.add('bulk-mode-active');
      toggleBulkModeButton.textContent = 'Exit Bulk Mode';
      toggleBulkModeButton.style.backgroundColor = '#f44336';
      
      if (selectedAnnotationType) {
        bulkCounter.classList.add('active');
        bulkCounter.textContent = `${selectedCount} observations selected`;
        
        // Highlight the selected annotation button
        clearButtonSelections();
        const button = getButtonForMode(selectedAnnotationType);
        if (button) {
          button.style.border = '3px solid #4CAF50';
          button.style.transform = 'scale(1.05)';
        }
        
        if (selectedCount > 0) {
          startBulkProcessButton.classList.add('active');
          statusDiv.textContent = `Step 3: Click "Start Processing" to process ${selectedCount} observations`;
          statusDiv.style.color = '#2196F3';
        } else {
          startBulkProcessButton.classList.remove('active');
          statusDiv.textContent = 'Step 2: Click observations on the page to select them';
          statusDiv.style.color = '#666';
        }
      } else {
        bulkCounter.classList.remove('active');
        startBulkProcessButton.classList.remove('active');
        clearButtonSelections();
      }
    } else {
      document.body.classList.remove('bulk-mode-active');
      bulkCounter.classList.remove('active');
      startBulkProcessButton.classList.remove('active');
      toggleBulkModeButton.textContent = 'Bulk Mark Mode';
      toggleBulkModeButton.style.backgroundColor = '#2196F3';
      clearButtonSelections();
    }
  }
  
  // Function to get button element for mode
  function getButtonForMode(mode) {
    switch(mode) {
      case 'adult-alive': return fillButtonAlive;
      case 'adult-dead': return fillButtonDead;
      case 'juvenile': return fillButtonJuvenile;
      case 'juvenile-dead': return fillButtonJuvenileDead;
      case 'age-unknown': return fillButtonAgeUnknown;
      default: return null;
    }
  }
  
  // Function to clear button selections
  function clearButtonSelections() {
    [fillButtonAlive, fillButtonDead, fillButtonJuvenile, fillButtonJuvenileDead, fillButtonAgeUnknown].forEach(button => {
      if (button) {
        button.style.border = '';
        button.style.transform = '';
      }
    });
  }
  
  // Function to select annotation button
  function selectAnnotationButton(button, mode, description) {
    if (!bulkModeActive) return;
    
    selectedAnnotationType = mode;
    statusDiv.textContent = `Step 2: Selected ${description}. Now click observations on the page.`;
    statusDiv.style.color = '#4CAF50';
    
    // Send annotation type to content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'setBulkAnnotationType', mode: mode}, function(response) {
        if (response && response.success) {
          updateBulkModeUI();
        }
      });
    });
  }
  
  // Add click handlers to existing annotation buttons for bulk mode
  fillButtonAlive.addEventListener('click', function(e) {
    if (bulkModeActive) {
      e.preventDefault();
      selectAnnotationButton(fillButtonAlive, 'adult-alive', 'Adult Live');
      return;
    }
    
    // Normal functionality
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsAlive'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  fillButtonDead.addEventListener('click', function(e) {
    if (bulkModeActive) {
      e.preventDefault();
      selectAnnotationButton(fillButtonDead, 'adult-dead', 'Adult Dead');
      return;
    }
    
    // Normal functionality
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsDead'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  fillButtonJuvenile.addEventListener('click', function(e) {
    if (bulkModeActive) {
      e.preventDefault();
      selectAnnotationButton(fillButtonJuvenile, 'juvenile', 'Juvenile');
      return;
    }
    
    // Normal functionality
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsJuvenile'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  fillButtonJuvenileDead.addEventListener('click', function(e) {
    if (bulkModeActive) {
      e.preventDefault();
      selectAnnotationButton(fillButtonJuvenileDead, 'juvenile-dead', 'Juvenile Dead');
      return;
    }
    
    // Normal functionality
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsJuvenileDead'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  fillButtonAgeUnknown.addEventListener('click', function(e) {
    if (bulkModeActive) {
      e.preventDefault();
      selectAnnotationButton(fillButtonAgeUnknown, 'age-unknown', 'Age Unknown');
      return;
    }
    
    // Normal functionality
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsAgeUnknown'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  // Start bulk processing button
  startBulkProcessButton.addEventListener('click', function() {
    if (!selectedAnnotationType || selectedCount === 0) {
      statusDiv.textContent = 'Please select observations and annotation type first';
      statusDiv.style.color = 'red';
      return;
    }
    
    statusDiv.textContent = `Processing ${selectedCount} observations...`;
    statusDiv.style.color = '#FF9800';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'processBulkSelection', mode: selectedAnnotationType}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error processing observations';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = response.message;
          statusDiv.style.color = 'green';
          // Reset bulk mode after processing
          setTimeout(() => {
            bulkModeActive = false;
            updateBulkModeUI();
          }, 3000);
        } else {
          statusDiv.textContent = 'No observations selected';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });
  
  // Listen for bulk mode updates from content script
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === 'bulkModeUpdate') {
      if (request.active !== undefined) {
        selectedCount = request.selectedCount || 0;
        selectedAnnotationType = request.annotationType;
        updateBulkModeUI();
      }
    } else if (request.action === 'bulkModeExited') {
      bulkModeActive = false;
      selectedAnnotationType = null;
      selectedCount = 0;
      updateBulkModeUI();
    }
  });

  usernameDisplay.addEventListener('click', function() {
    console.log('Username clicked');
    usernameDisplay.style.display = 'none';
    usernameInput.style.display = 'block';
    usernameInput.value = currentUsername;
    usernameInput.focus();
    usernameInput.select();
  });

  function saveUsername() {
    const newUsername = usernameInput.value.trim();
    if (newUsername) {
      currentUsername = newUsername;
      usernameDisplay.textContent = currentUsername;
      chrome.storage.sync.set({username: currentUsername});
    }
    usernameInput.style.display = 'none';
    usernameDisplay.style.display = 'block';
  }

  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveUsername();
    }
    if (e.key === 'Escape') {
      usernameInput.style.display = 'none';
      usernameDisplay.style.display = 'block';
    }
  });
});
