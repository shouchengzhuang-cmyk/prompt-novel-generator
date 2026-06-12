const path = require('path');
const fs = require('fs/promises');
const storage = require('./storage');

class ChapterServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createChapterService({
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  writeChapterIndex,
  extractTitleFromContent,
  clearRewriteStaleMarker,
  readVariants,
  writeVariants,
  countChars,
  withProjectLock,
}) {
  function validateChapterFileName(fileName) {
    if (!isValidChapterFileName(fileName)) {
      throw new ChapterServiceError('无效的章节文件名', 400);
    }
  }

  function resolveChapterPath(projectName, fileName) {
    validateChapterFileName(fileName);

    let projectDir;
    try {
      projectDir = safeProjectDir(projectName);
    } catch (err) {
      throw new ChapterServiceError(err.message, 400);
    }

    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const relativePath = path.relative(chaptersDir, chapterPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new ChapterServiceError('无效的章节文件名', 400);
    }
    return { chaptersDir, chapterPath };
  }

  async function getChapter(projectName, fileName) {
    const { chaptersDir, chapterPath } = resolveChapterPath(projectName, fileName);
    try {
      console.log('读取章节路径:', chapterPath);
      const content = await fs.readFile(chapterPath, 'utf-8');
      const indexEntries = await readChapterIndex(chaptersDir);
      const entry = indexEntries.find((item) => item.fileName === fileName);
      return {
        fileName,
        title: entry?.title || null,
        content,
        staleAfterRewrite: entry?.staleAfterRewrite === true,
        staleReason: entry?.staleReason || '',
        staleFromFileName: entry?.staleFromFileName || '',
        staleAt: entry?.staleAt || null,
      };
    } catch (err) {
      if (err instanceof ChapterServiceError) throw err;
      throw new ChapterServiceError('章节不存在', 404);
    }
  }

  async function confirmStaleChapter(projectName, fileName) {
    const { chaptersDir, chapterPath } = resolveChapterPath(projectName, fileName);
    await fs.access(chapterPath);
    const entries = await readChapterIndex(chaptersDir);
    let entry = entries.find((item) => item.fileName === fileName);
    if (!entry) {
      entry = {
        fileName,
        title: extractTitleFromContent('', parseInt(fileName, 10)),
        createdAt: new Date().toISOString(),
      };
      entries.push(entry);
    }
    clearRewriteStaleMarker(entry);
    await writeChapterIndex(chaptersDir, entries);
    return { ok: true, chapter: entry, chapters: entries };
  }

  async function deleteChapter(projectName, fileName) {
    const { chaptersDir, chapterPath } = resolveChapterPath(projectName, fileName);
    try {
      await fs.access(chapterPath);
    } catch {
      throw new ChapterServiceError('章节不存在', 404);
    }

    await withProjectLock(projectName, 'delete-chapter', async () => {
      await fs.rm(chapterPath);
      const indexEntries = await readChapterIndex(chaptersDir);
      const filtered = indexEntries.filter((entry) => entry.fileName !== fileName);
      if (filtered.length !== indexEntries.length) {
        await writeChapterIndex(chaptersDir, filtered);
      }
    });
    return { ok: true, message: '章节已删除', fileName };
  }

  async function saveChapterTitle(projectName, fileName, title) {
    const { chaptersDir, chapterPath } = resolveChapterPath(projectName, fileName);
    try {
      await fs.access(chapterPath);
    } catch {
      throw new ChapterServiceError('章节不存在', 404);
    }
    if (typeof title !== 'string') {
      throw new ChapterServiceError('title 必须为字符串', 400);
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      throw new ChapterServiceError('title 不能为空', 400);
    }

    let savedEntry;
    await withProjectLock(projectName, 'save-title', async () => {
      let indexEntries = await readChapterIndex(chaptersDir);
      if (indexEntries.length === 0) {
        const files = await fs.readdir(chaptersDir);
        const txtFiles = files.filter((file) => file.endsWith('.txt')).sort();
        indexEntries = txtFiles.map((chapterFileName) => ({
          fileName: chapterFileName,
          title: chapterFileName.replace('.txt', ''),
          createdAt: new Date().toISOString(),
        }));
      }

      savedEntry = indexEntries.find((entry) => entry.fileName === fileName);
      if (savedEntry) {
        savedEntry.title = trimmedTitle;
      } else {
        savedEntry = { fileName, title: trimmedTitle, createdAt: new Date().toISOString() };
        indexEntries.push(savedEntry);
      }
      await writeChapterIndex(chaptersDir, indexEntries);
    });

    return {
      ok: true,
      chapter: {
        fileName: savedEntry.fileName,
        title: savedEntry.title,
        createdAt: savedEntry.createdAt,
      },
    };
  }

  async function saveChapterContent(projectName, fileName, { title, content }) {
    validateChapterFileName(fileName);
    if (typeof content !== 'string') {
      throw new ChapterServiceError('content 必须为字符串', 400);
    }

    const { chaptersDir, chapterPath } = resolveChapterPath(projectName, fileName);
    try {
      await fs.access(chapterPath);
    } catch {
      throw new ChapterServiceError('章节不存在', 404);
    }

    await withProjectLock(projectName, 'save-content', async () => {
      const originalContent = await fs.readFile(chapterPath, 'utf-8');
      const existingVariants = await readVariants(chaptersDir, fileName);
      if (!existingVariants.find((variant) => variant.id === 'v-original')) {
        existingVariants.unshift({
          id: 'v-original',
          createdAt: new Date().toISOString(),
          model: 'original',
          userPrompt: '',
          content: originalContent,
        });
        await writeVariants(chaptersDir, fileName, existingVariants);
      }

      await storage.writeText(chapterPath, content);
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexEntry = indexEntries.find((entry) => entry.fileName === fileName);
      if (indexEntry) {
        indexEntry.wordCount = countChars(content);
        if (typeof title === 'string' && title.trim()) {
          indexEntry.title = title.trim();
        }
        await writeChapterIndex(chaptersDir, indexEntries);
      }
      console.log(`[编辑正文] 已保存 项目=${projectName} 章节=${fileName}`);
    });
    return { ok: true };
  }

  return {
    getChapter,
    confirmStaleChapter,
    deleteChapter,
    saveChapterTitle,
    saveChapterContent,
  };
}

module.exports = { ChapterServiceError, createChapterService };
