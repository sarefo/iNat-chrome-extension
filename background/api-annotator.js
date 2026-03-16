const API_BASE = 'https://api.inaturalist.org/v1';
const RATE_LIMIT_MS = 150;

// Each entry: { a: controlled_attribute_id, v: controlled_value_id }
const ANNOTATION_CONFIGS = {
  'adult-alive':             [{a:1,v:2},{a:17,v:18},{a:22,v:24}],
  'adult-dead':              [{a:1,v:2},{a:17,v:19},{a:22,v:24}],
  'juvenile':                [{a:1,v:8},{a:17,v:18},{a:22,v:24}],
  'juvenile-dead':           [{a:1,v:8},{a:17,v:19},{a:22,v:24}],
  'molt':                    [{a:17,v:19},{a:22,v:28}],
  'age-unknown':             [{a:17,v:18},{a:22,v:24}],
  'plant-flowers':           [{a:12,v:13},{a:36,v:38}],
  'plant-fruits':            [{a:12,v:14},{a:36,v:38}],
  'plant-no-flowers-fruits': [{a:12,v:21},{a:36,v:38}],
  'sex-female':              [{a:9,v:11}],
  'sex-male':                [{a:9,v:10}],
};

// Query the first open iNat tab and extract its JWT from page meta tag
async function getJwtFromInatTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: '*://*.inaturalist.org/*' }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        reject(new Error('No iNaturalist tab open. Please open iNaturalist first.'));
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getJwt' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Could not reach iNat tab: ' + chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.jwt) {
          reject(new Error('Not logged in to iNaturalist. Please log in first.'));
          return;
        }
        resolve(response.jwt);
      });
    });
  });
}

// POST a single annotation via the iNat API
// Returns true on success, throws on auth error, returns true on 422 (already exists)
async function postAnnotation(jwt, obsId, attrId, valueId) {
  const response = await fetch(`${API_BASE}/annotations`, {
    method: 'POST',
    headers: {
      'Authorization': jwt,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      annotation: {
        resource_type: 'Observation',
        resource_id: Number(obsId),
        controlled_attribute_id: attrId,
        controlled_value_id: valueId
      }
    })
  });

  if (response.status === 422) {
    // Already annotated — treat as success
    return true;
  }

  if (response.status === 401) {
    const err = new Error('auth:JWT expired or invalid');
    err.isAuthError = true;
    throw err;
  }

  if (!response.ok) {
    throw new Error(`API error ${response.status} for obs ${obsId} attr ${attrId}`);
  }

  return true;
}

// Annotate a single observation via API for the given mode
// Returns { observationId, success, results[] }
async function annotateObservationViaApi(obsId, mode, jwt) {
  const config = ANNOTATION_CONFIGS[mode];
  if (!config) {
    throw new Error(`Unknown annotation mode: ${mode}`);
  }

  const results = [];
  let allSuccess = true;

  for (const { a: attrId, v: valueId } of config) {
    try {
      await postAnnotation(jwt, obsId, attrId, valueId);
      results.push({ attrId, valueId, success: true });
    } catch (err) {
      if (err.isAuthError) throw err; // bubble up for JWT retry
      results.push({ attrId, valueId, success: false, error: err.message });
      allSuccess = false;
    }
    // Rate limit between individual annotation calls
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

  return {
    observationId: obsId,
    success: allSuccess,
    results
  };
}

// Annotate a single observation with all annotations fired in parallel
export async function annotateSingleObsViaApi(obsId, mode, jwt) {
  const config = ANNOTATION_CONFIGS[mode];
  if (!config) throw new Error(`Unknown annotation mode: ${mode}`);

  const results = await Promise.all(
    config.map(({ a: attrId, v: valueId }) =>
      postAnnotation(jwt, obsId, attrId, valueId)
        .then(() => ({ attrId, valueId, success: true }))
        .catch(err => ({ attrId, valueId, success: false, error: err.message }))
    )
  );

  const allSuccess = results.every(r => r.success);
  return { observationId: obsId, success: allSuccess, results };
}

// Process multiple observations via API (exported for background-main.js)
// jwt is passed directly from the content script; falls back to tab query if not provided
// onProgress(obsId) is called after each observation completes (optional)
export async function processBulkObservationsViaApi(observations, mode, sourceTabId, jwt, onProgress, progressSender = null) {
  const startTime = Date.now();
  if (!jwt) {
    jwt = await getJwtFromInatTab(); // fallback for queue processing
  }

  const results = [];
  let completed = 0;
  let errors = 0;

  const sendProgressUpdate = (isComplete = false) => {
    const data = {
      action: 'bulkProcessingProgress',
      completed,
      errors,
      total: observations.length,
      remaining: observations.length - completed,
      elapsedTime: Date.now() - startTime,
      isComplete
    };
    if (progressSender) {
      progressSender(data);
    } else if (sourceTabId) {
      chrome.tabs.sendMessage(sourceTabId, data, () => { void chrome.runtime.lastError; });
    }
  };

  for (const obsId of observations) {
    let result;
    try {
      result = await annotateObservationViaApi(obsId, mode, jwt);
      results.push(result);
    } catch (err) {
      if (err.isAuthError) {
        // Re-fetch JWT once and retry this observation
        console.log('JWT expired, re-fetching...');
        try {
          jwt = await getJwtFromInatTab();
          result = await annotateObservationViaApi(obsId, mode, jwt);
          results.push(result);
        } catch (retryErr) {
          errors++;
          results.push({ observationId: obsId, success: false, error: retryErr.message });
        }
      } else {
        errors++;
        results.push({ observationId: obsId, success: false, error: err.message });
      }
    }
    completed++;
    if (onProgress) onProgress(obsId);
    sendProgressUpdate(false);
  }

  sendProgressUpdate(true);
  return results;
}
