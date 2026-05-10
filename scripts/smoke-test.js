const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = process.cwd();
const requiredFiles = [
  'manifest.json',
  'src/extension/content.js',
  'src/extension/background.js',
  'src/popup/popup.html',
  'src/popup/popup.js',
  'src/extension/dark-mode.css',
  'rules/ad_rules.json'
];
const contentScriptPath = path.join(projectRoot, 'src/extension/content.js');
const mediaSelectors = ['img', 'video', 'picture', 'canvas', 'svg', 'iframe', 'embed', 'object', '[role="img"]'];
const lagThresholds = {
  mutationDebounceMs: 250,
  maxScanNodes: 2000,
  maxRootsPerFlush: 12,
  maxAddedNodesPerMutation: 100
};

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function info(message) {
  console.log(`INFO: ${message}`);
}

function assertFileExists(relativePath) {
  const absPath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absPath)) {
    fail(`Missing required file: ${relativePath}`);
    return false;
  }
  pass(`Found ${relativePath}`);
  return true;
}

function checkJsSyntax(relativePath) {
  const result = spawnSync('node', ['--check', relativePath], {
    cwd: projectRoot,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    fail(`Syntax error in ${relativePath}\n${result.stderr || result.stdout}`);
    return;
  }

  pass(`Syntax OK: ${relativePath}`);
}

function parseManifest() {
  const manifestPath = path.join(projectRoot, 'manifest.json');
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);
    pass('manifest.json is valid JSON');
    return manifest;
  } catch (error) {
    fail(`manifest.json is invalid JSON: ${error.message}`);
    return null;
  }
}

function validateManifestShape(manifest) {
  if (!manifest) return;

  if (manifest.manifest_version !== 3) {
    fail('manifest_version must be 3');
  } else {
    pass('manifest_version is 3');
  }

  const fields = ['name', 'version', 'description'];
  for (const field of fields) {
    if (!manifest[field]) {
      fail(`Missing manifest field: ${field}`);
    } else {
      pass(`Manifest field present: ${field}`);
    }
  }

  if (!manifest.content_scripts || manifest.content_scripts.length === 0) {
    fail('content_scripts must be defined with at least one entry');
  } else {
    pass('content_scripts configured');

    const scriptEntry = manifest.content_scripts[0];
    const jsFiles = scriptEntry.js || [];
    const cssFiles = scriptEntry.css || [];

    [...jsFiles, ...cssFiles].forEach((file) => {
      assertFileExists(file);
    });
  }

  if (!manifest.background || !manifest.background.service_worker) {
    fail('background.service_worker must be defined');
  } else {
    pass('background.service_worker configured');
    assertFileExists(manifest.background.service_worker);
  }

  if (manifest.action && manifest.action.default_popup) {
    assertFileExists(manifest.action.default_popup);
    pass('action.default_popup configured');
  }
}

function parseConfigNumber(content, key) {
  const regex = new RegExp(`${key}\\s*:\\s*(\\d+)`);
  const match = content.match(regex);
  if (!match) return null;
  return Number(match[1]);
}

function validateDarkModeSanity(manifest) {
  let content = '';

  try {
    content = fs.readFileSync(contentScriptPath, 'utf8');
  } catch (error) {
    fail(`Could not read content script for sanity checks: ${error.message}`);
    return;
  }

  if (/html\.__darkbrowser-enabled[\s\S]*?background:\s*#ffffff/i.test(content) && content.includes('filter: ${CONFIG.invertFilter}')) {
    pass('Dark-mode root style keeps dark conversion baseline');
  } else {
    fail('Missing dark-mode root style baseline for background/filter conversion');
  }

  const missingSelectors = mediaSelectors.filter((selector) => !content.includes(`html.__darkbrowser-enabled ${selector}`));
  if (missingSelectors.length > 0) {
    fail(`Media preserve selectors missing: ${missingSelectors.join(', ')}`);
  } else {
    pass('Media preserve selectors are present (images remain untainted)');
  }

  if (content.includes('style.backgroundImage') && content.includes('CONFIG.preserveClass') && content.includes('classList.add(CONFIG.preserveClass)')) {
    pass('Background-image elements are marked for preservation');
  } else {
    fail('Background-image preservation guard is missing');
  }

  if (/\.innerHTML\s*=/.test(content) || /document\.write\(/.test(content)) {
    fail('Unsafe DOM write APIs detected that may break pages');
  } else {
    pass('No unsafe DOM write APIs detected');
  }

  const lagChecks = Object.keys(lagThresholds).map((key) => {
    const value = parseConfigNumber(content, key);
    if (value === null || Number.isNaN(value)) {
      fail(`Missing performance config value: ${key}`);
      return false;
    }

    if (value > lagThresholds[key]) {
      fail(`Lag risk: ${key}=${value} exceeds limit ${lagThresholds[key]}`);
      return false;
    }

    pass(`Lag guard OK: ${key}=${value}`);
    return true;
  });

  if (content.includes('requestIdleCallback')) {
    pass('Idle callback scheduling is used for better responsiveness');
  } else {
    fail('requestIdleCallback fallback scheduling is missing');
  }

  const scores = [];
  const mutationDebounceMs = parseConfigNumber(content, 'mutationDebounceMs');
  const maxScanNodes = parseConfigNumber(content, 'maxScanNodes');
  const maxRootsPerFlush = parseConfigNumber(content, 'maxRootsPerFlush');
  const maxAddedNodesPerMutation = parseConfigNumber(content, 'maxAddedNodesPerMutation');

  if (mutationDebounceMs !== null) {
    scores.push(Math.max(0, 100 - Math.round((mutationDebounceMs / lagThresholds.mutationDebounceMs) * 45)));
  }
  if (maxScanNodes !== null) {
    scores.push(Math.max(0, 100 - Math.round((maxScanNodes / lagThresholds.maxScanNodes) * 30)));
  }
  if (maxRootsPerFlush !== null) {
    scores.push(Math.max(0, 100 - Math.round((maxRootsPerFlush / lagThresholds.maxRootsPerFlush) * 15)));
  }
  if (maxAddedNodesPerMutation !== null) {
    scores.push(Math.max(0, 100 - Math.round((maxAddedNodesPerMutation / lagThresholds.maxAddedNodesPerMutation) * 10)));
  }
  if (content.includes('requestIdleCallback')) {
    scores.push(15);
  }
  if (content.includes('if (isAlreadyDarkPage())')) {
    scores.push(10);
  }

  const version = manifest && manifest.version ? manifest.version : 'unknown';
  if (scores.length === 0) {
    fail('Could not compute efficiency score due to missing performance metrics');
    return;
  }

  const conversionEfficiencyScore = Math.min(100, Math.max(0, Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)));
  info(`v${version} conversion efficiency score: ${conversionEfficiencyScore}/100`);

  if (conversionEfficiencyScore < 55 || lagChecks.includes(false)) {
    fail('Efficiency score is below acceptable sanity threshold');
  } else {
    pass('Efficiency score meets sanity threshold');
  }
}

function run() {
  console.log('Running Dark Browser extension smoke tests...');

  requiredFiles.forEach(assertFileExists);

  [
    'src/extension/content.js',
    'src/extension/background.js',
    'src/popup/popup.js',
    'src/welcome/welcome.js'
  ].forEach(checkJsSyntax);

  const manifest = parseManifest();
  validateManifestShape(manifest);
  validateDarkModeSanity(manifest);

  if (process.exitCode) {
    console.error('\nSmoke tests completed with failures.');
    process.exit(process.exitCode);
  }

  console.log('\nSmoke tests completed successfully.');
}

run();
