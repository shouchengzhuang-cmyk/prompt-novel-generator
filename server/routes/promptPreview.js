const path = require('path');
const express = require('express');

function createPromptPreviewRouter({
  safeProjectDir,
  ensureDir,
  readChapterIndex,
  readVariants,
  buildPrompt,
  isValidChapterFileName,
  access,
  readFile,
  readDir,
  recentChapterLimit,
}) {
  const router = express.Router({ mergeParams: true });

  router.get('/prompt-preview', async (req, res) => {
    const { projectName } = req.params;
    const { taskType, userPrompt, fileName } = req.query;

    if (!taskType || !['novel.generateChapter', 'novel.rewriteChapter'].includes(taskType)) {
      return res.status(400).json({ error: 'taskType 必须为 novel.generateChapter 或 novel.rewriteChapter' });
    }

    let projectDir;
    try {
      projectDir = safeProjectDir(projectName);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      await access(projectDir);
    } catch {
      return res.status(404).json({ error: '项目不存在' });
    }

    const chaptersDir = path.join(projectDir, 'chapters');

    try {
      // 1. Read context files
      const [worldFile, charactersFile, styleFile] = await Promise.all([
        readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
      ]);

      let context = {
        world: worldFile || '',
        characters: charactersFile || '',
        style: styleFile || '',
        userPrompt: (userPrompt || '').trim(),
      };

      if (taskType === 'novel.generateChapter') {
        const summaryFile = await readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
        context.summary = summaryFile || '';
      }

      // 2. Read recent chapters (with activeVersionId awareness)
      let recentChapters = [];
      try {
        await ensureDir(chaptersDir);
        const files = await readDir(chaptersDir);
        const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
        const indexEntries = await readChapterIndex(chaptersDir);
        const indexMap = {};
        for (const entry of indexEntries) {
          indexMap[entry.fileName] = entry;
        }

        let selectedFiles;
        if (taskType === 'novel.rewriteChapter') {
          if (!fileName) {
            return res.status(400).json({ error: 'rewriteChapter 预览需要提供 fileName' });
          }
          if (!isValidChapterFileName(fileName)) {
            return res.status(400).json({ error: '无效的 fileName' });
          }
          const currentIndex = txtFiles.indexOf(fileName);
          if (currentIndex === -1) {
            return res.status(404).json({ error: '章节不存在' });
          }
          selectedFiles = currentIndex > 0
            ? txtFiles.slice(Math.max(0, currentIndex - recentChapterLimit), currentIndex)
            : [];
        } else {
          selectedFiles = txtFiles.slice(-recentChapterLimit);
        }

        for (const f of selectedFiles) {
          const entry = indexMap[f];
          let content;
          if (entry && entry.activeVersionId && entry.activeVersionId !== 'v-original') {
            const variants = await readVariants(chaptersDir, f);
            const activeVariant = variants.find((v) => v.id === entry.activeVersionId);
            content = activeVariant ? activeVariant.content : await readFile(path.join(chaptersDir, f), 'utf-8');
          } else {
            content = await readFile(path.join(chaptersDir, f), 'utf-8');
          }
          recentChapters.push({ filename: f, content });
        }
      } catch {
        await ensureDir(chaptersDir);
      }

      context.recentChapters = recentChapters.map((ch) => `--- ${ch.filename} ---\n${ch.content}`).join('\n\n');

      // 3. Build prompt
      const promptInfo = await buildPrompt(taskType, context);
      const { systemContent, userContent, templateId, templateTitle, usedFallback } = promptInfo;

      res.json({ taskType, templateId, templateTitle, usedFallback, systemContent, userContent });
    } catch (err) {
      res.status(500).json({ error: err.message || '预览生成失败' });
    }
  });

  return router;
}

module.exports = createPromptPreviewRouter;
