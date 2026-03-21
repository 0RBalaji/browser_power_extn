/**
 * Dark Mode Browser Extension - Popup Script
 * Handles popup UI interactions
 */

// DOM Elements
const darkModeToggle = document.getElementById('darkModeToggle');
const statusText = document.getElementById('statusText');
const currentSiteSpan = document.getElementById('currentSite');
const excludeBtn = document.getElementById('excludeBtn');
const excludedList = document.getElementById('excludedList');
const themeSelect = document.getElementById('themeSelect');

let currentTabUrl = null;
let currentDomain = null;

/**
 * Initialize popup on load
 */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  getCurrentTab();
  setupEventListeners();
});

/**
 * Load settings from storage
 */
function loadSettings() {
  chrome.storage.sync.get(['darkModeEnabled', 'excludedSites', 'theme'], (items) => {
    darkModeToggle.checked = items.darkModeEnabled !== false;
    updateStatusText();

    themeSelect.value = items.theme || 'default';

    // Load excluded sites
    displayExcludedSites(items.excludedSites || []);
  });
}

/**
 * Get current tab information
 */
function getCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabUrl = tabs[0].url;
      try {
        const url = new URL(currentTabUrl);
        currentDomain = url.hostname;
        currentSiteSpan.textContent = currentDomain;
      } catch (e) {
        currentSiteSpan.textContent = 'Unknown';
      }

      // Check if current site is excluded
      updateExcludeButtonState();
    }
  });
}

/**
 * Update exclude button state
 */
function updateExcludeButtonState() {
  chrome.storage.sync.get(['excludedSites'], (items) => {
    const excludedSites = items.excludedSites || [];
    const isExcluded = excludedSites.includes(currentDomain);

    if (isExcluded) {
      excludeBtn.textContent = 'Remove Exclusion';
      excludeBtn.classList.add('excluded');
    } else {
      excludeBtn.textContent = 'Exclude';
      excludeBtn.classList.remove('excluded');
    }
  });
}

/**
 * Update status text
 */
function updateStatusText() {
  statusText.textContent = darkModeToggle.checked ? 'Dark Mode: ON' : 'Dark Mode: OFF';
}

/**
 * Display excluded sites list
 */
function displayExcludedSites(sites) {
  if (sites.length === 0) {
    excludedList.innerHTML = '<p class="empty-message">No excluded sites</p>';
    return;
  }

  excludedList.innerHTML = '';
  sites.forEach(site => {
    const item = document.createElement('div');
    item.className = 'excluded-item';

    const siteSpan = document.createElement('span');
    siteSpan.className = 'excluded-site';
    siteSpan.textContent = site;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeExcludedSite(site));

    item.appendChild(siteSpan);
    item.appendChild(removeBtn);
    excludedList.appendChild(item);
  });
}

/**
 * Remove excluded site
 */
function removeExcludedSite(site) {
  chrome.runtime.sendMessage({
    action: 'removeExcludedSite',
    site: site
  }, (response) => {
    chrome.storage.sync.get(['excludedSites'], (items) => {
      displayExcludedSites(items.excludedSites || []);
      updateExcludeButtonState();
    });
  });
}

/**
 * Add/remove current site from exclusions
 */
function toggleExcludeSite() {
  if (!currentDomain) return;

  chrome.storage.sync.get(['excludedSites'], (items) => {
    let excludedSites = items.excludedSites || [];
    const isExcluded = excludedSites.includes(currentDomain);

    if (isExcluded) {
      excludedSites = excludedSites.filter(site => site !== currentDomain);
    } else {
      excludedSites.push(currentDomain);
    }

    chrome.storage.sync.set({ excludedSites }, () => {
      displayExcludedSites(excludedSites);
      updateExcludeButtonState();

      // Reload current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.reload(tabs[0].id);
        }
      });
    });
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  darkModeToggle.addEventListener('change', (e) => {
    chrome.storage.sync.set({ darkModeEnabled: e.target.checked }, () => {
      updateStatusText();

      // Reload all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.reload(tab.id);
        });
      });
    });
  });

  excludeBtn.addEventListener('click', toggleExcludeSite);

  themeSelect.addEventListener('change', (e) => {
    chrome.storage.sync.set({ theme: e.target.value });
  });
}
