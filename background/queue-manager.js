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

// Process queued observations sequentially (exported for background-main.js)
export async function processQueuedObservations(queueIds, jwt) {
  const queues = await getQueues();
  const results = [];

  for (const queueId of queueIds) {
    const queue = queues.find(q => q.id === queueId);
    if (!queue) {
      console.warn(`Queue ${queueId} not found`);
      continue;
    }

    console.log(`Processing queue ${queue.id}: ${queue.observations.length} observations with mode ${queue.annotationType}`);
    await updateQueueStatus(queue.id, 'processing');

    try {
      const queueResults = await processBulkObservationsViaApi(
        queue.observations,
        queue.annotationType,
        null, // no source tab for queue processing
        jwt
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
