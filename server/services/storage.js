const fs = require('fs/promises');
const path = require('path');

/**
 * Atomically write data to a file.
 *
 * Steps:
 *   1. Write to a temporary file in the same directory (.tmp suffix).
 *   2. Rename the temp file to the target path.
 *
 * On the same filesystem, rename is atomic — readers see either the
 * old content or the new content, never a partial write.
 *
 * On Windows, Node's rename does not overwrite an existing file, so
 * we fall back to copy + unlink when rename fails.
 *
 * @param {string} filePath  - Absolute target file path.
 * @param {string|Buffer} data - Content to write.
 * @param {string} [encoding='utf-8'] - Encoding for string data.
 */
async function atomicWrite(filePath, data, encoding) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.tmp`);

  await fs.writeFile(tmpPath, data, encoding);

  try {
    await fs.rename(tmpPath, filePath);
  } catch {
    // Windows: rename fails if target exists → copy + unlink
    await fs.copyFile(tmpPath, filePath);
    await fs.unlink(tmpPath);
  }
}

/** Write text content to a file (atomic). */
async function writeText(filePath, text) {
  await atomicWrite(filePath, text, 'utf-8');
}

/** Write a JSON-serializable object to a file (atomic, pretty-printed). */
async function writeJson(filePath, obj) {
  await atomicWrite(filePath, JSON.stringify(obj, null, 2), 'utf-8');
}

/** Read and parse a JSON file. Returns the parsed value. */
async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

/** Read text content from a file. */
async function readText(filePath) {
  return await fs.readFile(filePath, 'utf-8');
}

module.exports = {
  atomicWrite,
  writeText,
  writeJson,
  readJson,
  readText,
};
