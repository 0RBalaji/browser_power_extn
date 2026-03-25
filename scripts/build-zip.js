/**
 * build-zip.js
 *
 * Packages the extension into a distributable zip file.
 * The output is written to dist/darkbrowser-v<version>.zip and is
 * suitable for:
 *   • Manual "Load unpacked" via zip extraction (developer mode)
 *   • Chrome Web Store / Edge Add-ons upload
 *   • GitHub Releases attachment (automated by the release workflow)
 *
 * Usage:
 *   node scripts/build-zip.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkDir(dir, fileList) {
  fs.readdirSync(dir).forEach((entry) => {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      walkDir(full, fileList);
    } else {
      fileList.push(full);
    }
  });
}

/**
 * Minimal ZIP builder – no external dependencies required.
 *
 * Implements the ZIP local file header + central directory structure
 * (PKZIP spec §4.3) for stored (method 0) entries only.  For an
 * extension package that contains only source files, compression is
 * not required; the resulting zip is fully compatible with all browsers
 * and the Chrome Web Store.
 */
class ZipWriter {
  constructor() {
    this._entries = [];
  }

  /**
   * Add a file to the archive.
   * @param {string} archivePath – path inside the zip (forward slashes)
   * @param {Buffer} data
   */
  addFile(archivePath, data) {
    const nameBuf  = Buffer.from(archivePath, 'utf8');
    const dataBuf  = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc      = crc32(dataBuf);
    const size     = dataBuf.length;
    const dosDate  = toDosTime(new Date());

    // Local file header (30 + nameLen bytes)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);   // signature
    localHeader.writeUInt16LE(20, 4);            // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);             // flags
    localHeader.writeUInt16LE(0, 8);             // compression method (stored)
    localHeader.writeUInt16LE(dosDate.time, 10); // last mod time
    localHeader.writeUInt16LE(dosDate.date, 12); // last mod date
    localHeader.writeUInt32LE(crc, 14);          // crc-32
    localHeader.writeUInt32LE(size, 18);         // compressed size
    localHeader.writeUInt32LE(size, 22);         // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28);            // extra field length
    nameBuf.copy(localHeader, 30);

    this._entries.push({
      archivePath,
      nameBuf,
      data: dataBuf,
      crc,
      size,
      dosDate,
      localHeader,
      offset: 0 // filled during finalise()
    });
  }

  /**
   * Finalise the archive and return the complete ZIP as a Buffer.
   */
  finalise() {
    const parts = [];
    let offset  = 0;

    // Write local file headers + data
    for (const e of this._entries) {
      e.offset = offset;
      parts.push(e.localHeader);
      parts.push(e.data);
      offset += e.localHeader.length + e.data.length;
    }

    // Central directory
    const cdStart = offset;
    for (const e of this._entries) {
      const cdEntry = Buffer.alloc(46 + e.nameBuf.length);
      cdEntry.writeUInt32LE(0x02014b50, 0);        // signature
      cdEntry.writeUInt16LE(20, 4);                // version made by
      cdEntry.writeUInt16LE(20, 6);                // version needed
      cdEntry.writeUInt16LE(0, 8);                 // flags
      cdEntry.writeUInt16LE(0, 10);                // compression method
      cdEntry.writeUInt16LE(e.dosDate.time, 12);
      cdEntry.writeUInt16LE(e.dosDate.date, 14);
      cdEntry.writeUInt32LE(e.crc, 16);
      cdEntry.writeUInt32LE(e.size, 20);           // compressed size
      cdEntry.writeUInt32LE(e.size, 24);           // uncompressed size
      cdEntry.writeUInt16LE(e.nameBuf.length, 28);
      cdEntry.writeUInt16LE(0, 30);                // extra field length
      cdEntry.writeUInt16LE(0, 32);                // comment length
      cdEntry.writeUInt16LE(0, 34);                // disk number start
      cdEntry.writeUInt16LE(0, 36);                // int file attributes
      cdEntry.writeUInt32LE(0, 38);                // ext file attributes
      cdEntry.writeUInt32LE(e.offset, 42);         // local header offset
      e.nameBuf.copy(cdEntry, 46);
      parts.push(cdEntry);
      offset += cdEntry.length;
    }

    const cdSize = offset - cdStart;

    // End of central directory record
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);             // signature
    eocd.writeUInt16LE(0, 4);                      // disk number
    eocd.writeUInt16LE(0, 6);                      // disk with cd start
    eocd.writeUInt16LE(this._entries.length, 8);
    eocd.writeUInt16LE(this._entries.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);                     // comment length
    parts.push(eocd);

    return Buffer.concat(parts);
  }
}

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3 polynomial, no external library)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// DOS time encoding for ZIP headers
// ---------------------------------------------------------------------------

function toDosTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) |
               ((d.getMinutes() & 0x3f) << 5) |
               ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) |
               (((d.getMonth() + 1) & 0x0f) << 5) |
               (d.getDate() & 0x1f);
  return { time, date };
}

// ---------------------------------------------------------------------------
// Files / directories included in the package
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/** Files / dirs (relative to ROOT) that go into the package. */
const INCLUDE = [
  'manifest.json',
  'src',
  'rules'
];

/** Patterns to skip even if they are inside an included dir. */
const EXCLUDE_NAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const manifestPath = path.join(ROOT, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('ERROR: manifest.json not found.  Run this script from the repo root.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version  = manifest.version || '0.0.0';
  const zipName  = `darkbrowser-v${version}.zip`;

  // Collect files
  const filePaths = [];
  for (const entry of INCLUDE) {
    const full = path.join(ROOT, entry);
    if (!fs.existsSync(full)) {
      console.warn(`WARNING: ${entry} not found, skipping.`);
      continue;
    }
    if (fs.statSync(full).isDirectory()) {
      walkDir(full, filePaths);
    } else {
      filePaths.push(full);
    }
  }

  // Build zip
  const zip = new ZipWriter();
  for (const filePath of filePaths) {
    const baseName = path.basename(filePath);
    if (EXCLUDE_NAMES.has(baseName)) continue;

    const archivePath = path.relative(ROOT, filePath).split(path.sep).join('/');
    const data        = fs.readFileSync(filePath);
    zip.addFile(archivePath, data);
    console.log(`  + ${archivePath}`);
  }

  // Write output
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }

  const outPath = path.join(DIST, zipName);
  fs.writeFileSync(outPath, zip.finalise());

  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\nPackaged → dist/${zipName}  (${kb} KB)`);
  console.log('\nInstallation options:');
  console.log('  • Chrome / Edge / Brave  – drag the zip into chrome://extensions (developer mode on)');
  console.log('    or extract the zip and use "Load unpacked"');
  console.log('  • Chrome Web Store       – upload the zip directly in the Developer Dashboard');
}

main();
