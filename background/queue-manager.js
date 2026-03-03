import { processBulkObservationsViaApi } from './api-annotator.js';

// Queue storage helpers
async function getQueues() {
  return new Promise(resolve => {
    chrome.storage.local.get(['innat_queues'], data => resolve(data.innat_queues || []));
  });
}

async function setQueues(queues) {
  return new Promise(resolve => {
    chrome.storage.local.set({ innat_queues: queues }, resolve);
  });
}

async function updateQueueStatus(id, status) {
  const queues = await getQueues();
  const q = queues.find(q => q.id === id);
  if (q) {
    q.status = status;
    await setQueues(queues);
  }
}

// Mark a single observation as processed within a queue (persisted for crash recovery)
async function markObservationProcessed(queueId, obsId) {
  const queues = await getQueues();
  const q = queues.find(q => q.id === queueId);
  if (q) {
    if (!q.processedObservations) q.processedObservations = [];
    if (!q.processedObservations.includes(obsId)) q.processedObservations.push(obsId);
    await setQueues(queues);
  }
}

// Reset any queue stuck in 'processing' (e.g. from a previous browser crash) back to 'pending'
async function resetStuckQueues() {
  const queues = await getQueues();
  const stuck = queues.filter(q => q.status === 'processing');
  if (stuck.length === 0) return;
  stuck.forEach(q => { q.status = 'pending'; });
  await setQueues(queues);
}

// Process queued observations sequentially (exported for background-main.js)
export async function processQueuedObservations(queueIds, jwt) {
  await resetStuckQueues();

  const queues = await getQueues();
  const results = [];

  for (const queueId of queueIds) {
    const queue = queues.find(q => q.id === queueId);
    if (!queue) {
      console.warn(`Queue ${queueId} not found`);
      continue;
    }

    // Skip observations already processed (crash recovery)
    const alreadyDone = new Set(queue.processedObservations || []);
    const remaining = queue.observations.filter(id => !alreadyDone.has(id));

    console.log(`Processing queue ${queue.id}: ${remaining.length} remaining (${alreadyDone.size} already done) with mode ${queue.annotationType}`);
    await updateQueueStatus(queue.id, 'processing');

    try {
      const queueResults = await processBulkObservationsViaApi(
        remaining,
        queue.annotationType,
        null, // no source tab for queue processing
        jwt,
        (obsId) => markObservationProcessed(queue.id, obsId)
      );
      await updateQueueStatus(queue.id, 'completed');
      results.push({ queueId, success: true, count: queueResults.length });
    } catch (error) {
      console.error(`Error processing queue ${queue.id}:`, error);
      await updateQueueStatus(queue.id, 'pending');
      results.push({ queueId, success: false, error: error.message });
    }
  }

  return { results, processed: results.filter(r => r.success).length };
}
