import { processBulkObservationsViaApi, annotateSingleObsViaApi, quickAnnotateSingleObs, postObservationFieldViaApi } from './api-annotator.js';
import { processQueuedObservations } from './queue-manager.js';
import { startCustomBulkFetch, fetchMoreObservations } from './obs-fetcher.js';

let queueProcessingActive = false;
let queueGen = 0;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'quickAnnotateObs') {
    quickAnnotateSingleObs(request.obsId, request.mode)
      .then(result => sendResponse({ success: result.success, result }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'annotateSingleObs') {
    annotateSingleObsViaApi(request.obsId, request.mode, request.jwt)
      .then(result => sendResponse({ success: result.success, result }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'postObservationField') {
    postObservationFieldViaApi(request.obsId, request.fieldId, request.value, request.jwt || null)
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'startCustomBulkMode') {
    startCustomBulkFetch(request.searchUrl, request.annotationType, request.jwt, request.sourceTabId ?? sender.tab?.id ?? null)
      .catch(err => console.error('[custom bulk] fetch failed:', err));
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'fetchMoreObservations') {
    fetchMoreObservations(request.searchUrl)
      .catch(err => console.error('[obs-fetcher] fetch more failed:', err));
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'processBulkObservationsStaggered') {
    // When called from the custom-bulk extension page (no sender.tab), broadcast
    // progress via chrome.runtime.sendMessage so the page can receive it.
    const isCustomPage = !sender.tab;
    const sourceTabId = isCustomPage ? null : (sender.tab?.id ?? null);
    const progressSender = isCustomPage
      ? data => chrome.runtime.sendMessage(data, () => { void chrome.runtime.lastError; })
      : null;
    processBulkObservationsViaApi(request.observations, request.mode, sourceTabId, request.jwt, null, progressSender)
      .then(results => sendResponse({ success: true, results }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === 'processQueues') {
    const gen = ++queueGen;
    // Signal any running job to stop, then wait for it to exit before starting fresh
    const startNew = () => {
      if (queueGen !== gen) return; // superseded by an even newer request
      queueProcessingActive = true;
      processQueuedObservations(request.queueIds, request.jwt)
        .then(r => sendResponse({ success: true, ...r }))
        .catch(e => sendResponse({ success: false, error: e.message }))
        .finally(() => { if (queueGen === gen) queueProcessingActive = false; });
    };
    if (queueProcessingActive) {
      chrome.storage.local.set({ innat_cancel_current_queue: true }, () => {
        // Poll until the previous run has exited — never start concurrently
        const wait = setInterval(() => {
          if (!queueProcessingActive) { clearInterval(wait); startNew(); }
        }, 100);
      });
    } else {
      startNew();
    }
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
