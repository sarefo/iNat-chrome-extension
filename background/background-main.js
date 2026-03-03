import { processBulkObservationsViaApi, annotateSingleObsViaApi } from './api-annotator.js';
import { processQueuedObservations } from './queue-manager.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'annotateSingleObs') {
    annotateSingleObsViaApi(request.obsId, request.mode, request.jwt)
      .then(result => sendResponse({ success: result.success, result }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'processBulkObservationsStaggered') {
    // Same action name kept so content scripts don't need changing
    const sourceTabId = sender.tab?.id ?? null;
    processBulkObservationsViaApi(request.observations, request.mode, sourceTabId, request.jwt)
      .then(results => sendResponse({ success: true, results }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'processQueues') {
    processQueuedObservations(request.queueIds, request.jwt)
      .then(r => sendResponse({ success: true, ...r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});
