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
const createSearchRouter = require('./routes/search');
const createSummaryOutlineRouter = require('./routes/summaryOutline');
const createPromptPreviewRouter = require('./routes/promptPreview');
const createRebuildIndexRouter = require('./routes/rebuildIndex');
const { buildPrompt } = require('./services/promptBuilder');
const storage = require('./services/storage');
const { createProjectService } = require('./services/projectService');
const { createChapterService } = require('./services/chapterService');
const { createVariantService, VARIANTS_DIR_NAME, variantsFilePath, readVariants, writeVariants } = require('./services/variantService');
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
const { createEditorialMemoryService } = require('./services/editorialMemoryService');
const { isValidChapterFileName, countChars, createChapterMetadataService } = require('./services/chapterMetadataService');
const { createProjectContextFilesService } = require('./services/projectContextFilesService');

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

// ---- Chapter metadata service ----

const chapterMetadataService = createChapterMetadataService({
  storage,
  readFile: fs.readFile,
});

const {
  readChapterIndex,
  writeChapterIndex,
  clearRewriteStaleMarker,
  updateChapterWordCount,
  markChaptersStaleAfterRewrite,
  extractTitleFromContent,
} = chapterMetadataService;

// ---- Project context files service ----

const projectContextFilesService = createProjectContextFilesService({
  safeProjectDir,
  ensureDir,
  fsReadFile: fs.readFile,
  writeJson: storage.writeJson,
  isValidChapterFileName,
  readVariants,
});

const {
  readOutline,
  writeOutline,
  readActiveChapterContent,
} = projectContextFilesService;

// ---- Editorial memory service ----

const editorialMemoryService = createEditorialMemoryService({
  safeProjectDir,
  callDeepSeek,
  readChapterIndex,
  ensureDir,
  fsReadFile: fs.readFile,
  fsAccess: fs.access,
  writeText: storage.writeText,
});

// ---- Project routes ----

const projectService = createProjectService({
  novelsDir: NOVELS_DIR,
  safeProjectDir,
  isValidChapterFileName,
  readChapterIndex,
  extractTitleFromContent,
  readEditorialMemory: editorialMemoryService.readEditorialMemory,
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
  readEditorialMemory: editorialMemoryService.readEditorialMemory,
  selectEditorialMemoryForPrompt: editorialMemoryService.selectEditorialMemoryForPrompt,
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
  updateEditorialMemoryForChapter: editorialMemoryService.updateEditorialMemoryForChapter,
  fetchImpl: (...args) => fetch(...args),
  getDeepSeekApiKey: () => process.env.DEEPSEEK_API_KEY,
}));

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

// ---- Rebuild index route ----

app.use(
  '/api/projects/:projectName/chapters',
  createRebuildIndexRouter({
    safeProjectDir,
    readChapterIndex,
    writeChapterIndex,
    withProjectLock,
    ProjectLockError,
    access: fs.access,
    readDir: fs.readdir,
    stat: fs.stat,
  }),
);

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
  updateChapterWordCount,
  markChaptersStaleAfterRewrite,
  withProjectLock,
});

app.use(
  '/api/projects/:projectName/chapters/:fileName/variants',
  createVariantsRouter({ variantService }),
);

const MAX_SUMMARY_CONTENT_LENGTH = 60000;

// ---- Summary / outline routes ----

app.use(
  '/api/projects/:projectName',
  createSummaryOutlineRouter({
    safeProjectDir,
    callDeepSeek,
    readChapterIndex,
    readActiveChapterContent,
    readOutline,
    writeOutline,
    withProjectLock,
    ProjectLockError,
    access: fs.access,
    readFile: fs.readFile,
    stat: fs.stat,
    writeText: storage.writeText,
    maxSummaryContentLength: MAX_SUMMARY_CONTENT_LENGTH,
  }),
);

// ---- Prompt preview routes ----

app.use(
  '/api/projects/:projectName',
  createPromptPreviewRouter({
    safeProjectDir,
    ensureDir,
    readChapterIndex,
    readVariants,
    buildPrompt,
    isValidChapterFileName,
    access: fs.access,
    readFile: fs.readFile,
    readDir: fs.readdir,
    recentChapterLimit: RECENT_CHAPTER_LIMIT,
  }),
);

// ---- Search routes ----

app.use('/api', createSearchRouter({
  novelsDir: NOVELS_DIR,
  ensureDir,
  safeProjectDir,
  readChapterIndex,
  isValidChapterFileName,
  readDir: fs.readdir,
  readFile: fs.readFile,
}));

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
module.exports.__testHelpers = {
  DEFAULT_EDITORIAL_MEMORY: editorialMemoryService.DEFAULT_EDITORIAL_MEMORY,
  safeProjectDir,
  isValidChapterFileName,
  countChars,
  getEditorialMemoryPath: editorialMemoryService.getEditorialMemoryPath,
  ensureEditorialMemory: editorialMemoryService.ensureEditorialMemory,
  readEditorialMemory: editorialMemoryService.readEditorialMemory,
  writeEditorialMemory: editorialMemoryService.writeEditorialMemory,
  replaceChapterMemoryBlock: editorialMemoryService.replaceChapterMemoryBlock,
  selectEditorialMemoryForPrompt: editorialMemoryService.selectEditorialMemoryForPrompt,
  updateEditorialMemoryForChapter: editorialMemoryService.updateEditorialMemoryForChapter,
  readChapterIndex,
  writeChapterIndex,
  clearRewriteStaleMarker,
  updateChapterWordCount,
  markChaptersStaleAfterRewrite,
  extractTitleFromContent,
  readActiveChapterContent,
  variantsFilePath,
  readVariants,
  writeVariants,
};

// ---- Start ----

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
