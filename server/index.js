const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { ZipArchive } = require('archiver');

const vaultRoutes = require('./routes/vault');
const createMaterialsRouter = require('./routes/materials');
const createProjectsRouter = require('./routes/projects');
const createChaptersRouter = require('./routes/chapters');
const createVariantsRouter = require('./routes/variants');
const createGenerateRouter = require('./routes/generate');
const createRegenerateRouter = require('./routes/regenerate');
const createExportBackupRouter = require('./routes/exportBackup');
const { buildPrompt } = require('./services/promptBuilder');
const storage = require('./services/storage');
const { createProjectService } = require('./services/projectService');
const { createChapterService } = require('./services/chapterService');
const { createVariantService } = require('./services/variantService');
const { createGenerationContextService } = require('./services/generationContextService');
const { createGenerationPersistenceService } = require('./services/generationPersistenceService');
const {
  resolveGenerationModel,
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
  appendAndExtractSseLines,
  parseDeepSeekSseLine,
} = require('./services/generationHelpers');
const { acquireProjectLock, releaseProjectLock, withProjectLock, ProjectLockError } = require('./services/projectLocks');

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

// ---- Project routes ----

const projectService = createProjectService({
  novelsDir: NOVELS_DIR,
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  extractTitleFromContent,
  readEditorialMemory,
  withProjectLock,
});
app.use('/api/projects', createProjectsRouter({ projectService }));

// ---- Chapter routes ----

const chapterService = createChapterService({
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  writeChapterIndex,
  extractTitleFromContent,
  clearRewriteStaleMarker,
  readVariants,
  writeVariants,
  countChars,
  withProjectLock,
});
app.use('/api/projects/:projectName/chapters', createChaptersRouter({ chapterService }));

// ---- 生成上下文准备（供 /api/generate 和 /api/generate-stream 共用）----

const generationContextService = createGenerationContextService({
  safeProjectDir,
  ensureDir,
  readEditorialMemory,
  selectEditorialMemoryForPrompt,
  readOutline,
  readChapterIndex,
  readVariants,
  buildPrompt,
  resolveGenerationModel,
  recentChapterLimit: RECENT_CHAPTER_LIMIT,
});
const { prepareGenerationContext } = generationContextService;

const generationPersistenceService = createGenerationPersistenceService({
  ensureDir,
  readChapterIndex,
  writeChapterIndex,
  extractTitleFromContent,
  countChars,
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
});
const { persistGeneratedChapter } = generationPersistenceService;

// ---- Generate routes ----

app.use('/api', createGenerateRouter({
  callDeepSeek,
  withProjectLock,
  ProjectLockError,
  acquireProjectLock,
  releaseProjectLock,
  prepareGenerationContext,
  persistGeneratedChapter,
  appendAndExtractSseLines,
  parseDeepSeekSseLine,
  readFile: fs.readFile,
  writeText: storage.writeText,
  updateEditorialMemoryForChapter,
  fetchImpl: (...args) => fetch(...args),
  getDeepSeekApiKey: () => process.env.DEEPSEEK_API_KEY,
}));

// ---- Export / backup helpers ----

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

// ---- Export / backup routes ----

app.use(
  '/api/projects/:projectName',
  createExportBackupRouter({
    safeProjectDir,
    readChapterIndex,
    readActiveChapterContent,
    access: fs.access,
    readDir: fs.readdir,
    readFile: fs.readFile,
    stat: fs.stat,
    ZipArchive,
  }),
);

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
    await withProjectLock(projectName, 'rebuild-index', async () => {
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
    });
  } catch (err) {
    if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
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

// [P-X2 预留] 事件卡注入生成 — 被 466dfbc 禁用，如需恢复在此处接入 loadEventCards / buildEventCardPromptSection

// ---- Regenerate routes ----

app.use(
  '/api/projects/:projectName/chapters/:fileName',
  createRegenerateRouter({
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
    readFile: fs.readFile,
    readDir: fs.readdir,
    access: fs.access,
    fetchImpl: (...args) => fetch(...args),
    getDeepSeekApiKey: () => process.env.DEEPSEEK_API_KEY,
    recentChapterLimit: RECENT_CHAPTER_LIMIT,
  }),
);

// ---- Variant routes ----

const variantService = createVariantService({
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  writeChapterIndex,
  readVariants,
  writeVariants,
  updateChapterWordCount,
  markChaptersStaleAfterRewrite,
  withProjectLock,
});
app.use(
  '/api/projects/:projectName/chapters/:fileName/variants',
  createVariantsRouter({ variantService }),
);

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
    await withProjectLock(projectName, 'save-outline', async () => {
      await writeOutline(projectName, outline);
      res.json({ ok: true, outline });
    });
  } catch (err) {
    if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
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
    await withProjectLock(projectName, 'generate-outline', async () => {
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
    });
  } catch (err) {
    if (err instanceof ProjectLockError) return res.status(409).json({ error: err.message });
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

// ---- Materials routes ----

app.use('/api/projects/:projectName/materials', createMaterialsRouter({ safeProjectDir }));

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
