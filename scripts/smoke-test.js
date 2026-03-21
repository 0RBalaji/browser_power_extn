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
  'src/extension/dark-mode.css'
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
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

  if (process.exitCode) {
    console.error('\nSmoke tests completed with failures.');
    process.exit(process.exitCode);
  }

  console.log('\nSmoke tests completed successfully.');
}

run();
