const API_BASE = 'https://api.inaturalist.org/v1';
const PER_PAGE = 200;
const PARALLEL_BATCH = 5;

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

async function fetchPage(params, page) {
  const p = new URLSearchParams(params);
  p.set('page', String(page));
  const resp = await fetch(`${API_BASE}/observations?${p}`);
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  return resp.json();
}

async function patchStorage(patch) {
  const stored = await chrome.storage.local.get(['innat_custom_bulk']);
  const data = stored.innat_custom_bulk || {};
  await chrome.storage.local.set({ innat_custom_bulk: { ...data, ...patch } });
}

// Fetch all observations for the given iNat page URL, updating storage progressively.
// Opens custom-bulk.html immediately after the first page arrives.
export async function startCustomBulkFetch(searchUrl, annotationType, jwt) {
  // Initialize storage with loading state
  await chrome.storage.local.set({
    innat_custom_bulk: {
      status: 'loading',
      searchUrl,
      annotationType,
      jwt: jwt || null,
      totalCount: 0,
      observations: [],
      selectedIds: [],
      createdAt: Date.now()
    }
  });

  // Open the custom page immediately
  chrome.tabs.create({ url: chrome.runtime.getURL('custom-bulk.html') });

  try {
    const params = buildApiParams(searchUrl);

    // Page 1: get total and first batch fast
    const first = await fetchPage(params, 1);
    const total = first.total_results;
    let allObs = extractObs(first.results);

    await patchStorage({ observations: allObs, totalCount: total });

    if (total > PER_PAGE) {
      const totalPages = Math.ceil(total / PER_PAGE);

      for (let start = 2; start <= totalPages; start += PARALLEL_BATCH) {
        // Abort if user cancelled
        const stored = await chrome.storage.local.get(['innat_custom_bulk']);
        if (!stored.innat_custom_bulk || stored.innat_custom_bulk.status === 'cancelled') return;

        const batch = [];
        for (let p = start; p < start + PARALLEL_BATCH && p <= totalPages; p++) {
          batch.push(fetchPage(params, p));
        }
        const results = await Promise.all(batch);
        for (const r of results) allObs = allObs.concat(extractObs(r.results));

        await patchStorage({ observations: allObs });
      }
    }

    await patchStorage({ status: 'ready', observations: allObs });
  } catch (err) {
    console.error('[obs-fetcher] fetch failed:', err);
    await patchStorage({ status: 'error', error: err.message });
  }
}
