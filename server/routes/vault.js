const path = require('path');
const fs = require('fs/promises');
const storage = require('../services/storage');
const express = require('express');
const router = express.Router();

const VAULT_DIR = process.env.VAULT_DIR
  ? path.resolve(process.env.VAULT_DIR)
  : path.resolve(__dirname, '..', 'data', 'vault');
const VAULT_FILE = path.join(VAULT_DIR, 'templates.json');

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // already exists
  }
}

async function readTemplates() {
  await ensureDir(VAULT_DIR);
  let raw;
  try {
    raw = await fs.readFile(VAULT_FILE, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error('templates.json 解析失败: ' + err.message);
  }
}

async function writeTemplates(templates) {
  await ensureDir(VAULT_DIR);
  await storage.writeJson(VAULT_FILE, templates);
}

function generateId(title) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9一-龥]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug + '-' + Date.now();
}

// GET /api/vault/templates — 列出所有模板
router.get('/', async (_req, res) => {
  try {
    const templates = await readTemplates();
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vault/templates/:id — 获取单个模板
router.get('/:id', async (req, res) => {
  try {
    const templates = await readTemplates();
    const tpl = templates.find((t) => t.id === req.params.id);
    if (!tpl) return res.status(404).json({ error: '模板不存在' });
    res.json(tpl);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vault/templates — 创建模板
router.post('/', async (req, res) => {
  try {
    const { title, description, category, tags, taskType, defaultModel, systemTemplate, userTemplate, variables } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
    if (!systemTemplate || !systemTemplate.trim()) return res.status(400).json({ error: 'systemTemplate 不能为空' });
    if (!userTemplate || !userTemplate.trim()) return res.status(400).json({ error: 'userTemplate 不能为空' });

    const templates = await readTemplates();
    const newTemplate = {
      id: generateId(title),
      title: title.trim(),
      description: description || '',
      category: category || '',
      tags: Array.isArray(tags) ? tags : [],
      taskType: taskType || '',
      defaultModel: defaultModel || 'deepseek-v4-flash',
      systemTemplate,
      userTemplate,
      variables: Array.isArray(variables) ? variables : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    templates.push(newTemplate);
    await writeTemplates(templates);
    res.json(newTemplate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vault/templates/:id — 更新模板
router.put('/:id', async (req, res) => {
  try {
    const { title, description, category, tags, taskType, defaultModel, systemTemplate, userTemplate, variables } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: '标题不能为空' });
    if (!systemTemplate || !systemTemplate.trim()) return res.status(400).json({ error: 'systemTemplate 不能为空' });
    if (!userTemplate || !userTemplate.trim()) return res.status(400).json({ error: 'userTemplate 不能为空' });

    const templates = await readTemplates();
    const idx = templates.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '模板不存在' });

    const updated = {
      ...templates[idx],
      title: title !== undefined ? title : templates[idx].title,
      description: description !== undefined ? description : templates[idx].description,
      category: category !== undefined ? category : templates[idx].category,
      tags: Array.isArray(tags) ? tags : templates[idx].tags,
      taskType: taskType !== undefined ? taskType : templates[idx].taskType,
      defaultModel: defaultModel !== undefined ? defaultModel : templates[idx].defaultModel,
      systemTemplate: systemTemplate !== undefined ? systemTemplate : templates[idx].systemTemplate,
      userTemplate: userTemplate !== undefined ? userTemplate : templates[idx].userTemplate,
      variables: Array.isArray(variables) ? variables : templates[idx].variables,
      updatedAt: new Date().toISOString(),
    };
    templates[idx] = updated;
    await writeTemplates(templates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vault/templates/:id — 删除模板
router.delete('/:id', async (req, res) => {
  try {
    const templates = await readTemplates();
    const idx = templates.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: '模板不存在' });
    templates.splice(idx, 1);
    await writeTemplates(templates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
