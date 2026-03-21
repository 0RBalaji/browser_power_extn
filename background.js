/**
 * Dark Mode Browser Extension - Background Service Worker
 * Handles extension lifecycle and manages settings
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      darkModeEnabled: true,
      excludedSites: [],
      theme: 'default'
    });

    // Open welcome page
    chrome.tabs.create({
      url: 'welcome.html'
    });
  }

  if (details.reason === 'update') {
    // Handle extension updates
    console.log('Dark Browser extension updated');
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleDarkMode') {
    // Update setting
    chrome.storage.sync.set({
      darkModeEnabled: request.enabled
    }, () => {
      // Notify all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'toggleDarkMode',
            enabled: request.enabled
          }).catch(() => {
            // Tab doesn't have content script
          });
        });
      });
    });
    sendResponse({ success: true });
  }

  if (request.action === 'addExcludedSite') {
    chrome.storage.sync.get(['excludedSites'], (items) => {
      const excludedSites = items.excludedSites || [];
      if (!excludedSites.includes(request.site)) {
        excludedSites.push(request.site);
        chrome.storage.sync.set({ excludedSites });
      }
    });
    sendResponse({ success: true });
  }

  if (request.action === 'removeExcludedSite') {
    chrome.storage.sync.get(['excludedSites'], (items) => {
      let excludedSites = items.excludedSites || [];
      excludedSites = excludedSites.filter(site => site !== request.site);
      chrome.storage.sync.set({ excludedSites });
    });
    sendResponse({ success: true });
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(['darkModeEnabled', 'excludedSites', 'theme'], (items) => {
      sendResponse({
        darkModeEnabled: items.darkModeEnabled !== false,
        excludedSites: items.excludedSites || [],
        theme: items.theme || 'default'
      });
    });
    return true; // Will respond asynchronously
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Send message to toggle dark mode
  chrome.tabs.sendMessage(tab.id, {
    action: 'toggleDarkMode'
  }).catch(() => {
    console.log('Could not communicate with content script');
  });
});
