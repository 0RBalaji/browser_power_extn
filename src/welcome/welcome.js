/**
 * Welcome page — close tab + version from manifest
 */

document.getElementById('closeBtn').addEventListener('click', () => {
  window.close();
});

(function initMeta() {
  const verEl = document.getElementById('appVersion');
  if (!verEl || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getManifest) {
    return;
  }
  try {
    const v = chrome.runtime.getManifest().version;
    verEl.textContent = `v${v}`;
  } catch {
    verEl.textContent = '';
  }
})();
