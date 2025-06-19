// Background script for handling bulk observation processing

// Staggered processing configuration - optimized for slow connections
const MAX_CONCURRENT_TABS = 4; // Further reduced for slow connection stability
const STAGGER_DELAY = 400; // Increased delay between starting each tab for slow connections
let processingTabs = new Map(); // Track active processing tabs
let isProcessingBulk = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processObservationInNewTab') {
    // Legacy single processing - keep for compatibility
    processObservationInNewTab(request.observationId, request.url, request.mode)
      .then(result => sendResponse({success: true, result}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Will respond asynchronously
  } else if (request.action === 'processBulkObservationsStaggered') {
    // New staggered processing - track the sender tab ID
    const sourceTabId = sender.tab.id;
    processBulkObservationsStaggered(request.observations, request.mode, sourceTabId)
      .then(results => sendResponse({success: true, results}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Will respond asynchronously
  }
});

// New staggered processing function
async function processBulkObservationsStaggered(observations, mode = 'adult-alive', sourceTabId) {
  console.log(`Starting staggered processing of ${observations.length} observations with max ${MAX_CONCURRENT_TABS} concurrent tabs`);
  
  const startTime = Date.now(); // Track start time
  isProcessingBulk = true;
  const results = [];
  let completed = 0;
  let errors = 0;
  let verified = 0;
  let activeTabs = 0;

  // Function to send progress updates to the specific source tab
  const sendProgressUpdate = (isComplete = false) => {
    const elapsedTime = Date.now() - startTime;
    console.log(`Sending progress update: ${completed}/${observations.length} (${verified} verified, ${errors} errors) to tab ${sourceTabId}`);
    
    chrome.tabs.sendMessage(sourceTabId, {
      action: 'bulkProcessingProgress',
      completed: completed,
      errors: errors,
      verified: verified,
      total: observations.length,
      remaining: observations.length - completed,
      elapsedTime: elapsedTime,
      isComplete: isComplete
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn(`Failed to send progress update to tab ${sourceTabId}:`, chrome.runtime.lastError.message);
      } else {
        console.log(`Progress update sent successfully to tab ${sourceTabId}`);
      }
    });
  };

  try {
    // Process all observations sequentially but with concurrent execution
    for (let i = 0; i < observations.length; i++) {
      // Wait if we've hit the concurrent limit - adaptive waiting for slow connections
      while (activeTabs >= MAX_CONCURRENT_TABS) {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
      }
      
      const observationId = observations[i];
      activeTabs++;
      
      console.log(`Starting observation ${observationId} (${i + 1}/${observations.length}, ${activeTabs} active)`);
      
      // Process this observation and track completion
      processObservationWithCleanup(observationId, mode)
        .then(result => {
          activeTabs--;
          completed++;
          
          // Track verified observations
          if (result.verified) {
            verified++;
          }
          
          console.log(`Completed observation ${observationId} (${completed}/${observations.length}) - Verified: ${result.verified}`);
          results.push(result);
          
          // Send progress update
          sendProgressUpdate();
        })
        .catch(error => {
          activeTabs--;
          completed++;
          errors++;
          
          console.error(`Failed observation ${observationId}:`, error);
          results.push({ observationId, error: error.message });
          
          // Send progress update
          sendProgressUpdate();
        });
      
      // Stagger the starts
      if (i < observations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY));
      }
    }
    
    // Wait for all observations to actually complete
    console.log(`All ${observations.length} observations started. Waiting for completion...`);
    
    while (completed < observations.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Send final completion update
    const totalTime = Date.now() - startTime;
    console.log(`All processing complete! Final counts: completed=${completed}, errors=${errors}, verified=${verified}, total=${observations.length}. Total time: ${totalTime}ms`);
    
    sendProgressUpdate(true);
    
    return results;
  } finally {
    isProcessingBulk = false;
    console.log(`Staggered processing completed: ${results.length} total results`);
  }
}

// Process a single observation with automatic cleanup
async function processObservationWithCleanup(observationId, mode = 'adult-alive') {
  let tabId = null;
  
  try {
    // Create a new tab for this observation
    const tab = await createNewTab();
    tabId = tab.id;
    
    // Process the observation
    const result = await processObservationInExistingTab(tabId, observationId, mode);
    return result;
    
  } finally {
    // Always clean up the tab
    if (tabId) {
      try {
        await new Promise(resolve => {
          chrome.tabs.remove(tabId, () => resolve());
        });
      } catch (error) {
        console.error(`Error closing tab ${tabId}:`, error);
      }
    }
  }
}

// Create a new tab
function createNewTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({
      url: 'about:blank',
      active: false
    }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tab);
      }
    });
  });
}

// Process an observation in an existing tab
async function processObservationInExistingTab(tabId, observationId, mode = 'adult-alive') {
  return new Promise((resolve, reject) => {
    const url = `https://www.inaturalist.org/observations/${observationId}`;
    console.log(`Processing observation ${observationId} in tab ${tabId}`);
    
    // Navigate to the observation URL
    chrome.tabs.update(tabId, { url: url }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Wait for tab to load
      const tabLoadListener = (changedTabId, changeInfo, updatedTab) => {
        if (changedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabLoadListener);
          
          // Wait for page to be fully ready
          setTimeout(() => {
            // Determine the action based on mode
            let action;
            switch(mode) {
              case 'adult-dead':
                action = 'fillFieldsDead';
                break;
              case 'juvenile':
                action = 'fillFieldsJuvenile';
                break;
              case 'juvenile-dead':
                action = 'fillFieldsJuvenileDead';
                break;
              case 'age-unknown':
                action = 'fillFieldsAgeUnknown';
                break;
              default:
                action = 'fillFieldsAlive';
            }
            
            console.log(`Sending ${action} to tab ${tabId} for observation ${observationId}`);
            
            // Send message to content script to fill fields
            chrome.tabs.sendMessage(tabId, {
              action: action
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error(`Error sending message to tab ${tabId}:`, chrome.runtime.lastError);
                reject(new Error(`Failed to communicate with tab: ${chrome.runtime.lastError.message}`));
                return;
              }
              
              console.log(`Response from tab ${tabId} for observation ${observationId}:`, response);
              
              if (!response) {
                reject(new Error(`No response from content script in tab ${tabId}`));
                return;
              }
              
              if (!response.success) {
                // Only reject on actual script errors, not verification issues
                if (!response.lenientSuccess) {
                  reject(new Error(`Content script failed: ${response.error || 'Unknown error'}`));
                  return;
                }
              }
              
              // Wait longer for fields to be actually filled before resolving
              setTimeout(() => {
                console.log(`Successfully processed observation ${observationId} in tab ${tabId}, fields: ${response.fieldsFound || 0}/${response.expectedFields || 0}, verified: ${response.verified}`);
                resolve({
                  observationId, 
                  fieldsFound: response.fieldsFound || 0, 
                  expectedFields: response.expectedFields || 0,
                  verified: response.verified,
                  tabId
                });
              }, 4000); // Extended wait time for slow connections to ensure all fields are filled
            });
          }, 3000); // Extended wait time for slow connections
        }
      };
      
      chrome.tabs.onUpdated.addListener(tabLoadListener);
      
      // Extended timeout for slow connections
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(tabLoadListener);
        reject(new Error(`Timeout processing observation ${observationId} in tab ${tabId}`));
      }, 30000);
    });
  });
}

// Legacy single processing function - keep for compatibility
async function processObservationInNewTab(observationId, url, mode = 'adult-alive') {
  return new Promise((resolve, reject) => {
    console.log(`Opening tab for observation ${observationId}: ${url} with mode: ${mode}`);
    
    // Create new tab
    chrome.tabs.create({
      url: url,
      active: false // Don't focus the tab
    }, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      // Wait for tab to load
      const tabLoadListener = (tabId, changeInfo, updatedTab) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(tabLoadListener);
          
          // Quick wait for page to be ready
          setTimeout(() => {
            // Determine the action based on mode
            let action;
            switch(mode) {
              case 'adult-dead':
                action = 'fillFieldsDead';
                break;
              case 'juvenile':
                action = 'fillFieldsJuvenile';
                break;
              case 'juvenile-dead':
                action = 'fillFieldsJuvenileDead';
                break;
              case 'age-unknown':
                action = 'fillFieldsAgeUnknown';
                break;
              default:
                action = 'fillFieldsAlive';
            }
            
            console.log(`Sending ${action} to tab ${tab.id}`);
            
            // Send message to content script to fill fields
            chrome.tabs.sendMessage(tab.id, {
              action: action
            }, (response) => {
              console.log(`Response from tab ${tab.id}:`, response);
              
              // Quick wait for fields to be filled, then close tab
              setTimeout(() => {
                chrome.tabs.remove(tab.id, () => {
                  console.log(`Processed and closed tab for observation ${observationId}`);
                  resolve({observationId, fieldsFound: response?.fieldsFound || 0});
                });
              }, 800); // Reduced wait time
            });
          }, 500); // Reduced wait time for page load
        }
      };
      
      chrome.tabs.onUpdated.addListener(tabLoadListener);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(tabLoadListener);
        chrome.tabs.remove(tab.id, () => {
          reject(new Error(`Timeout processing observation ${observationId}`));
        });
      }, 10000);
    });
  });
}