const path = require('path');
const express = require('express');

function createExportBackupRouter({
  safeProjectDir,
  readChapterIndex,
  readActiveChapterContent,
  access,
  readDir,
  readFile,
  stat,
  ZipArchive,
}) {
  const router = express.Router({ mergeParams: true });

  router.get('/export', async (req, res) => {
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
      // Try reading index.json first
      const indexEntries = await readChapterIndex(chaptersDir);
      let chapters = [];

      if (indexEntries.length > 0) {
        // Use index.json order
        for (const entry of indexEntries) {
          try {
            const text = await readActiveChapterContent(chaptersDir, entry);
            chapters.push({ title: entry.title || `第${parseInt(entry.fileName, 10)}章`, content: text });
          } catch {
            // skip missing files
          }
        }
      }

      // Fallback: read .txt files sorted alphabetically
      if (chapters.length === 0) {
        const files = await readDir(chaptersDir);
        const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
        for (const f of txtFiles) {
          const filePath = path.join(chaptersDir, f);
          const relative = path.relative(chaptersDir, filePath);
          if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
          const text = await readFile(filePath, 'utf-8');
          chapters.push({ title: `第${parseInt(f, 10)}章`, content: text });
        }
      }

      if (chapters.length === 0) {
        return res.status(404).json({ error: '该项目暂无章节' });
      }

      // Build markdown
      const parts = chapters.map((ch) => `# ${ch.title}\n\n${ch.content}`);
      const content = parts.join('\n\n');

      res.json({ fileName: `${projectName}.md`, content });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/backup', async (req, res) => {
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

    const backupFiles = [];
    const addBackupFile = async (filePath, archiveName) => {
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          backupFiles.push({ filePath, archiveName });
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
    };

    try {
      // Root markdown files (world.md, characters.md, style.md, summary.md, editorial-memory.md)
      for (const f of ['world.md', 'characters.md', 'style.md', 'summary.md', 'editorial-memory.md']) {
        await addBackupFile(path.join(projectDir, f), f);
      }

      // chapters/index.json and all .txt files
      const chaptersDir = path.join(projectDir, 'chapters');
      try {
        const chapterEntries = await readDir(chaptersDir, { withFileTypes: true });
        for (const entry of chapterEntries) {
          if (entry.isFile() && (entry.name.endsWith('.txt') || entry.name === 'index.json')) {
            backupFiles.push({
              filePath: path.join(chaptersDir, entry.name),
              archiveName: `chapters/${entry.name}`,
            });
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      // chapters/variants/*.json
      const variantsDir = path.join(chaptersDir, 'variants');
      try {
        const variantEntries = await readDir(variantsDir, { withFileTypes: true });
        for (const entry of variantEntries) {
          if (entry.isFile() && entry.name.endsWith('.json')) {
            backupFiles.push({
              filePath: path.join(variantsDir, entry.name),
              archiveName: `chapters/variants/${entry.name}`,
            });
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }

      if (backupFiles.length === 0) {
        return res.status(404).json({ error: '项目中没有可备份的文件' });
      }

      const archive = new ZipArchive({ zlib: { level: 9 } });
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `${projectName}-backup-${dateStr}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          archive.emit('error', err);
        }
      });

      archive.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message || '备份打包失败' });
        } else {
          res.destroy(err);
        }
      });

      archive.pipe(res);

      for (const file of backupFiles) {
        archive.file(file.filePath, { name: file.archiveName });
      }

      await archive.finalize();
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || '备份打包失败' });
      }
    }
  });

  return router;
}

module.exports = createExportBackupRouter;
