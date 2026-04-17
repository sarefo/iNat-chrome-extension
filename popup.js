document.addEventListener('DOMContentLoaded', function() {
  const openUrlButton = document.getElementById('openUrl');
  const statusDiv = document.getElementById('status');

  // Annotation button definitions
  const ANNOTATION_BUTTONS = [
    { id: 'fillFieldsAgeUnknown',      action: 'fillFieldsAgeUnknown'           },
    { id: 'fillFieldsJuvenile',        action: 'fillFieldsJuvenile'             },
    { id: 'fillFieldsAlive',           action: 'fillFieldsAlive'                },
    { id: 'fillFieldsDead',            action: 'fillFieldsDead'                 },
    { id: 'fillFieldsJuvenileDead',    action: 'fillFieldsJuvenileDead'         },
    { id: 'fillFieldsMolt',            action: 'fillFieldsMolt'                 },
    { id: 'fillFieldsFlowers',         action: 'fillFieldsPlantFlowers'         },
    { id: 'fillFieldsFruits',          action: 'fillFieldsPlantFruits'          },
    { id: 'fillFieldsNoFlowersFruits', action: 'fillFieldsPlantNoFlowersFruits' },
  ];

  const usernameDisplay = document.getElementById('username-display');
  const usernameInput = document.getElementById('username-input');

  let currentUsername = 'portioid';

  if (!usernameDisplay || !usernameInput) {
    console.error('Username elements not found');
    return;
  }

  chrome.storage.sync.get(['username'], function(result) {
    if (result.username !== undefined) {
      currentUsername = result.username;
      usernameDisplay.textContent = currentUsername || '(no username)';
    }
    document.getElementById('openUrlUsername').textContent = currentUsername || 'all';
  });

  function startBulkModeFromTab(annotationType, withoutTermId) {
    chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
      const tab = tabs[0];
      const url = tab.url || '';

      function launchBulkMode(searchUrl) {
        chrome.tabs.sendMessage(tab.id, { action: 'getJwt' }, function(jwtResponse) {
          const jwt = jwtResponse?.jwt || null;
          chrome.runtime.sendMessage({
            action: 'startCustomBulkMode',
            searchUrl,
            jwt,
            annotationType,
            sourceTabId: tab.id
          }, () => { void chrome.runtime.lastError; });
          window.close();
        });
      }

      // Taxon page: /taxa/12345-Name
      const taxaMatch = url.match(/inaturalist\.org\/taxa\/(\d+)/);
      if (taxaMatch) {
        launchBulkMode(`https://www.inaturalist.org/observations?taxon_id=${taxaMatch[1]}&without_term_id=${withoutTermId}`);
        return;
      }

      // Single observation page: /observations/12345
      const obsMatch = url.match(/inaturalist\.org\/observations\/(\d+)/);
      if (obsMatch) {
        chrome.tabs.sendMessage(tab.id, { action: 'getTaxonId' }, async function(response) {
          const taxonId = response?.taxonId;
          if (taxonId) {
            launchBulkMode(`https://www.inaturalist.org/observations?taxon_id=${taxonId}&without_term_id=${withoutTermId}`);
            return;
          }
          // Fallback: API fetch
          try {
            const resp = await fetch(`https://api.inaturalist.org/v1/observations/${obsMatch[1]}`);
            const data = await resp.json();
            const apiTaxonId = data?.results?.[0]?.taxon?.id;
            if (!apiTaxonId) {
              statusDiv.textContent = 'Could not find taxon for this observation';
              statusDiv.style.color = 'red';
              return;
            }
            launchBulkMode(`https://www.inaturalist.org/observations?taxon_id=${apiTaxonId}&without_term_id=${withoutTermId}`);
          } catch (e) {
            statusDiv.textContent = 'Error fetching observation taxon';
            statusDiv.style.color = 'red';
          }
        });
        return;
      }

      // Observations list page: replace or add without_term_id filter
      if (url.includes('inaturalist.org/observations')) {
        const parsed = new URL(url);
        parsed.searchParams.set('without_term_id', String(withoutTermId));
        launchBulkMode(parsed.toString());
        return;
      }

      statusDiv.textContent = 'Must be on an iNaturalist page';
      statusDiv.style.color = 'red';
    });
  }

  document.getElementById('startCustomBulkMode').addEventListener('click', function() {
    startBulkModeFromTab('adult-alive', 17);
  });

  document.getElementById('startGenderBulkMode').addEventListener('click', function() {
    startBulkModeFromTab('sex-split', 9);
  });

  document.getElementById('startTaxaMode').addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      const url = tabs[0]?.url || '';
      let taxonId = null, taxonName = null;
      // Taxon page: /taxa/12345 or /taxa/12345-some-name
      const taxaMatch = url.match(/inaturalist\.org\/taxa\/(\d+)/);
      if (taxaMatch) {
        taxonId = taxaMatch[1];
        // Don't extract taxonName from URL slug; let the taxonomy page fetch the actual scientific name
        taxonName = null;
      }
      // Observations list with taxon_id param
      if (!taxonId && url.includes('inaturalist.org/observations')) {
        try { taxonId = new URL(url).searchParams.get('taxon_id'); } catch { /* ignore */ }
      }
      // Single observation page: /observations/12345
      if (!taxonId) {
        const obsMatch = url.match(/inaturalist\.org\/observations\/(\d+)/);
        if (obsMatch) {
          statusDiv.textContent = 'Loading observation...';
          statusDiv.style.color = 'gray';
          const obsId = obsMatch[1];
          fetch(`https://api.inaturalist.org/v1/observations/${obsId}`)
            .then(r => r.json())
            .then(json => {
              const obs = json.results?.[0];
              if (obs?.taxon?.id) {
                taxonId = obs.taxon.id;
                taxonName = obs.taxon.name;
                openTaxonomy();
              } else {
                statusDiv.textContent = 'No taxon found in observation';
                statusDiv.style.color = 'red';
              }
            })
            .catch(() => {
              statusDiv.textContent = 'Failed to fetch observation';
              statusDiv.style.color = 'red';
            });
          return;
        }
      }
      if (!taxonId) {
        statusDiv.textContent = 'Must be on an iNat taxon or observations page';
        statusDiv.style.color = 'red';
        return;
      }
      openTaxonomy();

      function openTaxonomy() {
        const params = new URLSearchParams({ taxon_id: taxonId });
        if (taxonName) params.set('taxon_name', taxonName);
        chrome.tabs.create({ url: chrome.runtime.getURL(`taxonomy.html?${params}`) });
        window.close();
      }
    });
  });

  openUrlButton.addEventListener('click', function() {
    const baseUrl = 'https://www.inaturalist.org/observations?taxon_id=1';
    const userParam = currentUsername ? `&user_id=${currentUsername}` : '';
    const url = `${baseUrl}${userParam}&without_term_id=17`;
    chrome.tabs.create({ url });
  });

// Data-driven annotation button handlers
  ANNOTATION_BUTTONS.forEach(({ id, action }) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', function() {
      statusDiv.textContent = 'Filling fields...';

      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action }, function(response) {
          if (chrome.runtime.lastError) {
            statusDiv.textContent = 'Error: Must be on a single observation page';
            statusDiv.style.color = 'red';
          } else if (response && response.success) {
            statusDiv.textContent = 'Fields filled successfully!';
            statusDiv.style.color = 'green';
          } else {
            statusDiv.textContent = response?.error || 'Could not find fields to fill';
            statusDiv.style.color = 'orange';
          }
        });
      });
    });
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(function(request) {
    if (request.action === 'queueUpdated') {
      loadQueues();
    }
  });

  // Queue management
  const queueSection = document.getElementById('queueSection');
  const queueList = document.getElementById('queueList');
const processAllButton = document.getElementById('processAllButton');
  const processSelectedButton = document.getElementById('processSelectedButton');
  const selectAllQueuesButton = document.getElementById('selectAllQueues');
  const clearCompletedButton = document.getElementById('clearCompletedQueues');
  const queueEta = document.getElementById('queueEta');
  let selectedQueueIds = new Set();
  let isRunning = false;
  let thisPopupStartedRun = false;  // true only when THIS popup instance sent the processQueues message
  let pendingQueueIds = new Set();
  let cancelCurrentRequested = false;
  let activeButtonType = null;  // 'all' | 'selected' — persisted across popup reopens
  let lastProgressTime = 0;
  let lastTotalProcessed = 0;
  let stallCheckInterval = null;
  let isStalled = false;

  function saveSelectedQueueIds() {
    chrome.storage.local.set({ innat_selected_queue_ids: Array.from(selectedQueueIds) });
  }

  selectAllQueuesButton.addEventListener('click', () => {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = result.innat_queues || [];
      const allSelected = queues.every(q => selectedQueueIds.has(q.id));
      if (allSelected) {
        selectedQueueIds.clear();
      } else {
        queues.forEach(q => selectedQueueIds.add(q.id));
      }
      saveSelectedQueueIds();
      renderQueues(queues);
    });
  });

  clearCompletedButton.addEventListener('click', () => {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = (result.innat_queues || []).filter(q => q.status !== 'completed');
      const remaining = new Set(queues.map(q => q.id));
      for (const id of selectedQueueIds) {
        if (!remaining.has(id)) selectedQueueIds.delete(id);
      }
      saveSelectedQueueIds();
      chrome.storage.local.set({ innat_queues: queues }, () => loadQueues());
    });
  });

  // Restore persisted selection and active button on open
  chrome.storage.local.get(['innat_selected_queue_ids', 'innat_queue_active_button'], result => {
    (result.innat_selected_queue_ids || []).forEach(id => selectedQueueIds.add(id));
    activeButtonType = result.innat_queue_active_button || null;
    loadQueues();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.innat_pending_queue_ids) {
      pendingQueueIds = new Set(changes.innat_pending_queue_ids.newValue || []);
    }
    if (changes.innat_queues) {
      // Track progress to detect stalls
      const queues = changes.innat_queues.newValue || [];
      const totalProcessed = queues.reduce((sum, q) => sum + (q.processedObservations?.length || 0), 0);
      if (totalProcessed > lastTotalProcessed) {
        lastTotalProcessed = totalProcessed;
        lastProgressTime = Date.now();
        if (isStalled) { isStalled = false; updateRunningButtonState(); }
      }
    }
    if (changes.innat_queues || changes.innat_current_collection || changes.innat_pending_queue_ids) {
      loadQueues();
    }
  });

  function loadQueues() {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = result.innat_queues || [];
      // Prune stale selected IDs for queues that no longer exist
      const existingIds = new Set(queues.map(q => q.id));
      for (const id of selectedQueueIds) {
        if (!existingIds.has(id)) selectedQueueIds.delete(id);
      }
      renderQueues(queues);
    });
  }

  function renderQueues(queues) {
    if (!queues || queues.length === 0) {
      queueSection.style.display = 'none';
      return;
    }

    queueSection.style.display = 'block';
    // Sync running state from queue data (handles popup reopen mid-run)
    if (queues.some(q => q.status === 'processing')) {
      if (!isRunning) { isRunning = true; startStallCheck(); }
    }
    const allSelected = queues.every(q => selectedQueueIds.has(q.id));
    selectAllQueuesButton.textContent = allSelected ? 'Deselect All' : 'Select All';
    queueList.innerHTML = '';

    queues.forEach(queue => {
      const item = document.createElement('div');
      item.className = 'queue-item';

      const dot = document.createElement('span');
      dot.className = 'queue-dot';
      dot.textContent = '●';
      const isProcessing = queue.status === 'processing';
      const isCompleted = queue.status === 'completed';
      const isSelected = isRunning ? pendingQueueIds.has(queue.id) : selectedQueueIds.has(queue.id);
      dot.classList.add(
        isProcessing ? 'dot-processing' :
        isCompleted  ? 'dot-completed'  :
        isSelected   ? 'dot-selected'   : 'dot-idle'
      );
      dot.addEventListener('click', () => {
          if (isProcessing) {
            // Cancel the currently running queue; progress is preserved via processedObservations
            cancelCurrentRequested = true;
            chrome.storage.local.set({ innat_cancel_current_queue: true });
            renderQueues(queues);
          } else if (isRunning) {
            // Dynamically add/remove from background's pending list
            if (pendingQueueIds.has(queue.id)) {
              pendingQueueIds.delete(queue.id);
            } else {
              pendingQueueIds.add(queue.id);
            }
            chrome.storage.local.set({ innat_pending_queue_ids: Array.from(pendingQueueIds) });
            renderQueues(queues);
          } else {
            if (selectedQueueIds.has(queue.id)) {
              selectedQueueIds.delete(queue.id);
            } else {
              selectedQueueIds.add(queue.id);
            }
            saveSelectedQueueIds();
            renderQueues(queues);
          }
        });

      const nameSpan = document.createElement('span');
      nameSpan.className = 'queue-item-name';
      let statusSuffix = '';
      if (queue.status === 'processing') {
        const done = queue.processedObservations?.length || 0;
        statusSuffix = ` [${done}/${queue.observations.length}]`;
      } else if (queue.status !== 'pending') {
        statusSuffix = ` [${queue.status}]`;
      }
      nameSpan.textContent = queue.name + statusSuffix;
      let taxonIdForQueue = null;
      try { taxonIdForQueue = queue.searchUrl ? new URL(queue.searchUrl).searchParams.get('taxon_id') : null; } catch {}
      nameSpan.title = taxonIdForQueue ? `taxon_id: ${taxonIdForQueue}` : queue.name;
      if (taxonIdForQueue) {
        nameSpan.style.cursor = 'pointer';
        nameSpan.addEventListener('click', e => {
          e.stopPropagation();
          chrome.tabs.create({ url: `https://www.inaturalist.org/taxa/${taxonIdForQueue}` });
        });
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'queue-item-delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete queue';
      deleteBtn.addEventListener('click', () => {
        selectedQueueIds.delete(queue.id);
        saveSelectedQueueIds();
        deleteQueue(queue.id);
      });

      item.appendChild(dot);
      item.appendChild(nameSpan);
      item.appendChild(deleteBtn);
      queueList.appendChild(item);
    });

    updateProcessQueuesButton(queues);
    updateRunningButtonState();
  }

  function updateProcessQueuesButton(queues) {
    const allObs = queues.reduce((sum, q) => sum + q.observations.length, 0);
    const activeIds = isRunning ? pendingQueueIds : selectedQueueIds;
    const checked = queues.filter(q => activeIds.has(q.id));
    let selectedObs = checked.reduce((sum, q) => sum + q.observations.length, 0);
    if (!cancelCurrentRequested) {
      const processing = queues.find(q => q.status === 'processing');
      if (processing) selectedObs += processing.observations.length;
    }
    processAllButton.textContent = `▶ All (${allObs})`;
    processSelectedButton.textContent = `▶ Selected (${selectedObs})`;
    processSelectedButton.disabled = checked.length === 0;
  }

  function deleteQueue(id) {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = (result.innat_queues || []).filter(q => q.id !== id);
      chrome.storage.local.set({ innat_queues: queues }, () => loadQueues());
    });
  }

  processAllButton.addEventListener('click', () => {
    chrome.storage.local.get(['innat_queues'], result => {
      const allQueues = result.innat_queues || [];
      allQueues.forEach(q => selectedQueueIds.add(q.id));
      saveSelectedQueueIds();
      _processQueues(allQueues.map(q => q.id), processAllButton);
    });
  });

  processSelectedButton.addEventListener('click', () => {
    _processQueues(Array.from(selectedQueueIds), processSelectedButton);
  });

  function _processQueues(ids, activeButton) {
    if (ids.length === 0) return;

    activeButtonType = activeButton === processAllButton ? 'all' : 'selected';
    chrome.storage.local.set({ innat_queue_active_button: activeButtonType });

    statusDiv.textContent = 'Processing queues...';
    statusDiv.style.color = '#FF9800';
    processAllButton.disabled = true;
    processSelectedButton.disabled = true;
    isRunning = true;
    thisPopupStartedRun = true;
    pendingQueueIds = new Set(ids);
    lastTotalProcessed = 0;
    startStallCheck();

    // Get JWT from the current tab before handing off to background
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getJwt' }, jwtResponse => {
        const jwt = jwtResponse?.jwt || null;
        chrome.runtime.sendMessage({ action: 'processQueues', queueIds: ids, jwt }, response => {
          isRunning = false;
          thisPopupStartedRun = false;
          pendingQueueIds.clear();
          cancelCurrentRequested = false;
          stopStallCheck();
          activeButtonType = null;
          chrome.storage.local.remove('innat_queue_active_button');
          processAllButton.disabled = false;
          processSelectedButton.disabled = selectedQueueIds.size === 0;
          if (chrome.runtime.lastError || !response) {
            statusDiv.textContent = 'Error starting queue processing';
            statusDiv.style.color = 'red';
          } else if (response.success) {
            statusDiv.textContent = 'Queue processing complete!';
            statusDiv.style.color = 'green';
            selectedQueueIds.clear();
            saveSelectedQueueIds();
            loadQueues();
          } else {
            statusDiv.textContent = `Error: ${response.error}`;
            statusDiv.style.color = 'red';
          }
        });
      });
    });
  }

  function updateEta() {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = result.innat_queues || [];
      const totalObs = queues.reduce((sum, q) => sum + q.observations.length, 0);
      const totalDone = queues.reduce((sum, q) =>
        q.status === 'completed' ? sum + q.observations.length : sum + (q.processedObservations?.length || 0), 0);
      const secsLeft = totalObs - totalDone;
      if (secsLeft > 0) {
        const h = Math.floor(secsLeft / 3600);
        const m = Math.floor((secsLeft % 3600) / 60);
        const s = secsLeft % 60;
        queueEta.textContent = h > 0
          ? `~${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `~${m}:${String(s).padStart(2,'0')}`;
        queueEta.style.display = '';
      } else {
        queueEta.style.display = 'none';
      }
    });
  }

  function startStallCheck() {
    lastProgressTime = Date.now();
    clearInterval(stallCheckInterval);
    stallCheckInterval = setInterval(() => {
      if (!isRunning) { stopStallCheck(); return; }
      const nowStalled = Date.now() - lastProgressTime > 30000;
      if (nowStalled !== isStalled) {
        isStalled = nowStalled;
        updateRunningButtonState();
      }
      updateEta();
    }, 1000);
    updateRunningButtonState();
  }

  function stopStallCheck() {
    clearInterval(stallCheckInterval);
    stallCheckInterval = null;
    isStalled = false;
    queueEta.style.display = 'none';
    processAllButton.classList.remove('running', 'stalled');
    processSelectedButton.classList.remove('running', 'stalled');
  }

  function updateRunningButtonState() {
    processAllButton.classList.remove('running', 'stalled');
    processSelectedButton.classList.remove('running', 'stalled');
    if (!isRunning) return;
    // Only disable buttons if this popup instance started the run;
    // if we just detected a run on open, keep them enabled so user can restart
    if (thisPopupStartedRun) {
      processAllButton.disabled = true;
      processSelectedButton.disabled = true;
    }
    const cls = isStalled ? 'stalled' : 'running';
    const btn = activeButtonType === 'selected' ? processSelectedButton : processAllButton;
    btn.classList.add(cls);
  }

  usernameDisplay.addEventListener('click', function() {
    usernameDisplay.style.display = 'none';
    usernameInput.style.display = 'block';
    usernameInput.value = currentUsername;
    usernameInput.focus();
    usernameInput.select();
  });

  function saveUsername() {
    const newUsername = usernameInput.value.trim();
    currentUsername = newUsername;
    usernameDisplay.textContent = currentUsername || '(no username)';
    chrome.storage.sync.set({ username: currentUsername });
    usernameInput.style.display = 'none';
    usernameDisplay.style.display = 'block';
  }

  usernameInput.addEventListener('blur', saveUsername);
  usernameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveUsername();
    }
    if (e.key === 'Escape') {
      usernameInput.style.display = 'none';
      usernameDisplay.style.display = 'block';
    }
  });
});
