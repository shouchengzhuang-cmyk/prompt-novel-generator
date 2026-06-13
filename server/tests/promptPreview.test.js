import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let app;
let request;
let tmpDir;
let agent;

async function createProject(projectName, { includeSettings = true } = {}) {
  const projectDir = path.join(tmpDir, projectName);
  const chaptersDir = path.join(projectDir, 'chapters');
  const variantsDir = path.join(chaptersDir, 'variants');
  await fs.mkdir(variantsDir, { recursive: true });

  const writes = [
    fs.writeFile(path.join(chaptersDir, '001.txt'), '第一章原正文', 'utf8'),
    fs.writeFile(path.join(chaptersDir, '002.txt'), '第二章原正文', 'utf8'),
    fs.writeFile(path.join(chaptersDir, 'index.json'), JSON.stringify([
      { fileName: '001.txt', title: '第一章', activeVersionId: 'v-active' },
      { fileName: '002.txt', title: '第二章', activeVersionId: 'v-original' },
    ], null, 2), 'utf8'),
    fs.writeFile(path.join(variantsDir, '001.json'), JSON.stringify({
      fileName: '001.txt',
      variants: [{ id: 'v-active', content: '第一章当前候选正文' }],
    }, null, 2), 'utf8'),
  ];

  if (includeSettings) {
    writes.push(
      fs.writeFile(path.join(projectDir, 'world.md'), '预览世界观', 'utf8'),
      fs.writeFile(path.join(projectDir, 'characters.md'), '预览人物', 'utf8'),
      fs.writeFile(path.join(projectDir, 'style.md'), '预览文风', 'utf8'),
      fs.writeFile(path.join(projectDir, 'summary.md'), '预览摘要', 'utf8'),
    );
  }

  await Promise.all(writes);
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-prompt-preview-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.SESSION_SECRET = 'prompt-preview-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  await createProject('preview-project');
  await createProject('preview-fallback', { includeSettings: false });

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ pin: '0000' });
});

afterAll(async () => {
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('GET /api/projects/:projectName/prompt-preview', () => {
  it('generate 预览保持响应结构、上下文内容与 userPrompt trim 行为', async () => {
    const res = await agent
      .get('/api/projects/preview-project/prompt-preview')
      .query({ taskType: 'novel.generateChapter', userPrompt: '  继续写作  ' });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'systemContent',
      'taskType',
      'templateId',
      'templateTitle',
      'usedFallback',
      'userContent',
    ]);
    expect(res.body.taskType).toBe('novel.generateChapter');
    expect(res.body.templateId).toBe('novel-generate');
    expect(res.body.templateTitle).toBe('小说续写');
    expect(res.body.usedFallback).toBe(false);
    expect(res.body.userContent).toContain('预览世界观');
    expect(res.body.userContent).toContain('预览人物');
    expect(res.body.userContent).toContain('预览摘要');
    expect(res.body.userContent).toContain('继续写作');
    expect(res.body.userContent).toContain('第一章当前候选正文');
    expect(res.body.userContent).toContain('第二章原正文');
  });

  it('设定文件缺失时保持空字符串 fallback，仍可生成预览', async () => {
    const res = await agent
      .get('/api/projects/preview-fallback/prompt-preview')
      .query({ taskType: 'novel.generateChapter', userPrompt: '继续' });

    expect(res.status).toBe(200);
    expect(res.body.taskType).toBe('novel.generateChapter');
    expect(res.body.userContent).toContain('继续');
    expect(res.body.userContent).toContain('第一章当前候选正文');
  });

  it('rewrite 预览只注入当前章节之前的 active variant 内容', async () => {
    const res = await agent
      .get('/api/projects/preview-project/prompt-preview')
      .query({
        taskType: 'novel.rewriteChapter',
        fileName: '002.txt',
        userPrompt: '改写第二章',
      });

    expect(res.status).toBe(200);
    expect(res.body.taskType).toBe('novel.rewriteChapter');
    expect(res.body.templateId).toBe('novel-rewrite');
    expect(res.body.userContent).toContain('第一章当前候选正文');
    expect(res.body.userContent).not.toContain('第一章原正文');
    expect(res.body.userContent).not.toContain('第二章原正文');
    expect(res.body.userContent).toContain('改写第二章');
  });

  it('taskType 与 rewrite fileName 校验保持既有错误结构', async () => {
    const missingTaskType = await agent.get('/api/projects/preview-project/prompt-preview');
    const missingFileName = await agent
      .get('/api/projects/preview-project/prompt-preview')
      .query({ taskType: 'novel.rewriteChapter' });
    const invalidFileName = await agent
      .get('/api/projects/preview-project/prompt-preview')
      .query({ taskType: 'novel.rewriteChapter', fileName: '../001.txt' });
    const missingChapter = await agent
      .get('/api/projects/preview-project/prompt-preview')
      .query({ taskType: 'novel.rewriteChapter', fileName: '999.txt' });

    expect(missingTaskType.status).toBe(400);
    expect(missingTaskType.body).toEqual({ error: 'taskType 必须为 novel.generateChapter 或 novel.rewriteChapter' });
    expect(missingFileName.status).toBe(400);
    expect(missingFileName.body).toEqual({ error: 'rewriteChapter 预览需要提供 fileName' });
    expect(invalidFileName.status).toBe(400);
    expect(invalidFileName.body).toEqual({ error: '无效的 fileName' });
    expect(missingChapter.status).toBe(404);
    expect(missingChapter.body).toEqual({ error: '章节不存在' });
  });

  it('项目不存在与非法项目名保持既有错误响应', async () => {
    const missing = await agent
      .get('/api/projects/missing-project/prompt-preview')
      .query({ taskType: 'novel.generateChapter' });
    const invalid = await agent
      .get('/api/projects/bad%5Cname/prompt-preview')
      .query({ taskType: 'novel.generateChapter' });

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: '项目不存在' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toContain('项目名包含非法字符');
  });
});
