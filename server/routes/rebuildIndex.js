const path = require('path');
const express = require('express');

function createRebuildIndexRouter({
  safeProjectDir,
  readChapterIndex,
  writeChapterIndex,
  withProjectLock,
  ProjectLockError,
  access,
  readDir,
  stat,
}) {
  const router = express.Router({ mergeParams: true });

  router.post('/rebuild-index', async (req, res) => {
    const { projectName } = req.params;

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
      await access(chaptersDir);
    } catch {
      return res.status(404).json({ error: '该项目暂无章节' });
    }

    try {
      await withProjectLock(projectName, 'rebuild-index', async () => {
        const files = await readDir(chaptersDir);
        const txtFiles = files.filter((fileName) => fileName.endsWith('.txt')).sort();

        if (txtFiles.length === 0) {
          return res.status(404).json({ error: '该项目暂无章节' });
        }

        const oldEntries = await readChapterIndex(chaptersDir);
        const oldMap = {};
        for (const entry of oldEntries) {
          oldMap[entry.fileName] = entry;
        }

        const newEntries = [];
        for (const fileName of txtFiles) {
          const old = oldMap[fileName];
          let createdAt;
          if (old && old.createdAt) {
            createdAt = old.createdAt;
          } else {
            try {
              const fileStat = await stat(path.join(chaptersDir, fileName));
              createdAt = fileStat.birthtime?.toISOString() || fileStat.mtime.toISOString();
            } catch {
              createdAt = new Date().toISOString();
            }
          }
          newEntries.push({
            ...(old || {}),
            fileName,
            title: old?.title || `第${parseInt(fileName, 10)}章`,
            createdAt,
            activeVersionId: old?.activeVersionId || 'v-original',
            versions: old?.versions || [],
          });
        }

        await writeChapterIndex(chaptersDir, newEntries);
        res.json({ ok: true, chapters: newEntries });
      });
    } catch (err) {
      if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createRebuildIndexRouter;
