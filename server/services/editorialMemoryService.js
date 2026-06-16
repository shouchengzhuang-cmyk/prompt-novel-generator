const path = require('path');

const DEFAULT_EDITORIAL_MEMORY = `# 项目编辑记忆

> 最后更新：暂无
> 说明：这里记录编辑对本项目的长期判断、伏笔跟踪、人物关系演变和后续写作风险。summary.md 记录剧情事实，本文件记录编辑分析。

## 长期关注点

暂无。

## 伏笔跟踪

暂无。

## 章节编辑记忆
`;

function createEditorialMemoryService({
  safeProjectDir,
  callDeepSeek,
  readChapterIndex,
  ensureDir,
  fsReadFile,
  fsAccess,
  writeText,
}) {
  function getEditorialMemoryPath(projectName) {
    return path.join(safeProjectDir(projectName), 'editorial-memory.md');
  }

  async function ensureEditorialMemory(projectName) {
    const filePath = getEditorialMemoryPath(projectName);
    try {
      await fsAccess(filePath);
    } catch {
      await ensureDir(path.dirname(filePath));
      await writeText(filePath, DEFAULT_EDITORIAL_MEMORY);
    }
    return filePath;
  }

  async function readEditorialMemory(projectName) {
    try {
      await ensureEditorialMemory(projectName);
      const filePath = getEditorialMemoryPath(projectName);
      return await fsReadFile(filePath, 'utf-8');
    } catch {
      return DEFAULT_EDITORIAL_MEMORY;
    }
  }

  async function writeEditorialMemory(projectName, content) {
    const filePath = getEditorialMemoryPath(projectName);
    await ensureDir(path.dirname(filePath));
    await writeText(filePath, content);
  }

  /**
   * Replace or append a full chapter memory block (including markers) in editorial-memory.md.
   * fullBlock must contain `<!-- chapter-memory:start fileName -->` and `<!-- chapter-memory:end fileName -->`.
   * If block for this fileName already exists, replaces it. Otherwise appends after `## 章节编辑记忆` section.
   */
  function replaceChapterMemoryBlock(memoryContent, fileName, fullBlock) {
    const startMarker = `<!-- chapter-memory:start ${fileName} -->`;
    const endMarker = `<!-- chapter-memory:end ${fileName} -->`;

    const startIdx = memoryContent.indexOf(startMarker);
    const endIdx = memoryContent.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      const before = memoryContent.substring(0, startIdx);
      const after = memoryContent.substring(endIdx + endMarker.length);
      return before + fullBlock + after;
    }

    // Append new block after "## 章节编辑记忆" section
    const sectionMarker = '## 章节编辑记忆';
    const sectionIdx = memoryContent.indexOf(sectionMarker);
    if (sectionIdx !== -1) {
      const sectionEnd = sectionIdx + sectionMarker.length;
      const before = memoryContent.substring(0, sectionEnd);
      const after = memoryContent.substring(sectionEnd);
      return before + '\n\n' + fullBlock + after;
    }

    return memoryContent + '\n\n' + fullBlock;
  }

  /**
   * Select and truncate editorial memory for prompt injection.
   * Keeps header + long-term concerns + latest chapter blocks within maxChars.
   */
  function selectEditorialMemoryForPrompt(memoryContent, maxChars) {
    if (!memoryContent || memoryContent.length <= maxChars) {
      return memoryContent || '';
    }

    // Keep header (everything before ## 章节编辑记忆) + latest 3 chapter blocks
    const parts = [];
    const headerMatch = memoryContent.match(/^[\s\S]*?(?=## 章节编辑记忆)/);
    if (headerMatch) {
      parts.push(headerMatch[0].trim());
    }

    const blockRegex = /<!-- chapter-memory:start \S+ -->[\s\S]*?<!-- chapter-memory:end \S+ -->/g;
    const blocks = memoryContent.match(blockRegex) || [];
    const recentBlocks = blocks.slice(-3);

    if (recentBlocks.length > 0) {
      parts.push('## 章节编辑记忆', ...recentBlocks);
    }

    const result = parts.join('\n\n');
    if (result.length <= maxChars) return result;

    if (recentBlocks.length > 2) {
      const shorter = [parts[0], '## 章节编辑记忆', ...recentBlocks.slice(-2)].join('\n\n');
      if (shorter.length <= maxChars) return shorter;
    }

    return memoryContent.slice(0, maxChars) + '\n\n…（项目编辑记忆因过长已截断）';
  }

  /**
   * Called after a new chapter is generated.
   * Reads chapter content + summary + old editorial-memory.md, calls flash model,
   * then replaces or appends the corresponding chapter block.
   * Errors are caught and logged — never affects the caller.
   */
  async function updateEditorialMemoryForChapter(projectName, fileName) {
    const projectDir = safeProjectDir(projectName);
    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const rp = path.relative(chaptersDir, chapterPath);
    if (rp.startsWith('..') || path.isAbsolute(rp)) {
      throw new Error('无效的章节文件名');
    }

    const chapterContent = await fsReadFile(chapterPath, 'utf-8');
    const summary = await fsReadFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
    const oldMemory = await readEditorialMemory(projectName);

    // Get chapter title from index.json
    let chapterTitle = fileName;
    try {
      const indexEntries = await readChapterIndex(chaptersDir);
      const entry = indexEntries.find((item) => item.fileName === fileName);
      if (entry && entry.title) chapterTitle = entry.title;
    } catch { /* use fileName as fallback */ }

    const chapterNumber = parseInt(fileName, 10);
    const titleDisplay = `第${chapterNumber}章（${fileName}）`;

    const messages = [
      {
        role: 'system',
        content:
          '你是"小墨匣"的项目级编辑记忆维护员。' +
          '你的任务不是总结剧情事实，而是维护编辑长期记忆：人物关系演变、伏笔跟踪、跨章节风险、后续写作提醒。' +
          'summary.md 已经负责剧情事实；你不要重复写流水账。',
      },
      {
        role: 'user',
        content:
          `## 当前章节\n标题：${chapterTitle}\n文件名：${fileName}\n\n` +
          `## 当前章节正文\n${chapterContent}\n\n` +
          (summary ? `## 当前剧情摘要\n${summary}\n\n` : '') +
          `## 旧项目编辑记忆\n${oldMemory}\n\n` +
          '只输出当前章节的 memory block，不要输出整个文件。\n\n' +
          `必须使用这个格式（保留 \`<!-- chapter-memory:start -->\` 标记）：\n\n` +
          `<!-- chapter-memory:start ${fileName} -->\n` +
          `### ${titleDisplay}\n\n` +
          `- **剧情意义**：（本章在整体剧情中的作用）\n` +
          `- **人物关系变化**：（人物关系的新进展或变化）\n` +
          `- **伏笔与未解决问题**：（本章设置的伏笔或未解决的问题）\n` +
          `- **编辑判断**：（编辑对本章质量的整体判断）\n` +
          `- **后续提醒**：（对后续章节的写作提醒）\n\n` +
          `<!-- chapter-memory:end ${fileName} -->`,
      },
    ];

    const aiResponse = await callDeepSeek('deepseek-v4-flash', messages);
    let blockContent = aiResponse.trim();
    // Strip code fences if present
    blockContent = blockContent.replace(/^```[\w]*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();

    // Ensure the block has proper markers
    if (!blockContent.includes('<!-- chapter-memory:start')) {
      blockContent =
        `<!-- chapter-memory:start ${fileName} -->\n` +
        `### ${titleDisplay}\n\n` +
        blockContent +
        `\n<!-- chapter-memory:end ${fileName} -->`;
    }

    const currentMemory = await readEditorialMemory(projectName);
    let updatedMemory = replaceChapterMemoryBlock(currentMemory, fileName, blockContent);

    // Update the "最后更新" timestamp
    const now = new Date();
    const dateStr =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    updatedMemory = updatedMemory.replace(/> 最后更新：.*/, `> 最后更新：${dateStr}`);

    await writeEditorialMemory(projectName, updatedMemory);
  }

  return {
    DEFAULT_EDITORIAL_MEMORY,
    getEditorialMemoryPath,
    ensureEditorialMemory,
    readEditorialMemory,
    writeEditorialMemory,
    replaceChapterMemoryBlock,
    selectEditorialMemoryForPrompt,
    updateEditorialMemoryForChapter,
  };
}

module.exports = { createEditorialMemoryService };
