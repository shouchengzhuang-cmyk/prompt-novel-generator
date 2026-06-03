const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { ZipArchive } = require('archiver');

const vaultRoutes = require('./routes/vault');
const { buildPrompt } = require('./services/promptBuilder');
const storage = require('./services/storage');

const app = express();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Trust proxy for correct IP and protocol behind Nginx/reverse proxy
app.set('trust proxy', 1);

// ---- CORS ----

const CORS_ORIGIN = process.env.CORS_ORIGIN;

if (!CORS_ORIGIN) {
  if (IS_PRODUCTION) {
    console.error('❌ 生产环境必须设置 CORS_ORIGIN');
    console.error('   例如: CORS_ORIGIN=https://xiaomoxia.yourdomain.com');
    process.exit(1);
  }
  console.warn('⚠️  未设置 CORS_ORIGIN，开发环境仅允许 http://localhost:5173');
}

// Production: use the explicit origin only. Development: allow localhost origins.
const corsOrigin = CORS_ORIGIN || [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
];

app.use(cors({ origin: corsOrigin, credentials: true }));

app.use(express.json({ limit: '1mb' }));

// ---- Session ----

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  if (IS_PRODUCTION) {
    console.error('❌ 生产环境必须设置 SESSION_SECRET');
    console.error('   请用 openssl rand -hex 32 生成一个随机字符串');
    process.exit(1);
  }
  console.warn('⚠️  未设置 SESSION_SECRET，开发环境使用固定密钥');
}

const session = require('express-session');
app.use(session({
  secret: SESSION_SECRET || 'xiaomoxia-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

const NOVELS_DIR = process.env.NOVELS_DIR
  ? path.resolve(process.env.NOVELS_DIR)
  : path.resolve(__dirname, '..', 'novels');
const RECENT_CHAPTER_LIMIT = 10;

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

function countChars(text) {
  if (!text) return 0;
  return text.replace(/\s/g, '').length;
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
    await storage.writeText(filePath, DEFAULT_EDITORIAL_MEMORY);
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
  await storage.writeText(filePath, content);
}

// ---- Outline (chapter planning) ----

function getOutlinePath(projectName) {
  return path.join(safeProjectDir(projectName), 'outline.json');
}

async function readOutline(projectName) {
  try {
    const raw = await fs.readFile(getOutlinePath(projectName), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeOutline(projectName, outline) {
  if (!Array.isArray(outline)) {
    throw new Error('outline 必须是数组');
  }
  const filePath = getOutlinePath(projectName);
  await ensureDir(path.dirname(filePath));
  await storage.writeJson(filePath, outline);
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
  await storage.writeJson(path.join(chaptersDir, INDEX_FILE), entries);
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

async function updateChapterWordCount(chaptersDir, fileName) {
  const filePath = path.join(chaptersDir, fileName);
  let content;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    return 0;
  }
  const count = countChars(content);
  const entries = await readChapterIndex(chaptersDir);
  const entry = entries.find((e) => e.fileName === fileName);
  if (entry) {
    entry.wordCount = count;
    await writeChapterIndex(chaptersDir, entries);
  }
  return count;
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

// ---- Helper: collect project file stats ----

async function collectProjectStats(projectDir) {
  let totalSize = 0;
  let latestMtime = 0;

  const entries = await fs.readdir(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(projectDir, entry.name);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const sub = await collectProjectStats(fullPath);
      totalSize += sub.totalSize;
      if (sub.latestMtime > latestMtime) latestMtime = sub.latestMtime;
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        totalSize += stat.size;
        if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs;
      } catch { /* skip unreadable files */ }
    }
  }
  return { totalSize, latestMtime };
}

// ---- Auth ----

const AUTH_PIN = process.env.XIAOMOXIA_PIN
  || (process.env.NODE_ENV !== 'production' ? '0000' : null);

if (!AUTH_PIN) {
  console.error('❌ 未配置 XIAOMOXIA_PIN，请在 server/.env 中设置');
} else if (!process.env.XIAOMOXIA_PIN) {
  console.warn('⚠️  未设置 XIAOMOXIA_PIN，开发环境使用默认 PIN: 0000');
  console.warn('   生产环境请务必在 server/.env 中配置 XIAOMOXIA_PIN');
}

app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;

  if (!AUTH_PIN) {
    return res.status(500).json({ error: 'PIN 未配置' });
  }

  if (pin !== AUTH_PIN) {
    return res.status(401).json({ error: '密码错误' });
  }

  req.session.authenticated = true;
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ authenticated: !!req.session?.authenticated });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: '退出失败' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// Protect all /api/ routes except /api/auth/
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: '未登录' });
});

// ---- GET /api/projects ----

app.get('/api/projects', async (_req, res) => {
  try {
    await ensureDir(NOVELS_DIR);
    const entries = await fs.readdir(NOVELS_DIR, { withFileTypes: true });
    const projectNames = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);

    const projects = await Promise.all(projectNames.map(async (name) => {
      const projectDir = path.join(NOVELS_DIR, name);
      try {
        const stats = await collectProjectStats(projectDir);
        let chapterCount = 0;
        let totalWords = 0;
        try {
          const chaptersDir = path.join(projectDir, 'chapters');
          const chapterFiles = await fs.readdir(chaptersDir);
          chapterCount = chapterFiles.filter((file) => isValidChapterFileName(file)).length;
          const indexEntries = await readChapterIndex(chaptersDir);
          totalWords = indexEntries.reduce((sum, e) => sum + (Number(e.wordCount) || 0), 0);
        } catch {
          chapterCount = 0;
        }
        return { name, size: stats.totalSize, updatedAt: stats.latestMtime, chapterCount, totalWords };
      } catch {
        return { name, size: 0, updatedAt: 0, chapterCount: 0 };
      }
    }));

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
    await storage.writeText(path.join(projectDir, 'world.md'), world || '');
    await storage.writeText(path.join(projectDir, 'characters.md'), characters || '');
    await storage.writeText(path.join(projectDir, 'summary.md'), typeof summary === 'string' ? summary : '');
    await storage.writeText(path.join(projectDir, 'style.md'), style || '');
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

    const totalWords = chapters.reduce((sum, ch) => sum + (Number(ch.wordCount) || 0), 0);
    res.json({ projectName, world, characters, summary, style, editorialMemory, chapters, recentContent, totalWords });
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

// ---- PUT /api/projects/:projectName/chapters/:fileName/content (更新章节正文) ----

app.put('/api/projects/:projectName/chapters/:fileName/content', async (req, res) => {
  const { projectName, fileName } = req.params;
  const { title, content } = req.body;

  if (!isValidChapterFileName(fileName)) {
    return res.status(400).json({ error: '无效的章节文件名' });
  }

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content 必须为字符串' });
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
    // 1. Preserve original content as v-original variant if not already saved
    const originalContent = await fs.readFile(chapterPath, 'utf-8');
    const existingVariants = await readVariants(chaptersDir, fileName);
    if (!existingVariants.find((v) => v.id === 'v-original')) {
      existingVariants.unshift({
        id: 'v-original',
        createdAt: new Date().toISOString(),
        model: 'original',
        userPrompt: '',
        content: originalContent,
      });
      await writeVariants(chaptersDir, fileName, existingVariants);
    }

    // 2. Write new content
    await storage.writeText(chapterPath, content);

    // 3. Update word count in index
    const count = countChars(content);
    const idxEntries = await readChapterIndex(chaptersDir);
    const idxEntry = idxEntries.find((e) => e.fileName === fileName);
    if (idxEntry) {
      idxEntry.wordCount = count;
      // Update title in index if provided
      if (typeof title === 'string' && title.trim()) {
        idxEntry.title = title.trim();
      }
      await writeChapterIndex(chaptersDir, idxEntries);
    }

    console.log(`[编辑正文] 已保存 项目=${projectName} 章节=${fileName}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || '保存失败' });
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

// ---- POST /api/projects/:projectName/rename ----

app.post('/api/projects/:projectName/rename', async (req, res) => {
  const { projectName } = req.params;
  const { newName } = req.body;

  if (!newName || !newName.trim()) {
    return res.status(400).json({ error: '新项目名不能为空' });
  }

  const trimmed = newName.trim();

  // Validate: no path separator or illegal chars
  if (/[/\\:*?"<>|]/.test(trimmed)) {
    return res.status(400).json({ error: '项目名包含非法字符（/ \\ : * ? " < > |）' });
  }

  let oldDir, newDir;
  try {
    oldDir = safeProjectDir(projectName);
    newDir = safeProjectDir(trimmed);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Check old exists
  try {
    await fs.access(oldDir);
  } catch {
    return res.status(404).json({ error: '原项目不存在' });
  }

  // Check new doesn't exist
  try {
    await fs.access(newDir);
    return res.status(409).json({ error: `项目「${trimmed}」已存在` });
  } catch {
    // good — new name doesn't exist
  }

  try {
    await fs.rename(oldDir, newDir);
    res.json({ ok: true, projectName: trimmed, oldName: projectName });
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
      storage.writeText(path.join(projectDir, 'world.md'), project.world),
      storage.writeText(path.join(projectDir, 'characters.md'), project.characters),
      storage.writeText(path.join(projectDir, 'style.md'), project.style),
      storage.writeText(path.join(projectDir, 'summary.md'), project.summary),
    ];
    if (project.editorialMemory !== undefined) {
      writes.push(storage.writeText(path.join(projectDir, 'editorial-memory.md'), project.editorialMemory));
    }
    await Promise.all(writes);
    res.json({ ok: true, message: '设定已保存', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 生成上下文准备（供 /api/generate 和 /api/generate-stream 共用）----

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

  const allowedModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
  const effectiveModel = allowedModels.includes(model) ? model : 'deepseek-v4-flash';

  const projectDir = safeProjectDir(projectName);
  const chaptersDir = path.join(projectDir, 'chapters');

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

  // 3b. Inject editorial-memory.md into user prompt
  if (editorialMemoryForPrompt) {
    const selectedMemory = selectEditorialMemoryForPrompt(editorialMemoryForPrompt, 2000);
    if (selectedMemory) {
      const sectionText = `\n\n## 项目编辑记忆\n${selectedMemory}\n\n`;
      let currentContent = messages[1].content;
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
        currentContent = currentContent.replace('## 本次续写要求', sectionText + '## 本次续写要求');
      }
      messages[1] = { role: 'user', content: currentContent };
      console.log(`[编辑记忆] 已并入生成 prompt (${selectedMemory.length} 字)`);
    }
  }

  // 3c. Inject chapter plan from outline.json
  try {
    const chapterFiles = await fs.readdir(chaptersDir);
    const nums = chapterFiles
      .filter((f) => /^\d+\.txt$/.test(f))
      .map((f) => parseInt(f, 10))
      .filter((n) => !isNaN(n));
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    const outline = await readOutline(projectName);
    const plan = outline.find((item) => item.number === nextNum);
    if (plan) {
      let planText = `\n\n## 本章规划\n目标：${plan.goal || ''}\n`;
      if (Array.isArray(plan.keyEvents) && plan.keyEvents.length > 0) {
        planText += `关键事件：\n${plan.keyEvents.map((e) => `- ${e}`).join('\n')}\n`;
      }
      if (plan.characterChanges) {
        planText += `人物变化：${plan.characterChanges}\n`;
      }
      if (plan.status) {
        planText += `状态：${plan.status}\n`;
      }
      let currentContent = messages[1].content;
      currentContent = currentContent.replace('## 本次续写要求', planText + '## 本次续写要求');
      messages[1] = { role: 'user', content: currentContent };
      console.log(`[章节规划] 已并入第${nextNum}章规划`);
    }
  } catch (outlineErr) {
    console.warn(`[章节规划] 注入失败（不影响主流程）: ${outlineErr.message}`);
  }

  return { projectDir, chaptersDir, messages, effectiveModel, debugPromptInfo };
}

// ---- POST /api/generate ----

app.post('/api/generate', async (req, res) => {
  const { projectName, userPrompt, model } = req.body;

  try {
    const { projectDir, chaptersDir, messages, effectiveModel, debugPromptInfo } = await prepareGenerationContext({ projectName, userPrompt, model });

    // 4. Call DeepSeek
    const content = await callDeepSeek(effectiveModel, messages);

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
    await storage.writeText(path.join(chaptersDir, filename), content);

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
      wordCount: countChars(content),
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
    res.json({ content, fileName: filename, title, debugPromptInfo, wordCount: countChars(content) });

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
        await storage.writeText(path.join(projectDir, 'summary.md'), updatedSummary.trim());
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

// ---- POST /api/generate-stream (流式生成) ----

app.post('/api/generate-stream', async (req, res) => {
  const { projectName, userPrompt, model } = req.body;

  // 设置 SSE 响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let projectDir, chaptersDir, fullContent;
  try {
    const ctx = await prepareGenerationContext({ projectName, userPrompt, model });
    projectDir = ctx.projectDir;
    chaptersDir = ctx.chaptersDir;

    // 流式调用 DeepSeek
    const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
            // 跳过无法解析的行
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

    // 保存章节
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
    await storage.writeText(path.join(chaptersDir, filename), fullContent);

    // 提取标题并更新 index.json
    const title = extractTitleFromContent(fullContent, nextNum);
    const indexEntries = await readChapterIndex(chaptersDir);
    const now = new Date().toISOString();
    indexEntries.push({
      fileName: filename,
      title,
      createdAt: now,
      userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
      activeVersionId: 'v-original',
      wordCount: countChars(fullContent),
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

    console.log(`[流式生成] 已保存章节 ${filename}`);

    // 发送完成事件（包含完整内容和元数据）
    sendEvent({ type: 'done', fileName: filename, title, content: fullContent, debugPromptInfo: ctx.debugPromptInfo, wordCount: countChars(fullContent) });

    // 后台异步更新
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
              `## 新章节 ${filename}\n${fullContent}`,
          },
        ];
        const updatedSummary = await callDeepSeek('deepseek-v4-flash', summaryMessages);
        await storage.writeText(path.join(projectDir, 'summary.md'), updatedSummary.trim());
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
  await storage.writeJson(vFile, { fileName, variants });
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

// ---- POST /api/projects/:projectName/chapters/:fileName/regenerate-stream (流式重写) ----

app.post('/api/projects/:projectName/chapters/:fileName/regenerate-stream', async (req, res) => {
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
    await fs.access(chapterPath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: '章节不存在' }));
  }

  const trimmedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  const effectiveUserPrompt = trimmedUserPrompt || '继续写';

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 1. Read context files (skip summary to avoid old-chapter contamination)
    const [world, characters, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

    // 2. Read original chapter content (for v-original preservation)
    const originalContent = await fs.readFile(chapterPath, 'utf-8');

    // 3. Read previous chapters for context
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
    const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
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
    await storage.writeText(chapterPath, variant.content);

    // Update word count in index
    await updateChapterWordCount(chaptersDir, fileName);

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
    await storage.writeText(path.join(projectDir, 'summary.md'), trimmed);

    res.json({ ok: true, message: '摘要已重建', summary: trimmed });
  } catch (err) {
    // On any error, old summary.md is preserved (no write occurred)
    res.status(500).json({ error: err.message || '摘要重建失败' });
  }
});

// ---- GET /api/projects/:projectName/outline ----

app.get('/api/projects/:projectName/outline', async (req, res) => {
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

// ---- PUT /api/projects/:projectName/outline ----

app.put('/api/projects/:projectName/outline', async (req, res) => {
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
    await writeOutline(projectName, outline);
    res.json({ ok: true, outline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/projects/:projectName/outline/generate ----

app.post('/api/projects/:projectName/outline/generate', async (req, res) => {
  const { projectName } = req.params;
  const { model: reqModel } = req.body;

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

  const allowedModels = ['deepseek-v4-flash', 'deepseek-v4-pro'];
  const model = allowedModels.includes(reqModel) ? reqModel : 'deepseek-v4-flash';
  const chaptersDir = path.join(projectDir, 'chapters');

  try {
    // 1. Read project settings
    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

    // 2. Read chapter titles
    const chaptersDirExists = await fs.stat(chaptersDir).then(() => true).catch(() => false);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ---- GET /api/search ----

app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);

    if (!q) return res.status(400).json({ error: '搜索关键词不能为空' });
    if (q.length > 80) return res.status(400).json({ error: '搜索关键词最长 80 个字符' });

    const qLower = q.toLowerCase();
    const results = [];

    await ensureDir(NOVELS_DIR);
    const entries = await fs.readdir(NOVELS_DIR, { withFileTypes: true });
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
        const allFiles = await fs.readdir(chaptersDir);
        const txtFiles = allFiles.filter((f) => isValidChapterFileName(f)).sort();

        for (const fileName of txtFiles) {
          let matchCount = 0;
          let snippet = '';
          const entry = indexEntries.find((e) => e.fileName === fileName);
          const title = entry?.title || '';

          if (title.toLowerCase().includes(qLower)) matchCount++;

          try {
            const content = await fs.readFile(path.join(chaptersDir, fileName), 'utf-8');
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
          const content = await fs.readFile(path.join(projectDir, sf.file), 'utf-8');
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

// ---- Event Cards (剧情素材池) ----

/**
 * Validate an event card file name:
 * - No path separators or traversal
 * - Must end in .md
 */
function safeCardName(cardName) {
  const name = String(cardName || '').trim();
  if (!name || name === '.' || name === '..') throw new Error('非法的文件名');
  if (/[/\\]/.test(name)) throw new Error('文件名包含非法字符');
  if (!name.endsWith('.md')) throw new Error('只允许 .md 文件');
  return name;
}

function getEventCardsDir(projectDir) {
  return path.join(projectDir, 'materials', 'event-cards');
}

function getEventCardTrashDir(projectDir) {
  return path.join(projectDir, 'materials', '.trash', 'event-cards');
}

function extractTitleFromMarkdown(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : null;
}

const EVENT_CARD_TEMPLATE = `# 对话事件卡

## 事件标题

## 参与角色

## 事件摘要

## 关键对白

## 情绪变化

## 关系变化

## 新增事实

## 可小说化方向

## 给小墨匣的写作提示词
`;

function generateSafeFileName(title) {
  const slug = String(title || '')
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const now = new Date().toISOString().slice(0, 10);
  return `${now}-${slug || 'event-card'}.md`;
}

// GET /api/projects/:projectName/materials/event-cards
app.get('/api/projects/:projectName/materials/event-cards', async (req, res) => {
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

  const cardsDir = getEventCardsDir(projectDir);
  try {
    await ensureDir(cardsDir);
  } catch { /* best-effort */ }

  try {
    const files = await fs.readdir(cardsDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    const cards = await Promise.all(mdFiles.map(async (f) => {
      const filePath = path.join(cardsDir, f);
      try {
        const [content, stats] = await Promise.all([
          fs.readFile(filePath, 'utf-8'),
          fs.stat(filePath),
        ]);
        const title = extractTitleFromMarkdown(content) || f.replace(/\.md$/, '');
        return { cardName: f, title, updatedAt: stats.mtime.toISOString(), size: stats.size };
      } catch {
        return null;
      }
    }));
    res.json({ cards: cards.filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectName/materials/event-cards/:cardName
app.get('/api/projects/:projectName/materials/event-cards/:cardName', async (req, res) => {
  const { projectName, cardName } = req.params;
  let projectDir, safeName;
  try {
    projectDir = safeProjectDir(projectName);
    safeName = safeCardName(cardName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const filePath = path.join(getEventCardsDir(projectDir), safeName);
  try {
    const [content, stats] = await Promise.all([
      fs.readFile(filePath, 'utf-8'),
      fs.stat(filePath),
    ]);
    const title = extractTitleFromMarkdown(content) || safeName.replace(/\.md$/, '');
    res.json({ cardName: safeName, title, content, updatedAt: stats.mtime.toISOString() });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: '事件卡不存在' });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/projects/:projectName/materials/event-cards
app.post('/api/projects/:projectName/materials/event-cards', async (req, res) => {
  const { projectName } = req.params;
  const { title, cardName, content } = req.body;

  if (!title && !cardName) {
    return res.status(400).json({ error: '标题或文件名至少提供一个' });
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

  const cardsDir = getEventCardsDir(projectDir);
  await ensureDir(cardsDir);

  let fileName;
  if (cardName && cardName.trim()) {
    try {
      fileName = safeCardName(cardName.trim());
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  } else {
    fileName = generateSafeFileName(title);
  }

  const filePath = path.join(cardsDir, fileName);

  try {
    await fs.access(filePath);
    return res.status(409).json({ error: `事件卡「${fileName}」已存在` });
  } catch { /* good — doesn't exist yet */ }

  const finalContent = content !== undefined && content !== null ? content : EVENT_CARD_TEMPLATE;

  try {
    await storage.writeText(filePath, finalContent);
    const stats = await fs.stat(filePath);
    const cardTitle = extractTitleFromMarkdown(finalContent) || fileName.replace(/\.md$/, '');
    res.status(201).json({ cardName: fileName, title: cardTitle, content: finalContent, updatedAt: stats.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:projectName/materials/event-cards/:cardName
app.put('/api/projects/:projectName/materials/event-cards/:cardName', async (req, res) => {
  const { projectName, cardName } = req.params;
  const { content } = req.body;

  if (content === undefined || content === null) {
    return res.status(400).json({ error: '内容不能为空' });
  }

  let projectDir, safeName;
  try {
    projectDir = safeProjectDir(projectName);
    safeName = safeCardName(cardName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const filePath = path.join(getEventCardsDir(projectDir), safeName);

  try {
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: '事件卡不存在' });
  }

  try {
    await storage.writeText(filePath, content);
    const stats = await fs.stat(filePath);
    const title = extractTitleFromMarkdown(content) || safeName.replace(/\.md$/, '');
    res.json({ cardName: safeName, title, content, updatedAt: stats.mtime.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectName/materials/event-cards/:cardName
app.delete('/api/projects/:projectName/materials/event-cards/:cardName', async (req, res) => {
  const { projectName, cardName } = req.params;
  let projectDir, safeName;
  try {
    projectDir = safeProjectDir(projectName);
    safeName = safeCardName(cardName);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    await fs.access(projectDir);
  } catch {
    return res.status(404).json({ error: '项目不存在' });
  }

  const sourcePath = path.join(getEventCardsDir(projectDir), safeName);
  try {
    await fs.access(sourcePath);
  } catch {
    return res.status(404).json({ error: '事件卡不存在' });
  }

  // Move to .trash instead of physical deletion
  const trashDir = getEventCardTrashDir(projectDir);
  await ensureDir(trashDir);
  let trashPath = path.join(trashDir, safeName);
  // Avoid name collision in trash
  let counter = 0;
  while (true) {
    try {
      await fs.access(trashPath);
      counter++;
      const base = safeName.replace(/\.md$/, '');
      trashPath = path.join(trashDir, `${base}-${counter}.md`);
    } catch {
      break;
    }
  }

  try {
    await fs.rename(sourcePath, trashPath);
    res.json({ ok: true, cardName: safeName, message: '事件卡已移至回收站' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ---- Export (for testing via supertest) ----

module.exports = app;

// ---- Start ----

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
