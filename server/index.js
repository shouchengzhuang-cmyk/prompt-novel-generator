const path = require('path');
const fs = require('fs/promises');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const NOVELS_DIR = path.resolve(__dirname, '..', 'novels');

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
      chapters = files
        .filter((f) => f.endsWith('.txt'))
        .sort()
        .map((f) => ({ filename: f }));

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
    res.json({ ok: true, message: '章节已删除', fileName });
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

    // 2. Read latest 3 chapters for context
    let recentChapters = [];
    try {
      await ensureDir(chaptersDir);
      const files = await fs.readdir(chaptersDir);
      const txtFiles = files.filter((f) => f.endsWith('.txt')).sort().slice(-3);
      for (const f of txtFiles) {
        const text = await fs.readFile(path.join(chaptersDir, f), 'utf-8');
        recentChapters.push({ filename: f, content: text });
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

    // 6. Update summary after the chapter is safely saved.
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
      res.json({ content, fileName: filename, summaryUpdated: true });
    } catch (summaryErr) {
      res.json({
        content,
        fileName: filename,
        summaryUpdated: false,
        summaryError: summaryErr.message || '摘要更新失败',
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message || '服务器内部错误' });
  }
});

// ---- Start ----

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
