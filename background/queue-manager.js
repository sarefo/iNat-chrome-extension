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

async function getPendingQueueIds() {
  return new Promise(resolve => {
    chrome.storage.local.get(['innat_pending_queue_ids'], data => resolve(data.innat_pending_queue_ids || []));
  });
}

async function setPendingQueueIds(ids) {
  return new Promise(resolve => {
    chrome.storage.local.set({ innat_pending_queue_ids: ids }, resolve);
  });
}

// Process queued observations sequentially (exported for background-main.js)
export async function processQueuedObservations(queueIds, jwt) {
  // Clear any stale cancel signal left over from a previous run
  await new Promise(resolve => chrome.storage.local.remove('innat_cancel_current_queue', resolve));
  await resetStuckQueues();

  // Sort queue IDs by observation count ascending (fewest obs first)
  const allQueuesForSort = await getQueues();
  const obsCountMap = new Map(allQueuesForSort.map(q => [q.id, q.observations.length]));
  const sortedQueueIds = [...queueIds].sort((a, b) => (obsCountMap.get(a) ?? 0) - (obsCountMap.get(b) ?? 0));

  // Write pending IDs to storage so popup can modify them mid-run
  await setPendingQueueIds(sortedQueueIds);

  const results = [];

  while (true) {
    // Re-read pending IDs each iteration so popup changes take effect
    const pendingIds = await getPendingQueueIds();
    if (pendingIds.length === 0) break;

    const queueId = pendingIds[0];
    await setPendingQueueIds(pendingIds.slice(1));

    const queues = await getQueues();
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

    const shouldCancel = () => new Promise(resolve =>
      chrome.storage.local.get(['innat_cancel_current_queue'], data => resolve(!!data.innat_cancel_current_queue))
    );

    try {
      const queueResults = await processBulkObservationsViaApi(
        remaining,
        queue.annotationType,
        null, // no source tab for queue processing
        jwt,
        (obsId) => markObservationProcessed(queue.id, obsId),
        null,
        shouldCancel
      );
      await updateQueueStatus(queue.id, 'completed');
      results.push({ queueId, success: true, count: queueResults.length });
    } catch (error) {
      await updateQueueStatus(queue.id, 'pending');
      if (error.isCancelled) {
        await new Promise(resolve => chrome.storage.local.remove('innat_cancel_current_queue', resolve));
        results.push({ queueId, cancelled: true });
      } else {
        console.error(`Error processing queue ${queue.id}:`, error);
        results.push({ queueId, success: false, error: error.message });
      }
    }
  }

  await setPendingQueueIds([]);
  return { results, processed: results.filter(r => r.success).length };
}
