// Shared constants and tiny helpers used across content scripts, background, and HTML pages.
// Loaded as a classic script — no imports/exports.

// chrome.storage.local keys
// var (not const) so these land on the global object and are visible to other
// scripts loaded via importScripts() in the service worker's shared scope.
var STORAGE_KEY_CURRENT     = 'innat_current_collection';
var STORAGE_KEY_QUEUES      = 'innat_queues';
var STORAGE_KEY_CUSTOM_BULK = 'innat_custom_bulk';

// Observations per page on the iNat /observations grid view (used for scroll/preload math).
var INAT_PAGE_SIZE = 96;

// Silently drop the noisy "no receiver" lastError that fires when nobody is listening.
function sendFireAndForget(msg) {
  chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
}

// Build the bulk-mode search URL for the current page.
// - `url`: current tab URL.
// - `withoutTermId`: annotation term ID to exclude (17 = Life Stage, 9 = Sex, etc.).
// - `getTaxonIdFromDom`: optional async fn returning the obs's taxon ID via the page DOM
//   (popup.js routes through the content script; content-main.js reads document directly).
// Resolves to the search URL, or null if not on a supported iNat page / obs has no taxon.
async function buildBulkSearchUrl(url, withoutTermId, getTaxonIdFromDom) {
  const taxaMatch = url.match(/inaturalist\.org\/taxa\/(\d+)/);
  if (taxaMatch) {
    return `https://www.inaturalist.org/observations?taxon_id=${taxaMatch[1]}&without_term_id=${withoutTermId}`;
  }

  const obsMatch = url.match(/inaturalist\.org\/observations\/(\d+)(?:[^/]|$)/);
  if (obsMatch) {
    let taxonId = getTaxonIdFromDom ? await getTaxonIdFromDom() : null;
    if (!taxonId) {
      try {
        const resp = await fetch(`https://api.inaturalist.org/v1/observations/${obsMatch[1]}`);
        const data = await resp.json();
        taxonId = data?.results?.[0]?.taxon?.id ?? null;
      } catch { /* ignore — return null below */ }
    }
    if (!taxonId) return null;
    return `https://www.inaturalist.org/observations?taxon_id=${taxonId}&without_term_id=${withoutTermId}`;
  }

  if (url.includes('inaturalist.org/observations')) {
    const parsed = new URL(url);
    parsed.searchParams.set('without_term_id', String(withoutTermId));
    return parsed.toString();
  }

  return null;
}
