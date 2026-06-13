const path = require('path');
const express = require('express');

function createSummaryOutlineRouter({
  safeProjectDir,
  callDeepSeek,
  readChapterIndex,
  readActiveChapterContent,
  readOutline,
  writeOutline,
  withProjectLock,
  ProjectLockError,
  access,
  readFile,
  stat,
  writeText,
  maxSummaryContentLength,
}) {
  const router = express.Router({ mergeParams: true });

  router.post('/summary/rebuild', async (req, res) => {
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

    try {
      // 1. Read settings files for context
      const [world, characters, style] = await Promise.all([
        readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
      ]);

      // 2. Read chapters in index.json order with activeVersionId awareness
      const chaptersDir = path.join(projectDir, 'chapters');
      try { await access(chaptersDir); } catch {
        return res.status(404).json({ error: '该项目暂无章节' });
      }

      const indexEntries = await readChapterIndex(chaptersDir);
      if (indexEntries.length === 0) {
        return res.status(404).json({ error: '该项目暂无章节' });
      }

      // Collect all chapter contents with numbering
      let allParts = [];
      for (const entry of indexEntries) {
        try {
          const content = await readActiveChapterContent(chaptersDir, entry);
          const header = `## ${entry.title || `第${parseInt(entry.fileName, 10)}章`}`;
          allParts.push({ text: `${header}\n\n${content}` });
        } catch {
          // skip unreadable chapters
        }
      }

      if (allParts.length === 0) {
        return res.status(404).json({ error: '无可读章节内容' });
      }

      // Truncate oldest chapters if total content exceeds limit
      let totalLength = allParts.reduce((sum, p) => sum + p.text.length, 0);
      let truncatedCount = 0;
      while (totalLength > maxSummaryContentLength && allParts.length > 1) {
        const removed = allParts.shift();
        totalLength -= removed.text.length;
        truncatedCount++;
      }

      const chaptersText = allParts.map((p) => p.text).join('\n\n---\n\n');
      let truncatedNote = '';
      if (truncatedCount > 0) {
        truncatedNote = `\n\n注意：共 ${truncatedCount + allParts.length} 章，前 ${truncatedCount} 章因全文过长已截断，以上为最新的 ${allParts.length} 章。`;
      }

      // 3. Build prompt
      let userContent = '';
      if (world) userContent += `## 世界观设定\n${world}\n\n`;
      if (characters) userContent += `## 人物设定\n${characters}\n\n`;
      if (style) userContent += `## 写作规则\n${style}\n\n`;
      userContent += `## 全文章节\n${chaptersText}${truncatedNote}\n\n`;
      userContent += '请根据以上设定和所有章节正文，输出新的剧情摘要。';

      const messages = [
        {
          role: 'system',
          content:
            '你是长篇小说剧情摘要助手。你只更新剧情事实，不写正文，不评价作品。' +
            '根据以下小说设定和全文章节，生成一份完整的故事摘要。使用中文，总长度控制在 800 字以内。',
        },
        {
          role: 'user',
          content:
            '请根据以下小说设定和所有章节正文，输出一份完整的剧情摘要。\n\n' +
            '要求：\n' +
            '1. 不要写正文。\n' +
            '2. 不要评价作品。\n' +
            '3. 只更新剧情事实。\n' +
            '4. 必须包含：已发生的关键事件、人物关系变化、重要物品/地点/秘密/伏笔、未解决悬念、当前时间线、下一章可接的位置。\n' +
            '5. 总长度控制在 800 字以内。\n\n' +
            userContent,
        },
      ];

      // 4. Call DeepSeek (only writes summary.md on success)
      const newSummary = await callDeepSeek('deepseek-v4-flash', messages);
      const trimmed = newSummary.trim();

      // 5. Write to summary.md (only reached if DeepSeek succeeded)
      await writeText(path.join(projectDir, 'summary.md'), trimmed);

      res.json({ ok: true, message: '摘要已重建', summary: trimmed });
    } catch (err) {
      // On any error, old summary.md is preserved (no write occurred)
      res.status(500).json({ error: err.message || '摘要重建失败' });
    }
  });

  router.get('/outline', async (req, res) => {
    const { projectName } = req.params;

    try {
      safeProjectDir(projectName);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const outline = await readOutline(projectName);
      res.json({ outline });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/outline', async (req, res) => {
    const { projectName } = req.params;
    const { outline } = req.body;

    try {
      safeProjectDir(projectName);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!Array.isArray(outline)) {
      return res.status(400).json({ error: 'outline 必须是数组' });
    }

    try {
      await withProjectLock(projectName, 'save-outline', async () => {
        await writeOutline(projectName, outline);
        res.json({ ok: true, outline });
      });
    } catch (err) {
      if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/outline/generate', async (req, res) => {
    const { projectName } = req.params;
    const { model: reqModel } = req.body;

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

    const allowedModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
    const model = allowedModels.includes(reqModel) ? reqModel : 'deepseek-v4-flash';
    const chaptersDir = path.join(projectDir, 'chapters');

    try {
      await withProjectLock(projectName, 'generate-outline', async () => {
        // 1. Read project settings
        const [world, characters, summary, style] = await Promise.all([
          readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
          readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
          readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
          readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
        ]);

        // 2. Read chapter titles
        const chaptersDirExists = await stat(chaptersDir).then(() => true).catch(() => false);
        let chapterTitles = [];
        if (chaptersDirExists) {
          const indexEntries = await readChapterIndex(chaptersDir);
          chapterTitles = indexEntries.map((entry, i) => ({
            number: i + 1,
            title: entry.title || `第${i + 1}章`,
            fileName: entry.fileName,
          }));
        }

        // 3. Build the prompt
        let contextSections = [];
        if (world) contextSections.push(`【世界观设定】\n${world}`);
        if (characters) contextSections.push(`【人物设定】\n${characters}`);
        if (style) contextSections.push(`【写作规则】\n${style}`);
        if (summary) contextSections.push(`【剧情摘要】\n${summary}`);

        let chapterListing = '暂无章节';
        if (chapterTitles.length > 0) {
          chapterListing = chapterTitles.map((ch) => `第${ch.number}章：${ch.title}`).join('\n');
        }

        const systemPrompt = '你是一个专业的小说章节大纲生成器。根据项目设定和已有章节，为接下来的章节生成结构化大纲。';
        const userPrompt = `${contextSections.join('\n\n')}\n\n【已有章节】\n${chapterListing}\n\n请根据以上信息和小说创作规律，为尚未编写的章节生成大纲。\n\n要求：\n1. 返回 JSON 数组，每个元素包含字段：number（章节号）, goal（本章目标）, keyEvents（关键事件数组）, characterChanges（人物变化）, status（状态，用"planned"）。\n2. 如果已有章节，从下一章开始规划 5 章。\n3. 如果没有章节，从第 1 章开始规划 5 章。\n4. 只返回 JSON，不要额外文字。`;

        const content = await callDeepSeek(model, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ]);

        // Parse the returned JSON
        let outline;
        try {
          // Try to extract JSON from code block if present
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
          outline = JSON.parse(jsonStr);
          if (!Array.isArray(outline)) {
            // Maybe it's wrapped in an object
            if (outline.outline && Array.isArray(outline.outline)) {
              outline = outline.outline;
            } else {
              throw new Error('返回数据不是数组');
            }
          }
        } catch (parseErr) {
          return res.status(500).json({ error: 'AI 返回格式异常，请重试', raw: content });
        }

        // Merge with existing outline: keep chapters that already have entries
        const existing = await readOutline(projectName);
        const merged = [...outline];
        for (const item of existing) {
          const idx = merged.findIndex((m) => m.number === item.number);
          if (idx >= 0) {
            // Keep existing status and details if they exist
            merged[idx] = { ...merged[idx], ...item, number: item.number };
          } else {
            merged.push(item);
          }
        }
        merged.sort((a, b) => a.number - b.number);

        await writeOutline(projectName, merged);
        res.json({ outline: merged });
      });
    } catch (err) {
      if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createSummaryOutlineRouter;
