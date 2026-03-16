const PAGE_SIZE = 100; // observations per display page

let allObservations = []; // [{ id, photoUrl }]
let selectedIds = new Set();
let femaleIds = new Set();
let maleIds = new Set();
let currentPage = 1;
let totalCount = 0;
let totalApiPages = 0;
let fetchedApiPages = 0;
let annotationType = 'adult-alive';
let dataStatus = 'loading';
let searchUrl = null;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function getStorageData() {
  const result = await chrome.storage.local.get(['innat_custom_bulk']);
  return result.innat_custom_bulk || null;
}

function saveSelections() {
  getStorageData().then(data => {
    if (!data) return;
    chrome.storage.local.set({
      innat_custom_bulk: { ...data, selectedIds: Array.from(selectedIds) }
    });
  });
}

function saveSexSelections() {
  getStorageData().then(data => {
    if (!data) return;
    chrome.storage.local.set({
      innat_custom_bulk: {
        ...data,
        femaleIds: Array.from(femaleIds),
        maleIds: Array.from(maleIds)
      }
    });
  });
}

function saveAnnotationType(type) {
  getStorageData().then(data => {
    if (!data) return;
    chrome.storage.local.set({
      innat_custom_bulk: { ...data, annotationType: type }
    });
  });
}

// ---------------------------------------------------------------------------
// Computed helpers
// ---------------------------------------------------------------------------

function totalDisplayPages() {
  return Math.max(1, Math.ceil(allObservations.length / PAGE_SIZE));
}

function pageObservations(page = currentPage) {
  const start = (page - 1) * PAGE_SIZE;
  return allObservations.slice(start, start + PAGE_SIZE);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  renderGrid();
  updateToolbar();
  updateStatusInfo();
}

function renderGrid() {
  const grid = document.getElementById('obs-grid');
  const loadingMsg = document.getElementById('loading-msg');
  const obs = pageObservations();

  if (obs.length === 0) {
    grid.innerHTML = '';
    loadingMsg.style.display = 'block';
    loadingMsg.textContent = dataStatus === 'loading'
      ? 'Loading observations from iNaturalist API...'
      : 'No observations found.';
    return;
  }

  loadingMsg.style.display = 'none';
  grid.innerHTML = '';

  const isSex = annotationType === 'sex-split';

  obs.forEach(({ id, photoUrl }) => {
    const card = document.createElement('div');
    if (isSex) {
      card.className = 'obs-card sex-mode';
    } else {
      card.className = 'obs-card' + (selectedIds.has(id) ? ' selected' : '');
    }
    card.dataset.id = id;

    if (photoUrl) {
      const img = document.createElement('img');
      img.src = photoUrl;
      img.alt = id;
      img.loading = 'eager';
      card.appendChild(img);
    } else {
      const noPhoto = document.createElement('div');
      noPhoto.className = 'no-photo';
      noPhoto.textContent = 'No photo';
      card.appendChild(noPhoto);
    }

    if (isSex) {
      const fOverlay = document.createElement('div');
      fOverlay.className = 'sex-overlay sex-female-overlay' + (femaleIds.has(id) ? ' active' : '');
      card.appendChild(fOverlay);

      const mOverlay = document.createElement('div');
      mOverlay.className = 'sex-overlay sex-male-overlay' + (maleIds.has(id) ? ' active' : '');
      card.appendChild(mOverlay);

      const fLabel = document.createElement('div');
      fLabel.className = 'sex-female-label';
      fLabel.textContent = '♀';
      card.appendChild(fLabel);

      const mLabel = document.createElement('div');
      mLabel.className = 'sex-male-label';
      mLabel.textContent = '♂';
      card.appendChild(mLabel);
    }

    card.addEventListener('click', e => handleCardClick(e, id, card));
    grid.appendChild(card);
  });
}

function updateToolbar() {
  const pages = totalDisplayPages();
  document.getElementById('page-info').textContent = `Page ${currentPage} / ${pages}`;

  document.getElementById('btn-prev').disabled = currentPage <= 1;
  document.getElementById('btn-next').disabled = currentPage >= pages;

  const processBtn = document.getElementById('btn-process');
  if (annotationType === 'sex-split') {
    processBtn.textContent = `Add to Queue (♀ ${femaleIds.size} / ♂ ${maleIds.size})`;
    processBtn.disabled = femaleIds.size === 0 && maleIds.size === 0;
  } else {
    processBtn.textContent = `Add to Queue (${selectedIds.size})`;
    processBtn.disabled = selectedIds.size === 0;
  }

  const pageObs = pageObservations();
  const allOnPageSelected = pageObs.length > 0 && pageObs.every(o => selectedIds.has(o.id));
  document.getElementById('btn-select-page').textContent =
    allOnPageSelected ? 'Deselect Page' : 'Select Page';
}

function updateStatusInfo() {
  const info = document.getElementById('status-info');
  const loaded = allObservations.length;

  let html = annotationType === 'sex-split'
    ? `<span class="count">♀ ${femaleIds.size} / ♂ ${maleIds.size}</span>`
    : `<span class="count">${selectedIds.size} selected</span>`;
  if (dataStatus === 'loading') {
    html += ` &nbsp;|&nbsp; <span class="loading">Fetching ${loaded} / ${totalCount || '?'}</span>`;
  } else if (dataStatus === 'error') {
    html += ` &nbsp;|&nbsp; <span style="color:red">Error loading data</span>`;
  } else if (dataStatus === 'partial') {
    html += ` &nbsp;|&nbsp; ${loaded} / ${totalCount} loaded &nbsp;|&nbsp; <span style="color:#FF9800">reach last page to load more</span>`;
  } else {
    html += ` &nbsp;|&nbsp; ${loaded} observations`;
  }
  info.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Fetch more (lazy loading)
// ---------------------------------------------------------------------------

function triggerFetchMore() {
  if (!searchUrl || dataStatus !== 'partial') return;
  chrome.runtime.sendMessage(
    { action: 'fetchMoreObservations', searchUrl },
    () => { void chrome.runtime.lastError; }
  );
}

// ---------------------------------------------------------------------------
// Preloading
// ---------------------------------------------------------------------------

function preloadAdjacentPages() {
  const prev = pageObservations(currentPage - 1);
  const next = pageObservations(currentPage + 1);
  [...prev, ...next].forEach(({ photoUrl }) => {
    if (photoUrl) { const img = new Image(); img.src = photoUrl; }
  });
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function handleCardClick(e, id, card) {
  if (annotationType === 'sex-split') {
    handleSexCardClick(e, id, card);
    return;
  }

  if (e.ctrlKey || e.metaKey) {
    // Ctrl+click: deselect and open in new tab
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
      card.classList.remove('selected');
      saveSelections();
      updateToolbar();
      updateStatusInfo();
    }
    window.open(`https://www.inaturalist.org/observations/${id}`, '_blank');
    return;
  }

  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    card.classList.remove('selected');
  } else {
    selectedIds.add(id);
    card.classList.add('selected');
  }

  saveSelections();
  updateToolbar();
  updateStatusInfo();
}

function handleSexCardClick(e, id, card) {
  if (e.ctrlKey || e.metaKey) {
    window.open(`https://www.inaturalist.org/observations/${id}`, '_blank');
    return;
  }

  // Diagonal from top-right to bottom-left: female = upper-left (x+y < width)
  const rect = card.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const isFemaleZone = (x + y) < rect.width;

  if (isFemaleZone) {
    if (femaleIds.has(id)) {
      femaleIds.delete(id);
    } else {
      femaleIds.add(id);
      maleIds.delete(id);
    }
  } else {
    if (maleIds.has(id)) {
      maleIds.delete(id);
    } else {
      maleIds.add(id);
      femaleIds.delete(id);
    }
  }

  const fOverlay = card.querySelector('.sex-female-overlay');
  const mOverlay = card.querySelector('.sex-male-overlay');
  if (fOverlay) fOverlay.classList.toggle('active', femaleIds.has(id));
  if (mOverlay) mOverlay.classList.toggle('active', maleIds.has(id));

  saveSexSelections();
  updateToolbar();
  updateStatusInfo();
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const ANNOTATION_LABELS = {
  'adult-alive':             '🦆 Adult Alive',
  'adult-dead':              '💀 Adult Dead',
  'juvenile':                '🐛 Juvenile',
  'juvenile-dead':           '💀 Juvenile Dead',
  'molt':                    '💀 Molt',
  'age-unknown':             '❓ Age Unknown',
  'plant-flowers':           '🌼 Flowers',
  'plant-fruits':            '🍇 Fruits',
  'plant-no-flowers-fruits': '❌ No Flowers/Fruits',
  'sex-split':               '⚥ Sex (♀/♂)',
};

async function addToQueueSexMode() {
  if (femaleIds.size === 0 && maleIds.size === 0) return;

  const data = await getStorageData();
  let taxonPrefix = '';
  if (data?.searchUrl) {
    try {
      const params = new URL(data.searchUrl).searchParams;
      const taxon = params.get('taxon_name') || params.get('taxon_id') || '';
      if (taxon) taxonPrefix = `${taxon} · `;
    } catch { /* ignore */ }
  }

  const stored = await chrome.storage.local.get(['innat_queues']);
  const queues = stored.innat_queues || [];
  let totalAdded = 0;
  const now = Date.now();

  if (femaleIds.size > 0) {
    const femaleObs = Array.from(femaleIds);
    queues.push({
      id: `q_${now}_f`,
      name: `${taxonPrefix}♀ Female (${femaleObs.length})`,
      annotationType: 'sex-female',
      observations: femaleObs,
      created: now,
      status: 'pending'
    });
    totalAdded += femaleObs.length;
  }

  if (maleIds.size > 0) {
    const maleObs = Array.from(maleIds);
    queues.push({
      id: `q_${now + 1}_m`,
      name: `${taxonPrefix}♂ Male (${maleObs.length})`,
      annotationType: 'sex-male',
      observations: maleObs,
      created: now + 1,
      status: 'pending'
    });
    totalAdded += maleObs.length;
  }

  await chrome.storage.local.set({ innat_queues: queues });
  chrome.runtime.sendMessage({ action: 'queueUpdated' }, () => { void chrome.runtime.lastError; });

  femaleIds.clear();
  maleIds.clear();
  saveSexSelections();
  renderGrid();
  updateToolbar();
  updateStatusInfo();

  const toast = document.getElementById('queue-toast');
  toast.textContent = `✓ Added ${totalAdded} observations to queue`;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 3000);
}

async function addToQueue() {
  if (annotationType === 'sex-split') return addToQueueSexMode();
  if (selectedIds.size === 0) return;

  const data = await getStorageData();
  const observations = Array.from(selectedIds);

  // Build a descriptive queue name from the search URL if available
  let taxonPrefix = '';
  if (data?.searchUrl) {
    try {
      const params = new URL(data.searchUrl).searchParams;
      const taxon = params.get('taxon_name') || params.get('taxon_id') || '';
      if (taxon) taxonPrefix = `${taxon} · `;
    } catch { /* ignore malformed URLs */ }
  }
  const label = ANNOTATION_LABELS[annotationType] || annotationType;
  const name = `${taxonPrefix}${label} (${observations.length})`;

  const queue = {
    id: `q_${Date.now()}`,
    name,
    annotationType,
    observations,
    created: Date.now(),
    status: 'pending'
  };

  const stored = await chrome.storage.local.get(['innat_queues']);
  const queues = stored.innat_queues || [];
  queues.push(queue);
  await chrome.storage.local.set({ innat_queues: queues });

  // Notify the popup so it refreshes the queue list
  chrome.runtime.sendMessage({ action: 'queueUpdated' }, () => { void chrome.runtime.lastError; });

  // Clear the selection
  selectedIds.clear();
  saveSelections();
  renderGrid();
  updateToolbar();
  updateStatusInfo();

  // Show a brief confirmation toast
  const toast = document.getElementById('queue-toast');
  toast.textContent = `✓ Added ${observations.length} observations to queue`;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 3000);
}

// ---------------------------------------------------------------------------
// Storage change listener (progressive loading updates)
// ---------------------------------------------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.innat_custom_bulk) return;
  const data = changes.innat_custom_bulk.newValue;
  if (!data) return;

  const prevStatus = dataStatus;
  const prevLength = allObservations.length;
  allObservations = data.observations || [];
  totalCount = data.totalCount || allObservations.length;
  totalApiPages = data.totalApiPages || 0;
  fetchedApiPages = data.fetchedApiPages || 0;
  dataStatus = data.status;
  if (data.searchUrl) searchUrl = data.searchUrl;
  // Don't overwrite in-session selections from storage changes

  updateStatusInfo();
  updateToolbar();

  // Refresh grid when first data arrives
  if (prevStatus === 'loading' && allObservations.length > 0 && prevLength === 0) {
    renderGrid();
  }
  // When a fetch-more batch completes, re-render if user is still on the (now non-last) page
  if (allObservations.length > prevLength && prevLength > 0 && (dataStatus === 'ready' || dataStatus === 'partial')) {
    preloadAdjacentPages();
  }
});

// ---------------------------------------------------------------------------
// Toolbar events
// ---------------------------------------------------------------------------

function updateSexModeUI() {
  const isSex = annotationType === 'sex-split';
  document.getElementById('btn-select-page').style.display = isSex ? 'none' : '';
  document.getElementById('btn-select-all').style.display = isSex ? 'none' : '';
  render();
}

document.getElementById('annotation-select').addEventListener('change', e => {
  annotationType = e.target.value;
  saveAnnotationType(annotationType);
  updateSexModeUI();
});

document.getElementById('btn-prev').addEventListener('click', () => {
  if (currentPage <= 1) return;
  currentPage--;
  window.scrollTo(0, 0);
  render();
  preloadAdjacentPages();
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (currentPage >= totalDisplayPages()) return;
  currentPage++;
  window.scrollTo(0, 0);
  render();
  preloadAdjacentPages();
  if (currentPage === totalDisplayPages() && dataStatus === 'partial') {
    triggerFetchMore();
  }
});

document.getElementById('btn-select-page').addEventListener('click', () => {
  const pageObs = pageObservations();
  const allSelected = pageObs.every(o => selectedIds.has(o.id));
  if (allSelected) {
    pageObs.forEach(o => selectedIds.delete(o.id));
  } else {
    pageObs.forEach(o => selectedIds.add(o.id));
  }
  saveSelections();
  renderGrid();
  updateToolbar();
  updateStatusInfo();
});

document.getElementById('btn-select-all').addEventListener('click', () => {
  // Select all loaded observations (across all pages)
  const allSelected = allObservations.length > 0 &&
    allObservations.every(o => selectedIds.has(o.id));
  if (allSelected) {
    selectedIds.clear();
  } else {
    allObservations.forEach(o => selectedIds.add(o.id));
  }
  saveSelections();
  renderGrid();
  updateToolbar();
  updateStatusInfo();
});

document.getElementById('btn-process').addEventListener('click', addToQueue);

document.getElementById('btn-cancel').addEventListener('click', () => {
  chrome.storage.local.remove('innat_custom_bulk');
  window.close();
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  // Ignore shortcuts if user is typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'n':
      // Next page
      if (currentPage < totalDisplayPages()) {
        document.getElementById('btn-next').click();
      }
      break;
    case 'a':
      if (annotationType !== 'sex-split') {
        document.getElementById('btn-select-all').click();
      }
      break;
    case 'x':
      if (annotationType === 'sex-split') {
        if (femaleIds.size > 0 || maleIds.size > 0) {
          addToQueue().then(() => window.close());
        }
      } else if (selectedIds.size > 0) {
        addToQueue().then(() => window.close());
      }
      break;
    case 'u': {
      const firstCard = document.querySelector('.obs-card');
      if (firstCard) {
        const rowHeight = firstCard.offsetHeight + 6;
        window.scrollBy({ top: rowHeight, behavior: 'smooth' });
      }
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  const data = await getStorageData();
  if (!data) {
    document.getElementById('loading-msg').textContent =
      'No session data found. Please start from the extension popup.';
    return;
  }

  allObservations = data.observations || [];
  selectedIds = new Set(data.selectedIds || []);
  femaleIds = new Set(data.femaleIds || []);
  maleIds = new Set(data.maleIds || []);
  totalCount = data.totalCount || 0;
  totalApiPages = data.totalApiPages || 0;
  fetchedApiPages = data.fetchedApiPages || 0;
  annotationType = data.annotationType || 'adult-alive';
  dataStatus = data.status || 'loading';
  searchUrl = data.searchUrl || null;

  document.getElementById('annotation-select').value = annotationType;

  if (data.searchUrl) {
    try {
      const params = new URL(data.searchUrl).searchParams;
      const taxonId = params.get('taxon_id');
      const taxonName = params.get('taxon_name');
      const label = taxonName ? `${taxonName} (${taxonId})` : taxonId ? `taxon: ${taxonId}` : '';
      if (label) document.getElementById('taxon-info').textContent = label;
    } catch { /* ignore malformed URLs */ }
  }

  updateSexModeUI(); // applies button visibility and renders

  if (dataStatus !== 'loading') preloadAdjacentPages();
}

init();
