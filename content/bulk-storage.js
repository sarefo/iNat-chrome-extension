// Storage keys (shared globals used by other content files)
const STORAGE_KEY_CURRENT = 'innat_current_collection';
const STORAGE_KEY_QUEUES   = 'innat_queues';

// Persist current accumulator to chrome.storage.local
function saveCurrentCollection() {
  if (!selectedObservations.size) {
    chrome.storage.local.remove([STORAGE_KEY_CURRENT]);
    return;
  }
  const data = {
    annotationType: bulkAnnotationMode,
    observations: Array.from(selectedObservations),
    lastUpdated: Date.now()
  };
  chrome.storage.local.set({ [STORAGE_KEY_CURRENT]: data });
}

// Highlight observations already in selectedObservations on the current page
function highlightRestoredObservations() {
  const links = document.querySelectorAll('.thumbnail a[href*="/observations/"]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const id = href.split('/observations/')[1].split('?')[0].split('#')[0];
    if (selectedObservations.has(id)) {
      const div = link.closest('.observation.observation-grid-cell');
      if (div) markSelected(div);
    }
  });
}

// Save current accumulator as a named queue, then clear the accumulator
async function saveAsNamedQueue() {
  const observations = Array.from(selectedObservations);
  if (!observations.length || !bulkAnnotationMode) return null;

  const id = `q_${Date.now()}`;
  const params = new URLSearchParams(window.location.search);
  const taxon = params.get('taxon_name') || params.get('taxon_id') || bulkTaxonId || '';
  const taxonPrefix = taxon ? `${taxon} · ` : '';
  const name = `${taxonPrefix}${getAnnotationDisplayName(bulkAnnotationMode)} (${observations.length})`;
  const queue = {
    id,
    name,
    annotationType: bulkAnnotationMode,
    observations,
    created: Date.now(),
    status: 'pending'
  };

  const result = await new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY_QUEUES], data => {
      const queues = data[STORAGE_KEY_QUEUES] || [];
      queues.push(queue);
      chrome.storage.local.set({ [STORAGE_KEY_QUEUES]: queues }, () => resolve(queue));
    });
  });

  // Clear accumulator
  selectedObservations.clear();
  saveCurrentCollection(); // removes STORAGE_KEY_CURRENT since set is empty

  return result;
}
