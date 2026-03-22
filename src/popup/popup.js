/**
 * Dark Mode Browser Extension - Popup Script
 * Handles popup UI interactions
 */

const EXTENSION_REPO_URL = 'https://github.com/0RBalaji/browser_power_extn';

const THEME_LABELS = {
  default: 'Default',
  amoled: 'AMOLED',
  blue: 'Blue'
};

// DOM Elements
const darkModeToggle = document.getElementById('darkModeToggle');
const statusText = document.getElementById('statusText');
const currentSiteSpan = document.getElementById('currentSite');
const excludeBtn = document.getElementById('excludeBtn');
const themeDropdown = document.getElementById('themeDropdown');
const themeDropdownTrigger = document.getElementById('themeDropdownTrigger');
const themeDropdownValue = document.getElementById('themeDropdownValue');
const themeDropdownPanel = document.getElementById('themeDropdownPanel');
const themeDropdownList = document.getElementById('themeDropdownList');
const footerGithub = document.getElementById('footerGithub');
const footerVersion = document.getElementById('footerVersion');

let currentTabUrl = null;
let currentDomain = null;

/**
 * Initialize popup on load
 */
document.addEventListener('DOMContentLoaded', () => {
  syncFooterFromManifest();
  loadSettings();
  getCurrentTab();
  setupEventListeners();
  setupThemeDropdown();
});

/**
 * Footer link + version from extension manifest (after popup DOM is ready).
 */
function syncFooterFromManifest() {
  if (footerGithub) {
    footerGithub.href = EXTENSION_REPO_URL;
  }
  if (footerVersion) {
    const v = chrome.runtime.getManifest().version;
    footerVersion.textContent = `v${v}`;
  }
}

/**
 * Load settings from storage
 */
function loadSettings() {
  chrome.storage.sync.get(['darkModeEnabled', 'excludedSites', 'theme'], (items) => {
    darkModeToggle.checked = items.darkModeEnabled !== false;
    updateStatusText();

    applyThemeToUi(items.theme || 'default');
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
}

function applyThemeToUi(theme) {
  const key = theme in THEME_LABELS ? theme : 'default';
  themeDropdownValue.textContent = THEME_LABELS[key];
  themeDropdownList.querySelectorAll('[role="option"]').forEach((opt) => {
    opt.setAttribute('aria-selected', opt.dataset.value === key ? 'true' : 'false');
  });
}

function setupThemeDropdown() {
  const optionEls = () =>
    Array.from(themeDropdownList.querySelectorAll('[role="option"]'));

  function openPanel(focusMode) {
    themeDropdownPanel.hidden = false;
    themeDropdown.classList.add('theme-dropdown--open');
    themeDropdownTrigger.setAttribute('aria-expanded', 'true');
    const opts = optionEls();
    let focusTarget;
    if (focusMode === 'last') {
      focusTarget = opts[opts.length - 1];
    } else if (focusMode === 'first') {
      focusTarget = opts[0];
    } else {
      focusTarget =
        opts.find((o) => o.getAttribute('aria-selected') === 'true') || opts[0];
    }
    requestAnimationFrame(() => focusTarget.focus());
  }

  function closePanel() {
    themeDropdownPanel.hidden = true;
    themeDropdown.classList.remove('theme-dropdown--open');
    themeDropdownTrigger.setAttribute('aria-expanded', 'false');
    themeDropdownTrigger.focus();
  }

  function togglePanel() {
    if (themeDropdownPanel.hidden) {
      openPanel();
    } else {
      closePanel();
    }
  }

  themeDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanel();
  });

  document.addEventListener('mousedown', (e) => {
    if (!themeDropdown.contains(e.target)) {
      if (!themeDropdownPanel.hidden) {
        closePanel();
      }
    }
  });

  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.addEventListener('scroll', () => {
      if (!themeDropdownPanel.hidden) {
        closePanel();
      }
    });
  }

  optionEls().forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = opt.dataset.value;
      applyThemeToUi(value);
      chrome.storage.sync.set({ theme: value });
      closePanel();
    });
  });

  themeDropdownTrigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (themeDropdownPanel.hidden) {
        openPanel();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (themeDropdownPanel.hidden) {
        openPanel('last');
      }
    } else if (e.key === 'Escape' && !themeDropdownPanel.hidden) {
      e.preventDefault();
      closePanel();
    }
  });

  themeDropdownList.addEventListener('keydown', (e) => {
    const opts = optionEls();
    const i = opts.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = i < 0 ? 0 : Math.min(i + 1, opts.length - 1);
      opts[next].focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = i < 0 ? opts.length - 1 : Math.max(i - 1, 0);
      opts[prev].focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      opts[0].focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      opts[opts.length - 1].focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const active = document.activeElement;
      if (active && active.dataset.value) {
        const value = active.dataset.value;
        applyThemeToUi(value);
        chrome.storage.sync.set({ theme: value });
        closePanel();
      }
    }
  });
}
