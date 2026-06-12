const path = require('path');
const fs = require('fs/promises');
const storage = require('./storage');

class VariantServiceError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function createVariantService({
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  writeChapterIndex,
  readVariants,
  writeVariants,
  updateChapterWordCount,
  markChaptersStaleAfterRewrite,
  withProjectLock,
}) {
  function resolveChapterPath(projectName, fileName) {
    if (!isValidChapterFileName(fileName)) {
      throw new VariantServiceError('无效的章节文件名', 400);
    }

    let projectDir;
    try {
      projectDir = safeProjectDir(projectName);
    } catch (err) {
      throw new VariantServiceError(err.message, 400);
    }

    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const relativePath = path.relative(chaptersDir, chapterPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new VariantServiceError('无效的章节文件名', 400);
    }
    return { chaptersDir, chapterPath };
  }

  async function requireChapter(projectName, fileName) {
    const paths = resolveChapterPath(projectName, fileName);
    try {
      await fs.access(paths.chapterPath);
    } catch {
      throw new VariantServiceError('章节不存在', 404);
    }
    return paths;
  }

  async function listVariants(projectName, fileName) {
    const { chaptersDir, chapterPath } = await requireChapter(projectName, fileName);
    const indexEntries = await readChapterIndex(chaptersDir);
    const indexEntry = indexEntries.find((entry) => entry.fileName === fileName);
    const originalUserPrompt = indexEntry?.userPrompt || '继续写';
    const variants = (await readVariants(chaptersDir, fileName)).map((variant) =>
      variant.id === 'v-original' && !variant.userPrompt
        ? { ...variant, userPrompt: originalUserPrompt }
        : variant
    );

    if (!variants.find((variant) => variant.id === 'v-original')) {
      const originalContent = await fs.readFile(chapterPath, 'utf-8');
      variants.unshift({
        id: 'v-original',
        createdAt: indexEntry?.createdAt || new Date().toISOString(),
        model: 'original',
        userPrompt: originalUserPrompt,
        content: originalContent,
        title: indexEntry?.title || fileName.replace('.txt', ''),
      });
    }

    return { fileName, variants };
  }

  async function applyVariant(projectName, fileName, variantId) {
    const { chaptersDir, chapterPath } = await requireChapter(projectName, fileName);
    let result;

    await withProjectLock(projectName, 'apply-variant', async () => {
      let variants = await readVariants(chaptersDir, fileName);
      let variant = variants.find((item) => item.id === variantId);

      if (!variant && variantId === 'v-original') {
        const indexEntries = await readChapterIndex(chaptersDir);
        const indexEntry = indexEntries.find((entry) => entry.fileName === fileName);
        const originalContent = await fs.readFile(chapterPath, 'utf-8');
        variant = {
          id: 'v-original',
          createdAt: indexEntry?.createdAt || new Date().toISOString(),
          model: 'original',
          userPrompt: indexEntry?.userPrompt || '',
          content: originalContent,
          title: indexEntry?.title || fileName.replace('.txt', ''),
        };
        variants = [variant, ...variants];
        await writeVariants(chaptersDir, fileName, variants);
      }

      if (!variant) {
        throw new VariantServiceError('候选版本不存在', 404);
      }

      await storage.writeText(chapterPath, variant.content);
      await updateChapterWordCount(chaptersDir, fileName);

      let indexEntries = await readChapterIndex(chaptersDir);
      const indexEntry = indexEntries.find((entry) => entry.fileName === fileName);
      if (indexEntry) {
        indexEntry.activeVersionId = variantId;
        if (variant.title) {
          indexEntry.title = variant.title;
        }
        if (Array.isArray(variant.usedEventCards) && variant.usedEventCards.length > 0) {
          indexEntry.usedEventCards = variant.usedEventCards;
        }
        if (!indexEntry.versions) {
          indexEntry.versions = [];
        }
        if (!indexEntry.versions.find((version) => version.id === 'v-original')) {
          indexEntry.versions.unshift({
            id: 'v-original',
            title: indexEntry.title || fileName.replace('.txt', ''),
            userPrompt: indexEntry.userPrompt || '',
            createdAt: indexEntry.createdAt || new Date().toISOString(),
          });
        }
        if (!indexEntry.versions.find((version) => version.id === variantId)) {
          indexEntry.versions.push({
            id: variantId,
            title: indexEntry.title || fileName.replace('.txt', ''),
            userPrompt: variant.userPrompt || '',
            createdAt: variant.createdAt,
          });
        }
        indexEntries = markChaptersStaleAfterRewrite(indexEntries, fileName);
        await writeChapterIndex(chaptersDir, indexEntries);
      }

      result = {
        ok: true,
        fileName,
        content: variant.content,
        activeVersionId: variantId,
        title: indexEntry?.title || variant.title,
        chapters: indexEntries,
      };
    });

    return result;
  }

  return { listVariants, applyVariant };
}

module.exports = { VariantServiceError, createVariantService };
