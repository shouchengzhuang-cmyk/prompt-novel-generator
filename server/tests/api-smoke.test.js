import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;
let app;
let request;

beforeAll(async () => {
  // ---- 创建测试项目目录（不碰真实 novels/） ----
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-api-smoke-'));

  const projectDir = path.join(tmpDir, '测试小说');
  const chaptersDir = path.join(projectDir, 'chapters');
  await fs.mkdir(chaptersDir, { recursive: true });

  // 项目设定文件
  await fs.writeFile(path.join(projectDir, 'world.md'), '这是一个测试世界观', 'utf-8');
  await fs.writeFile(path.join(projectDir, 'characters.md'), '测试角色A\n测试角色B', 'utf-8');
  await fs.writeFile(path.join(projectDir, 'style.md'), '测试风格', 'utf-8');
  await fs.writeFile(path.join(projectDir, 'summary.md'), '测试摘要', 'utf-8');

  // 章节文件
  await fs.writeFile(path.join(chaptersDir, '001.txt'), '第一章正文内容', 'utf-8');
  await fs.writeFile(path.join(chaptersDir, '002.txt'), '第二章正文内容', 'utf-8');

  // 章节索引
  await fs.writeFile(
    path.join(chaptersDir, 'index.json'),
    JSON.stringify([
      { fileName: '001.txt', title: '觉醒', wordCount: 100, createdAt: '2026-01-01T00:00:00Z' },
      { fileName: '002.txt', title: '旅途', wordCount: 200, createdAt: '2026-01-02T00:00:00Z' },
    ]),
  );

  // ---- 设置环境变量 ----
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'test_deepseek_api_key_placeholder';
  process.env.SESSION_SECRET = 'test-session-secret-no-real';
  process.env.XIAOMOXIA_PIN = '0000';

  // ---- 动态导入，触发 server 模块加载 ----
  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
});

afterAll(async () => {
  // 清理环境变量
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;

  // 删除临时目录
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ----------------------------------------------------------------
// 认证
// ----------------------------------------------------------------
describe('认证', () => {
  it('未登录访问 API 返回 401', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('未登录');
  });

  it('错误 PIN 返回 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '9999' });
    expect(res.status).toBe(401);
  });

  it('正确 PIN 登录成功', async () => {
    const res = await request(app).post('/api/auth/login').send({ pin: '0000' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ----------------------------------------------------------------
// GET /api/projects
// ----------------------------------------------------------------
describe('GET /api/projects', () => {
  it('登录后可获取项目列表', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projects');
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(1);

    // 验证项目结构
    const project = res.body.projects.find((p) => p.name === '测试小说');
    expect(project).toBeDefined();
    expect(typeof project.chapterCount).toBe('number');
    expect(typeof project.totalWords).toBe('number');
  });
});

// ----------------------------------------------------------------
// GET /api/projects/:name
// ----------------------------------------------------------------
describe('GET /api/projects/:projectName', () => {
  it('登录后可获取项目详情', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects/测试小说');
    expect(res.status).toBe(200);
    expect(res.body.projectName).toBe('测试小说');
    expect(res.body.world).toBe('这是一个测试世界观');
    expect(res.body.characters).toBe('测试角色A\n测试角色B');
    expect(res.body.style).toBe('测试风格');
    expect(res.body.summary).toBe('测试摘要');
    expect(Array.isArray(res.body.chapters)).toBe(true);
    expect(res.body.chapters.length).toBe(2);
  });

  it('不存在的项目返回 404', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects/不存在的项目');
    expect(res.status).toBe(404);
  });
});

// ----------------------------------------------------------------
// GET /api/projects/:name/chapters/:fileName
// ----------------------------------------------------------------
describe('GET /api/projects/:projectName/chapters/:fileName', () => {
  it('登录后可读取章节内容', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects/测试小说/chapters/001.txt');
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('第一章正文内容');
    expect(res.body.fileName).toBe('001.txt');
    expect(res.body.title).toBe('觉醒');
  });

  it('不存在的章节返回 404', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects/测试小说/chapters/999.txt');
    expect(res.status).toBe(404);
  });

  it('文件名不合法（非 ###.txt 格式）返回 400', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ pin: '0000' });

    const res = await agent.get('/api/projects/测试小说/chapters/not-a-chapter.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('无效的章节文件名');
  });
});
