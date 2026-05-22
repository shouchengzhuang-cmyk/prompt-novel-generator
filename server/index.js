const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { ZipArchive } = require('archiver');

const vaultRoutes = require('./routes/vault');
const { buildPrompt } = require('./services/promptBuilder');

const app = express();
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

const NOVELS_DIR = process.env.NOVELS_DIR
  ? path.resolve(process.env.NOVELS_DIR)
  : path.resolve(__dirname, '..', 'novels');
const RECENT_CHAPTER_LIMIT = 10;
const EDITOR_CHAT_FULL_CHAPTER_LIMIT = 80000;

// ---- Helpers ----

function safeProjectDir(projectName) {
  const name = String(projectName || '').trim();

  if (!name || name === '.' || name === '..') {
    throw new Error('项目名不能为空');
  }

  // Validate against illegal Windows filename characters
  if (/[/\\:*?"<>|]/.test(name)) {
    throw new Error('项目名包含非法字符（/ \\ : * ? " < > |）');
  }

  if (path.basename(name) !== name) {
    throw new Error('非法的项目名');
  }

  const dir = path.resolve(NOVELS_DIR, name);
  const relativePath = path.relative(NOVELS_DIR, dir);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('非法的项目名');
  }
  return dir;
}

function isValidChapterFileName(fileName) {
  return /^\d{3,}\.txt$/.test(fileName);
}

function shouldLoadFullChapterForEditorChat(message) {
  return /全文|全章|这一章|这章|本章|章节内容|章节正文|正文|最后一个字|最后一句|最后一段|结尾|开头|分析这章|分析本章|看看这章|读一下|写到哪里|讲到哪里|说到哪里/.test(message);
}

function formatEditorChatFullChapter(chapterContent) {
  if (chapterContent.length <= EDITOR_CHAT_FULL_CHAPTER_LIMIT) {
    return chapterContent;
  }

  const edgeLength = Math.floor(EDITOR_CHAT_FULL_CHAPTER_LIMIT / 2);
  const head = chapterContent.slice(0, edgeLength);
  const tail = chapterContent.slice(-edgeLength);
  const omittedLength = chapterContent.length - head.length - tail.length;
  return `${head}\n\n…（当前章节过长，中间约省略 ${omittedLength} 字；已保留章节开头和结尾）\n\n${tail}`;
}

async function callDeepSeek(model, messages) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('请在 server/.env 中配置 DEEPSEEK_API_KEY');
  }
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'DeepSeek API 请求失败');
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API 返回内容为空');
  }

  return content;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

// ---- Editor Note ----

async function buildEditorNote(projectName, chapterFileName) {
  // 1. Validate chapterFileName
  if (!isValidChapterFileName(chapterFileName)) {
    const err = new Error('无效的章节文件名');
    err.statusCode = 400;
    err.code = 'INVALID_CHAPTER_FILENAME';
    throw err;
  }

  const projectDir = safeProjectDir(projectName);

  const [world, characters, summary, style] = await Promise.all([
    fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
  ]);

  const chaptersDir = path.join(projectDir, 'chapters');
  const chapterPath = path.join(chaptersDir, chapterFileName);
  const rp = path.relative(chaptersDir, chapterPath);
  if (rp.startsWith('..') || path.isAbsolute(rp)) {
    const err = new Error('无效的章节文件名');
    err.statusCode = 400;
    err.code = 'INVALID_CHAPTER_FILENAME';
    throw err;
  }

  // 2. Current chapter — fail if not found (core input)
  let chapterContent;
  try {
    chapterContent = await fs.readFile(chapterPath, 'utf-8');
  } catch {
    const err = new Error('章节不存在');
    err.statusCode = 404;
    err.code = 'CHAPTER_NOT_FOUND';
    throw err;
  }

  // 3. History chapters — skip individual failures gracefully
  const files = (await fs.readdir(chaptersDir))
    .filter((f) => f.endsWith('.txt') && isValidChapterFileName(f))
    .sort();
  const idx = files.indexOf(chapterFileName);
  let prevText = '';
  if (idx > 0) {
    const prevFiles = files.slice(Math.max(0, idx - 3), idx);
    for (const f of prevFiles) {
      try {
        const c = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
        prevText += `${f}:\n${c.length > 2000 ? c.slice(0, 2000) + '\n…' : c}\n\n`;
      } catch {
        // Skip individual history chapter read failure
      }
    }
  }

  // Build context (truncated to keep prompt lean)
  let contextText = '';
  if (world) contextText += `世界观：${world.slice(0, 800)}\n\n`;
  if (characters) contextText += `人物设定：${characters.slice(0, 800)}\n\n`;
  if (style) contextText += `写作风格：${style.slice(0, 500)}\n\n`;
  if (summary) contextText += `剧情摘要：${summary.slice(0, 800)}\n\n`;
  if (prevText) contextText += `前文回顾：\n${prevText}`;
  contextText += `当前章节 ${chapterFileName}：\n${chapterContent.slice(0, 4000)}${chapterContent.length > 4000 ? '\n…' : ''}\n\n`;

  const messages = [
    {
      role: 'system',
      content:
        '你是章节编辑，只输出简短、可执行的写作批注，给后续写作用。\n' +
        '禁止使用 Markdown：不要 **加粗**、### 标题、表格、> 引用、``` 代码块、--- 分隔线、复杂编号层级。\n' +
        '使用纯文本，可以用简单中文小标题，例如：本章问题：修改建议：下章注意：。\n' +
        '300 字以内，语气直接，不客套，不写“总体来说”“可以看出”“值得注意的是”。',
    },
    {
      role: 'user',
      content: contextText +
        '请基于以上信息，输出 300 字以内的编辑备注。\n\n' +
        '只保留对后续写作最有用的内容：人物行为是否合理、情绪是否连续、伏笔是否保留、下一章应该接什么、哪些内容不要重复、哪些冲突需要修正。\n\n' +
        '格式要求：\n' +
        '纯文本。可以使用“本章问题：”“修改建议：”“下章注意：”这类简单中文小标题。\n' +
        '禁止 Markdown 特殊格式符号：不要 **加粗**，不要 ### 标题，不要表格，不要 > 引用，不要 ``` 代码块，不要 --- 分隔线，不要复杂编号层级。\n' +
        '不要客套，不要总结式废话，不要询问用户，不要重写正文。直接输出批注内容。',
    },
  ];

  const note = await callDeepSeek('deepseek-v4-flash', messages);
  return sanitizeEditorText(note, 300);
}

// ---- Editorial Memory Helpers ----

const DEFAULT_EDITORIAL_MEMORY = `# 项目编辑记忆

> 最后更新：暂无
> 说明：这里记录编辑对本项目的长期判断、伏笔跟踪、人物关系演变和后续写作风险。summary.md 记录剧情事实，本文件记录编辑分析。

## 长期关注点

暂无。

## 伏笔跟踪

暂无。

## 章节编辑记忆
`;

function getEditorialMemoryPath(projectName) {
  return path.join(safeProjectDir(projectName), 'editorial-memory.md');
}

async function ensureEditorialMemory(projectName) {
  const filePath = getEditorialMemoryPath(projectName);
  try {
    await fs.access(filePath);
  } catch {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, DEFAULT_EDITORIAL_MEMORY, 'utf-8');
  }
  return filePath;
}

async function readEditorialMemory(projectName) {
  try {
    await ensureEditorialMemory(projectName);
    const filePath = getEditorialMemoryPath(projectName);
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return DEFAULT_EDITORIAL_MEMORY;
  }
}

async function writeEditorialMemory(projectName, content) {
  const filePath = getEditorialMemoryPath(projectName);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
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

  const chapterContent = await fs.readFile(chapterPath, 'utf-8');
  const summary = await fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
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

// ---- Chapter title helpers ----

const INDEX_FILE = 'index.json';

async function readChapterIndex(chaptersDir) {
  try {
    const raw = await fs.readFile(path.join(chaptersDir, INDEX_FILE), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeChapterIndex(chaptersDir, entries) {
  await fs.writeFile(
    path.join(chaptersDir, INDEX_FILE),
    JSON.stringify(entries, null, 2),
    'utf-8'
  );
}

async function ensureChapterIndexEntry(chaptersDir, fileName) {
  const entries = await readChapterIndex(chaptersDir);
  let entry = entries.find((item) => item.fileName === fileName);
  if (!entry) {
    entry = {
      fileName,
      title: extractTitleFromContent('', parseInt(fileName, 10)),
      createdAt: new Date().toISOString(),
    };
    entries.push(entry);
  }
  return { entries, entry };
}

function clearRewriteStaleMarker(entry) {
  if (!entry) return;
  delete entry.staleAfterRewrite;
  delete entry.staleReason;
  delete entry.staleFromFileName;
  delete entry.staleAt;
}

function markChaptersStaleAfterRewrite(chapters, rewrittenFileName, staleAt = Date.now()) {
  const rewrittenIndex = chapters.findIndex((item) => item.fileName === rewrittenFileName);
  if (rewrittenIndex < 0) return chapters;

  const chapterNumber = parseInt(rewrittenFileName, 10);
  const staleReason = `第${chapterNumber}章已重写，后续章节可能与当前剧情不连续`;

  return chapters.map((chapter, index) => {
    if (index === rewrittenIndex) {
      const nextChapter = { ...chapter };
      clearRewriteStaleMarker(nextChapter);
      return nextChapter;
    }
    if (index > rewrittenIndex) {
      return {
        ...chapter,
        staleAfterRewrite: true,
        staleReason,
        staleFromFileName: rewrittenFileName,
        staleAt,
      };
    }
    return chapter;
  });
}

function formatLocalMinute(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('');
}

function sanitizeEditorText(text, maxLength = 500) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/^```[\w-]*\s*$/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function extractTitleFromContent(content, chapterNumber) {
  // Scan first non-empty lines for a detectable title
  const lines = content.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const trimmed = line.trim();
    // Match: # 标题  or  ## 标题
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) return headingMatch[1].trim();
    // Match: 章节标题：xxx
    const titleDeclMatch = trimmed.match(/^章节标题[：:]\s*(.+)/);
    if (titleDeclMatch) return titleDeclMatch[1].trim();
    // Match: 第X章 标题
    const chapterMatch = trimmed.match(/^第[一二三四五六七八九十百千万\d]+章\s+(.+)/);
    if (chapterMatch) return `第${chapterNumber}章 ${chapterMatch[1].trim()}`;
    // Match bare "第X章"
    const bareChapter = trimmed.match(/^(第[一二三四五六七八九十百千万\d]+章)/);
    if (bareChapter) return bareChapter[1];
  }
  return `第${chapterNumber}章`;
}

// ---- GET /api/projects ----

app.get('/api/projects', async (_req, res) => {
  try {
    await ensureDir(NOVELS_DIR);
    const entries = await fs.readdir(NOVELS_DIR, { withFileTypes: true });
    const projects = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/projects ----

app.post('/api/projects', async (req, res) => {
  const { projectName, world, characters, style, summary } = req.body;

  if (!projectName || !projectName.trim()) {
    return res.status(400).json({ error: '项目名不能为空' });
  }

  const name = projectName.trim();

  let projectDir;
  try {
    projectDir = safeProjectDir(name);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    // Reject if project directory already exists
    try {
      await fs.access(projectDir);
      return res.status(409).json({ error: '项目名已存在，请换一个名称。' });
    } catch {
      // directory does not exist, safe to create
    }

    const chaptersDir = path.join(projectDir, 'chapters');
    await ensureDir(chaptersDir);
    await fs.writeFile(path.join(projectDir, 'world.md'), world || '', 'utf-8');
    await fs.writeFile(path.join(projectDir, 'characters.md'), characters || '', 'utf-8');
    await fs.writeFile(path.join(projectDir, 'summary.md'), typeof summary === 'string' ? summary : '', 'utf-8');
    await fs.writeFile(path.join(projectDir, 'style.md'), style || '', 'utf-8');
    res.json({ success: true, projectName: name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/projects/:projectName ----

app.get('/api/projects/:projectName', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  try {
    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);
    const editorialMemory = await readEditorialMemory(projectName);

    const chaptersDir = path.join(projectDir, 'chapters');
    let chapters = [];
    let recentContent = '';

    try {
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexMap = {};
      for (const entry of indexEntries) {
        indexMap[entry.fileName] = entry;
      }
      chapters = txtFiles.map((f) => ({
        ...(indexMap[f] || {}),
        filename: f,
        fileName: f,
        title: indexMap[f]?.title || extractTitleFromContent('', parseInt(f, 10)),
        userPrompt: indexMap[f]?.userPrompt || '',
        activeVersionId: indexMap[f]?.activeVersionId || 'v-original',
        editorNotes: Array.isArray(indexMap[f]?.editorNotes) ? indexMap[f].editorNotes : [],
        editorChats: Array.isArray(indexMap[f]?.editorChats) ? indexMap[f].editorChats : [],
      }));

      // Load content of last 10 chapters for display
      const recentFiles = chapters.slice(-10);
      const contents = await Promise.all(
        recentFiles.map((ch) =>
          fs.readFile(path.join(chaptersDir, ch.filename), 'utf-8')
            .then((c) => ({ fn: ch.filename, text: c }))
        )
      );
      // If more than 10 total, show a separator
      if (chapters.length > 10) {
        recentContent = `…（共 ${chapters.length} 章，显示最近 10 章）\n\n`;
      }
      recentContent += contents
        .map((c) => `--- ${c.fn} ---\n${c.text}`)
        .join('\n\n');
    } catch {
      // chapters dir may not exist
    }

    res.json({ projectName, world, characters, summary, style, editorialMemory, chapters, recentContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/projects/:projectName/chapters/:fileName ----

app.get('/api/projects/:projectName/chapters/:fileName', async (req, res) => {
  const { projectName, fileName } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const chaptersDir = path.join(projectDir, 'chapters');
    const chapterPath = path.join(chaptersDir, fileName);
    const relativePath = path.relative(chaptersDir, chapterPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return res.status(400).json({ error: '无效的章节文件名' });
    }
    console.log('读取章节路径:', chapterPath);
    const content = await fs.readFile(chapterPath, 'utf-8');
    const indexEntries = await readChapterIndex(chaptersDir);
    const entry = indexEntries.find((item) => item.fileName === fileName);
    res.json({
      fileName,
      title: entry?.title || null,
      content,
      editorNotes: Array.isArray(entry?.editorNotes) ? entry.editorNotes : [],
      editorChats: Array.isArray(entry?.editorChats) ? entry.editorChats : [],
      staleAfterRewrite: entry?.staleAfterRewrite === true,
      staleReason: entry?.staleReason || '',
      staleFromFileName: entry?.staleFromFileName || '',
      staleAt: entry?.staleAt || null,
    });
  } catch {
    res.status(404).json({ error: '章节不存在' });
  }
});

// ---- PUT /api/projects/:projectName/chapters/:fileName/stale/confirm ----

app.put('/api/projects/:projectName/chapters/:fileName/stale/confirm', async (req, res) => {
  const { projectName, fileName } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

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
    await fs.access(chapterPath);
    const { entries, entry } = await ensureChapterIndexEntry(chaptersDir, fileName);
    clearRewriteStaleMarker(entry);
    await writeChapterIndex(chaptersDir, entries);
    res.json({ ok: true, chapter: entry, chapters: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE /api/projects/:projectName/chapters/:fileName ----

app.delete('/api/projects/:projectName/chapters/:fileName', async (req, res) => {
  const { projectName, fileName } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

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
    await fs.access(chapterPath);
  } catch {
    return res.status(404).json({ error: '章节不存在' });
  }

  try {
    await fs.rm(chapterPath);
    // Remove entry from index.json
    const indexEntries = await readChapterIndex(chaptersDir);
    const filtered = indexEntries.filter((e) => e.fileName !== fileName);
    if (filtered.length !== indexEntries.length) {
      await writeChapterIndex(chaptersDir, filtered);
    }
    res.json({ ok: true, message: '章节已删除', fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/projects/:projectName/chapters/:fileName/title ----

app.put('/api/projects/:projectName/chapters/:fileName/title', async (req, res) => {
  const { projectName, fileName } = req.params;
  let { title } = req.body;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

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
    await fs.access(chapterPath);
  } catch {
    return res.status(404).json({ error: '章节不存在' });
  }

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'title 必须为字符串' });
  }

  title = title.trim();
  if (!title) {
    return res.status(400).json({ error: 'title 不能为空' });
  }

  try {
    let indexEntries = await readChapterIndex(chaptersDir);

    // Rebuild index.json if missing or empty
    if (indexEntries.length === 0) {
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
      indexEntries = txtFiles.map((f) => ({
        fileName: f,
        title: f.replace('.txt', ''),
        createdAt: new Date().toISOString(),
      }));
    }

    // Find or create entry
    let entry = indexEntries.find((e) => e.fileName === fileName);
    if (entry) {
      entry.title = title;
    } else {
      entry = { fileName, title, createdAt: new Date().toISOString() };
      indexEntries.push(entry);
    }

    await writeChapterIndex(chaptersDir, indexEntries);
    res.json({ ok: true, chapter: { fileName: entry.fileName, title: entry.title, createdAt: entry.createdAt } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE /api/projects/:projectName ----

app.delete('/api/projects/:projectName', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Prevent deleting the novels root directory
  if (projectDir === NOVELS_DIR) {
    return res.status(400).json({ error: '不能删除根目录' });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  try {
    await fs.rm(projectDir, { recursive: true, force: false });
    res.json({ ok: true, message: '项目已删除', projectName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/projects/:projectName ----

app.put('/api/projects/:projectName', async (req, res) => {
  const { projectName } = req.params;
  const { world, characters, style, summary, editorialMemory } = req.body;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  try {
    const project = {
      world: typeof world === 'string' ? world : '',
      characters: typeof characters === 'string' ? characters : '',
      style: typeof style === 'string' ? style : '',
      summary: typeof summary === 'string' ? summary : '',
      editorialMemory: typeof editorialMemory === 'string' ? editorialMemory : undefined,
    };

    const writes = [
      fs.writeFile(path.join(projectDir, 'world.md'), project.world, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'characters.md'), project.characters, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'style.md'), project.style, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'summary.md'), project.summary, 'utf-8'),
    ];
    if (project.editorialMemory !== undefined) {
      writes.push(fs.writeFile(path.join(projectDir, 'editorial-memory.md'), project.editorialMemory, 'utf-8'));
    }
    await Promise.all(writes);
    res.json({ ok: true, message: '设定已保存', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/generate ----

app.post('/api/generate', async (req, res) => {
  const { projectName, userPrompt, model } = req.body;

  if (!projectName || !projectName.trim()) {
    return res.status(400).json({ error: '缺少项目名' });
  }
  if (!userPrompt || !userPrompt.trim()) {
    return res.status(400).json({ error: '缺少续写要求' });
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

  try {
    // 1. Read context files
    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);
    const editorialMemoryForPrompt = await readEditorialMemory(projectName);

    // 2. Read latest chapters for context (respecting activeVersionId)
    let recentChapters = [];
    try {
      await ensureDir(chaptersDir);
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort().slice(-RECENT_CHAPTER_LIMIT);
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexMap = {};
      for (const entry of indexEntries) {
        indexMap[entry.fileName] = entry;
      }
      for (const f of txtFiles) {
        const entry = indexMap[f];
        if (entry?.staleAfterRewrite === true) {
          continue;
        }
        let content;
        // If this chapter has an active version pointing to a variant, load variant content
        if (entry && entry.activeVersionId && entry.activeVersionId !== 'v-original') {
          const variants = await readVariants(chaptersDir, f);
          const activeVariant = variants.find((v) => v.id === entry.activeVersionId);
          if (activeVariant) {
            content = activeVariant.content;
          } else {
            content = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
          }
        } else {
          content = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
        }
        recentChapters.push({ filename: f, content });
      }
    } catch {
      await ensureDir(chaptersDir);
    }

    // 3. Build messages from Vault template
    const recentChaptersText = recentChapters.map((ch) => `--- ${ch.filename} ---\n${ch.content}`).join('\n\n');
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

    // 3b. Inject editorial-memory.md into user prompt (after summary, before recent chapters)
    if (editorialMemoryForPrompt) {
      const selectedMemory = selectEditorialMemoryForPrompt(editorialMemoryForPrompt, 2000);
      if (selectedMemory) {
        const sectionText = `\n\n## 项目编辑记忆\n${selectedMemory}\n\n`;
        let currentContent = messages[1].content;
        // Try to insert before recent chapters section
        const chapterHeaders = ['## 最近章节', '## 前文章节', '## 前文'];
        let injected = false;
        for (const h of chapterHeaders) {
          if (currentContent.includes(h)) {
            currentContent = currentContent.replace(h, sectionText + h);
            injected = true;
            break;
          }
        }
        if (!injected) {
          // Fallback: inject before user prompt section
          currentContent = currentContent.replace('## 本次续写要求', sectionText + '## 本次续写要求');
        }
        messages[1] = { role: 'user', content: currentContent };
        console.log(`[编辑记忆] 已并入生成 prompt (${selectedMemory.length} 字)`);
      }
    }

    // 4a. Generate editor note from latest chapter and append to messages
    try {
      if (recentChapters.length > 0) {
        const lastCh = recentChapters[recentChapters.length - 1];
        const note = await buildEditorNote(projectName, lastCh.filename);
        if (note) {
          const suffix = `\n\n【后台编辑给下一章生成模型的提醒】\n${note}\n\n以上是内部编辑提醒，只用于指导生成，不要出现在正文中。`;
          messages[1] = { role: 'user', content: messages[1].content + suffix };
          console.log(`[编辑备注] 已并入生成 prompt`);
        }
      }
    } catch (noteErr) {
      console.warn(`[编辑备注] 生成失败（不影响主流程）: ${noteErr.message}`);
    }

    // 4. Call DeepSeek
    const content = await callDeepSeek(effectiveModel, messages);

    // 4b. Leakage detection: reject if editor note phrases leaked into generated content
    const LEAK_PHRASES = [
      '后台编辑给下一章生成模型的提醒',
      '内部编辑提醒',
      '编辑备注',
      '只用于指导生成',
      '不要出现在正文中',
    ];
    if (LEAK_PHRASES.some((p) => content.includes(p))) {
      throw new Error('生成内容包含编辑备注泄漏词，已拦截保存。请重试。');
    }

    // 5. Determine next chapter number and save
    await ensureDir(chaptersDir);
    let nextNum = 1;
    try {
      const files = await fs.readdir(chaptersDir);
      const nums = files
        .filter((f) => /^\d+\.txt$/.test(f))
        .map((f) => parseInt(f, 10));
      if (nums.length > 0) {
        nextNum = Math.max(...nums) + 1;
      }
    } catch {
      // first chapter
    }

    const filename = String(nextNum).padStart(3, '0') + '.txt';
    await fs.writeFile(path.join(chaptersDir, filename), content, 'utf-8');

    // 6a. Extract title and update index.json
    const title = extractTitleFromContent(content, nextNum);
    const indexEntries = await readChapterIndex(chaptersDir);
    const now = new Date().toISOString();
    indexEntries.push({
      fileName: filename,
      title,
      createdAt: now,
      userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
      activeVersionId: 'v-original',
      versions: [
        {
          id: 'v-original',
          title,
          userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
          createdAt: now,
        },
      ],
    });
    await writeChapterIndex(chaptersDir, indexEntries);

    // 6. 立即返回成功响应，摘要和编辑记忆改为后台异步更新
    res.json({ content, fileName: filename, title, debugPromptInfo });

    // 6b. 后台异步更新 summary.md（不阻塞响应）
    setImmediate(async () => {
      try {
        const oldSummary = await fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
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
        await fs.writeFile(path.join(projectDir, 'summary.md'), updatedSummary.trim(), 'utf-8');
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
  } catch (err) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// ---- GET /api/projects/:projectName/export ----

async function readActiveChapterContent(chaptersDir, chapterRecord) {
  const fileName = chapterRecord.fileName || chapterRecord.filename;
  const chapterPath = path.join(chaptersDir, fileName);
  const relative = path.relative(chaptersDir, chapterPath);
  if (!isValidChapterFileName(fileName) || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('无效的章节文件名');
  }

  const readChapterTxt = () => fs.readFile(chapterPath, 'utf-8');
  const activeVersionId = chapterRecord.activeVersionId || 'v-original';
  const variants = await readVariants(chaptersDir, fileName);

  if (activeVersionId !== 'v-original') {
    const activeVariant = variants.find((variant) => variant.id === activeVersionId);
    if (activeVariant && typeof activeVariant.content === 'string' && activeVariant.content) {
      return activeVariant.content;
    }
    return readChapterTxt();
  }

  const originalVariant = variants.find((variant) => variant.id === 'v-original');
  if (originalVariant && typeof originalVariant.content === 'string' && originalVariant.content) {
    return originalVariant.content;
  }

  return readChapterTxt();
}

app.get('/api/projects/:projectName/export', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const chaptersDir = path.join(projectDir, 'chapters');

  try {
    await fs.access(chaptersDir);
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
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
      for (const f of txtFiles) {
        const filePath = path.join(chaptersDir, f);
        const relative = path.relative(chaptersDir, filePath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
        const text = await fs.readFile(filePath, 'utf-8');
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

// ---- GET /api/projects/:projectName/backup ----

app.get('/api/projects/:projectName/backup', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const backupFiles = [];
  const addBackupFile = async (filePath, archiveName) => {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
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
      const chapterEntries = await fs.readdir(chaptersDir, { withFileTypes: true });
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
      const variantEntries = await fs.readdir(variantsDir, { withFileTypes: true });
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

// ---- POST /api/projects/:projectName/chapters/rebuild-index ----

app.post('/api/projects/:projectName/chapters/rebuild-index', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const chaptersDir = path.join(projectDir, 'chapters');

  try {
    await fs.access(chaptersDir);
  } catch {
    return res.status(404).json({ error: '该项目暂无章节' });
  }

  try {
    // Scan all .txt files sorted
    const files = await fs.readdir(chaptersDir);
    const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();

    if (txtFiles.length === 0) {
      return res.status(404).json({ error: '该项目暂无章节' });
    }

    // Read old index, keyed by fileName
    const oldEntries = await readChapterIndex(chaptersDir);
    const oldMap = {};
    for (const entry of oldEntries) {
      oldMap[entry.fileName] = entry;
    }

    // Build new index
    const newEntries = [];
    for (const f of txtFiles) {
      const old = oldMap[f];
      let createdAt;
      if (old && old.createdAt) {
        createdAt = old.createdAt;
      } else {
        try {
          const stat = await fs.stat(path.join(chaptersDir, f));
          createdAt = stat.birthtime?.toISOString() || stat.mtime.toISOString();
        } catch {
          createdAt = new Date().toISOString();
        }
      }
      newEntries.push({
        ...(old || {}),
        fileName: f,
        title: old?.title || `第${parseInt(f, 10)}章`,
        createdAt,
        activeVersionId: old?.activeVersionId || 'v-original',
        versions: old?.versions || [],
      });
    }

    await writeChapterIndex(chaptersDir, newEntries);
    res.json({ ok: true, chapters: newEntries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Variant helpers ----

const VARIANTS_DIR_NAME = 'variants';

function variantsFilePath(chaptersDir, fileName) {
  const base = fileName.replace(/\.txt$/, '');
  return path.join(chaptersDir, VARIANTS_DIR_NAME, `${base}.json`);
}

async function readVariants(chaptersDir, fileName) {
  const vDir = path.join(chaptersDir, VARIANTS_DIR_NAME);
  const vFile = variantsFilePath(chaptersDir, fileName);
  const relative = path.relative(vDir, vFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return [];
  try {
    const raw = await fs.readFile(vFile, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.variants) ? data.variants : [];
  } catch {
    return [];
  }
}

async function writeVariants(chaptersDir, fileName, variants) {
  const vDir = path.join(chaptersDir, VARIANTS_DIR_NAME);
  await ensureDir(vDir);
  const vFile = variantsFilePath(chaptersDir, fileName);
  const relative = path.relative(vDir, vFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('无效的文件名');
  }
  await fs.writeFile(vFile, JSON.stringify({ fileName, variants }, null, 2), 'utf-8');
}

// ---- POST /api/projects/:projectName/chapters/:fileName/regenerate ----

app.post('/api/projects/:projectName/chapters/:fileName/regenerate', async (req, res) => {
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
    await fs.access(chapterPath);
  } catch {
    return res.status(404).json({ error: '章节不存在' });
  }

  const trimmedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  const effectiveUserPrompt = trimmedUserPrompt || '继续写';

  try {
    // 1. Read context files (skip summary to avoid old-chapter contamination)
    const [world, characters, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

    // 2. Read original chapter content (only for v-original preservation, not for prompt)
    const originalContent = await fs.readFile(chapterPath, 'utf-8');

    // 3. Read previous chapters for context (skip the current one, respect activeVersionId)
    let recentChapters = [];
    try {
      await ensureDir(chaptersDir);
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort();
      const currentIndex = txtFiles.indexOf(fileName);
      const contextFiles = currentIndex > 0 ? txtFiles.slice(Math.max(0, currentIndex - RECENT_CHAPTER_LIMIT), currentIndex) : [];
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
          content = activeVariant ? activeVariant.content : await fs.readFile(path.join(chaptersDir, f), 'utf-8');
        } else {
          content = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
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
  } catch (err) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// ---- GET /api/projects/:projectName/chapters/:fileName/variants ----

app.get('/api/projects/:projectName/chapters/:fileName/variants', async (req, res) => {
  const { projectName, fileName } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

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
    await fs.access(chapterPath);
  } catch {
    return res.status(404).json({ error: '章节不存在' });
  }

  try {
    const indexEntries = await readChapterIndex(chaptersDir);
    const indexEntry = indexEntries.find((e) => e.fileName === fileName);
    const originalUserPrompt = indexEntry?.userPrompt || '继续写';
    let variants = (await readVariants(chaptersDir, fileName)).map((variant) =>
      variant.id === 'v-original' && !variant.userPrompt
        ? { ...variant, userPrompt: originalUserPrompt }
        : variant
    );

    // Always include v-original — synthesize from .txt if not yet in variants file
    if (!variants.find((v) => v.id === 'v-original')) {
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

    res.json({ fileName, variants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/projects/:projectName/chapters/:fileName/variants/:variantId/apply ----

app.put('/api/projects/:projectName/chapters/:fileName/variants/:variantId/apply', async (req, res) => {
  const { projectName, fileName, variantId } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

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
    await fs.access(chapterPath);
  } catch {
    return res.status(404).json({ error: '章节不存在' });
  }

  try {
    let variants = await readVariants(chaptersDir, fileName);
    let variant = variants.find((v) => v.id === variantId);

    // If v-original requested but not yet in variants file, synthesize from .txt
    if (!variant && variantId === 'v-original') {
      const indexEntries = await readChapterIndex(chaptersDir);
      const indexEntry = indexEntries.find((e) => e.fileName === fileName);
      const originalContent = await fs.readFile(chapterPath, 'utf-8');
      variant = {
        id: 'v-original',
        createdAt: indexEntry?.createdAt || new Date().toISOString(),
        model: 'original',
        userPrompt: indexEntry?.userPrompt || '',
        content: originalContent,
        title: indexEntry?.title || fileName.replace('.txt', ''),
      };
      // Persist so subsequent requests read from file
      variants = [variant, ...variants];
      await writeVariants(chaptersDir, fileName, variants);
    }

    if (!variant) {
      return res.status(404).json({ error: '候选版本不存在' });
    }

    // Write content to the main .txt file
    await fs.writeFile(chapterPath, variant.content, 'utf-8');

    // Update index.json: set activeVersionId and track the version
    let indexEntries = await readChapterIndex(chaptersDir);
    const indexEntry = indexEntries.find((e) => e.fileName === fileName);
    if (indexEntry) {
      indexEntry.activeVersionId = variantId;
      // Update chapter title if variant has a meaningful title
      if (variant.title) {
        indexEntry.title = variant.title;
      }
      // Ensure versions array exists with v-original as first entry
      if (!indexEntry.versions) {
        indexEntry.versions = [];
      }
      if (!indexEntry.versions.find((v) => v.id === 'v-original')) {
        indexEntry.versions.unshift({
          id: 'v-original',
          title: indexEntry.title || fileName.replace('.txt', ''),
          userPrompt: indexEntry.userPrompt || '',
          createdAt: indexEntry.createdAt || new Date().toISOString(),
        });
      }
      // Add this variant to versions if not already tracked
      if (!indexEntry.versions.find((v) => v.id === variantId)) {
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

    res.json({ ok: true, fileName, content: variant.content, activeVersionId: variantId, title: indexEntry?.title || variant.title, chapters: indexEntries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/projects/:projectName/summary/rebuild ----

const MAX_SUMMARY_CONTENT_LENGTH = 60000;

app.post('/api/projects/:projectName/summary/rebuild', async (req, res) => {
  const { projectName } = req.params;

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  try {
    // 1. Read settings files for context
    const [world, characters, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

    // 2. Read chapters in index.json order with activeVersionId awareness
    const chaptersDir = path.join(projectDir, 'chapters');
    try { await fs.access(chaptersDir); } catch {
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
    while (totalLength > MAX_SUMMARY_CONTENT_LENGTH && allParts.length > 1) {
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
    await fs.writeFile(path.join(projectDir, 'summary.md'), trimmed, 'utf-8');

    res.json({ ok: true, message: '摘要已重建', summary: trimmed });
  } catch (err) {
    // On any error, old summary.md is preserved (no write occurred)
    res.status(500).json({ error: err.message || '摘要重建失败' });
  }
});

// ---- GET /api/projects/:projectName/prompt-preview ----

app.get('/api/projects/:projectName/prompt-preview', async (req, res) => {
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
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const chaptersDir = path.join(projectDir, 'chapters');

  try {
    // 1. Read context files
    const [worldFile, charactersFile, styleFile] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

    let context = {
      world: worldFile || '',
      characters: charactersFile || '',
      style: styleFile || '',
      userPrompt: (userPrompt || '').trim(),
    };

    if (taskType === 'novel.generateChapter') {
      const summaryFile = await fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => '');
      context.summary = summaryFile || '';
    }

    // 2. Read recent chapters (with activeVersionId awareness)
    let recentChapters = [];
    try {
      await ensureDir(chaptersDir);
      const files = await fs.readdir(chaptersDir);
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
          ? txtFiles.slice(Math.max(0, currentIndex - RECENT_CHAPTER_LIMIT), currentIndex)
          : [];
      } else {
        selectedFiles = txtFiles.slice(-RECENT_CHAPTER_LIMIT);
      }

      for (const f of selectedFiles) {
        const entry = indexMap[f];
        let content;
        if (entry && entry.activeVersionId && entry.activeVersionId !== 'v-original') {
          const variants = await readVariants(chaptersDir, f);
          const activeVariant = variants.find((v) => v.id === entry.activeVersionId);
          content = activeVariant ? activeVariant.content : await fs.readFile(path.join(chaptersDir, f), 'utf-8');
        } else {
          content = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
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

// ---- GET /api/editor/note ----

app.get('/api/editor/note', async (req, res) => {
  const { projectName, chapterFileName } = req.query;

  if (!projectName) {
    return res.status(400).json({ error: '缺少项目名' });
  }

  if (!chapterFileName) {
    return res.status(400).json({ error: '缺少章节文件名' });
  }

  try {
    const note = await buildEditorNote(projectName, chapterFileName);
    console.log(`[编辑备注] 项目=${projectName} 章节=${chapterFileName}`);
    res.json({ note, projectName, chapterFileName });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message || '编辑备注生成失败' });
  }
});

// 在不超过 maxLen 的前提下，在句尾标点处截断，避免截断到半句话
function truncateAtSentence(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  for (const ch of ['。', '！', '？', '\n']) {
    const idx = cut.lastIndexOf(ch);
    if (idx >= maxLen * 0.4) return cut.slice(0, idx + 1).trim();
  }
  // 找不到合适断句点时，退回原始截断
  return cut.trim();
}

// ---- POST /api/editor-chat ----

app.post('/api/editor-chat', async (req, res) => {
  const { projectName, chapterId, fileName, message } = req.body;
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  if (!projectName) {
    return res.status(400).json({ error: '缺少项目名' });
  }
  if (!trimmedMessage) {
    return res.status(400).json({ error: '消息不能为空' });
  }

  // 优先用 fileName 定位章节，若没有则用 chapterId
  const resolvedFileName = (typeof fileName === 'string' && fileName.trim())
    ? fileName.trim()
    : (typeof chapterId === 'string' && chapterId.trim())
      ? chapterId.trim()
      : '';

  if (!resolvedFileName || !isValidChapterFileName(resolvedFileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const chaptersDir = path.join(projectDir, 'chapters');
  const chapterPath = path.join(chaptersDir, resolvedFileName);
  const relativePath = path.relative(chaptersDir, chapterPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

  // 读取章节正文，内容为空或读取失败则直接返回 404，不调用 AI
  let chapterContent;
  try {
    chapterContent = await fs.readFile(chapterPath, 'utf-8');
  } catch {
    return res.status(404).json({ error: '当前章节正文读取失败，无法进行编辑分析' });
  }
  if (!chapterContent || chapterContent.trim().length === 0) {
    return res.status(404).json({ error: '当前章节正文读取失败，无法进行编辑分析' });
  }

  // 读取项目设置文件
  const [world, characters, summary, style] = await Promise.all([
    fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
    fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
  ]);
  const editorialMemoryForChat = await readEditorialMemory(projectName);

  // 从 index.json 获取本章元数据
  let chapterTitle = resolvedFileName;
  let editorNotes = [];
  let editorChats = [];
  try {
    const indexEntries = await readChapterIndex(chaptersDir);
    const entry = indexEntries.find((item) => item.fileName === resolvedFileName);
    if (entry) {
      chapterTitle = entry.title || resolvedFileName;
      editorNotes = Array.isArray(entry.editorNotes) ? entry.editorNotes : [];
      editorChats = Array.isArray(entry.editorChats) ? entry.editorChats : [];
    }
  } catch {
    // index.json 读取失败不影响主流程
  }

  // 判断是否进入分析模式：只有用户明确要求分析、审稿等时才允许结构化展开。
  const isAnalysisMode = /分析|审稿|修改建议|逐段|评审|人物动机/.test(trimmedMessage)
    || (trimmedMessage.length >= 30 && /问题|节奏|建议/.test(trimmedMessage));
  const needsFullChapterContext = isAnalysisMode || shouldLoadFullChapterForEditorChat(trimmedMessage);

  const recentUserMessages = editorChats
    .filter((chat) => chat.role === 'user')
    .slice(-4)
    .map((chat) => `用户：${chat.content}`)
    .join('\n');

  let contextText = '';
  if (world) contextText += `## 世界观设定\n${world.slice(0, 600)}\n\n`;
  if (characters) contextText += `## 人物设定\n${characters.slice(0, 600)}\n\n`;
  if (style) contextText += `## 写作规则\n${style.slice(0, 400)}\n\n`;
  if (summary) contextText += `## 剧情摘要\n${summary.slice(0, 600)}\n\n`;
  if (editorialMemoryForChat) {
    const selectedMemory = selectEditorialMemoryForPrompt(editorialMemoryForChat, 800);
    if (selectedMemory) {
      contextText += `## 项目编辑记忆\n${selectedMemory}\n\n`;
    }
  }
  if (recentUserMessages) {
    contextText += `## 对话历史（仅用户消息）\n${recentUserMessages.slice(0, 800)}\n\n`;
  }

  if (needsFullChapterContext) {
    // 正文询问/分析模式：注入当前章节正文；只有分析模式额外加入编辑备注和最近完整对话。
    if (isAnalysisMode) {
      if (editorNotes.length > 0) {
        contextText += `## 已有编辑备注\n${editorNotes.join('\n\n').slice(0, 2000)}\n\n`;
      }
      const allHistory = editorChats.slice(-6).map((chat) => {
        const roleName = chat.role === 'user' ? '用户' : '随书编辑';
        return `${roleName}：${chat.content}`;
      }).join('\n');
      if (allHistory) {
        contextText += `## 最近编辑对话\n${allHistory.slice(0, 1500)}\n\n`;
      }
    }
    contextText += `## 当前章节 ${chapterTitle}（${resolvedFileName}）\n${formatEditorChatFullChapter(chapterContent)}\n\n`;
  } else {
    // 闲聊模式：只提供章节标题和开头片段作为背景，不注入完整全文
    const preview = chapterContent.slice(0, 400).replace(/\n{3,}/g, '\n\n');
    contextText += `## 当前章节\n项目：${projectName}\n章节：${chapterTitle}（${resolvedFileName}）\n开头片段：${preview}${chapterContent.length > 400 ? '\n（以上为章节开头片段，完整内容未加载）' : ''}\n\n`;
  }

  contextText += `## 用户本次问题\n${trimmedMessage}`;

  const reply = sanitizeEditorText(truncateAtSentence(await callDeepSeek('deepseek-v4-flash', [
    {
      role: 'system',
      content:
        '你是”小墨匣”写作工具的随书编辑。你和作者的关系像私聊，不是审稿人。\n\n' +
        '一、核心定位\n' +
        '你不需要审稿。章节内容和项目设定只是背景资料，不是你的分析任务。\n' +
        '用户最后发送的消息是你唯一需要直接回应的问题。\n' +
        '每次只回答用户正在说的这句话，不要提前展开全面分析。\n\n' +
        '二、默认回复规则\n' +
        '1. 回复必须像私聊，1～3 句话。\n' +
        '2. 不使用小标题，不编号，不列点。\n' +
        '3. 不输出”本章问题””人物判断””节奏判断””修改建议””下章注意”等审稿式结构。\n' +
        '4. 用户吐槽、感叹、玩梗、随口问时，自然接话就行，不要主动扩展成章节评审。\n' +
        '5. 用户问感受时，直接说阅读感受加一点理由，不展开成报告。\n' +
        '6. 用户问后续写法时，直接讨论后续方向，不要先回头审稿。\n' +
        '7. 不要以”用户说……”开头。不要复述你的任务，不要解释你将怎么分析。直接回话。\n' +
        '8. 闲聊回复 80～180 字，一般问题不超过 250 字。\n\n' +
        '三、分析模式（仅以下情况允许打破默认规则）\n' +
        '只有用户明确要求分析、审稿、列问题、给修改建议、逐段评审、判断节奏或人物动机时，\n' +
        '才可以使用小标题、列点、结构化分析。即使进入分析模式，也要先给简短判断再展开。',
    },
    {
      role: 'user',
      content: contextText,
    },
  ]), 300));

  const now = Date.now();
  const userChat = {
    id: `chat-${now}-user`,
    role: 'user',
    content: trimmedMessage,
    createdAt: now,
  };
  const editorChat = {
    id: `chat-${now}-editor`,
    role: 'editor',
    content: reply,
    createdAt: Date.now(),
  };
  editorChats = [...editorChats, userChat, editorChat];

  // 写回 index.json
  try {
    const { entries, entry: idxEntry } = await ensureChapterIndexEntry(chaptersDir, resolvedFileName);
    idxEntry.editorChats = editorChats;
    idxEntry.editorNotes = editorNotes;
    await writeChapterIndex(chaptersDir, entries);
  } catch {
    // index.json 写入失败不影响回复
  }

  res.json({ reply, editorChats });
});

// ---- POST /api/projects/:projectName/chapters/:fileName/editor-notes ----

app.post('/api/projects/:projectName/chapters/:fileName/editor-notes', async (req, res) => {
  const { projectName, fileName } = req.params;
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }
  if (!content) {
    return res.status(400).json({ error: '备注内容不能为空' });
  }

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const chaptersDir = path.join(projectDir, 'chapters');
    await fs.access(path.join(chaptersDir, fileName));
    const { entries, entry } = await ensureChapterIndexEntry(chaptersDir, fileName);
    const editorNotes = Array.isArray(entry.editorNotes) ? entry.editorNotes : [];
    const cleanContent = sanitizeEditorText(content, 300);
    if (!cleanContent) {
      return res.status(400).json({ error: '备注内容不能为空' });
    }
    const note = `编辑建议 ${formatLocalMinute()}\n${cleanContent}`;
    entry.editorNotes = [...editorNotes, note];
    await writeChapterIndex(chaptersDir, entries);
    res.json({ ok: true, note, editorNotes: entry.editorNotes });
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ error: err.message || '保存编辑备注失败' });
  }
});

// ---- DELETE /api/projects/:projectName/chapters/:fileName/editor-chats ----

app.delete('/api/projects/:projectName/chapters/:fileName/editor-chats', async (req, res) => {
  const { projectName, fileName } = req.params;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

  let projectDir;
  try {
    projectDir = safeProjectDir(projectName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const chaptersDir = path.join(projectDir, 'chapters');
    await fs.access(path.join(chaptersDir, fileName));
    const { entries, entry } = await ensureChapterIndexEntry(chaptersDir, fileName);
    entry.editorChats = [];
    await writeChapterIndex(chaptersDir, entries);
    res.json({ ok: true, editorChats: [] });
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : 500;
    res.status(status).json({ error: err.message || '清空编辑对话失败' });
  }
});

// ---- Vault routes ----

app.use('/api/vault/templates', vaultRoutes);

// ---- Serve built frontend ----

app.use(express.static(path.join(__dirname, '..', 'dist')));

// SPA fallback: any unmatched route serves index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// ---- Start ----

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
