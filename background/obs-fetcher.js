const API_BASE = 'https://api.inaturalist.org/v1';
const PER_PAGE = 200;
const PARALLEL_BATCH = 3;
const BATCH_DELAY_MS = 1000;
const MAX_API_PAGES_BATCH = 5; // 5 API pages × 200 obs = 1000 obs ≈ 10 display pages

// Params from the iNat page URL that don't translate to the API
const SKIP_PARAMS = new Set(['page', 'per_page', 'view', 'utf8', 'tab', 'locale', 'verifiable']);

function buildApiParams(inatPageUrl) {
  const url = new URL(inatPageUrl);
  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!SKIP_PARAMS.has(key)) params.set(key, value);
  }
  params.set('per_page', String(PER_PAGE));
  return params;
}

function extractObs(results) {
  return results
    .filter(obs => obs.photos?.length > 0)
    .map(obs => ({
      id: String(obs.id),
      photoUrl: obs.photos[0].url.replace(/\/square(\.\w+)$/, '/medium$1')
    }));
}

async function fetchPage(params, page, retries = 3) {
  const p = new URLSearchParams(params);
  p.set('page', String(page));
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(`${API_BASE}/observations?${p}`);
    if (resp.ok) return resp.json();
    if (resp.status === 429 && attempt < retries) {
      const backoff = (attempt + 1) * 2000;
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    throw new Error(`API error ${resp.status}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function patchStorage(patch) {
  const stored = await chrome.storage.local.get(['innat_custom_bulk']);
  const data = stored.innat_custom_bulk || {};
  await chrome.storage.local.set({ innat_custom_bulk: { ...data, ...patch } });
}

async function fetchBatch(params, startPage, endPage, existingObs) {
  let allObs = existingObs;
  for (let start = startPage; start <= endPage; start += PARALLEL_BATCH) {
    const stored = await chrome.storage.local.get(['innat_custom_bulk']);
    if (!stored.innat_custom_bulk || stored.innat_custom_bulk.status === 'cancelled') return null;

    const batch = [];
    for (let p = start; p < start + PARALLEL_BATCH && p <= endPage; p++) {
      batch.push(fetchPage(params, p));
    }
    const results = await Promise.all(batch);
    for (const r of results) allObs = allObs.concat(extractObs(r.results));

    const fetchedSoFar = Math.min(start + PARALLEL_BATCH - 1, endPage);
    await patchStorage({ observations: allObs, fetchedApiPages: fetchedSoFar });
    if (start + PARALLEL_BATCH <= endPage) await sleep(BATCH_DELAY_MS);
  }
  return allObs;
}

// Fetch the first batch of observations for the given iNat page URL.
// Opens custom-bulk.html immediately after the first page arrives.
export async function startCustomBulkFetch(searchUrl, annotationType, jwt, sourceTabId) {
  await chrome.storage.local.set({
    innat_custom_bulk: {
      status: 'loading',
      searchUrl,
      annotationType,
      jwt: jwt || null,
      totalCount: 0,
      totalApiPages: 0,
      fetchedApiPages: 0,
      observations: [],
      selectedIds: [],
      createdAt: Date.now()
    }
  });

  chrome.tabs.create({ url: chrome.runtime.getURL('custom-bulk.html') }, () => {
    if (sourceTabId) chrome.tabs.remove(sourceTabId, () => { void chrome.runtime.lastError; });
  });

  try {
    const params = buildApiParams(searchUrl);

    const first = await fetchPage(params, 1);
    const total = first.total_results;
    const totalApiPages = Math.ceil(total / PER_PAGE);
    const batchEnd = Math.min(totalApiPages, MAX_API_PAGES_BATCH);

    let allObs = extractObs(first.results);
    await patchStorage({ observations: allObs, totalCount: total, totalApiPages, fetchedApiPages: 1 });

    if (batchEnd > 1) {
      allObs = await fetchBatch(params, 2, batchEnd, allObs);
      if (allObs === null) return; // cancelled
    }

    const isDone = batchEnd >= totalApiPages;
    await patchStorage({ status: isDone ? 'ready' : 'partial', observations: allObs, fetchedApiPages: batchEnd });
  } catch (err) {
    console.error('[obs-fetcher] fetch failed:', err);
    await patchStorage({ status: 'error', error: err.message });
  }
}

// Fetch the next batch of API pages, appending to existing observations.
export async function fetchMoreObservations(searchUrl) {
  const stored = await chrome.storage.local.get(['innat_custom_bulk']);
  const data = stored.innat_custom_bulk;
  if (!data || data.status !== 'partial') return;

  const { fetchedApiPages, totalApiPages } = data;
  const startPage = fetchedApiPages + 1;
  const endPage = Math.min(totalApiPages, fetchedApiPages + MAX_API_PAGES_BATCH);

  await patchStorage({ status: 'loading' });

  try {
    const params = buildApiParams(searchUrl);
    let allObs = await fetchBatch(params, startPage, endPage, data.observations || []);
    if (allObs === null) return; // cancelled

    const isDone = endPage >= totalApiPages;
    await patchStorage({ status: isDone ? 'ready' : 'partial', observations: allObs, fetchedApiPages: endPage });
  } catch (err) {
    console.error('[obs-fetcher] fetch more failed:', err);
    await patchStorage({ status: 'error', error: err.message });
  }
}
