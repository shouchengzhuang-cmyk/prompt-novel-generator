import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let app;
let request;
let tmpDir;
let agent;
let deepSeekResponses;

async function createProject(projectName, { withOutline = true } = {}) {
  const projectDir = path.join(tmpDir, projectName);
  const chaptersDir = path.join(projectDir, 'chapters');
  const variantsDir = path.join(chaptersDir, 'variants');
  await fs.mkdir(variantsDir, { recursive: true });

  const files = [
    fs.writeFile(path.join(projectDir, 'world.md'), '测试世界观', 'utf8'),
    fs.writeFile(path.join(projectDir, 'characters.md'), '测试人物', 'utf8'),
    fs.writeFile(path.join(projectDir, 'style.md'), '测试文风', 'utf8'),
    fs.writeFile(path.join(projectDir, 'summary.md'), '旧摘要', 'utf8'),
    fs.writeFile(path.join(chaptersDir, '001.txt'), '主章节正文', 'utf8'),
    fs.writeFile(path.join(chaptersDir, 'index.json'), JSON.stringify([{
      fileName: '001.txt',
      title: '第一章',
      activeVersionId: 'v-active',
    }], null, 2), 'utf8'),
    fs.writeFile(path.join(variantsDir, '001.json'), JSON.stringify({
      fileName: '001.txt',
      variants: [{ id: 'v-active', content: '当前采用正文' }],
    }, null, 2), 'utf8'),
  ];

  if (withOutline) {
    files.push(fs.writeFile(path.join(projectDir, 'outline.json'), JSON.stringify([{
      number: 2,
      goal: '保留旧目标',
      status: 'writing',
    }], null, 2), 'utf8'));
  }
  await Promise.all(files);
  return { projectDir };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-summary-outline-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.SESSION_SECRET = 'summary-outline-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  await createProject('summary-outline-project');
  await createProject('missing-outline-project', { withOutline: false });

  vi.stubGlobal('fetch', vi.fn(async () => {
    const content = deepSeekResponses.shift();
    if (content === undefined) throw new Error('missing mocked DeepSeek response');
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }));

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ pin: '0000' });
});

beforeEach(() => {
  deepSeekResponses = [];
  vi.mocked(fetch).mockClear();
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('summary / outline routes', () => {
  it('读取 outline 保持既有响应结构', async () => {
    const res = await agent.get('/api/projects/summary-outline-project/outline');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      outline: [{ number: 2, goal: '保留旧目标', status: 'writing' }],
    });
  });

  it('outline 文件缺失时保持空数组 fallback', async () => {
    const res = await agent.get('/api/projects/missing-outline-project/outline');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ outline: [] });
  });

  it('保存 outline 后写入 outline.json 并返回原结构', async () => {
    const outline = [{ number: 3, goal: '新目标', keyEvents: ['事件'], status: 'planned' }];
    const res = await agent.put('/api/projects/summary-outline-project/outline').send({ outline });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, outline });
    const saved = JSON.parse(await fs.readFile(path.join(tmpDir, 'summary-outline-project', 'outline.json'), 'utf8'));
    expect(saved).toEqual(outline);
  });

  it('非数组 outline 与非法项目名保持既有 400 错误', async () => {
    const invalidOutline = await agent
      .put('/api/projects/summary-outline-project/outline')
      .send({ outline: {} });
    const invalidProject = await agent.get('/api/projects/bad%5Cname/outline');

    expect(invalidOutline.status).toBe(400);
    expect(invalidOutline.body).toEqual({ error: 'outline 必须是数组' });
    expect(invalidProject.status).toBe(400);
    expect(invalidProject.body.error).toContain('项目名包含非法字符');
  });

  it('summary rebuild 使用 active variant，成功后覆盖 summary.md', async () => {
    deepSeekResponses.push('  新摘要内容  ');
    const res = await agent.post('/api/projects/summary-outline-project/summary/rebuild');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, message: '摘要已重建', summary: '新摘要内容' });
    expect(await fs.readFile(path.join(tmpDir, 'summary-outline-project', 'summary.md'), 'utf8'))
      .toBe('新摘要内容');

    const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(requestBody.model).toBe('deepseek-v4-flash');
    expect(requestBody.stream).toBe(false);
    expect(requestBody.messages[1].content).toContain('当前采用正文');
    expect(requestBody.messages[1].content).not.toContain('主章节正文');
  });

  it('不存在项目的 summary rebuild 保持 404', async () => {
    const res = await agent.post('/api/projects/missing-project/summary/rebuild');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: '项目不存在' });
  });

  it('outline generate 保持合并旧条目并按章节号排序', async () => {
    await fs.writeFile(path.join(tmpDir, 'summary-outline-project', 'outline.json'), JSON.stringify([{
      number: 2,
      goal: '保留旧目标',
      status: 'writing',
    }], null, 2), 'utf8');
    deepSeekResponses.push(JSON.stringify([
      { number: 2, goal: 'AI 新目标', status: 'planned' },
      { number: 3, goal: '第三章目标', status: 'planned' },
    ]));

    const res = await agent
      .post('/api/projects/summary-outline-project/outline/generate')
      .send({ model: 'deepseek-v4-pro' });

    expect(res.status).toBe(200);
    expect(res.body.outline).toEqual([
      { number: 2, goal: '保留旧目标', status: 'writing' },
      { number: 3, goal: '第三章目标', status: 'planned' },
    ]);
    const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(requestBody.model).toBe('deepseek-v4-pro');
  });
});
