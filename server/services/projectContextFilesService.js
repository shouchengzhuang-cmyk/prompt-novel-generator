const path = require('path');

function createProjectContextFilesService({
  safeProjectDir,
  ensureDir,
  fsReadFile,
  writeJson,
  isValidChapterFileName,
  readVariants,
}) {
  function getOutlinePath(projectName) {
    return path.join(safeProjectDir(projectName), 'outline.json');
  }

  async function readOutline(projectName) {
    try {
      const raw = await fsReadFile(getOutlinePath(projectName), 'utf-8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function writeOutline(projectName, outline) {
    if (!Array.isArray(outline)) {
      throw new Error('outline 必须是数组');
    }
    const filePath = getOutlinePath(projectName);
    await ensureDir(path.dirname(filePath));
    await writeJson(filePath, outline);
  }

  async function readActiveChapterContent(chaptersDir, chapterRecord) {
    const fileName = chapterRecord.fileName || chapterRecord.filename;
    const chapterPath = path.join(chaptersDir, fileName);
    const relative = path.relative(chaptersDir, chapterPath);
    if (!isValidChapterFileName(fileName) || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('无效的章节文件名');
    }

    const readChapterTxt = () => fsReadFile(chapterPath, 'utf-8');
    const activeVersionId = chapterRecord.activeVersionId || 'v-original';
    const variants = await readVariants(chaptersDir, fileName);

    if (activeVersionId !== 'v-original') {
      const activeVariant = variants.find((variant) => variant.id === activeVersionId);
      if (activeVariant && typeof activeVariant.content === 'string' && activeVariant.content) {
        return activeVariant.content;
      }
      return readChapterTxt();
    }

    const originalVariant = variants.find((variant) => variant.id === 'v-original');
    if (originalVariant && typeof originalVariant.content === 'string' && originalVariant.content) {
      return originalVariant.content;
    }

    return readChapterTxt();
  }

  return {
    readOutline,
    writeOutline,
    readActiveChapterContent,
  };
}

module.exports = { createProjectContextFilesService };
