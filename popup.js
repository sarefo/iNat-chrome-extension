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
  const queueBadge = document.getElementById('queueBadge');
  const processQueuesButton = document.getElementById('processQueuesButton');
  const selectAllQueuesButton = document.getElementById('selectAllQueues');
  let selectedQueueIds = new Set();

  selectAllQueuesButton.addEventListener('click', () => {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = result.innat_queues || [];
      const allSelected = queues.every(q => selectedQueueIds.has(q.id));
      if (allSelected) {
        selectedQueueIds.clear();
      } else {
        queues.forEach(q => selectedQueueIds.add(q.id));
      }
      renderQueues(queues);
    });
  });

  loadQueues();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.innat_queues || changes.innat_current_collection)) {
      loadQueues();
    }
  });

  function loadQueues() {
    chrome.storage.local.get(['innat_queues'], result => {
      renderQueues(result.innat_queues || []);
    });
  }

  function renderQueues(queues) {
    if (!queues || queues.length === 0) {
      queueSection.style.display = 'none';
      return;
    }

    queueSection.style.display = 'block';
    queueBadge.textContent = queues.length;
    const allSelected = queues.every(q => selectedQueueIds.has(q.id));
    selectAllQueuesButton.textContent = allSelected ? 'Deselect All' : 'Select All';
    queueList.innerHTML = '';

    queues.forEach(queue => {
      const item = document.createElement('div');
      item.className = 'queue-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = selectedQueueIds.has(queue.id);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedQueueIds.add(queue.id);
        } else {
          selectedQueueIds.delete(queue.id);
        }
        updateProcessQueuesButton(queues);
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
      nameSpan.title = queue.name;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'queue-item-delete';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete queue';
      deleteBtn.addEventListener('click', () => {
        selectedQueueIds.delete(queue.id);
        deleteQueue(queue.id);
      });

      item.appendChild(checkbox);
      item.appendChild(nameSpan);
      item.appendChild(deleteBtn);
      queueList.appendChild(item);
    });

    updateProcessQueuesButton(queues);
  }

  function updateProcessQueuesButton(queues) {
    const checked = queues.filter(q => selectedQueueIds.has(q.id));
    if (checked.length === 0) {
      processQueuesButton.style.display = 'none';
    } else {
      const totalObs = checked.reduce((sum, q) => sum + q.observations.length, 0);
      processQueuesButton.style.display = 'block';
      processQueuesButton.textContent = `▶ Process Selected (${totalObs} obs)`;
    }
  }

  function deleteQueue(id) {
    chrome.storage.local.get(['innat_queues'], result => {
      const queues = (result.innat_queues || []).filter(q => q.id !== id);
      chrome.storage.local.set({ innat_queues: queues }, () => loadQueues());
    });
  }

  processQueuesButton.addEventListener('click', () => {
    const ids = Array.from(selectedQueueIds);
    if (ids.length === 0) return;

    statusDiv.textContent = 'Processing queues...';
    statusDiv.style.color = '#FF9800';
    processQueuesButton.disabled = true;

    // Get JWT from the current tab before handing off to background
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'getJwt' }, jwtResponse => {
        const jwt = jwtResponse?.jwt || null;
        chrome.runtime.sendMessage({ action: 'processQueues', queueIds: ids, jwt }, response => {
          processQueuesButton.disabled = false;
          if (chrome.runtime.lastError || !response) {
            statusDiv.textContent = 'Error starting queue processing';
            statusDiv.style.color = 'red';
          } else if (response.success) {
            statusDiv.textContent = 'Queue processing complete!';
            statusDiv.style.color = 'green';
            selectedQueueIds.clear();
            loadQueues();
          } else {
            statusDiv.textContent = `Error: ${response.error}`;
            statusDiv.style.color = 'red';
          }
        });
      });
    });
  });

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
