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
