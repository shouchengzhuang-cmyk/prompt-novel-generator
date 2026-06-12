const path = require('path');
const express = require('express');

function createRegenerateRouter({
  isValidChapterFileName,
  safeProjectDir,
  withProjectLock,
  ProjectLockError,
  acquireProjectLock,
  releaseProjectLock,
  ensureDir,
  readChapterIndex,
  writeChapterIndex,
  readVariants,
  writeVariants,
  extractTitleFromContent,
  buildPrompt,
  callDeepSeek,
  readFile,
  readDir,
  access,
  fetchImpl,
  getDeepSeekApiKey,
  recentChapterLimit,
}) {
  const router = express.Router({ mergeParams: true });

  router.post('/regenerate', async (req, res) => {
    const { projectName, fileName } = req.params;
    const { model, userPrompt } = req.body;

    if (!isValidChapterFileName(fileName)) {
      return res.status(400).json({ error: '无效的章节文件名' });
    }

    const allowedModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
    const effectiveModel = allowedModels.includes(model) ? model : 'deepseek-v4-flash';

    let projectDir;
    try {
      projectDir = safeProjectDir(projectName);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const relativePath = path.relative(chaptersDir, chapterPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(400).json({ error: '无效的章节文件名' });
    }

    try {
      await access(chapterPath);
    } catch {
      return res.status(404).json({ error: '章节不存在' });
    }

    const trimmedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
    const effectiveUserPrompt = trimmedUserPrompt || '继续写';

    try {
      await withProjectLock(projectName, 'regenerate', async () => {
        // 1. Read context files (skip summary to avoid old-chapter contamination)
        const [world, characters, style] = await Promise.all([
          readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
          readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
          readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
        ]);

        // 2. Read original chapter content (only for v-original preservation, not for prompt)
        const originalContent = await readFile(chapterPath, 'utf-8');

        // 3. Read previous chapters for context (skip the current one, respect activeVersionId)
        let recentChapters = [];
        try {
          await ensureDir(chaptersDir);
          const files = await readDir(chaptersDir);
          const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
          const currentIndex = txtFiles.indexOf(fileName);
          const contextFiles = currentIndex > 0 ? txtFiles.slice(Math.max(0, currentIndex - recentChapterLimit), currentIndex) : [];
          const indexEntries = await readChapterIndex(chaptersDir);
          const indexMap = {};
          for (const entry of indexEntries) {
            indexMap[entry.fileName] = entry;
          }
          for (const f of contextFiles) {
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
          // ignore
        }

        // 4. Build prompt from Vault template (fork — NOT rewrite old chapter)
        const recentChaptersText = recentChapters.map((ch) => `--- ${ch.filename} ---\n${ch.content}`).join('\n\n');
        const promptInfo = await buildPrompt('novel.rewriteChapter', {
          world: world || '',
          characters: characters || '',
          style: style || '',
          recentChapters: recentChaptersText,
          userPrompt: effectiveUserPrompt,
        });
        const { systemContent, userContent, templateId, templateTitle, usedFallback } = promptInfo;
        const debugPromptInfo = { taskType: 'novel.rewriteChapter', templateId, templateTitle, usedFallback };

        console.log(`[重写] 项目=${projectName} 章节=${fileName} taskType=novel.rewriteChapter templateId=${templateId || '(无)'} usedFallback=${usedFallback}`);
        if (usedFallback) {
          console.warn(`[重写] ⚠ 项目=${projectName} 章节=${fileName} taskType=novel.rewriteChapter 使用了 fallback 生成，未使用 Vault 模板`);
        }

        const messages = [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ];

        // 5. Call DeepSeek
        const content = await callDeepSeek(effectiveModel, messages);

        // 6. Save as variant (with title extracted from content)
        const chapterNumber = parseInt(fileName, 10);
        const variantTitle = extractTitleFromContent(content, chapterNumber);
        const variant = {
          id: `v-${Date.now()}`,
          createdAt: new Date().toISOString(),
          model: effectiveModel,
          userPrompt: effectiveUserPrompt,
          title: variantTitle,
          content,
        };
        const indexEntries = await readChapterIndex(chaptersDir);
        const indexEntry = indexEntries.find((e) => e.fileName === fileName);
        const originalUserPrompt = indexEntry?.userPrompt || '继续写';
        const existingVariants = await readVariants(chaptersDir, fileName);
        // If the original content hasn't been saved as a variant yet, save it now
        if (!existingVariants.find((v) => v.id === 'v-original')) {
          existingVariants.unshift({
            id: 'v-original',
            createdAt: new Date().toISOString(),
            model: 'original',
            userPrompt: originalUserPrompt,
            content: originalContent,
          });
        }
        existingVariants.push(variant);
        await writeVariants(chaptersDir, fileName, existingVariants);

        // 7. Also track in index.json versions array
        if (indexEntry) {
          if (!indexEntry.versions) {
            indexEntry.versions = [];
          }
          if (!indexEntry.versions.find((v) => v.id === 'v-original')) {
            indexEntry.versions.unshift({
              id: 'v-original',
              title: indexEntry.title || fileName.replace('.txt', ''),
              userPrompt: originalUserPrompt,
              createdAt: indexEntry.createdAt || new Date().toISOString(),
            });
          }
          indexEntry.versions.push({
            id: variant.id,
            title: variantTitle,
            userPrompt: effectiveUserPrompt,
            createdAt: variant.createdAt,
          });
          await writeChapterIndex(chaptersDir, indexEntries);
        }

        res.json({ ok: true, variant, debugPromptInfo });
      });
    } catch (err) {
      if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
      res.status(500).json({ error: err.message || '服务器内部错误' });
    }
  });

  router.post('/regenerate-stream', async (req, res) => {
    const { projectName, fileName } = req.params;
    const { model, userPrompt } = req.body;

    if (!isValidChapterFileName(fileName)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '无效的章节文件名' }));
    }

    const allowedModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
    const effectiveModel = allowedModels.includes(model) ? model : 'deepseek-v4-flash';

    let projectDir;
    try {
      projectDir = safeProjectDir(projectName);
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }

    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const relativePath = path.relative(chaptersDir, chapterPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '无效的章节文件名' }));
    }

    try {
      await access(chapterPath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '章节不存在' }));
    }

    const trimmedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
    const effectiveUserPrompt = trimmedUserPrompt || '继续写';

    if (!acquireProjectLock(projectName, 'regenerate-stream')) {
      return res.status(409).json({ error: '当前项目正在生成或保存，请稍后再试' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // 1. Read context files (skip summary to avoid old-chapter contamination)
      const [world, characters, style] = await Promise.all([
        readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
        readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
      ]);

      // 2. Read original chapter content (for v-original preservation)
      const originalContent = await readFile(chapterPath, 'utf-8');

      // 3. Read previous chapters for context
      let recentChapters = [];
      try {
        await ensureDir(chaptersDir);
        const files = await readDir(chaptersDir);
        const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
        const currentIndex = txtFiles.indexOf(fileName);
        const contextFiles = currentIndex > 0 ? txtFiles.slice(Math.max(0, currentIndex - recentChapterLimit), currentIndex) : [];
        const indexEntries = await readChapterIndex(chaptersDir);
        const indexMap = {};
        for (const entry of indexEntries) {
          indexMap[entry.fileName] = entry;
        }
        for (const f of contextFiles) {
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
        // ignore
      }

      // 4. Build prompt from Vault template
      const recentChaptersText = recentChapters.map((ch) => `--- ${ch.filename} ---\n${ch.content}`).join('\n\n');
      const promptInfo = await buildPrompt('novel.rewriteChapter', {
        world: world || '',
        characters: characters || '',
        style: style || '',
        recentChapters: recentChaptersText,
        userPrompt: effectiveUserPrompt,
      });
      const { systemContent, userContent, templateId, templateTitle, usedFallback } = promptInfo;
      const debugPromptInfo = { taskType: 'novel.rewriteChapter', templateId, templateTitle, usedFallback };

      console.log(`[流式重写] 项目=${projectName} 章节=${fileName} taskType=novel.rewriteChapter templateId=${templateId || '(无)'} usedFallback=${usedFallback}`);

      const messages = [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ];

      // 5. Call DeepSeek with streaming
      const dsResponse = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getDeepSeekApiKey()}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          messages,
          stream: true,
        }),
      });

      if (!dsResponse.ok) {
        const errData = await dsResponse.json().catch(() => ({}));
        sendEvent({ type: 'error', message: errData.error?.message || 'DeepSeek API 请求失败' });
        res.end();
        return;
      }

      // Read DeepSeek's SSE stream and forward chunks to client
      let fullContent = '';
      const reader = dsResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const parsed = JSON.parse(payload);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                sendEvent({ type: 'chunk', content: delta });
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      } finally {
        try { reader.releaseLock(); } catch {}
      }

      if (!fullContent) {
        sendEvent({ type: 'error', message: 'API 返回内容为空' });
        res.end();
        return;
      }

      // 7. Save as variant
      const chapterNumber = parseInt(fileName, 10);
      const variantTitle = extractTitleFromContent(fullContent, chapterNumber);
      const variant = {
        id: `v-${Date.now()}`,
        createdAt: new Date().toISOString(),
        model: effectiveModel,
        userPrompt: effectiveUserPrompt,
        title: variantTitle,
        content: fullContent,
      };
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexEntry = indexEntries.find((e) => e.fileName === fileName);
      const originalUserPrompt = indexEntry?.userPrompt || '继续写';
      const existingVariants = await readVariants(chaptersDir, fileName);
      if (!existingVariants.find((v) => v.id === 'v-original')) {
        existingVariants.unshift({
          id: 'v-original',
          createdAt: new Date().toISOString(),
          model: 'original',
          userPrompt: originalUserPrompt,
          content: originalContent,
        });
      }
      existingVariants.push(variant);
      await writeVariants(chaptersDir, fileName, existingVariants);

      // 8. Update index.json versions array
      if (indexEntry) {
        if (!indexEntry.versions) {
          indexEntry.versions = [];
        }
        if (!indexEntry.versions.find((v) => v.id === 'v-original')) {
          indexEntry.versions.unshift({
            id: 'v-original',
            title: indexEntry.title || fileName.replace('.txt', ''),
            userPrompt: originalUserPrompt,
            createdAt: indexEntry.createdAt || new Date().toISOString(),
          });
        }
        indexEntry.versions.push({
          id: variant.id,
          title: variantTitle,
          userPrompt: effectiveUserPrompt,
          createdAt: variant.createdAt,
        });
        await writeChapterIndex(chaptersDir, indexEntries);
      }

      console.log(`[流式重写] 已保存变体 章节=${fileName} 变体=${variant.id}`);

      // Send done event with full variant and debug info
      sendEvent({ type: 'done', variant, debugPromptInfo });

      res.end();
    } catch (err) {
      console.error(`[流式重写] 错误:`, err);
      if (!res.writableEnded) {
        sendEvent({ type: 'error', message: err.message || '服务器内部错误' });
        res.end();
      }
    } finally {
      releaseProjectLock(projectName);
    }
  });

  return router;
}

module.exports = createRegenerateRouter;
