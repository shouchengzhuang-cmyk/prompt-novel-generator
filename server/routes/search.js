const path = require('path');
const express = require('express');

function createSearchRouter({
  novelsDir,
  ensureDir,
  safeProjectDir,
  readChapterIndex,
  isValidChapterFileName,
  readDir,
  readFile,
}) {
  const router = express.Router();

  router.get('/search', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);

      if (!q) return res.status(400).json({ error: '搜索关键词不能为空' });
      if (q.length > 80) return res.status(400).json({ error: '搜索关键词最长 80 个字符' });

      const qLower = q.toLowerCase();
      const results = [];

      await ensureDir(novelsDir);
      const entries = await readDir(novelsDir, { withFileTypes: true });
      const projectNames = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .map((e) => e.name);

      for (const name of projectNames) {
        let projectDir;
        try {
          projectDir = safeProjectDir(name);
        } catch {
          continue;
        }

        // 1. 项目名匹配
        if (name.toLowerCase().includes(qLower)) {
          results.push({ projectName: name, type: 'project', title: name, snippet: name, matchCount: 1 });
        }

        // 2. 章节标题 + 正文
        const chaptersDir = path.join(projectDir, 'chapters');
        try {
          const indexEntries = await readChapterIndex(chaptersDir);
          const allFiles = await readDir(chaptersDir);
          const txtFiles = allFiles.filter((f) => isValidChapterFileName(f)).sort();

          for (const fileName of txtFiles) {
            let matchCount = 0;
            let snippet = '';
            const entry = indexEntries.find((e) => e.fileName === fileName);
            const title = entry?.title || '';

            if (title.toLowerCase().includes(qLower)) matchCount++;

            try {
              const content = await readFile(path.join(chaptersDir, fileName), 'utf-8');
              const idx = content.toLowerCase().indexOf(qLower);
              if (idx !== -1) {
                matchCount++;
                const start = Math.max(0, idx - 20);
                const end = Math.min(content.length, idx + q.length + 50);
                snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
              }
            } catch { /* skip unreadable */ }

            if (matchCount > 0) {
              results.push({
                projectName: name,
                type: 'chapter',
                chapterNumber: parseInt(fileName, 10),
                title,
                fileName,
                snippet,
                matchCount,
              });
            }
          }
        } catch { /* no chapters dir */ }

        // 3. 设定文件
        const settingFiles = [
          { key: 'world', label: '世界观设定', file: 'world.md' },
          { key: 'characters', label: '人物设定', file: 'characters.md' },
          { key: 'style', label: '写作规则', file: 'style.md' },
          { key: 'summary', label: '剧情摘要', file: 'summary.md' },
          { key: 'editorialMemory', label: '编辑记忆', file: 'editorial-memory.md' },
          { key: 'outline', label: '大纲', file: 'outline.json' },
        ];

        for (const sf of settingFiles) {
          try {
            const content = await readFile(path.join(projectDir, sf.file), 'utf-8');
            const idx = content.toLowerCase().indexOf(qLower);
            if (idx !== -1) {
              const start = Math.max(0, idx - 20);
              const end = Math.min(content.length, idx + q.length + 50);
              const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
              results.push({
                projectName: name,
                type: 'setting',
                settingKey: sf.key,
                title: sf.label,
                snippet,
                matchCount: 1,
              });
            }
          } catch { /* file not found */ }
        }
      }

      // 排序：项目名 > 章节标题命中 > 设定名命中 > 正文命中
      function rank(r) {
        if (r.type === 'project') return 0;
        if (r.type === 'chapter' && r.title && r.title.toLowerCase().includes(qLower)) return 1;
        if (r.type === 'setting') return 2;
        return 3;
      }
      results.sort((a, b) => rank(a) - rank(b));

      res.json({ query: q, results: results.slice(0, limit) });
    } catch (err) {
      console.error('[Search] 异常:', err.message);
      res.status(500).json({ error: '搜索服务异常' });
    }
  });

  return router;
}

module.exports = createSearchRouter;
