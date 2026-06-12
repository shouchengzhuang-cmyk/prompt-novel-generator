const path = require('path');
const express = require('express');

function createGenerateRouter({
  callDeepSeek,
  withProjectLock,
  ProjectLockError,
  acquireProjectLock,
  releaseProjectLock,
  prepareGenerationContext,
  persistGeneratedChapter,
  appendAndExtractSseLines,
  parseDeepSeekSseLine,
  readFile,
  writeText,
  updateEditorialMemoryForChapter,
  fetchImpl,
  getDeepSeekApiKey,
}) {
  const router = express.Router();

  router.post('/generate', async (req, res) => {
    const { projectName, userPrompt, model } = req.body;

    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ error: '缺少项目名' });
    }

    try {
      await withProjectLock(projectName.trim(), 'generate', async () => {
        const { projectDir, chaptersDir, messages, effectiveModel, debugPromptInfo } = await prepareGenerationContext({ projectName: projectName.trim(), userPrompt, model });

        // 4. Call DeepSeek
        const content = await callDeepSeek(effectiveModel, messages);

        const {
          fileName: filename,
          title,
          wordCount,
        } = await persistGeneratedChapter({ chaptersDir, content, userPrompt });

        // 6. 立即返回成功响应，摘要和编辑记忆改为后台异步更新
        res.json({ content, fileName: filename, title, debugPromptInfo, wordCount });

        // 6b. 后台异步更新 summary.md（不阻塞响应）
        setImmediate(async () => {
          try {
            const oldSummary = await readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
            const summaryMessages = [
              {
                role: 'system',
                content:
                  '你是长篇小说剧情摘要维护助手。你只更新剧情事实，不写正文，不评价作品。' +
                  '请把旧摘要和新章节内容合并压缩为新的 summary.md，使用中文，总长度控制在 800 字以内。',
              },
              {
                role: 'user',
                content:
                  '请根据旧 summary.md 和新章节内容，输出新的剧情摘要。\n\n' +
                  '要求：\n' +
                  '1. 不要写正文。\n' +
                  '2. 不要评价作品。\n' +
                  '3. 只更新剧情事实。\n' +
                  '4. 必须保留：已发生的关键事件、人物关系变化、重要物品/地点/秘密/伏笔、未解决悬念、当前时间线、下一章可接的位置。\n' +
                  '5. 总长度控制在 800 字以内。\n\n' +
                  `## 旧 summary.md\n${oldSummary || '（暂无）'}\n\n` +
                  `## 新章节 ${filename}\n${content}`,
              },
            ];
            const updatedSummary = await callDeepSeek('deepseek-v4-flash', summaryMessages);
            await writeText(path.join(projectDir, 'summary.md'), updatedSummary.trim());
            console.log(`[摘要] 后台已更新项目=${projectName} 章节=${filename}`);
          } catch (summaryErr) {
            console.warn(`[摘要] 后台更新失败（不影响主流程）: ${summaryErr.message}`);
          }

          // 6c. 后台异步更新 editorial-memory.md
          try {
            await updateEditorialMemoryForChapter(projectName, filename);
            console.log(`[编辑记忆] 后台已更新章节 ${filename}`);
          } catch (memErr) {
            console.warn(`[编辑记忆] 后台更新失败（不影响主流程）: ${memErr.message}`);
          }
        });
      });
    } catch (err) {
      if (err instanceof ProjectLockError) {
        return res.status(409).json({ error: err.message });
      }
      res.status(500).json({ error: err.message || '服务器内部错误' });
    }
  });

  router.post('/generate-stream', async (req, res) => {
    const { projectName, userPrompt, model } = req.body;

    if (!projectName || !projectName.trim()) {
      return res.status(400).json({ error: '缺少项目名' });
    }

    const trimmedProjectName = projectName.trim();

    if (!acquireProjectLock(trimmedProjectName, 'generate-stream')) {
      return res.status(409).json({ error: '当前项目正在生成或保存，请稍后再试' });
    }

    // 设置 SSE 响应头
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

    let projectDir, chaptersDir, fullContent;
    try {
      const ctx = await prepareGenerationContext({ projectName, userPrompt, model });
      projectDir = ctx.projectDir;
      chaptersDir = ctx.chaptersDir;

      // 流式调用 DeepSeek
      const dsResponse = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getDeepSeekApiKey()}`,
        },
        body: JSON.stringify({
          model: ctx.effectiveModel,
          messages: ctx.messages,
          stream: true,
        }),
      });

      if (!dsResponse.ok) {
        const errData = await dsResponse.json().catch(() => ({}));
        sendEvent({ type: 'error', message: errData.error?.message || 'DeepSeek API 请求失败' });
        res.end();
        return;
      }

      // 读取 DeepSeek 的 SSE 流，逐块转发给前端
      fullContent = '';
      const reader = dsResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const parsedChunk = appendAndExtractSseLines(buffer, decoder.decode(value, { stream: true }));
          buffer = parsedChunk.buffer;

          for (const line of parsedChunk.lines) {
            const event = parseDeepSeekSseLine(line);
            if (event?.content) {
              fullContent += event.content;
              sendEvent({ type: 'chunk', content: event.content });
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

      const {
        fileName: filename,
        title,
        wordCount,
      } = await persistGeneratedChapter({ chaptersDir, content: fullContent, userPrompt });

      console.log(`[流式生成] 已保存章节 ${filename}`);

      // 发送完成事件（包含完整内容和元数据）
      sendEvent({ type: 'done', fileName: filename, title, content: fullContent, debugPromptInfo: ctx.debugPromptInfo, wordCount });

      // 后台异步更新
      setImmediate(async () => {
        try {
          const oldSummary = await readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
          const summaryMessages = [
            {
              role: 'system',
              content:
                '你是长篇小说剧情摘要维护助手。你只更新剧情事实，不写正文，不评价作品。' +
                '请把旧摘要和新章节内容合并压缩为新的 summary.md，使用中文，总长度控制在 800 字以内。',
            },
            {
              role: 'user',
              content:
                '请根据旧 summary.md 和新章节内容，输出新的剧情摘要。\n\n' +
                '要求：\n' +
                '1. 不要写正文。\n' +
                '2. 不要评价作品。\n' +
                '3. 只更新剧情事实。\n' +
                '4. 必须保留：已发生的关键事件、人物关系变化、重要物品/地点/秘密/伏笔、未解决悬念、当前时间线、下一章可接的位置。\n' +
                '5. 总长度控制在 800 字以内。\n\n' +
                `## 旧 summary.md\n${oldSummary || '（暂无）'}\n\n` +
                `## 新章节 ${filename}\n${fullContent}`,
            },
          ];
          const updatedSummary = await callDeepSeek('deepseek-v4-flash', summaryMessages);
          await writeText(path.join(projectDir, 'summary.md'), updatedSummary.trim());
          console.log(`[流式生成] 后台已更新摘要 项目=${projectName} 章节=${filename}`);
        } catch (summaryErr) {
          console.warn(`[流式生成] 后台摘要更新失败: ${summaryErr.message}`);
        }

        try {
          await updateEditorialMemoryForChapter(projectName, filename);
          console.log(`[流式生成] 后台已更新编辑记忆 章节=${filename}`);
        } catch (memErr) {
          console.warn(`[流式生成] 后台编辑记忆更新失败: ${memErr.message}`);
        }
      });

      res.end();
    } catch (err) {
      console.error(`[流式生成] 错误:`, err);
      if (!res.writableEnded) {
        sendEvent({ type: 'error', message: err.message || '服务器内部错误' });
        res.end();
      }
    } finally {
      releaseProjectLock(trimmedProjectName);
    }
  });

  return router;
}

module.exports = createGenerateRouter;
