function fillObservationFields(mode = 'adult-alive') {
  let fieldsFound = 0;

  console.log(`fillObservationFields called with mode: ${mode}`);

  // Check if annotations section exists
  const annotationsTable = document.querySelector('.Annotations table');
  if (!annotationsTable) {
    console.log('No annotations table found');
    return 0;
  }

  console.log('Annotations table found, checking for dropdowns...');

  // Wait for page to be fully loaded
  setTimeout(() => {
    // Function to click dropdown and select option with retry logic
    function selectDropdownOption(dropdown, optionText, maxRetries = 3) {
      return new Promise((resolve) => {
        let retryCount = 0;

        function attemptSelection() {
          try {

            console.log(`Attempt ${retryCount + 1}/${maxRetries + 1}: Selecting option "${optionText}"`);

            // Click the dropdown to open it
            dropdown.click();

            // Adaptive wait time based on connection speed
            const baseDelay = 200;
            const adaptiveDelay = baseDelay + (retryCount * 100); // Increase delay on retries

            setTimeout(() => {
              const dropdownMenu = dropdown.nextElementSibling;
              if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
                const options = dropdownMenu.querySelectorAll('a[role="menuitem"]');
                console.log(`Found ${options.length} dropdown options`);

                if (options.length === 0 && retryCount < maxRetries) {
                  console.log('No options found, retrying...');
                  retryCount++;
                  setTimeout(attemptSelection, 500 + (retryCount * 200));
                  return;
                }

                for (const option of options) {
                  const optionInnerText = option.textContent.trim().toLowerCase();
                  console.log(`Checking option: "${optionInnerText}"`);

                  // More flexible matching for "Alive" option
                  if (optionText.toLowerCase() === 'alive' &&
                      (optionInnerText === 'alive' || optionInnerText.includes('alive'))) {
                    console.log(`Clicking "Alive" option: "${optionInnerText}"`);
                    option.click();
                    fieldsFound++;
                    resolve(true);
                    return;
                  }
                  // More flexible matching for "Adult" option
                  else if (optionText.toLowerCase() === 'adult' &&
                           (optionInnerText === 'adult' || optionInnerText.includes('adult'))) {
                    console.log(`Clicking "Adult" option: "${optionInnerText}"`);
                    option.click();
                    fieldsFound++;
                    resolve(true);
                    return;
                  }
                  // More flexible matching for "Organism" option
                  else if (optionText.toLowerCase() === 'organism' &&
                           (optionInnerText === 'organism' || optionInnerText.includes('organism'))) {
                    console.log(`Clicking "Organism" option: "${optionInnerText}"`);
                    option.click();
                    fieldsFound++;
                    resolve(true);
                    return;
                  }
                  // Exact match fallback
                  else if (optionInnerText === optionText.toLowerCase()) {
                    console.log(`Clicking exact match option: "${optionInnerText}"`);
                    option.click();
                    fieldsFound++;
                    resolve(true);
                    return;
                  }
                }

                console.log(`No matching option found for: "${optionText}"`);
                if (retryCount < maxRetries) {
                  console.log(`Retrying option selection for: "${optionText}"`);
                  retryCount++;
                  setTimeout(attemptSelection, 500 + (retryCount * 200));
                } else {
                  resolve(false);
                }
              } else {
                console.log('Dropdown menu not found or not open');
                if (retryCount < maxRetries) {
                  console.log('Retrying dropdown open...');
                  retryCount++;
                  setTimeout(attemptSelection, 500 + (retryCount * 200));
                } else {
                  resolve(false);
                }
              }
            }, adaptiveDelay);
          } catch (error) {
            console.error('Error selecting dropdown option:', error);
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(attemptSelection, 1000 + (retryCount * 500));
            } else {
              resolve(false);
            }
          }
        }

        attemptSelection();
      });
    }

    // Function to find and select the best juvenile life stage with retry
    function selectJuvenileLifeStage(dropdown, maxRetries = 3) {
      return new Promise((resolve) => {
        let retryCount = 0;

        function attemptJuvenileSelection() {
          try {

            console.log(`Attempt ${retryCount + 1}/${maxRetries + 1}: Selecting juvenile life stage`);
            dropdown.click();

            const baseDelay = 200;
            const adaptiveDelay = baseDelay + (retryCount * 100);

            setTimeout(() => {
              const dropdownMenu = dropdown.nextElementSibling;
              if (dropdownMenu && dropdownMenu.classList.contains('dropdown-menu')) {
                const options = dropdownMenu.querySelectorAll('a[role="menuitem"]');
                console.log(`Found ${options.length} options for juvenile life stage`);

                if (options.length === 0 && retryCount < maxRetries) {
                  console.log('No juvenile options found, retrying...');
                  retryCount++;
                  setTimeout(attemptJuvenileSelection, 500 + (retryCount * 200));
                  return;
                }

                // Priority order for juvenile life stages
                const juvenileOptions = ['larva', 'nymph', 'juvenile'];

                for (const juvenileType of juvenileOptions) {
                  for (const option of options) {
                    const optionText = option.textContent.trim().toLowerCase();
                    console.log(`Checking juvenile option: "${optionText}"`);
                    if (optionText === juvenileType || optionText.includes(juvenileType)) {
                      console.log(`Clicking juvenile option: "${optionText}"`);
                      option.click();
                      fieldsFound++;
                      resolve(true);
                      return;
                    }
                  }
                }

                console.log('No matching juvenile life stage found');
                if (retryCount < maxRetries) {
                  console.log('Retrying juvenile selection...');
                  retryCount++;
                  setTimeout(attemptJuvenileSelection, 500 + (retryCount * 200));
                } else {
                  resolve(false);
                }
              } else {
                console.log('Juvenile dropdown menu not found or not open');
                if (retryCount < maxRetries) {
                  console.log('Retrying juvenile dropdown open...');
                  retryCount++;
                  setTimeout(attemptJuvenileSelection, 500 + (retryCount * 200));
                } else {
                  resolve(false);
                }
              }
            }, adaptiveDelay);
          } catch (error) {
            console.error('Error selecting juvenile life stage:', error);
            if (retryCount < maxRetries) {
              retryCount++;
              setTimeout(attemptJuvenileSelection, 1000 + (retryCount * 500));
            } else {
              resolve(false);
            }
          }
        }

        attemptJuvenileSelection();
      });
    }

    // Find the annotations table
    const annotationsTable = document.querySelector('.Annotations table');
    if (!annotationsTable) {
      console.log('Annotations table not found');
      return;
    }

    // Get all rows in the table body
    const rows = annotationsTable.querySelectorAll('tbody tr');

    // Process rows sequentially to avoid timing conflicts
    const processRowsSequentially = async () => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const attributeCell = row.querySelector('td.attribute div');
        if (!attributeCell) continue;

        const attributeTitle = attributeCell.getAttribute('title') || attributeCell.textContent.trim();
        const dropdown = row.querySelector('button.dropdown-toggle');

        if (!dropdown) continue;

        console.log(`Processing row ${i + 1}/${rows.length}: ${attributeTitle}`);

        if (mode === 'plant-flowers' || mode === 'plant-fruits' || mode === 'plant-no-flowers-fruits') {
          // Handle plant phenology annotations
          if (attributeTitle.includes('Flowers') || attributeTitle.includes('Fruit')) {
            let phenologyOption;
            if (mode === 'plant-flowers') {
              phenologyOption = 'Flowers';
            } else if (mode === 'plant-fruits') {
              phenologyOption = 'Fruits or Seeds';
            } else {
              phenologyOption = 'No Flowers or Fruits';
            }
            await selectDropdownOption(dropdown, phenologyOption);
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
          } else if (attributeTitle.includes('Leaves') || attributeTitle.includes('leaves')) {
            await selectDropdownOption(dropdown, 'Green Leaves');
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
          }
        } else if (attributeTitle.includes('Alive or Dead')) {
          const aliveOrDead = (mode === 'adult-dead' || mode === 'juvenile-dead') ? 'Dead' : 'Alive';
          await selectDropdownOption(dropdown, aliveOrDead);
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
        } else if (attributeTitle.includes('Evidence of Presence')) {
          await selectDropdownOption(dropdown, 'Organism');
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
        } else if (attributeTitle.includes('Life Stage')) {
          if (mode === 'juvenile' || mode === 'juvenile-dead') {
            await selectJuvenileLifeStage(dropdown);
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
          } else if (mode === 'age-unknown') {
            // Skip life stage for age unknown
          } else {
            await selectDropdownOption(dropdown, 'Adult');
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
          }
        }
      }
    };

    // Start sequential processing
    processRowsSequentially().then(() => {
      console.log(`Completed processing ${rows.length} annotation rows`);
    }).catch(error => {
      console.error('Error processing rows:', error);
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

// Function to count actually filled annotation fields
function countFilledFields() {
  let filledCount = 0;

  const annotationsTable = document.querySelector('.Annotations table');
  if (!annotationsTable) {
    console.log('No annotations table found when counting filled fields');
    return 0;
  }

  const rows = annotationsTable.querySelectorAll('tbody tr');

  rows.forEach(row => {
    const dropdown = row.querySelector('button.dropdown-toggle');
    if (!dropdown) return;

    const buttonText = dropdown.textContent.trim();

    // More lenient check - any non-empty text that's not the default placeholder
    const isDefault = buttonText === 'Choose one...' || buttonText === '' || buttonText === 'Choose one';
    if (buttonText && !isDefault) {
      filledCount++;
      console.log(`Found filled field: "${buttonText}"`);
    } else {
      console.log(`Unfilled field: "${buttonText}"`);
    }
  });

  console.log(`Total filled fields: ${filledCount} out of ${rows.length} total fields`);
  return filledCount;
}

// Function to calculate expected number of fields that should be filled
function getExpectedFieldCount(mode) {
  if (!mode) return 0;

  const annotationsTable = document.querySelector('.Annotations table');
  if (!annotationsTable) return 0;

  const rows = annotationsTable.querySelectorAll('tbody tr');
  let expectedFields = 0;

  // Count how many annotation types should be filled based on what's available
  rows.forEach(row => {
    const attributeCell = row.querySelector('td.attribute div');
    if (!attributeCell) return;

    const attributeTitle = attributeCell.getAttribute('title') || attributeCell.textContent.trim();

    if (mode === 'plant-flowers' || mode === 'plant-fruits' || mode === 'plant-no-flowers-fruits') {
      if (attributeTitle.includes('Flowers') || attributeTitle.includes('Fruit')) {
        expectedFields++;
      } else if (attributeTitle.includes('Leaves')) {
        expectedFields++;
      }
    } else if (attributeTitle.includes('Alive or Dead')) {
      if (mode !== 'age-unknown') {
        expectedFields++;
      }
    } else if (attributeTitle.includes('Evidence of Presence')) {
      expectedFields++;
    } else if (attributeTitle.includes('Life Stage')) {
      if (mode !== 'age-unknown') {
        expectedFields++;
      }
    }
  });

  console.log(`Expected ${expectedFields} fields to be filled for mode: ${mode} (found ${rows.length} annotation rows)`);
  return expectedFields;
}
