document.addEventListener('DOMContentLoaded', function() {
  const fillButtonAlive = document.getElementById('fillFieldsAlive');
  const fillButtonDead = document.getElementById('fillFieldsDead');
  const fillButtonJuvenile = document.getElementById('fillFieldsJuvenile');
  const fillButtonJuvenileDead = document.getElementById('fillFieldsJuvenileDead');
  const fillButtonAgeUnknown = document.getElementById('fillFieldsAgeUnknown');
  const openUrlButton = document.getElementById('openUrl');
  const statusDiv = document.getElementById('status');
  const usernameDisplay = document.getElementById('username-display');
  const usernameInput = document.getElementById('username-input');
  
  let currentUsername = 'portioid';
  
  if (!usernameDisplay || !usernameInput) {
    console.error('Username elements not found');
    return;
  }
  
  chrome.storage.sync.get(['username'], function(result) {
    if (result.username) {
      currentUsername = result.username;
      usernameDisplay.textContent = currentUsername;
    }
  });

  fillButtonAlive.addEventListener('click', function() {
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsAlive'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });

  fillButtonDead.addEventListener('click', function() {
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsDead'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });

  fillButtonJuvenile.addEventListener('click', function() {
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsJuvenile'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });

  fillButtonJuvenileDead.addEventListener('click', function() {
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsJuvenileDead'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });

  fillButtonAgeUnknown.addEventListener('click', function() {
    statusDiv.textContent = 'Filling fields...';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'fillFieldsAgeUnknown'}, function(response) {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error: Make sure you\'re on an iNaturalist page';
          statusDiv.style.color = 'red';
        } else if (response && response.success) {
          statusDiv.textContent = 'Fields filled successfully!';
          statusDiv.style.color = 'green';
        } else {
          statusDiv.textContent = 'Could not find fields to fill';
          statusDiv.style.color = 'orange';
        }
      });
    });
  });

  openUrlButton.addEventListener('click', function() {
    chrome.tabs.create({
      url: `https://www.inaturalist.org/observations?page=3&taxon_id=47120&user_id=${currentUsername}&without_term_id=17`
    });
  });

  usernameDisplay.addEventListener('click', function() {
    console.log('Username clicked');
    usernameDisplay.style.display = 'none';
    usernameInput.style.display = 'block';
    usernameInput.value = currentUsername;
    usernameInput.focus();
    usernameInput.select();
  });

  function saveUsername() {
    const newUsername = usernameInput.value.trim();
    if (newUsername) {
      currentUsername = newUsername;
      usernameDisplay.textContent = currentUsername;
      chrome.storage.sync.set({username: currentUsername});
    }
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
