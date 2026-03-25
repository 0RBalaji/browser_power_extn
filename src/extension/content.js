/**
 * Dark Mode Browser Extension - Content Script
 * Fast global dark conversion with explicit media and background-image preservation.
 */

const CONFIG = {
  darkBase: '#111111',
  invertFilter: 'invert(1) hue-rotate(180deg)',
  mutationDebounceMs: 180,
  maxScanNodes: 900,
  maxRootsPerFlush: 8,
  maxAddedNodesPerMutation: 30,
  preserveClass: '__darkbrowser-preserve',
  postApplyCheckDelayMs: 700  // Allow time for JS-framework dark themes to hydrate
};

const API = globalThis.browser || globalThis.chrome;
let observer = null;
let flushTimer = null;
const pendingRoots = [];
let idleScanScheduled = false;
let resizeTimer = null;
let postApplyCheckTimer = null;

function parseRgb(color) {
  if (!color) return null;

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3])
    };
  }

  const hexMatch = color.match(/^#([a-f\d]{6})$/i);
  if (hexMatch) {
    const v = hexMatch[1];
    return {
      r: parseInt(v.slice(0, 2), 16),
      g: parseInt(v.slice(2, 4), 16),
      b: parseInt(v.slice(4, 6), 16)
    };
  }

  return null;
}

function getLuminance(rgb) {
  if (!rgb) return null;
  return Math.round((rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000);
}

function isTransparent(color) {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

function backgroundLuminance(el) {
  if (!el) return null;
  const style = window.getComputedStyle(el);
  if (!style || isTransparent(style.backgroundColor)) return null;
  return getLuminance(parseRgb(style.backgroundColor));
}

function hasDarkThemeAttribute() {
  const roots = [document.documentElement, document.body];
  for (let i = 0; i < roots.length; i += 1) {
    const el = roots[i];
    const colorMode = el.getAttribute('data-color-mode');
    if (colorMode && colorMode.toLowerCase().includes('dark')) return true;
    const theme = el.getAttribute('data-theme');
    if (theme && theme.toLowerCase().includes('dark')) return true;
    const bsTheme = el.getAttribute('data-bs-theme');
    if (bsTheme && bsTheme.toLowerCase().includes('dark')) return true;
    if (el.classList && el.classList.contains('dark')) return true;
  }
  return false;
}

function hasDarkColorScheme() {
  try {
    const scheme = (
      window.getComputedStyle(document.documentElement).getPropertyValue('color-scheme') || ''
    ).trim();
    return /\bdark\b/.test(scheme);
  } catch (_) {
    return false;
  }
}

function isAlreadyDarkPage() {
  // Fast checks: theme attributes and color-scheme declaration (before luminance scan)
  if (hasDarkThemeAttribute() || hasDarkColorScheme()) return true;

  const htmlLum = backgroundLuminance(document.documentElement);
  const bodyLum = backgroundLuminance(document.body);

  if ((htmlLum !== null && htmlLum < 75) || (bodyLum !== null && bodyLum < 75)) {
    return true;
  }

  const candidates = [];
  const selectors = ['main', '[role="main"]', '#app', '#root', 'article', 'section'];
  selectors.forEach((selector) => {
    const nodes = document.querySelectorAll(selector);
    for (let i = 0; i < nodes.length && candidates.length < 28; i += 1) {
      candidates.push(nodes[i]);
    }
  });

  let darkCount = 0;
  let lightCount = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const lum = backgroundLuminance(candidates[i]);
    if (lum === null) continue;
    if (lum <= 95) darkCount += 1;
    if (lum >= 185) lightCount += 1;
  }

  return darkCount >= 4 && darkCount >= lightCount;
}

function ensureRuntimeStyle() {
  if (document.getElementById('darkbrowser-runtime-style')) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = 'darkbrowser-runtime-style';
  styleElement.textContent = `
    html.__darkbrowser-enabled {
      /* Keep source background light so inversion yields dark canvas */
      background: #ffffff !important;
      color-scheme: dark;
      filter: ${CONFIG.invertFilter} !important;
      min-height: 100% !important;
    }

    html.__darkbrowser-enabled body {
      background: #ffffff !important;
      min-height: 100% !important;
    }

    html.__darkbrowser-enabled img,
    html.__darkbrowser-enabled video,
    html.__darkbrowser-enabled picture,
    html.__darkbrowser-enabled canvas,
    html.__darkbrowser-enabled svg,
    html.__darkbrowser-enabled iframe,
    html.__darkbrowser-enabled embed,
    html.__darkbrowser-enabled object,
    html.__darkbrowser-enabled [role="img"],
    html.__darkbrowser-enabled .${CONFIG.preserveClass} {
      filter: ${CONFIG.invertFilter} !important;
    }
  `;

  (document.head || document.documentElement).appendChild(styleElement);
}

function markIfBackgroundImage(el) {
  if (!el || !el.tagName) return;

  const tag = el.tagName.toLowerCase();
  if (
    tag === 'img' ||
    tag === 'video' ||
    tag === 'picture' ||
    tag === 'canvas' ||
    tag === 'svg' ||
    tag === 'iframe' ||
    tag === 'embed' ||
    tag === 'object'
  ) {
    return;
  }

  const style = window.getComputedStyle(el);
  if (!style) return;

  // Preserve elements that visually render images via CSS backgrounds.
  if (style.backgroundImage && style.backgroundImage !== 'none') {
    el.classList.add(CONFIG.preserveClass);
  }
}

function scanRoot(root) {
  const base = root && root.nodeType === Node.ELEMENT_NODE ? root : document.body;
  if (!base) return;

  markIfBackgroundImage(base);

  const walker = document.createTreeWalker(base, NodeFilter.SHOW_ELEMENT);
  let node = walker.nextNode();
  let count = 0;

  while (node && count < CONFIG.maxScanNodes) {
    markIfBackgroundImage(node);
    count += 1;
    node = walker.nextNode();
  }
}

function queueUniqueRoot(root) {
  const finalRoot = root || document.body || document.documentElement;
  if (!finalRoot) return;
  if (!pendingRoots.includes(finalRoot)) {
    pendingRoots.push(finalRoot);
  }
}

function flushScans() {
  const roots = pendingRoots.splice(0, CONFIG.maxRootsPerFlush);
  for (let i = 0; i < roots.length; i += 1) {
    scanRoot(roots[i]);
  }

  if (pendingRoots.length > 0) {
    flushTimer = setTimeout(flushScans, CONFIG.mutationDebounceMs);
    return;
  }

  flushTimer = null;
}

function queueScan(root) {
  queueUniqueRoot(root);
  if (flushTimer) return;

  flushTimer = setTimeout(flushScans, CONFIG.mutationDebounceMs);
}

function requestIdleScan(root) {
  queueUniqueRoot(root);
  if (idleScanScheduled) return;

  idleScanScheduled = true;
  const run = () => {
    idleScanScheduled = false;
    flushScans();
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 500 });
  } else {
    setTimeout(run, CONFIG.mutationDebounceMs);
  }
}

function setupObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        const limit = Math.min(mutation.addedNodes.length, CONFIG.maxAddedNodesPerMutation);
        for (let i = 0; i < limit; i += 1) {
          const node = mutation.addedNodes[i];
          if (node && node.nodeType === Node.ELEMENT_NODE) {
            requestIdleScan(node);
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true
  });
}

function setupResizeListener() {
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }

    resizeTimer = setTimeout(() => {
      requestIdleScan(document.body || document.documentElement);
      resizeTimer = null;
    }, 220);
  }, { passive: true });
}

function getStorageValues(keys) {
  if (!API || !API.storage || !API.storage.sync) {
    return Promise.resolve({ darkModeEnabled: true, excludedSites: [] });
  }

  return new Promise((resolve) => {
    API.storage.sync.get(keys, (items) => {
      resolve(items || {});
    });
  });
}

async function isEnabledForSite() {
  const items = await getStorageValues(['darkModeEnabled', 'excludedSites']);
  const enabled = items.darkModeEnabled !== false;
  const excluded = Array.isArray(items.excludedSites) ? items.excludedSites : [];
  const host = window.location.hostname;

  if (!enabled) return false;
  return !excluded.some((site) => host.includes(site));
}

function setupMessageListener() {
  if (!API || !API.runtime || !API.runtime.onMessage) return;
  API.runtime.onMessage.addListener((request) => {
    if (request.action !== 'toggleDarkMode') return;
    if (request.enabled) {
      startDarkMode();
    } else {
      window.location.reload();
    }
  });
}

function removeDarkMode() {
  if (postApplyCheckTimer !== null) {
    clearTimeout(postApplyCheckTimer);
    postApplyCheckTimer = null;
  }
  document.documentElement.classList.remove('__darkbrowser-enabled');
  const styleEl = document.getElementById('darkbrowser-runtime-style');
  if (styleEl) styleEl.remove();
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

function schedulePostApplyDarkCheck() {
  // Some sites (e.g. Bitbucket) apply their own dark theme via JavaScript after
  // DOMContentLoaded. We re-check after a short delay so we can remove our filter
  // if the page turns out to have its own dark mode.
  postApplyCheckTimer = setTimeout(() => {
    postApplyCheckTimer = null;
    if (!document.documentElement.classList.contains('__darkbrowser-enabled')) return;

    // Use attribute and luminance checks only (not hasDarkColorScheme because
    // ensureRuntimeStyle() sets color-scheme:dark, which would always match here).
    if (hasDarkThemeAttribute()) {
      removeDarkMode();
      return;
    }

    const htmlLum = backgroundLuminance(document.documentElement);
    const bodyLum = backgroundLuminance(document.body);
    if ((htmlLum !== null && htmlLum < 75) || (bodyLum !== null && bodyLum < 75)) {
      removeDarkMode();
    }
  }, CONFIG.postApplyCheckDelayMs);
}

function startDarkMode() {
  if (isAlreadyDarkPage()) {
    return;
  }

  document.documentElement.classList.add('__darkbrowser-enabled');
  ensureRuntimeStyle();
  requestIdleScan(document.body || document.documentElement);
  setupObserver();
  setupResizeListener();
  schedulePostApplyDarkCheck();
}

async function main() {
  const enabled = await isEnabledForSite();
  if (!enabled) return;

  setupMessageListener();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDarkMode, { once: true });
  } else {
    startDarkMode();
  }
}

main();
