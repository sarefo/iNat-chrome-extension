// Background script for handling bulk observation processing

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processObservationInNewTab') {
    processObservationInNewTab(request.observationId, request.url, request.mode)
      .then(result => sendResponse({success: true, result}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true; // Will respond asynchronously
  }
});

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