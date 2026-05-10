// Global state for bulk selection mode
let bulkSelectionMode = false;
let selectedObservations = new Set();
let bulkModeButtons = null;
let bulkAnnotationMode = 'adult-alive'; // Default mode
let bulkJumpedToLastPage = false;
let bulkTotalObservations = 0;
let bulkTaxonId = ''; // persists through all page navigations to detect/fix iNat taxon_id stripping

// Function to check if we're on a supported observations list page
function isObservationsListPage() {
  const url = window.location.href;
  return url.includes('/observations?') ||
         (url.includes('/observations') && window.location.search.length > 0) ||
         url.includes('/observations/export') ||
         url.includes('/observations/identify') ||
         /\/taxa\/\d+/.test(url);
}

// Observation selection highlight helpers
function markSelected(div) {
  div.style.border = '3px solid #4CAF50';
  div.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
  div.style.borderRadius = '8px';
}

function markDeselected(div) {
  div.style.border = '';
  div.style.boxShadow = '';
  div.style.borderRadius = '';
}

function getAnnotationDisplayName(mode) {
  return INAT_ANNOTATION_LABELS[mode] || 'Unknown';
}
