const PAGE_SIZE = 100; // observations per display page

let allObservations = []; // [{ id, photoUrl, annotations }]
let selectedIds = new Set();
let manuallyDeselectedIds = new Set();
let matingIds = new Set();
let kbFocusedIds = new Set(); // IDs of all kb-focused cards
let kbPrimaryId = null;       // card where overlay is shown (last focused)
let vkRow = 1, vkCol = 1;
let femaleIds = new Set();
let maleIds = new Set();
let currentPage = 1;
let totalCount = 0;
let totalApiPages = 0;
let fetchedApiPages = 0;
let annotationType = 'adult-alive';
let dataStatus = 'loading';
let searchUrl = null;
let selectAllActive = false;
let visitedPages = new Set([1]);
let includeSubtaxa = true; // Include subtaxa in bulk mode by default
let taxonRank = null; // Rank of the taxon, used for exact-rank-only filtering

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

function updateGuideHeight() {
  const guide = document.getElementById('nav-guide');
  const footer = document.getElementById('grid-footer');
  const toolbar = document.getElementById('toolbar');
  if (!guide) return;
  const toolbarH = toolbar ? toolbar.offsetHeight : 0;
  // card is square, fills 1/5 of grid width (grid has 12px padding each side, 4×6px gaps)
  const cardSize = (window.innerWidth - 24 - 24) / 5;
  // center of first card must equal scroll-visible-center at scrollY=0
  // scroll-visible-center = toolbarH + (window.innerHeight - toolbarH) / 2
  const visibleCenter = toolbarH + (window.innerHeight - toolbarH) / 2;
  const guideH = Math.max(60, visibleCenter - 12 - cardSize / 2);
  guide.style.height = guideH + 'px';
  // footer: allow last row to be centered too
  if (footer) footer.style.paddingBottom = Math.max(40, (window.innerHeight - toolbarH) / 2 - cardSize / 2) + 'px';
}

updateGuideHeight();
window.addEventListener('resize', updateGuideHeight);

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

  obs.forEach(({ id, photoUrl, annotations, qualityGrade }) => {
    const card = document.createElement('div');
    if (isSex) {
      card.className = 'obs-card sex-mode';
    } else {
      card.className = 'obs-card' + (selectedIds.has(id) ? ' selected' : (manuallyDeselectedIds.has(id) ? ' deselected' : '')) + (kbFocusedIds.has(id) ? ' kb-focused' : '');
    }
    card.dataset.id = id;

    if (photoUrl) {
      const img = document.createElement('img');
      img.alt = id;
      img.loading = 'eager';

      const reloadBtn = document.createElement('button');
      reloadBtn.className = 'reload-btn';
      reloadBtn.textContent = '↻';
      reloadBtn.title = 'Retry loading image';
      reloadBtn.addEventListener('click', e => {
        e.stopPropagation();
        // Add cache-bust parameter to force fresh request from server
        const separator = photoUrl.includes('?') ? '&' : '?';
        const bustUrl = photoUrl + separator + 'cb=' + Date.now();
        img.src = bustUrl;
      });

      img.addEventListener('load',  () => reloadBtn.classList.add('loaded'));
      img.addEventListener('error', () => reloadBtn.classList.remove('loaded'));

      img.src = photoUrl;
      // Hide immediately if browser already has it cached
      if (img.complete && img.naturalWidth > 0) reloadBtn.classList.add('loaded');

      card.appendChild(img);
      card.appendChild(reloadBtn);
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

    const badges = buildAnnotationBadges(annotations, qualityGrade, id);
    if (badges) card.appendChild(badges);

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
  document.getElementById('btn-select-page').innerHTML =
    allOnPageSelected ? 'Deselect Page <kbd>(p)</kbd>' : 'Select Page <kbd>(p)</kbd>';

  // Update subtaxa toggle button state
  const subtaxaBtn = document.getElementById('btn-subtaxa');
  if (subtaxaBtn) {
    subtaxaBtn.classList.toggle('active', includeSubtaxa);
    subtaxaBtn.textContent = includeSubtaxa ? '⊙ With Subtaxa' : '◯ Exact Rank Only';
  }
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
    html += ` &nbsp;|&nbsp; ${loaded} / ${totalCount} loaded &nbsp;|&nbsp; <span style="color:#FF9600">reach last page to load more</span>`;
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

// Modify search URL to include or exclude subtaxa
function modifySearchUrlForSubtaxa(url, includeSubtaxa) {
  const urlObj = new URL(url);

  if (includeSubtaxa) {
    // Remove rank filtering parameters to include all subtaxa
    urlObj.searchParams.delete('hrank');
    urlObj.searchParams.delete('lrank');
  } else {
    // Restrict to exact rank only by setting both hrank and lrank to the same rank
    if (taxonRank) {
      urlObj.searchParams.set('hrank', taxonRank);
      urlObj.searchParams.set('lrank', taxonRank);
    }
  }

  return urlObj.toString();
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
  if (e.ctrlKey) {
    ctrlDeselectCard(id);
    chrome.tabs.create({ url: `https://www.inaturalist.org/observations/${id}`, active: false });
    return;
  }
  if (annotationType === 'sex-split') {
    handleSexCardClick(e, id, card);
    return;
  }

  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    manuallyDeselectedIds.add(id);
    card.classList.remove('selected');
    card.classList.add('deselected');
  } else {
    selectedIds.add(id);
    manuallyDeselectedIds.delete(id);
    card.classList.add('selected');
    card.classList.remove('deselected');
  }

  saveSelections();
  updateToolbar();
  updateStatusInfo();
}

function handleSexCardClick(e, id, card) {
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
// Ctrl-hover quick annotation overlay
// ---------------------------------------------------------------------------

let ctrlOverlayCardId = null;
const ctrlOverlayEl = document.getElementById('ctrl-overlay');

function showCtrlOverlay(card) {
  const rect = card.getBoundingClientRect();
  ctrlOverlayEl.style.left = rect.left + 'px';
  ctrlOverlayEl.style.top = rect.top + 'px';
  ctrlOverlayEl.style.width = rect.width + 'px';
  ctrlOverlayEl.style.height = rect.height + 'px';
  ctrlOverlayCardId = card.dataset.id;
  ctrlOverlayEl.classList.add('visible');
  updateVkHighlight();
}

function hideCtrlOverlay() {
  ctrlOverlayEl.classList.remove('visible');
  ctrlOverlayCardId = null;
  document.querySelectorAll('.vk-active').forEach(el => el.classList.remove('vk-active'));
}

function ctrlDeselectCard(id) {
  let changed = false;
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    manuallyDeselectedIds.add(id);
    const card = document.querySelector(`.obs-card[data-id="${id}"]`);
    if (card) { card.classList.remove('selected'); card.classList.add('deselected'); }
    saveSelections();
    changed = true;
  }
  if (femaleIds.has(id) || maleIds.has(id)) {
    femaleIds.delete(id);
    maleIds.delete(id);
    const card = document.querySelector(`.obs-card[data-id="${id}"]`);
    if (card) {
      card.querySelector('.sex-female-overlay')?.classList.remove('active');
      card.querySelector('.sex-male-overlay')?.classList.remove('active');
    }
    saveSexSelections();
    changed = true;
  }
  if (changed) {
    updateToolbar();
    updateStatusInfo();
  }
}

ctrlOverlayEl.querySelectorAll('.ctrl-zone[data-type]').forEach(zone => {
  zone.addEventListener('click', e => {
    e.stopPropagation();
    const type = zone.dataset.type;
    const id = ctrlOverlayCardId;
    hideCtrlOverlay();
    clearKbFocus();
    if (!id) return;
    ctrlDeselectCard(id);
    const label = ANNOTATION_LABELS[type] || type;
    const toast = document.getElementById('queue-toast');
    const centered = positionToastOnCard(toast, id);
    toast.textContent = `⏳ Annotating: ${label}…`;
    toast.classList.add('active');
    chrome.runtime.sendMessage(
      { action: 'quickAnnotateObs', obsId: id, mode: type },
      response => {
        if (chrome.runtime.lastError) {
          toast.textContent = `✗ Error: ${chrome.runtime.lastError.message}`;
        } else if (response && response.success) {
          toast.textContent = `✓ Annotated: ${label}`;
          addAnnotationsToCard(id, type);
        } else {
          toast.textContent = `✗ Failed: ${response?.error || 'Unknown error'}`;
        }
        setTimeout(() => toast.classList.remove('active'), centered ? 600 : 3000);
      }
    );
  });
});

// Track which card the mouse is currently over (for Ctrl tap in mouse mode)
let mouseOverCardId = null;
document.addEventListener('mouseover', e => {
  const card = e.target.closest('.obs-card');
  mouseOverCardId = card ? card.dataset.id : null;
});

// Ctrl tracking: distinguish tap (toggle overlay) from combo (Ctrl+Enter, Ctrl+Click)
let ctrlHeld = false;
let ctrlComboUsed = false;

document.addEventListener('keydown', e => {
  if (e.key === 'Control') {
    ctrlHeld = true;
    ctrlComboUsed = false;
  } else if (ctrlHeld) {
    ctrlComboUsed = true; // another key pressed while Ctrl held → not a tap
  }
});

document.addEventListener('mousedown', e => {
  if (ctrlHeld) ctrlComboUsed = true; // Ctrl+click → not a tap
});

// Ctrl keyup: tap-toggle overlay only when no combo key was used
document.addEventListener('keyup', e => {
  if (e.key === 'Control') {
    if (!ctrlComboUsed && !shiftHeld) {
      if (ctrlOverlayEl.classList.contains('visible')) {
        hideCtrlOverlay();
      } else {
        const targetId = kbPrimaryId || mouseOverCardId;
        if (targetId) {
          const c = document.querySelector(`.obs-card[data-id="${targetId}"]`);
          if (c) showCtrlOverlay(c);
        }
      }
    }
    ctrlHeld = false;
    ctrlComboUsed = false;
  }
});

window.addEventListener('blur', () => {
  shiftHeld = false;
  ctrlHeld = false;
  ctrlComboUsed = false;
  hideShiftOverlay();
  if (kbPrimaryId) {
    const c = document.querySelector(`.obs-card[data-id="${kbPrimaryId}"]`);
    if (c) showCtrlOverlay(c);
  }
});

// ---------------------------------------------------------------------------
// Shift-hover quick annotation overlay (sex, evidence of presence, mating)
// Unlike ctrl-mode, shift-mode does NOT deselect the observation.
// ---------------------------------------------------------------------------

const SHIFT_ANNOTATION_LABELS = {
  'sex-female':        '♀ Female',
  'mating':            '❤️ Mating',
  'sex-male':          '♂ Male',
  'eop-egg':           '🥚 Egg',
  'eop-molt':          '🪲 Molt',
  'life-pupa':         '🐛 Pupa',
  'eop-construction':  '🏗 Construction',
  'eop-gall':          '🌿 Gall',
  'eop-track':         '👣 Track',
};

let shiftHeld = false;
let shiftOverlayCardId = null;
const shiftOverlayEl = document.getElementById('shift-overlay');

function showShiftOverlay(card) {
  const rect = card.getBoundingClientRect();
  shiftOverlayEl.style.left = rect.left + 'px';
  shiftOverlayEl.style.top = rect.top + 'px';
  shiftOverlayEl.style.width = rect.width + 'px';
  shiftOverlayEl.style.height = rect.height + 'px';
  shiftOverlayCardId = card.dataset.id;
  shiftOverlayEl.classList.add('visible');
  updateVkHighlight();
}

function hideShiftOverlay() {
  shiftOverlayEl.classList.remove('visible');
  shiftOverlayCardId = null;
  document.querySelectorAll('.vk-active').forEach(el => el.classList.remove('vk-active'));
}

function showPhotoOverlay(url) {
  const overlay = document.getElementById('photo-overlay');
  document.getElementById('photo-overlay-img').src = url;
  overlay.classList.add('visible');
}

function hidePhotoOverlay() {
  document.getElementById('photo-overlay').classList.remove('visible');
}

document.getElementById('photo-overlay').addEventListener('click', hidePhotoOverlay);

shiftOverlayEl.querySelectorAll('.shift-zone[data-type]').forEach(zone => {
  zone.addEventListener('click', e => {
    e.stopPropagation();
    const type = zone.dataset.type;
    const id = shiftOverlayCardId;
    hideShiftOverlay();
    clearKbFocus();
    if (!id) return;
    // Shift-mode: do NOT deselect the observation
    const label = SHIFT_ANNOTATION_LABELS[type] || type;
    const toast = document.getElementById('queue-toast');
    const centeredShift = positionToastOnCard(toast, id);
    toast.textContent = `⏳ Annotating: ${label}…`;
    toast.classList.add('active');

    if (type === 'mating') {
      chrome.runtime.sendMessage(
        { action: 'postObservationField', obsId: id, fieldId: 6637, value: 'yes' },
        response => {
          if (chrome.runtime.lastError) {
            toast.textContent = `✗ Error: ${chrome.runtime.lastError.message}`;
          } else if (response && response.success) {
            toast.textContent = `✓ ${label}: obs ${id}`;
            matingIds.add(id);
            const card = document.querySelector(`.obs-card[data-id="${id}"]`);
            if (card) {
              const existing = card.querySelector('.ann-badges');
              if (existing) card.removeChild(existing);
              const badges = buildAnnotationBadges(
                allObservations.find(o => o.id === id)?.annotations,
                allObservations.find(o => o.id === id)?.qualityGrade,
                id
              );
              if (badges) card.appendChild(badges);
            }
          } else {
            toast.textContent = `✗ Failed: ${response?.error || 'Unknown error'}`;
          }
          setTimeout(() => toast.classList.remove('active'), centeredShift ? 600 : 3000);
        }
      );
    } else {
      chrome.runtime.sendMessage(
        { action: 'quickAnnotateObs', obsId: id, mode: type },
        response => {
          if (chrome.runtime.lastError) {
            toast.textContent = `✗ Error: ${chrome.runtime.lastError.message}`;
          } else if (response && response.success) {
            toast.textContent = `✓ ${label}: obs ${id}`;
            addAnnotationsToCard(id, type);
          } else {
            toast.textContent = `✗ Failed: ${response?.error || 'Unknown error'}`;
          }
          setTimeout(() => toast.classList.remove('active'), centeredShift ? 600 : 3000);
        }
      );
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Shift' && !shiftHeld) {
    shiftHeld = true;
    const targetId = kbPrimaryId || ctrlOverlayCardId;
    if (targetId) {
      hideCtrlOverlay();
      const c = document.querySelector(`.obs-card[data-id="${targetId}"]`);
      if (c) showShiftOverlay(c);
    }
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') {
    const prevCard = shiftOverlayCardId;
    shiftHeld = false;
    hideShiftOverlay();
    const targetId = kbPrimaryId || prevCard;
    if (targetId) {
      const c = document.querySelector(`.obs-card[data-id="${targetId}"]`);
      if (c) showCtrlOverlay(c);
    }
  }
});

document.addEventListener('mousemove', e => {
  if (!shiftHeld) {
    if (shiftOverlayCardId) hideShiftOverlay();
    return;
  }
  if (kbPrimaryId) return; // kb mode: overlay locked to focused card
  if (shiftOverlayEl.contains(e.target)) return;
  const card = e.target.closest('.obs-card');
  if (card) {
    if (card.dataset.id !== shiftOverlayCardId) showShiftOverlay(card);
  } else {
    hideShiftOverlay();
  }
});

// ---------------------------------------------------------------------------
// Help modal
// ---------------------------------------------------------------------------

document.getElementById('btn-help').addEventListener('click', () => {
  document.getElementById('help-overlay').classList.add('visible');
});

document.getElementById('help-close').addEventListener('click', () => {
  document.getElementById('help-overlay').classList.remove('visible');
});

document.getElementById('help-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('help-overlay')) {
    document.getElementById('help-overlay').classList.remove('visible');
  }
});

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

// Maps quickAnnotateObs mode keys to the {attrId, valId} pairs they set
// (mirrors ANNOTATION_CONFIGS in api-annotator.js — keep in sync)
const MODE_ANNOTATIONS = {
  'adult-alive':             [{a:1,v:2},{a:17,v:18},{a:22,v:24}],
  'adult-cannot':            [{a:1,v:2},{a:17,v:20},{a:22,v:24}],
  'adult-dead':              [{a:1,v:2},{a:17,v:19},{a:22,v:24}],
  'juvenile':                [{a:1,v:8},{a:17,v:18},{a:22,v:24}],
  'juvenile-cannot':         [{a:1,v:8},{a:17,v:20},{a:22,v:24}],
  'juvenile-dead':           [{a:1,v:8},{a:17,v:19},{a:22,v:24}],
  'dead-only':               [{a:17,v:19},{a:22,v:24}],
  'molt':                    [{a:17,v:19},{a:22,v:28}],
  'age-unknown':             [{a:17,v:18},{a:22,v:24}],
  'cannot-only':             [{a:17,v:20},{a:22,v:24}],
  'plant-flowers':           [{a:12,v:13},{a:36,v:38}],
  'plant-fruits':            [{a:12,v:14},{a:36,v:38}],
  'plant-no-flowers-fruits': [{a:12,v:21},{a:36,v:38}],
  'sex-female':              [{a:9,v:10}],
  'sex-male':                [{a:9,v:11}],
  'eop-construction':        [{a:22,v:35}],
  'eop-egg':                 [{a:22,v:30}],
  'eop-gall':                [{a:22,v:29}],
  'eop-molt':                [{a:22,v:28}],
  'eop-track':               [{a:22,v:26}],
  'life-pupa':               [{a:1,v:4}],
};

function addAnnotationsToCard(id, mode) {
  const pairs = MODE_ANNOTATIONS[mode];
  if (!pairs) return;
  const obs = allObservations.find(o => o.id === id);
  if (!obs) return;
  if (!obs.annotations) obs.annotations = [];
  for (const { a, v } of pairs) {
    if (!obs.annotations.some(x => x.attrId === a && x.valId === v)) {
      obs.annotations.push({ attrId: a, valId: v });
    }
  }
  const card = document.querySelector(`.obs-card[data-id="${id}"]`);
  if (card) {
    const existing = card.querySelector('.ann-badges');
    if (existing) card.removeChild(existing);
    const badges = buildAnnotationBadges(obs.annotations, obs.qualityGrade, id);
    if (badges) card.appendChild(badges);
  }
}

// Existing annotation badge display (keyed by "attrId_valId")
const EXISTING_ANNOTATION_BADGE = {
  // Life Stage (attr 1)
  '1_2':  { text: 'Adult',    bg: '#1565C0' },
  '1_3':  { text: 'Teneral',  bg: '#0277BD' },
  '1_4':  { text: 'Pupa',     bg: '#558B2F' },
  '1_5':  { text: 'Nymph',    bg: '#388E3C' },
  '1_6':  { text: 'Larva',    bg: '#2E7D32' },
  '1_7':  { text: 'Egg',      bg: '#E65100' },
  '1_8':  { text: 'Juv',      bg: '#33691E' },
  '1_16': { text: 'Sub',      bg: '#00695C' },
  // Sex (attr 9)
  '9_10': { text: '♀',        bg: '#AD1457' },
  '9_11': { text: '♂',        bg: '#1565C0' },
  '9_20': { text: '?',        bg: '#757575' },
  // Alive/Dead (attr 17)
  '17_18': { text: 'Alive',   bg: '#2E7D32' },
  '17_19': { text: 'Dead',    bg: '#4E342E' },
  '17_20': { text: '?',       bg: '#757575' },
  // Evidence of Presence (attr 22)
  '22_23': { text: 'Feather', bg: '#6D4C41' },
  '22_24': { text: 'Org',     bg: '#546E7A' },
  '22_25': { text: 'Scat',    bg: '#6D4C41' },
  '22_26': { text: 'Track',   bg: '#37474F' },
  '22_27': { text: 'Bone',    bg: '#5D4037' },
  '22_28': { text: 'Molt',    bg: '#6D4C41' },
  '22_29': { text: 'Gall',    bg: '#2E7D32' },
  '22_30': { text: 'Egg',     bg: '#E65100' },
  '22_31': { text: 'Hair',    bg: '#6D4C41' },
  '22_32': { text: 'Mine',    bg: '#388E3C' },
  '22_35': { text: 'Constr',  bg: '#4E342E' },
};

function buildAnnotationBadges(annotations, qualityGrade, id) {
  const wrap = document.createElement('div');
  wrap.className = 'ann-badges';
  if (qualityGrade === 'research') {
    const el = document.createElement('span');
    el.className = 'ann-badge';
    el.textContent = 'RG';
    el.style.background = '#2E7D32';
    wrap.appendChild(el);
  }
  if (id && matingIds.has(id)) {
    const el = document.createElement('span');
    el.className = 'ann-badge';
    el.textContent = '❤️ Mating';
    el.style.background = '#880E4F';
    wrap.appendChild(el);
  }
  for (const { attrId, valId } of (annotations || [])) {
    const badge = EXISTING_ANNOTATION_BADGE[`${attrId}_${valId}`];
    if (!badge) continue;
    const el = document.createElement('span');
    el.className = 'ann-badge';
    el.textContent = badge.text;
    el.style.background = badge.bg;
    wrap.appendChild(el);
  }
  if (!wrap.hasChildNodes()) return null;
  return wrap;
}

const ANNOTATION_LABELS = {
  'adult-alive':             '🦆 Adult Alive',
  'adult-cannot':            '❓ Adult Cannot Be Determined',
  'adult-dead':              '💀 Adult Dead',
  'juvenile':                '🐛 Juvenile Alive',
  'juvenile-cannot':         '❓ Juvenile Cannot Be Determined',
  'juvenile-dead':           '💀 Juvenile Dead',
  'dead-only':               '💀 Dead (no age)',
  'molt':                    '💀 Molt',
  'age-unknown':             '❓ Age Unknown',
  'cannot-only':             '❓ Cannot Be Determined',
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
  if (data.taxonRank) taxonRank = data.taxonRank;
  // Don't overwrite in-session selections from storage changes

  updateStatusInfo();
  updateToolbar();

  // Refresh grid when first data arrives, or when fetch completes with zero results
  if (prevStatus === 'loading' && prevLength === 0 && (allObservations.length > 0 || dataStatus !== 'loading')) {
    renderGrid();
    preloadAdjacentPages();
  }
  // Preload adjacent pages whenever new observations arrive (including during fetch-more)
  if (allObservations.length > prevLength && prevLength > 0) {
    preloadAdjacentPages();
    // Auto-select new batch if "select all" was active when more obs were requested
    if (selectAllActive) {
      allObservations.slice(prevLength).forEach(o => selectedIds.add(o.id));
      if (dataStatus === 'ready') selectAllActive = false;
      // Only save when background fetch is done (status !== 'loading') to avoid
      // racing with concurrent patchStorage writes and reverting status to 'loading'
      if (dataStatus !== 'loading') saveSelections();
      updateToolbar();
      updateStatusInfo();
    }
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
  visitedPages.add(currentPage);
  window.scrollTo(0, 0);
  render();
  preloadAdjacentPages();
});

document.getElementById('btn-next').addEventListener('click', () => {
  if (currentPage >= totalDisplayPages()) return;
  currentPage++;
  visitedPages.add(currentPage);
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
    selectAllActive = false;
  } else {
    allObservations.forEach(o => selectedIds.add(o.id));
    selectAllActive = dataStatus !== 'ready';
  }
  saveSelections();
  renderGrid();
  updateToolbar();
  updateStatusInfo();
});

document.getElementById('btn-process').addEventListener('click', () => tryAddToQueue(false));

document.getElementById('btn-cancel').addEventListener('click', () => {
  chrome.storage.local.remove('innat_custom_bulk');
  window.close();
});

const btnSubtaxa = document.getElementById('btn-subtaxa');
if (btnSubtaxa) {
  btnSubtaxa.addEventListener('click', async () => {
    includeSubtaxa = !includeSubtaxa;
    updateToolbar();

    // Reload observations with modified search URL
    if (searchUrl) {
      const newUrl = modifySearchUrlForSubtaxa(searchUrl, includeSubtaxa);
      await chrome.storage.local.get(['innat_custom_bulk'], (result) => {
        const data = result.innat_custom_bulk;
        if (data) {
          chrome.storage.local.set({
            innat_custom_bulk: {
              ...data,
              searchUrl: newUrl,
              status: 'loading',
              observations: [],
              fetchedApiPages: 0,
              totalApiPages: 0
            }
          });
          chrome.runtime.sendMessage(
            { action: 'reloadObservations', searchUrl: newUrl },
            () => { void chrome.runtime.lastError; }
          );
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts + virtual cursor
// ---------------------------------------------------------------------------

function getRowsSorted() {
  const cards = Array.from(document.querySelectorAll('.obs-card'));
  const rows = new Map();
  for (const card of cards) {
    const top = card.offsetTop;
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push(card);
  }
  return { rows, sortedTops: Array.from(rows.keys()).sort((a, b) => a - b) };
}

function scrollRowBy(delta) {
  const { rows, sortedTops } = getRowsSorted();
  if (sortedTops.length === 0) return;
  const toolbarH = document.getElementById('toolbar')?.offsetHeight || 0;
  const viewportCenter = window.scrollY + toolbarH + (window.innerHeight - toolbarH) / 2;
  let centerIdx = 0, bestDist = Infinity;
  sortedTops.forEach((top, i) => {
    const h = rows.get(top)[0].offsetHeight;
    const dist = Math.abs(top + h / 2 - viewportCenter);
    if (dist < bestDist) { bestDist = dist; centerIdx = i; }
  });
  const targetIdx = Math.min(Math.max(centerIdx + delta, 0), sortedTops.length - 1);
  const targetTop = sortedTops[targetIdx];
  const targetH = rows.get(targetTop)[0].offsetHeight;
  window.scrollTo({ top: targetTop + targetH / 2 - viewportCenter + window.scrollY, behavior: 'smooth' });
}

function getCenterRowCards() {
  const { rows, sortedTops } = getRowsSorted();
  if (sortedTops.length === 0) return [];
  const toolbarH = document.getElementById('toolbar')?.offsetHeight || 0;
  const viewportCenter = window.scrollY + toolbarH + (window.innerHeight - toolbarH) / 2;
  let bestCards = [], bestDist = Infinity;
  for (const [top, rowCards] of rows) {
    const dist = Math.abs(top + rowCards[0].offsetHeight / 2 - viewportCenter);
    if (dist < bestDist) { bestDist = dist; bestCards = rowCards; }
  }
  return bestCards;
}

function updateVkHighlight() {
  document.querySelectorAll('.vk-active').forEach(el => el.classList.remove('vk-active'));
  if (!kbPrimaryId) return;
  const overlayEl = shiftHeld ? shiftOverlayEl : ctrlOverlayEl;
  if (!overlayEl.classList.contains('visible')) return;
  const overlayCardId = shiftHeld ? shiftOverlayCardId : ctrlOverlayCardId;
  if (overlayCardId !== kbPrimaryId) return;
  const zone = Array.from(overlayEl.children)[vkRow * 3 + vkCol];
  if (zone) zone.classList.add('vk-active');
}

function setKbFocus(card) {
  const id = card.dataset.id;
  if (kbFocusedIds.has(id)) {
    // Toggle off
    kbFocusedIds.delete(id);
    card.classList.remove('kb-focused');
    kbPrimaryId = kbFocusedIds.size > 0 ? [...kbFocusedIds].at(-1) : null;
  } else {
    kbFocusedIds.add(id);
    card.classList.add('kb-focused');
    kbPrimaryId = id;
    const rect = card.getBoundingClientRect();
    vkMouseX = rect.left + rect.width / 2;
    vkMouseY = rect.top + rect.height / 2;
  }
  const primaryCard = kbPrimaryId ? document.querySelector(`.obs-card[data-id="${kbPrimaryId}"]`) : null;
  if (primaryCard && shiftHeld) { hideCtrlOverlay(); showShiftOverlay(primaryCard); }
  else if (primaryCard) { hideShiftOverlay(); showCtrlOverlay(primaryCard); }
  else { hideCtrlOverlay(); hideShiftOverlay(); }
}

function clearKbFocus() {
  kbFocusedIds.forEach(id => {
    const card = document.querySelector(`.obs-card[data-id="${id}"]`);
    if (card) card.classList.remove('kb-focused');
  });
  kbFocusedIds.clear();
  kbPrimaryId = null;
}

function positionToastOnCard(toast, cardId) {
  const card = cardId && document.querySelector(`.obs-card[data-id="${cardId}"]`);
  if (card) {
    const rect = card.getBoundingClientRect();
    toast.style.top = (rect.top + rect.height / 2) + 'px';
    toast.style.left = (rect.left + rect.width / 2) + 'px';
    toast.style.right = 'auto';
    toast.style.transform = 'translate(-50%, -50%)';
    return true;
  } else {
    toast.style.top = '16px';
    toast.style.right = '16px';
    toast.style.left = 'auto';
    toast.style.transform = 'none';
    return false;
  }
}

function applyZoneToFocusedCards(zoneEl, isCtrl) {
  const type = zoneEl.dataset.type;
  const ids = Array.from(kbFocusedIds);
  const count = ids.length;
  const label = (isCtrl ? ANNOTATION_LABELS[type] : SHIFT_ANNOTATION_LABELS[type]) || type;
  const toast = document.getElementById('queue-toast');
  const centered = positionToastOnCard(toast, kbPrimaryId);
  const toastDelay = centered ? 600 : 3000;

  if (isCtrl) {
    toast.textContent = `⏳ Annotating ${count}×: ${label}…`;
    toast.classList.add('active');
    ids.forEach(id => {
      ctrlDeselectCard(id);
      chrome.runtime.sendMessage({ action: 'quickAnnotateObs', obsId: id, mode: type });
      addAnnotationsToCard(id, type);
    });
    toast.textContent = `✓ ${count}× ${label}`;
    setTimeout(() => toast.classList.remove('active'), toastDelay);
  } else if (type === 'mating') {
    toast.textContent = `⏳ Tagging ${count}× mating…`;
    toast.classList.add('active');
    ids.forEach(id => {
      chrome.runtime.sendMessage({ action: 'postObservationField', obsId: id, fieldId: 6637, value: 'yes' }, response => {
        if (response?.success) {
          matingIds.add(id);
          const card = document.querySelector(`.obs-card[data-id="${id}"]`);
          if (card) {
            const existing = card.querySelector('.ann-badges');
            if (existing) card.removeChild(existing);
            const badges = buildAnnotationBadges(
              allObservations.find(o => o.id === id)?.annotations,
              allObservations.find(o => o.id === id)?.qualityGrade, id
            );
            if (badges) card.appendChild(badges);
          }
        }
      });
    });
    toast.textContent = `✓ ${count}× ❤️ Mating`;
    setTimeout(() => toast.classList.remove('active'), toastDelay);
  } else {
    toast.textContent = `⏳ Annotating ${count}×: ${label}…`;
    toast.classList.add('active');
    ids.forEach(id => {
      chrome.runtime.sendMessage({ action: 'quickAnnotateObs', obsId: id, mode: type });
      addAnnotationsToCard(id, type);
    });
    toast.textContent = `✓ ${count}× ${label}`;
    setTimeout(() => toast.classList.remove('active'), toastDelay);
  }

  if (isCtrl) hideCtrlOverlay(); else hideShiftOverlay();
  clearKbFocus();
}

// Sync real mouse hover over overlay zones with vkRow/vkCol
[ctrlOverlayEl, shiftOverlayEl].forEach(overlayEl => {
  Array.from(overlayEl.children).forEach((zone, idx) => {
    zone.addEventListener('mouseenter', () => {
      vkRow = Math.floor(idx / 3);
      vkCol = idx % 3;
      updateVkHighlight();
    });
  });
});

document.addEventListener('keydown', (e) => {
  // Ignore shortcuts if user is typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':
      if (kbPrimaryId) {
        vkCol = Math.max(0, vkCol - 1);
        updateVkHighlight();
        e.preventDefault();
      }
      break;
    case 'ArrowRight':
      if (kbPrimaryId) {
        vkCol = Math.min(2, vkCol + 1);
        updateVkHighlight();
        e.preventDefault();
      }
      break;
    case 'ArrowUp':
      if (kbPrimaryId) {
        vkRow = Math.max(0, vkRow - 1);
        updateVkHighlight();
        e.preventDefault();
      }
      break;
    case 'ArrowDown':
      if (kbPrimaryId) {
        vkRow = Math.min(2, vkRow + 1);
        updateVkHighlight();
        e.preventDefault();
      }
      break;
    case 'Enter': {
      if (ctrlHeld) {
        // Ctrl+Enter: send all selected to queue and close
        if (!shiftHeld) {
          if (annotationType === 'sex-split') {
            if (femaleIds.size > 0 || maleIds.size > 0) addToQueue().then(() => window.close());
          } else if (selectedIds.size > 0) {
            tryAddToQueue();
          }
        }
        e.preventDefault();
      } else if (kbPrimaryId) {
        // Enter: deselect and open all focused obs in new tabs
        const idsToOpen = kbFocusedIds.size > 0 ? [...kbFocusedIds] : (ctrlOverlayCardId ? [ctrlOverlayCardId] : []);
        idsToOpen.forEach(id => {
          ctrlDeselectCard(id);
          chrome.tabs.create({ url: `https://www.inaturalist.org/observations/${id}`, active: false });
        });
        hideCtrlOverlay();
        clearKbFocus();
        e.preventDefault();
      }
      break;
    }
    case 'Escape':
      clearKbFocus();
      hideCtrlOverlay();
      hideShiftOverlay();
      hidePhotoOverlay();
      break;
    default: {
      // Zone shortcuts: khg=top row, snr=middle row, bm,=bottom row (neo2 positions)
      // '–' is shift+, on neo2 layout, maps to same zone as ','
      const ZONE_KEYS = { 'k': [0,0], 'h': [0,1], 'g': [0,2], 's': [1,0], 'n': [1,1], 'r': [1,2], 'b': [2,0], 'm': [2,1], ',': [2,2], '–': [2,2] };
      const zone = ZONE_KEYS[e.key.toLowerCase() === e.key ? e.key : e.key.toLowerCase()];
      if (zone && kbPrimaryId) {
        const [row, col] = zone;
        vkRow = row; vkCol = col;
        const overlayEl = shiftHeld ? shiftOverlayEl : ctrlOverlayEl;
        const zoneEl = Array.from(overlayEl.children)[vkRow * 3 + vkCol];
        if (zoneEl) applyZoneToFocusedCards(zoneEl, !shiftHeld);
        e.preventDefault();
        break;
      }
      switch (e.key.toLowerCase()) {
        case 'o': {
          if (document.getElementById('photo-overlay').classList.contains('visible')) {
            hidePhotoOverlay();
          } else if (kbPrimaryId) {
            const obs = allObservations.find(o => o.id === kbPrimaryId);
            if (obs?.photoUrl) showPhotoOverlay(obs.photoUrl);
          }
          break;
        }
        case 'x':
          if (kbFocusedIds.size > 0) {
            [...kbFocusedIds].forEach(id => {
              selectedIds.delete(id);
              femaleIds.delete(id);
              maleIds.delete(id);
              manuallyDeselectedIds.add(id);
              const card = document.querySelector(`.obs-card[data-id="${id}"]`);
              if (card) { card.classList.remove('selected'); card.classList.add('deselected'); card.querySelector('.sex-female-overlay')?.classList.remove('active'); card.querySelector('.sex-male-overlay')?.classList.remove('active'); }
            });
            saveSelections(); saveSexSelections(); updateToolbar(); updateStatusInfo();
            hideCtrlOverlay(); hideShiftOverlay();
            clearKbFocus();
          }
          break;
        case ' ':
          if (currentPage < totalDisplayPages()) document.getElementById('btn-next').click();
          e.preventDefault();
          break;
        case 'backspace':
          if (currentPage > 1) document.getElementById('btn-prev').click();
          e.preventDefault();
          break;
        case 'p':
          document.getElementById('btn-select-page').click();
          break;
        case 'a':
          if (annotationType !== 'sex-split') document.getElementById('btn-select-all').click();
          break;
        case 'u': {
          scrollRowBy(+1);
          break;
        }
        case 'ü': {
          scrollRowBy(-1);
          break;
        }
        case '1': case '2': case '3': case '4': case '5': {
          const idx = ['1', '2', '3', '4', '5'].indexOf(e.key);
          const centerCards = getCenterRowCards();
          if (idx < centerCards.length) {
            setKbFocus(centerCards[idx]);
            vkRow = 1; vkCol = 1;
            updateVkHighlight();
          }
          break;
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Warning modal for unvisited pages
// ---------------------------------------------------------------------------


function selectAllIsActive() {
  return allObservations.length > 0 &&
    allObservations.every(o => selectedIds.has(o.id));
}

function hasSelectionsOnUnvisitedPages() {
  return allObservations.some((o, i) => {
    const page = Math.floor(i / PAGE_SIZE) + 1;
    return !visitedPages.has(page) && selectedIds.has(o.id);
  });
}

let _warnCloseAfter = true;

function tryAddToQueue(closeAfter = true) {
  _warnCloseAfter = closeAfter;
  if (hasSelectionsOnUnvisitedPages()) {
    document.getElementById('warn-current-page').textContent = currentPage;
    document.getElementById('warn-overlay').classList.add('visible');
  } else {
    const p = addToQueue();
    if (closeAfter) p.then(() => window.close());
  }
}

document.getElementById('warn-trim-confirm').addEventListener('click', () => {
  document.getElementById('warn-overlay').classList.remove('visible');
  const keepIds = new Set(
    allObservations.slice(0, currentPage * PAGE_SIZE).map(o => o.id)
  );
  for (const id of selectedIds) {
    if (!keepIds.has(id)) selectedIds.delete(id);
  }
  const p = addToQueue();
  if (_warnCloseAfter) p.then(() => window.close());
});


document.getElementById('warn-cancel').addEventListener('click', () => {
  document.getElementById('warn-overlay').classList.remove('visible');
});

document.getElementById('warn-overlay').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('warn-trim-confirm').click();
  if (e.key === 'Escape') document.getElementById('warn-cancel').click();
});

// Also handle Enter/Esc globally when modal is open
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('warn-overlay').classList.contains('visible')) return;
  if (e.key === 'Enter') { e.stopImmediatePropagation(); document.getElementById('warn-trim-confirm').click(); }
  if (e.key === 'Escape') { e.stopImmediatePropagation(); document.getElementById('warn-cancel').click(); }
}, true);

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
      if (taxonId) {
        const taxonUrl = `https://www.inaturalist.org/taxa/${taxonId}`;
        const setTaxonLink = (label) => {
          const el = document.getElementById('taxon-info');
          el.innerHTML = '';
          const a = document.createElement('a');
          a.href = taxonUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = label;
          el.appendChild(a);
        };
        if (taxonName) {
          setTaxonLink(`${taxonName} (${taxonId})`);
        } else {
          setTaxonLink(`taxon: ${taxonId}`);
          fetch(`https://api.inaturalist.org/v1/taxa/${taxonId}`)
            .then(r => r.json())
            .then(json => {
              const t = json.results && json.results[0];
              if (t) {
                setTaxonLink(`${t.name} (${taxonId})`);
              }
            })
            .catch(() => {});
        }
      }
    } catch { /* ignore malformed URLs */ }
  }

  updateSexModeUI(); // applies button visibility and renders

  if (allObservations.length > 0) preloadAdjacentPages();
}

init();
