import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;
let app;
let request;
let agent;

beforeAll(async () => {
  // ---- 创建测试项目目录 ----
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-test-'));

  // 项目一：测试小说（含章节和设定）
  const project1Dir = path.join(tmpDir, '测试小说');
  const ch1Dir = path.join(project1Dir, 'chapters');
  await fs.mkdir(ch1Dir, { recursive: true });

  await fs.writeFile(path.join(project1Dir, 'world.md'), '这是一个魔法世界，有龙和精灵', 'utf-8');
  await fs.writeFile(path.join(project1Dir, 'characters.md'), '勇者小明、魔法师小红', 'utf-8');
  await fs.writeFile(path.join(project1Dir, 'style.md'), '轻松幽默', 'utf-8');
  await fs.writeFile(path.join(project1Dir, 'summary.md'), '勇者踏上旅途寻找传说之剑', 'utf-8');
  await fs.writeFile(path.join(project1Dir, 'editorial-memory.md'), '伏笔：剑在龙穴', 'utf-8');
  await fs.writeFile(path.join(project1Dir, 'outline.json'), JSON.stringify([
    { number: 1, title: '出发', keyEvents: '离开村庄' },
    { number: 2, title: '森林', keyEvents: '遇到精灵' },
  ]));

  await fs.writeFile(path.join(ch1Dir, '001.txt'), '第一章：小明从村庄出发，踏上了寻找传说之剑的旅途。', 'utf-8');
  await fs.writeFile(path.join(ch1Dir, '002.txt'), '第二章：小明在森林中遇到了一位精灵弓箭手。', 'utf-8');
  await fs.writeFile(
    path.join(ch1Dir, 'index.json'),
    JSON.stringify([
      { fileName: '001.txt', title: '出发', wordCount: 50, createdAt: '2026-01-01T00:00:00Z' },
      { fileName: '002.txt', title: '森林', wordCount: 50, createdAt: '2026-01-02T00:00:00Z' },
    ]),
  );

  // 项目二：科幻宇宙（不含章节，只有设定）
  const project2Dir = path.join(tmpDir, '科幻宇宙');
  await fs.mkdir(project2Dir);
  await fs.writeFile(path.join(project2Dir, 'world.md'), '2457年，人类已经殖民火星', 'utf-8');

  // ---- 设置环境变量 ----
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'test_deepseek_api_key_placeholder';
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ pin: '0000' });
});

afterAll(async () => {
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ----------------------------------------------------------------
describe('GET /api/search', () => {
  it('空关键词返回 400', async () => {
    const res = await agent.get('/api/search?q=');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不能为空');
  });

  it('无 q 参数返回 400', async () => {
    const res = await agent.get('/api/search');
    expect(res.status).toBe(400);
  });

  it('超长关键词返回 400', async () => {
    const long = 'x'.repeat(81);
    const res = await agent.get(`/api/search?q=${long}`);
    expect(res.status).toBe(400);
  });

  it('能搜到项目名', async () => {
    const res = await agent.get('/api/search?q=测试小说');
    expect(res.status).toBe(200);
    expect(res.body.query).toBe('测试小说');
    const projects = res.body.results.filter((r) => r.type === 'project');
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects[0].projectName).toBe('测试小说');
  });

  it('能搜到章节标题', async () => {
    const res = await agent.get('/api/search?q=出发');
    expect(res.status).toBe(200);
    const chapters = res.body.results.filter((r) => r.type === 'chapter');
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chapters.some((c) => c.title === '出发')).toBe(true);
  });

  it('能搜到章节正文', async () => {
    const res = await agent.get('/api/search?q=精灵弓箭手');
    expect(res.status).toBe(200);
    const chapters = res.body.results.filter((r) => r.type === 'chapter');
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chapters[0].snippet).toContain('精灵弓箭手');
  });

  it('能搜到 world.md 设定内容', async () => {
    const res = await agent.get('/api/search?q=魔法世界');
    expect(res.status).toBe(200);
    const settings = res.body.results.filter((r) => r.type === 'setting' && r.settingKey === 'world');
    expect(settings.length).toBeGreaterThanOrEqual(1);
    expect(settings[0].projectName).toBe('测试小说');
  });

  it('能搜到 characters.md 设定内容', async () => {
    const res = await agent.get('/api/search?q=勇者小明');
    expect(res.status).toBe(200);
    const settings = res.body.results.filter((r) => r.type === 'setting' && r.settingKey === 'characters');
    expect(settings.length).toBeGreaterThanOrEqual(1);
  });

  it('能搜到 summary.md 设定内容', async () => {
    const res = await agent.get('/api/search?q=传说之剑');
    expect(res.status).toBe(200);
    const settings = res.body.results.filter((r) => r.type === 'setting');
    expect(settings.some((s) => s.snippet.includes('传说之剑'))).toBe(true);
  });

  it('不存在的关键词返回空数组', async () => {
    const res = await agent.get('/api/search?q=ZZZZ_NOT_EXISTS_999');
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it('搜索结果按类型排序优先', async () => {
    const res = await agent.get('/api/search?q=测试');
    expect(res.status).toBe(200);
    const types = res.body.results.map((r) => r.type);
    // project 应该在 chapter 之前
    const firstProject = types.indexOf('project');
    const firstChapter = types.indexOf('chapter');
    if (firstProject !== -1 && firstChapter !== -1) {
      expect(firstProject).toBeLessThan(firstChapter);
    }
  });

  it('limit 参数生效', async () => {
    const res = await agent.get('/api/search?q=小&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(1);
  });

  it('跨项目搜索返回多项目结果', async () => {
    const res = await agent.get('/api/search?q=火星');
    expect(res.status).toBe(200);
    const projects = res.body.results.map((r) => r.projectName);
    expect(projects).toContain('科幻宇宙');
  });
});
