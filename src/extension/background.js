/**
 * Dark Mode Browser Extension - Background Service Worker
 * Handles extension lifecycle and manages settings
 */

const ADBLOCK_RULESET_ID = 'adblock_rules';

function syncAdBlockRuleset() {
  chrome.storage.sync.get(['adBlockEnabled'], (items) => {
    const enabled = items.adBlockEnabled === true;
    chrome.declarativeNetRequest.updateEnabledRulesets(
      {
        enableRulesetIds: enabled ? [ADBLOCK_RULESET_ID] : [],
        disableRulesetIds: enabled ? [] : [ADBLOCK_RULESET_ID]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn('Dark Browser: ad block ruleset', chrome.runtime.lastError.message);
        }
      }
    );
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && Object.prototype.hasOwnProperty.call(changes, 'adBlockEnabled')) {
    syncAdBlockRuleset();
  }
});

syncAdBlockRuleset();

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.sync.set({
      darkModeEnabled: true,
      excludedSites: [],
      theme: 'default',
      adBlockEnabled: false
    });

    // Open welcome page
    chrome.tabs.create({
      url: 'src/welcome/welcome.html'
    });
  }

  if (details.reason === 'update') {
    console.log('Dark Browser extension updated');
    syncAdBlockRuleset();
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
    chrome.storage.sync.get(['darkModeEnabled', 'excludedSites', 'theme', 'adBlockEnabled'], (items) => {
      sendResponse({
        darkModeEnabled: items.darkModeEnabled !== false,
        excludedSites: items.excludedSites || [],
        theme: items.theme || 'default',
        adBlockEnabled: items.adBlockEnabled === true
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
