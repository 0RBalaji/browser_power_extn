/**
 * Welcome page — close tab + version/releases link from manifest
 */

document.getElementById('closeBtn').addEventListener('click', () => {
  window.close();
});

(function initMeta() {
  const verEl      = document.getElementById('appVersion');
  const releaseLink = document.getElementById('releasesLink');

  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getManifest) {
    return;
  }

  try {
    const manifest = chrome.runtime.getManifest();
    const v = manifest.version;

    if (verEl) verEl.textContent = `v${v}`;

    // Point the download button at the exact release tag when available.
    // Fall back to /releases/latest if the tag has not been published yet
    // (e.g. extension loaded unpacked during development).
    if (releaseLink) {
      releaseLink.href =
        `https://github.com/0RBalaji/browser_power_extn/releases/tag/v${v}`;

      // Silently revert to /releases/latest if the versioned tag returns 404.
      fetch(releaseLink.href, { method: 'HEAD', mode: 'no-cors' }).catch(() => {
        releaseLink.href =
          'https://github.com/0RBalaji/browser_power_extn/releases/latest';
      });
    }
  } catch {
    if (verEl) verEl.textContent = '';
  }
})();
