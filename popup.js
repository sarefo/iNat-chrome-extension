document.addEventListener('DOMContentLoaded', function() {
  const fillButtonAlive = document.getElementById('fillFieldsAlive');
  const fillButtonDead = document.getElementById('fillFieldsDead');
  const fillButtonJuvenile = document.getElementById('fillFieldsJuvenile');
  const fillButtonJuvenileDead = document.getElementById('fillFieldsJuvenileDead');
  const fillButtonAgeUnknown = document.getElementById('fillFieldsAgeUnknown');
  const openUrlButton = document.getElementById('openUrl');
  const statusDiv = document.getElementById('status');

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
      url: 'https://www.inaturalist.org/observations?page=3&taxon_id=47120&user_id=portioid&without_term_id=17'
    });
  });
});
