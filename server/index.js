const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const NOVELS_DIR = path.resolve(__dirname, '..', 'novels');
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
  const { projectName, world, characters, style } = req.body;

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
    // summary.md starts empty; the user can edit it later for better continuity
    await fs.writeFile(path.join(projectDir, 'summary.md'), '', 'utf-8');
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
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const [world, characters, summary, style] = await Promise.all([
      fs.readFile(path.join(projectDir, 'world.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'characters.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'summary.md'), 'utf-8').catch(() => ''),
      fs.readFile(path.join(projectDir, 'style.md'), 'utf-8').catch(() => ''),
    ]);

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
        filename: f,
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

    res.json({ projectName, world, characters, summary, style, chapters, recentContent });
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
    res.json({ fileName, content });
  } catch {
    res.status(404).json({ error: '章节不存在' });
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
  const { world, characters, style, summary } = req.body;

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
    };

    await Promise.all([
      fs.writeFile(path.join(projectDir, 'world.md'), project.world, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'characters.md'), project.characters, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'style.md'), project.style, 'utf-8'),
      fs.writeFile(path.join(projectDir, 'summary.md'), project.summary, 'utf-8'),
    ]);
    res.json({ ok: true, message: '设定已保存', project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/generate ----

app.post('/api/generate', async (req, res) => {
  const { projectName, userPrompt, model } = req.body;

  if (!projectName || !projectName.trim()) {
    return res.status(400).json({ error: 'projectName is required' });
  }
  if (!userPrompt || !userPrompt.trim()) {
    return res.status(400).json({ error: 'userPrompt is required' });
  }

  const allowedModels = ['deepseek-chat', 'deepseek-reasoner'];
  const effectiveModel = allowedModels.includes(model) ? model : 'deepseek-chat';

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

    // 3. Build messages
    let systemContent =
      '你是一位长篇小说写作助手。根据以下规则续写接下来的内容：\n' +
      '1. 必须遵守下面的写作规则。\n' +
      '2. 保持世界观、人物性格、叙事风格和情节发展的连续性。\n' +
      '3. 不要重复最近章节中已经写过的内容。\n' +
      '4. 不要擅自改变人物关系和核心设定。\n' +
      '5. 始终使用中文写作。';

    if (style) {
      systemContent += `\n\n## 写作规则\n${style}`;
    }

    let userContent = '';
    if (world) userContent += `## 世界观设定\n${world}\n\n`;
    if (characters) userContent += `## 人物设定\n${characters}\n\n`;
    if (summary) userContent += `## 故事梗概\n${summary}\n\n`;
    if (recentChapters.length > 0) {
      userContent += '## 最近章节\n';
      for (const ch of recentChapters) {
        userContent += `--- ${ch.filename} ---\n${ch.content}\n\n`;
      }
    }
    userContent += `## 本次续写要求\n${userPrompt.trim()}`;

    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ];

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

    // 6b. Update summary after the chapter is safely saved.
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
      const updatedSummary = await callDeepSeek('deepseek-chat', summaryMessages);
      await fs.writeFile(path.join(projectDir, 'summary.md'), updatedSummary.trim(), 'utf-8');
      res.json({ content, fileName: filename, title, summaryUpdated: true });
    } catch (summaryErr) {
      res.json({
        content,
        fileName: filename,
        title,
        summaryUpdated: false,
        summaryError: summaryErr.message || '摘要更新失败',
      });
    }
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

  const allowedModels = ['deepseek-chat', 'deepseek-reasoner'];
  const effectiveModel = allowedModels.includes(model) ? model : 'deepseek-chat';

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

    // 4. Build prompt — fork from previous chapters, NOT rewrite old chapter
    let systemContent =
      '你是一位长篇小说写作助手。你的任务是基于已有前文，生成当前章节的一个新分支版本。\n' +
      '1. 只承接前文章节和项目设定。\n' +
      '2. 不要参考旧版本章节正文。\n' +
      '3. 不要沿用旧版本的情节走向，按用户本次要求重新展开。\n' +
      '4. 保持世界观、人物性格、叙事风格一致。\n' +
      '5. 优先执行用户本次续写要求。\n' +
      '6. 只输出章节正文，不要解释说明。';

    if (style) {
      systemContent += `\n\n## 写作规则\n${style}`;
    }

    let userContent = '';
    if (world) userContent += `## 世界观设定\n${world}\n\n`;
    if (characters) userContent += `## 人物设定\n${characters}\n\n`;
    if (recentChapters.length > 0) {
      userContent += '## 前文章节\n';
      for (const ch of recentChapters) {
        userContent += `--- ${ch.filename} ---\n${ch.content}\n\n`;
      }
    }
    userContent += `## 用户本次续写要求\n${effectiveUserPrompt}\n\n`;
    userContent += '请根据以上设定和前文，输出当前章节的新分支版本正文。不要做任何解释说明。';

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

    res.json({ ok: true, variant });
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
    const indexEntries = await readChapterIndex(chaptersDir);
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
      await writeChapterIndex(chaptersDir, indexEntries);
    }

    res.json({ ok: true, fileName, content: variant.content, activeVersionId: variantId, title: indexEntry?.title || variant.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
