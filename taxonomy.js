'use strict';

// ── Rank metadata ──────────────────────────────────────────────────────────────

const RANK_ORDER = [
  'stateofmatter','kingdom','phylum','subphylum','superclass','class','subclass',
  'superorder','order','suborder','superfamily','family','subfamily','tribe','subtribe',
  'genus','genushybrid','subgenus','species','hybrid','subspecies','variety','form'
];
const RANK_INDEX = Object.fromEntries(RANK_ORDER.map((r, i) => [r, i]));

const RANK_COLOR = {
  stateofmatter: '#455A64', kingdom: '#5C6BC0', phylum: '#7E57C2',
  subphylum: '#9575CD', superclass: '#BA68C8', class: '#AB47BC',
  subclass: '#CE93D8', superorder: '#F48FB1', order: '#EC407A',
  suborder: '#EF5350', superfamily: '#E53935', family: '#EF5350',
  subfamily: '#FF7043', tribe: '#FFA726', subtribe: '#FFCA28',
  genus: '#66BB6A', genushybrid: '#66BB6A', subgenus: '#26A69A',
  species: '#29B6F6', hybrid: '#4FC3F7', subspecies: '#78909C',
  variety: '#8D6E63', form: '#A1887F',
};
const RANK_TEXT_DARK = new Set(['subtribe']);
const LEAF_RANKS = new Set(['species','hybrid','genushybrid','subspecies','variety','form']);

// ── State ──────────────────────────────────────────────────────────────────────

let rootNode = null;
const nodeById = new Map();
let visibleRanks = new Set();
const doneIds = new Set();
let treeVisible = false;
let overlayVisible = true;
let sortMode = 'unann'; // 'alpha' | 'obs' | 'unann'

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  const params   = new URLSearchParams(location.search);
  const taxonId  = params.get('taxon_id');
  const nameHint = params.get('taxon_name');

  document.getElementById('btn-back').addEventListener('click', navigateUp);
  document.getElementById('btn-tree-toggle').addEventListener('click', toggleTree);
  buildViewControls();

  await loadQueuedTaxonIds();

  if (!taxonId) { showEmpty('No taxon specified.'); return; }

  let rootData;
  try {
    const resp = await fetch(`https://api.inaturalist.org/v1/taxa/${taxonId}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    rootData = json.results?.[0];
  } catch {
    showEmpty(nameHint ? `${nameHint} — failed to load.` : 'Failed to load taxon.');
    return;
  }
  if (!rootData) { showEmpty('Taxon not found.'); return; }

  rootNode = makeNode(rootData, rootData.parent_id ?? null);
  nodeById.set(rootNode.id, rootNode);
  document.title = `${rootData.preferred_common_name || rootData.name} — iNat Taxonomy`;

  await setRoot(rootNode);
}

// ── Root navigation ────────────────────────────────────────────────────────────

async function setRoot(node) {
  rootNode = node;

  if (!rootNode.childrenLoaded) {
    showGridLoading(true);
    await loadChildren(rootNode);
    showGridLoading(false);
  }

  updateUpButton();
  buildRankFilterBar();   // initialises visibleRanks based on what's loaded
  renderBreadcrumb();
  renderGrid();
  if (treeVisible) renderTree();

  fetchUnannCounts(rootNode.children.filter(c => !c.isLoadMore));
}

async function navigateUp() {
  if (!rootNode?.parentId) return;

  let parent = nodeById.get(rootNode.parentId);
  if (!parent) {
    try {
      const resp = await fetch(`https://api.inaturalist.org/v1/taxa/${rootNode.parentId}`);
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      const pd = json.results?.[0];
      if (pd) {
        parent = makeNode(pd, pd.parent_id ?? null);
        nodeById.set(parent.id, parent);
      }
    } catch { return; }
  }
  if (parent) await setRoot(parent);
}

function updateUpButton() {
  const btn = document.getElementById('btn-back');
  btn.disabled = !rootNode?.parentId;
  btn.style.opacity = rootNode?.parentId ? '1' : '0.45';
}

// ── Node factory ───────────────────────────────────────────────────────────────

function makeNode(t, parentId) {
  const photo = t.default_photo;
  const photoUrl = photo ? (photo.medium_url ?? photo.square_url ?? null) : null;
  return {
    id: t.id, name: t.name, rank: t.rank,
    commonName: t.preferred_common_name || null,
    photoUrl,
    obsCount:   t.observations_count ?? 0,
    unannCount: null,
    parentId,
    children: [], childrenLoaded: false,
    expanded: false, inlineExpanded: false,
    hasChildren: !LEAF_RANKS.has(t.rank),
  };
}

// ── Load children ──────────────────────────────────────────────────────────────

async function loadChildren(node) {
  try {
    const resp = await fetchTaxa(`parent_id=${node.id}&per_page=500`);
    node.childrenLoaded = true;
    for (const t of resp.results) {
      if (nodeById.has(t.id)) continue;
      if ((t.observations_count ?? 0) === 0) continue;
      const child = makeNode(t, node.id);
      node.children.push(child);
      nodeById.set(child.id, child);
    }
    if (resp.total_results > 500) {
      node.children.push({ isLoadMore: true, parentId: node.id, nextPage: 2, remaining: resp.total_results - 500 });
    }
  } catch (e) {
    console.warn('[taxonomy] loadChildren failed for', node.id, e);
    node.childrenLoaded = true;
    node.hasChildren = false;
  }
}

// Load children for all nodes whose rank is coarser than targetRank (and haven't been loaded yet).
// Repeats level by level until no such nodes remain (handles tribe → genus → species chains).
async function loadAllPendingChildren(targetRank) {
  const MAX_ITER = 6;
  const CONCURRENCY = 3;
  const BATCH_DELAY = 600;
  const targetIdx = targetRank ? (RANK_INDEX[targetRank] ?? 99) : 99;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Only load nodes whose rank is strictly coarser than the target rank.
    // e.g. for targetRank='genus': load tribes/subtribes but not genera themselves.
    const pending = [...nodeById.values()].filter(n =>
      !n.isLoadMore && !n.childrenLoaded && n.hasChildren &&
      (RANK_INDEX[n.rank] ?? 99) < targetIdx
    );
    if (!pending.length) break;

    const allNew = [];
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      await Promise.all(pending.slice(i, i + CONCURRENCY).map(n => loadChildren(n)));
      renderGrid();
      if (i + CONCURRENCY < pending.length) await delay(BATCH_DELAY);
    }
    for (const n of pending) allNew.push(...n.children.filter(c => !c.isLoadMore));
    fetchUnannCounts(allNew);
  }
}

async function loadMoreChildren(placeholder) {
  const parent = nodeById.get(placeholder.parentId);
  if (!parent) return;
  try {
    const resp = await fetchTaxa(`parent_id=${placeholder.parentId}&per_page=500&page=${placeholder.nextPage}`);
    const idx = parent.children.indexOf(placeholder);
    if (idx !== -1) parent.children.splice(idx, 1);
    const newNodes = [];
    for (const t of resp.results) {
      if (nodeById.has(t.id)) continue;
      if ((t.observations_count ?? 0) === 0) continue;
      const child = makeNode(t, parent.id);
      parent.children.push(child);
      nodeById.set(child.id, child);
      newNodes.push(child);
    }
    const loaded = placeholder.nextPage * 500;
    if (resp.total_results > loaded) {
      parent.children.push({ isLoadMore: true, parentId: parent.id, nextPage: placeholder.nextPage + 1, remaining: resp.total_results - loaded });
    }
    renderGrid();
    if (treeVisible) renderTree();
    fetchUnannCounts(newNodes);
  } catch (e) { console.warn('[taxonomy] loadMoreChildren failed', e); }
}

async function fetchTaxa(qs) {
  const resp = await fetch(`https://api.inaturalist.org/v1/taxa?${qs}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  return { results: json.results || [], total_results: json.total_results || 0 };
}

// ── View controls (overlay + sort) ────────────────────────────────────────────

function buildViewControls() {
  const ctrl = document.getElementById('view-controls');

  const overlayBtn = document.createElement('button');
  overlayBtn.className = 'view-btn active';
  overlayBtn.title = 'Toggle photo labels';
  overlayBtn.textContent = 'Labels';
  overlayBtn.addEventListener('click', () => {
    overlayVisible = !overlayVisible;
    document.body.classList.toggle('overlay-off', !overlayVisible);
    overlayBtn.classList.toggle('active', overlayVisible);
  });
  ctrl.appendChild(overlayBtn);

  const sortGroup = document.createElement('div');
  sortGroup.className = 'sort-group';
  const sorts = [
    { key: 'alpha', label: 'A–Z', title: 'Sort alphabetically' },
    { key: 'obs',   label: 'Obs', title: 'Sort by total observations' },
    { key: 'unann', label: '★',   title: 'Sort by unannotated observations' },
  ];
  for (const s of sorts) {
    const btn = document.createElement('button');
    btn.className = 'sort-btn' + (s.key === sortMode ? ' active' : '');
    btn.textContent = s.label;
    btn.title = s.title;
    btn.dataset.sort = s.key;
    btn.addEventListener('click', () => {
      sortMode = s.key;
      sortGroup.querySelectorAll('.sort-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.sort === sortMode));
      renderGrid();
      if (treeVisible) renderTree();
    });
    sortGroup.appendChild(btn);
  }
  ctrl.appendChild(sortGroup);
}

// ── Rank filter bar ────────────────────────────────────────────────────────────

function buildRankFilterBar() {
  const bar = document.getElementById('rank-filter-bar');
  // Remove only rank chips — leave #view-controls intact
  bar.querySelectorAll('.rank-chip').forEach(el => el.remove());
  if (!rootNode) return;

  const rootIdx = RANK_INDEX[rootNode.rank] ?? 0;
  const lowerRanks = RANK_ORDER.filter(r => (RANK_INDEX[r] ?? 99) > rootIdx);
  if (!lowerRanks.length) return;

  // Initialise visibleRanks: only the coarsest rank among direct children starts ON.
  // e.g. if Hypenodinae has tribes + unassigned genera, only "tribe" is ON initially.
  const directChildren = rootNode.children.filter(c => !c.isLoadMore);
  const minChildRankIdx = directChildren.length
    ? Math.min(...directChildren.map(c => RANK_INDEX[c.rank] ?? 99))
    : 99;
  visibleRanks = new Set(
    directChildren
      .filter(c => (RANK_INDEX[c.rank] ?? 99) === minChildRankIdx)
      .map(c => c.rank)
  );

  const viewControls = document.getElementById('view-controls');
  for (const rank of lowerRanks) {
    const on  = visibleRanks.has(rank);
    const chip = document.createElement('button');
    chip.className   = 'rank-chip' + (on ? '' : ' off');
    chip.textContent = rank;
    chip.dataset.rank = rank;
    chip.style.setProperty('--rank-color', RANK_COLOR[rank] ?? '#888');
    if (RANK_TEXT_DARK.has(rank)) chip.style.color = '#333';
    chip.addEventListener('click', () => onChipClick(chip, rank));
    bar.insertBefore(chip, viewControls); // chips on left, view-controls on right
  }
}

function getPresentRanks() {
  const s = new Set();
  for (const n of nodeById.values()) {
    if (n !== rootNode && !n.isLoadMore && n.rank) s.add(n.rank);
  }
  return s;
}

async function onChipClick(chip, rank) {
  if (visibleRanks.has(rank)) {
    visibleRanks.delete(rank);
    chip.classList.add('off');
    renderGrid();
  } else {
    visibleRanks.add(rank);
    chip.classList.remove('off');

    // Load deeper levels if any node still has unloaded children —
    // this is needed even when the rank is partly present as a direct child
    // (e.g. "genus" exists under the subfamily directly, but not yet under tribes).
    const hasUnloaded = [...nodeById.values()].some(n =>
      !n.isLoadMore && !n.childrenLoaded && n.hasChildren
    );
    if (hasUnloaded) {
      chip.textContent = rank + ' ⏳';
      chip.disabled = true;
      await loadAllPendingChildren(rank);
      chip.textContent = rank;
      chip.disabled = false;
    }

    renderGrid();
    if (treeVisible) renderTree();
  }
}

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  el.innerHTML = '';
  const path = buildPathTo(rootNode);
  path.forEach((node, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      el.appendChild(sep);
    }
    const crumb = document.createElement('span');
    crumb.className = 'crumb' + (i === path.length - 1 ? ' current' : '');
    crumb.title = node.name;
    crumb.textContent = node.name;
    if (i < path.length - 1) crumb.addEventListener('click', () => setRoot(node));
    el.appendChild(crumb);
  });
}

function buildPathTo(node) {
  const path = [];
  let n = node;
  while (n) {
    path.unshift(n);
    n = n.parentId != null ? nodeById.get(n.parentId) : null;
  }
  return path;
}

// ── Flat photo grid ────────────────────────────────────────────────────────────

function renderGrid() {
  const container = document.getElementById('grid-container');
  container.innerHTML = '';

  const items = flattenTree(rootNode);
  document.getElementById('grid-empty').style.display = items.length === 0 ? '' : 'none';

  for (const item of items) {
    container.appendChild(item.isLoadMore ? buildLoadMoreCard(item) : buildCard(item));
  }
}

// Depth-first: parent before children, sorted within siblings.
// parentInlineExpanded=true means direct children are shown regardless of visibleRanks.
function flattenTree(node, parentInlineExpanded = false) {
  const result = [];
  for (const child of sortedChildren(node)) {
    if (child.isLoadMore) { result.push(child); continue; }
    if (visibleRanks.has(child.rank) || parentInlineExpanded) result.push(child);
    if (child.childrenLoaded) result.push(...flattenTree(child, child.inlineExpanded));
  }
  return result;
}

function sortedChildren(node) {
  if (!node?.children) return [];
  return [...node.children].sort((a, b) => {
    if (a.isLoadMore) return 1;
    if (b.isLoadMore) return -1;
    const aDone = doneIds.has(a.id) ? 1 : 0;
    const bDone = doneIds.has(b.id) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    // Coarser ranks always precede finer ranks (tribe before genus)
    const aRankIdx = RANK_INDEX[a.rank] ?? 99;
    const bRankIdx = RANK_INDEX[b.rank] ?? 99;
    if (aRankIdx !== bRankIdx) return aRankIdx - bRankIdx;
    // Within same rank: apply current sort mode
    if (sortMode === 'alpha') return a.name.localeCompare(b.name);
    if (sortMode === 'obs')   return (b.obsCount ?? 0) - (a.obsCount ?? 0);
    return (b.unannCount ?? 0) - (a.unannCount ?? 0); // 'unann'
  });
}

function buildCard(node) {
  const done = doneIds.has(node.id);
  const card = document.createElement('div');
  card.className = 'taxon-card' + (done ? ' done' : '');
  card.dataset.id = node.id;
  card.style.setProperty('--rank-color', RANK_COLOR[node.rank] ?? '#888');

  if (node.photoUrl) {
    const img = document.createElement('img');
    img.src = node.photoUrl;
    img.alt = node.name;
    img.loading = 'lazy';
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'no-photo';
    ph.textContent = node.name;
    card.appendChild(ph);
  }

  if (done) {
    const ov = document.createElement('div');
    ov.className = 'done-overlay';
    ov.textContent = '✓';
    card.appendChild(ov);
  }

  // Hover action buttons (top bar)
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const mkBtn = (label, title, handler) => {
    const b = document.createElement('button');
    b.className = 'card-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', e => { e.stopPropagation(); handler(); });
    return b;
  };
  actions.appendChild(mkBtn('⊙ root',  'Set as root taxon',         () => setRoot(node)));
  actions.appendChild(mkBtn(node.inlineExpanded ? '▴ sub' : '▾ sub', 'Expand/collapse subtaxa inline', () => expandInline(node)));
  actions.appendChild(mkBtn('→ bulk',  'Open in bulk mode (new tab)', () => openBulkForTaxon(node)));
  actions.appendChild(mkBtn('↗ iNat', 'Open on iNaturalist',        () => window.open(`https://www.inaturalist.org/taxa/${node.id}`, '_blank', 'noopener')));
  card.appendChild(actions);

  // Bottom info bar
  const info = document.createElement('div');
  info.className = 'card-info';

  const name = document.createElement('span');
  name.className = 'card-name';
  name.textContent = node.name;
  name.title = node.commonName || node.name;
  info.appendChild(name);

  const counts = document.createElement('div');
  counts.className = 'card-counts';

  const obsEl = document.createElement('span');
  obsEl.className = 'card-obs-count';
  obsEl.textContent = node.obsCount.toLocaleString();
  counts.appendChild(obsEl);

  const unannEl = document.createElement('span');
  unannEl.className = 'unannotated-count';
  unannEl.dataset.nodeId = node.id;
  if (node.unannCount != null) unannEl.textContent = `★ ${node.unannCount.toLocaleString()}`;
  else unannEl.style.display = 'none';
  counts.appendChild(unannEl);

  info.appendChild(counts);
  card.appendChild(info);

  return card;
}

function buildLoadMoreCard(placeholder) {
  const card = document.createElement('div');
  card.className = 'load-more-card';
  card.textContent = `Load ${placeholder.remaining.toLocaleString()} more…`;
  card.addEventListener('click', () => loadMoreChildren(placeholder));
  return card;
}

// ── Tree panel ─────────────────────────────────────────────────────────────────

function toggleTree() {
  treeVisible = !treeVisible;
  const panel = document.getElementById('tree-panel');
  const btn   = document.getElementById('btn-tree-toggle');
  panel.style.display = treeVisible ? '' : 'none';
  btn.classList.toggle('active', treeVisible);
  if (treeVisible) renderTree();
}

function renderTree() {
  const container = document.getElementById('tree-panel');
  container.innerHTML = '';
  if (!rootNode) return;
  renderTreeSubtree(rootNode, container, 0);
}

function renderTreeSubtree(node, container, depth) {
  for (const child of sortedChildren(node)) {
    if (child.isLoadMore) {
      const row = document.createElement('div');
      row.className = 'load-more-row';
      row.style.paddingLeft = `calc(10px + ${depth} * 18px)`;
      const btn = document.createElement('button');
      btn.textContent = `Load ${child.remaining.toLocaleString()} more…`;
      btn.addEventListener('click', () => loadMoreChildren(child));
      row.appendChild(btn);
      container.appendChild(row);
      continue;
    }

    const row = document.createElement('div');
    row.className = 'taxon-row' + (doneIds.has(child.id) ? ' done' : '');
    row.dataset.id = child.id;
    row.style.setProperty('--indent', depth);

    // Expand triangle
    const expandBtn = document.createElement('span');
    expandBtn.className = 'expand-btn';
    if (!child.hasChildren && child.childrenLoaded) {
      expandBtn.textContent = '·';
    } else {
      expandBtn.textContent = child.expanded ? '▼' : '▶';
      expandBtn.addEventListener('click', e => { e.stopPropagation(); treeToggleExpand(child); });
    }
    row.appendChild(expandBtn);

    // Name (click → open bulk mode)
    const sciName = document.createElement('span');
    sciName.className = 'sci-name';
    sciName.textContent = child.name;
    sciName.addEventListener('click', e => { e.stopPropagation(); openBulkForTaxon(child); });
    row.appendChild(sciName);

    if (child.commonName) {
      const cn = document.createElement('span');
      cn.className = 'common-name';
      cn.textContent = child.commonName;
      row.appendChild(cn);
    }

    const obsEl = document.createElement('span');
    obsEl.className = 'tree-obs-count';
    obsEl.textContent = child.obsCount.toLocaleString();
    row.appendChild(obsEl);

    const unannEl = document.createElement('span');
    unannEl.className = 'tree-unannotated';
    unannEl.dataset.nodeId = child.id;
    if (child.unannCount != null) unannEl.textContent = `★ ${child.unannCount.toLocaleString()}`;
    else unannEl.style.display = 'none';
    row.appendChild(unannEl);

    // iNat link button
    const inatBtn = document.createElement('button');
    inatBtn.className = 'tree-inat-btn';
    inatBtn.textContent = 'iNat↗';
    inatBtn.title = `Open ${child.name} on iNaturalist`;
    inatBtn.addEventListener('click', e => {
      e.stopPropagation();
      window.open(`https://www.inaturalist.org/taxa/${child.id}`, '_blank', 'noopener');
    });
    row.appendChild(inatBtn);

    container.appendChild(row);

    if (child.expanded) {
      if (child.childrenLoaded) {
        renderTreeSubtree(child, container, depth + 1);
      } else {
        const loading = document.createElement('div');
        loading.className = 'loading-row';
        loading.style.paddingLeft = `calc(10px + ${depth + 1} * 18px)`;
        loading.textContent = '⏳ Loading…';
        container.appendChild(loading);
      }
    }
  }
}

async function treeToggleExpand(node) {
  node.expanded = !node.expanded;
  renderTree();
  if (node.expanded && !node.childrenLoaded) {
    await loadChildren(node);
    fetchUnannCounts(node.children.filter(c => !c.isLoadMore));
    renderTree();
  }
}

// ── Unannotated counts ─────────────────────────────────────────────────────────

async function fetchUnannCounts(nodes) {
  const toFetch = nodes.filter(n => !n.isLoadMore && n.unannCount === null && n.obsCount > 0);
  if (!toFetch.length) return;

  // Sort by rank (higher ranks first) and limit to ~12 taxa to respect 1 req/sec rate limit
  const MAX_TO_FETCH = 12;
  const sorted = toFetch.sort((a, b) => (RANK_INDEX[a.rank] ?? 99) - (RANK_INDEX[b.rank] ?? 99));
  const limited = sorted.slice(0, MAX_TO_FETCH);

  const CONCURRENCY = 1;
  const BATCH_DELAY = 1000; // 1 req/sec rate limit

  for (let i = 0; i < limited.length; i += CONCURRENCY) {
    await Promise.all(limited.slice(i, i + CONCURRENCY).map(async node => {
      try {
        const resp = await fetch(`https://api.inaturalist.org/v1/observations?taxon_id=${node.id}&without_term_id=17&per_page=1`);
        const json = await resp.json();
        node.unannCount = json.total_results ?? 0;
      } catch { node.unannCount = 0; }
      updateCountsInDOM(node);
    }));
    if (i + CONCURRENCY < limited.length) await delay(BATCH_DELAY);
  }

  renderGrid();
  if (treeVisible) renderTree();
}

function updateCountsInDOM(node) {
  for (const el of document.querySelectorAll(`[data-node-id="${node.id}"]`)) {
    el.textContent = node.unannCount != null ? `★ ${node.unannCount.toLocaleString()}` : '';
    el.style.display = node.unannCount != null ? '' : 'none';
  }
}

// ── Inline expand ──────────────────────────────────────────────────────────────

async function expandInline(node) {
  if (!node.hasChildren) return;

  // Toggle: collapse if already expanded
  if (node.inlineExpanded) {
    node.inlineExpanded = false;
    renderGrid();
    if (treeVisible) renderTree();
    return;
  }

  if (!node.childrenLoaded) {
    await loadChildren(node);
    fetchUnannCounts(node.children.filter(c => !c.isLoadMore));
  }

  if (!node.children.filter(c => !c.isLoadMore).length) return;

  node.inlineExpanded = true;
  renderGrid();
  if (treeVisible) renderTree();
}

// ── Bulk mode ──────────────────────────────────────────────────────────────────

async function loadQueuedTaxonIds() {
  try {
    const data = await new Promise(r => chrome.storage.local.get(['innat_queues'], r));
    for (const q of (data.innat_queues || [])) {
      try {
        const tid = q.searchUrl ? new URL(q.searchUrl).searchParams.get('taxon_id') : null;
        if (tid) doneIds.add(Number(tid));
      } catch {}
    }
  } catch {}
}

function openBulkForTaxon(node) {
  doneIds.add(node.id);
  renderGrid();
  if (treeVisible) renderTree();

  const searchUrl = `https://www.inaturalist.org/observations?taxon_id=${node.id}&without_term_id=17`;
  chrome.runtime.sendMessage({
    action: 'startCustomBulkMode',
    searchUrl,
    annotationType: 'adult-alive',
    jwt: null,
    sourceTabId: 0,  // 0 is falsy → background won't close this tab
    taxonRank: node.rank  // Pass rank for exact-rank-only filtering
  }, () => { void chrome.runtime.lastError; });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function showGridLoading(show) {
  document.getElementById('grid-loading').style.display = show ? '' : 'none';
  document.getElementById('grid-container').style.display = show ? 'none' : '';
}

function showEmpty(msg) {
  document.getElementById('grid-empty').textContent = msg;
  document.getElementById('grid-empty').style.display = '';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Start ──────────────────────────────────────────────────────────────────────

init();
