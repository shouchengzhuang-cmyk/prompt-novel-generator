const path = require('path');
const fs = require('fs/promises');
const storage = require('./storage');

function createGenerationPersistenceService({
  ensureDir,
  readChapterIndex,
  writeChapterIndex,
  extractTitleFromContent,
  countChars,
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
  fileSystem = fs,
  storageService = storage,
  now = () => new Date().toISOString(),
}) {
  async function persistGeneratedChapter({ chaptersDir, content, userPrompt }) {
    await ensureDir(chaptersDir);

    let chapterNumber = 1;
    try {
      const files = await fileSystem.readdir(chaptersDir);
      chapterNumber = getNextChapterNumber(files);
    } catch {
      // Preserve first-chapter fallback when the directory cannot be read.
    }

    const fileName = formatChapterFileName(chapterNumber);
    await storageService.writeText(path.join(chaptersDir, fileName), content);

    const title = extractTitleFromContent(content, chapterNumber);
    const wordCount = countChars(content);
    const indexEntries = await readChapterIndex(chaptersDir);
    const chapterEntry = buildGeneratedChapterIndexEntry({
      fileName,
      title,
      createdAt: now(),
      userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
      wordCount,
    });
    indexEntries.push(chapterEntry);
    await writeChapterIndex(chaptersDir, indexEntries);

    return {
      fileName,
      title,
      wordCount,
      chapterNumber,
      chapterEntry,
      finalContent: content,
    };
  }

  return { persistGeneratedChapter };
}

module.exports = { createGenerationPersistenceService };
