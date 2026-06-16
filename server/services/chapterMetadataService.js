const path = require('path');

const INDEX_FILE = 'index.json';

function isValidChapterFileName(fileName) {
  return /^\d{3,}\.txt$/.test(fileName);
}

function countChars(text) {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
}

function createChapterMetadataService({
  storage,
  readFile,
}) {
  async function readChapterIndex(chaptersDir) {
    try {
      const raw = await readFile(path.join(chaptersDir, INDEX_FILE), 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async function writeChapterIndex(chaptersDir, entries) {
    await storage.writeJson(path.join(chaptersDir, INDEX_FILE), entries);
  }

  function clearRewriteStaleMarker(entry) {
    if (!entry) return;
    delete entry.staleAfterRewrite;
    delete entry.staleReason;
    delete entry.staleFromFileName;
    delete entry.staleAt;
  }

  async function updateChapterWordCount(chaptersDir, fileName) {
    const filePath = path.join(chaptersDir, fileName);
    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return 0;
    }
    const wordCount = countChars(content);
    const entries = await readChapterIndex(chaptersDir);
    const entry = entries.find((e) => e.fileName === fileName);
    if (entry) {
      entry.wordCount = wordCount;
      await writeChapterIndex(chaptersDir, entries);
    }
    return wordCount;
  }

  function markChaptersStaleAfterRewrite(chapters, rewrittenFileName, staleAt = Date.now()) {
    const rewrittenIndex = chapters.findIndex((item) => item.fileName === rewrittenFileName);
    if (rewrittenIndex < 0) return chapters;

    const chapterNumber = parseInt(rewrittenFileName, 10);
    const staleReason = `第${chapterNumber}章已重写，后续章节可能与当前剧情不连续`;

    return chapters.map((chapter, index) => {
      if (index === rewrittenIndex) {
        const nextChapter = { ...chapter };
        clearRewriteStaleMarker(nextChapter);
        return nextChapter;
      }
      if (index > rewrittenIndex) {
        return {
          ...chapter,
          staleAfterRewrite: true,
          staleReason,
          staleFromFileName: rewrittenFileName,
          staleAt,
        };
      }
      return chapter;
    });
  }

  function extractTitleFromContent(content, chapterNumber) {
    // Scan first non-empty lines for a detectable title
    const lines = content.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      // Match: # 标题  or  ## 标题
      const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
      if (headingMatch) return headingMatch[1].trim();
      // Match: 章节标题：xxx
      const titleDeclMatch = trimmed.match(/^章节标题[：:]\s*(.+)/);
      if (titleDeclMatch) return titleDeclMatch[1].trim();
      // Match: 第X章 标题
      const chapterMatch = trimmed.match(/^第[一二三四五六七八九十百千万\d]+章\s+(.+)/);
      if (chapterMatch) return `第${chapterNumber}章 ${chapterMatch[1].trim()}`;
      // Match bare "第X章"
      const bareChapter = trimmed.match(/^(第[一二三四五六七八九十百千万\d]+章)/);
      if (bareChapter) return bareChapter[1];
    }
    return `第${chapterNumber}章`;
  }

  return {
    INDEX_FILE,
    readChapterIndex,
    writeChapterIndex,
    clearRewriteStaleMarker,
    updateChapterWordCount,
    markChaptersStaleAfterRewrite,
    extractTitleFromContent,
  };
}

module.exports = { INDEX_FILE, isValidChapterFileName, countChars, createChapterMetadataService };
