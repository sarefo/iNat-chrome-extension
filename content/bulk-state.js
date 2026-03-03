// Global state for bulk selection mode
let bulkSelectionMode = false;
let selectedObservations = new Set();
let bulkModeButtons = null;
let bulkAnnotationMode = 'adult-alive'; // Default mode

// Function to check if we're on a supported observations list page
function isObservationsListPage() {
  const url = window.location.href;
  return url.includes('/observations?') ||
         (url.includes('/observations') && window.location.search.length > 0) ||
         url.includes('/observations/export') ||
         url.includes('/observations/identify');
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
