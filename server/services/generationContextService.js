const path = require('path');
const fs = require('fs/promises');

function createGenerationContextService({
  safeProjectDir,
  ensureDir,
  readEditorialMemory,
  selectEditorialMemoryForPrompt,
  readOutline,
  readChapterIndex,
  readVariants,
  buildPrompt,
  resolveGenerationModel,
  recentChapterLimit,
}) {
  async function prepareGenerationContext({ projectName, userPrompt, model }) {
    if (!projectName || !projectName.trim()) {
      const err = new Error('缺少项目名');
      err.statusCode = 400;
      throw err;
    }
    if (!userPrompt || !userPrompt.trim()) {
      const err = new Error('缺少续写要求');
      err.statusCode = 400;
      throw err;
    }

    const effectiveModel = resolveGenerationModel(model);
    const projectDir = safeProjectDir(projectName);
    const chaptersDir = path.join(projectDir, 'chapters');

    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);
    const editorialMemoryForPrompt = await readEditorialMemory(projectName);

    let recentChapters = [];
    try {
      await ensureDir(chaptersDir);
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((fileName) => fileName.endsWith('.txt')).sort().slice(-recentChapterLimit);
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexMap = {};
      for (const entry of indexEntries) {
        indexMap[entry.fileName] = entry;
      }
      for (const fileName of txtFiles) {
        const entry = indexMap[fileName];
        if (entry?.staleAfterRewrite === true) continue;

        let content;
        if (entry && entry.activeVersionId && entry.activeVersionId !== 'v-original') {
          const variants = await readVariants(chaptersDir, fileName);
          const activeVariant = variants.find((variant) => variant.id === entry.activeVersionId);
          content = activeVariant
            ? activeVariant.content
            : await fs.readFile(path.join(chaptersDir, fileName), 'utf-8');
        } else {
          content = await fs.readFile(path.join(chaptersDir, fileName), 'utf-8');
        }
        recentChapters.push({ filename: fileName, content });
      }
    } catch {
      await ensureDir(chaptersDir);
    }

    const recentChaptersText = recentChapters
      .map((chapter) => `--- ${chapter.filename} ---\n${chapter.content}`)
      .join('\n\n');
    const promptInfo = await buildPrompt('novel.generateChapter', {
      world: world || '',
      characters: characters || '',
      style: style || '',
      summary: summary || '',
      editorialMemory: editorialMemoryForPrompt || '',
      recentChapters: recentChaptersText,
      userPrompt: userPrompt.trim(),
    });
    const { systemContent, userContent, templateId, templateTitle, usedFallback } = promptInfo;
    const debugPromptInfo = { taskType: 'novel.generateChapter', templateId, templateTitle, usedFallback };

    console.log(`[生成] 项目=${projectName} taskType=novel.generateChapter templateId=${templateId || '(无)'} usedFallback=${usedFallback}`);
    if (usedFallback) {
      console.warn(`[生成] ⚠ 项目=${projectName} taskType=novel.generateChapter 使用了 fallback 生成，未使用 Vault 模板`);
    }

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];

    if (editorialMemoryForPrompt) {
      const selectedMemory = selectEditorialMemoryForPrompt(editorialMemoryForPrompt, 2000);
      if (selectedMemory) {
        const sectionText = `\n\n## 项目编辑记忆\n${selectedMemory}\n\n`;
        let currentContent = messages[1].content;
        const chapterHeaders = ['## 最近章节', '## 前文章节', '## 前文'];
        let injected = false;
        for (const header of chapterHeaders) {
          if (currentContent.includes(header)) {
            currentContent = currentContent.replace(header, sectionText + header);
            injected = true;
            break;
          }
        }
        if (!injected) {
          currentContent = currentContent.replace('## 本次续写要求', sectionText + '## 本次续写要求');
        }
        messages[1] = { role: 'user', content: currentContent };
        console.log(`[编辑记忆] 已并入生成 prompt (${selectedMemory.length} 字)`);
      }
    }

    try {
      const chapterFiles = await fs.readdir(chaptersDir);
      const numbers = chapterFiles
        .filter((fileName) => /^\d+\.txt$/.test(fileName))
        .map((fileName) => parseInt(fileName, 10))
        .filter((number) => !isNaN(number));
      const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;

      const outline = await readOutline(projectName);
      const plan = outline.find((item) => item.number === nextNumber);
      if (plan) {
        let planText = `\n\n## 本章规划\n目标：${plan.goal || ''}\n`;
        if (Array.isArray(plan.keyEvents) && plan.keyEvents.length > 0) {
          planText += `关键事件：\n${plan.keyEvents.map((event) => `- ${event}`).join('\n')}\n`;
        }
        if (plan.characterChanges) planText += `人物变化：${plan.characterChanges}\n`;
        if (plan.status) planText += `状态：${plan.status}\n`;

        messages[1] = {
          role: 'user',
          content: messages[1].content.replace('## 本次续写要求', planText + '## 本次续写要求'),
        };
        console.log(`[章节规划] 已并入第${nextNumber}章规划`);
      }
    } catch (outlineErr) {
      console.warn(`[章节规划] 注入失败（不影响主流程）: ${outlineErr.message}`);
    }

    return { projectDir, chaptersDir, messages, effectiveModel, debugPromptInfo };
  }

  return { prepareGenerationContext };
}

module.exports = { createGenerationContextService };
