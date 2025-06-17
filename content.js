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
    
  }, 500); // Give page time to load
  
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
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
