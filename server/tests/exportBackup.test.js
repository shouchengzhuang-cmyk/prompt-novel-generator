import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let app;
let request;
let tmpDir;
let agent;

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function createProject(projectName) {
  const projectDir = path.join(tmpDir, projectName);
  const chaptersDir = path.join(projectDir, 'chapters');
  const variantsDir = path.join(chaptersDir, 'variants');
  await fs.mkdir(variantsDir, { recursive: true });

  await Promise.all([
    fs.writeFile(path.join(projectDir, 'world.md'), '测试世界观', 'utf8'),
    fs.writeFile(path.join(projectDir, 'characters.md'), '测试人物', 'utf8'),
    fs.writeFile(path.join(projectDir, 'style.md'), '测试文风', 'utf8'),
    fs.writeFile(path.join(projectDir, 'summary.md'), '测试摘要', 'utf8'),
    fs.writeFile(path.join(projectDir, 'editorial-memory.md'), '测试编辑记忆', 'utf8'),
    fs.writeFile(path.join(chaptersDir, '001.txt'), '主章节正文', 'utf8'),
    fs.writeFile(path.join(chaptersDir, 'index.json'), JSON.stringify([{
      fileName: '001.txt',
      title: '第一章标题',
      activeVersionId: 'v-active',
    }], null, 2), 'utf8'),
    fs.writeFile(path.join(variantsDir, '001.json'), JSON.stringify({
      fileName: '001.txt',
      variants: [
        { id: 'v-original', content: '原始候选正文' },
        { id: 'v-active', content: '当前采用的候选正文' },
      ],
    }, null, 2), 'utf8'),
  ]);
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-export-backup-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.SESSION_SECRET = 'export-backup-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  await createProject('export-project');

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

describe('export / backup routes', () => {
  it('按 index 顺序导出 active variant，保持既有 JSON 结构', async () => {
    const res = await agent.get('/api/projects/export-project/export');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      fileName: 'export-project.md',
      content: '# 第一章标题\n\n当前采用的候选正文',
    });
  });

  it('不存在的项目保持 404 错误结构', async () => {
    const exportResponse = await agent.get('/api/projects/missing-project/export');
    const backupResponse = await agent.get('/api/projects/missing-project/backup');

    expect(exportResponse.status).toBe(404);
    expect(exportResponse.body).toEqual({ error: '项目不存在' });
    expect(backupResponse.status).toBe(404);
    expect(backupResponse.body).toEqual({ error: '项目不存在' });
  });

  it('非法项目名保持 400，路径校验未放松', async () => {
    const res = await agent.get('/api/projects/bad%5Cname/export');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('项目名包含非法字符');
  });

  it('备份返回既有 zip 响应头、文件名和归档内容', async () => {
    const res = await agent
      .get('/api/projects/export-project/backup')
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition'])
      .toMatch(/^attachment; filename="export-project-backup-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.subarray(0, 2).toString('ascii')).toBe('PK');

    const zipText = res.body.toString('latin1');
    expect(zipText).toContain('world.md');
    expect(zipText).toContain('chapters/001.txt');
    expect(zipText).toContain('chapters/index.json');
    expect(zipText).toContain('chapters/variants/001.json');
  });
});
