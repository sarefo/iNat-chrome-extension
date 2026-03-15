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

  if (request.action === 'openPreloadTab') {
    chrome.storage.local.get(['innat_preload'], result => {
      const create = () => {
        chrome.tabs.create({ url: request.url, active: false, index: sender.tab?.index }, tab => {
          chrome.storage.local.set({
            innat_preload: {
              url: request.url,
              tabId: tab.id,
              totalObservations: request.totalObservations,
              targetPage: request.targetPage,
              createdAt: Date.now()
            }
          }, () => sendResponse({ success: true, tabId: tab.id }));
        });
      };

      const existing = result.innat_preload;
      if (existing?.tabId) {
        chrome.tabs.remove(existing.tabId, () => { void chrome.runtime.lastError; create(); });
      } else {
        create();
      }
    });
    return true;
  }

  if (request.action === 'switchToPreloadTab') {
    chrome.storage.local.get(['innat_preload'], result => {
      const preload = result.innat_preload;
      if (!preload?.tabId) { sendResponse({ success: false }); return; }
      chrome.tabs.get(preload.tabId, tab => {
        if (chrome.runtime.lastError || !tab) {
          chrome.storage.local.remove('innat_preload');
          sendResponse({ success: false });
          return;
        }
        chrome.tabs.update(preload.tabId, { active: true });
        chrome.storage.local.remove('innat_preload');
        chrome.tabs.sendMessage(preload.tabId, { action: 'activatePreload' }, () => { void chrome.runtime.lastError; });
        sendResponse({ success: true });
        const sourceTabId = sender.tab?.id;
        if (sourceTabId) {
          setTimeout(() => chrome.tabs.remove(sourceTabId, () => { void chrome.runtime.lastError; }), 200);
        }
      });
    });
    return true;
  }

  if (request.action === 'closePreloadTab') {
    chrome.storage.local.get(['innat_preload'], result => {
      const preload = result.innat_preload;
      if (preload?.tabId) {
        chrome.tabs.remove(preload.tabId, () => { void chrome.runtime.lastError; });
      }
      chrome.storage.local.remove('innat_preload');
      sendResponse({ success: true });
    });
    return true;
  }
});
