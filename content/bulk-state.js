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
         url.includes('/observations/identify');
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

// Function to get display name for annotation mode
function getAnnotationDisplayName(mode) {
  switch(mode) {
    case 'adult-alive': return '🦆 Adult Live';
    case 'adult-dead': return '💀 Adult Dead';
    case 'juvenile': return '🐛 Juvenile';
    case 'juvenile-dead': return '💀 Juvenile Dead';
    case 'age-unknown': return '❓ Age Unknown';
    case 'plant-flowers': return '🌼 Flowers + Green Leaves';
    case 'plant-fruits': return '🍇 Fruits + Green Leaves';
    case 'plant-no-flowers-fruits': return '🍇❌ No Flowers/Fruits + Green Leaves';
    default: return 'Unknown';
  }
}
