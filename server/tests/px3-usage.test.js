/**
 * P-X3 Tests: event card usage tracking
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;
let app;
let request;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-px3-'));

  const projectDir = path.join(tmpDir, '测试项目');
  const chaptersDir = path.join(projectDir, 'chapters');
  const cardsDir = path.join(projectDir, 'materials', 'event-cards');
  await fs.mkdir(chaptersDir, { recursive: true });
  await fs.mkdir(cardsDir, { recursive: true });

  // Project setting files
  await fs.writeFile(path.join(projectDir, 'world.md'), '测试世界观', 'utf-8');
  await fs.writeFile(path.join(projectDir, 'characters.md'), '测试角色', 'utf-8');
  await fs.writeFile(path.join(projectDir, 'style.md'), '测试文风', 'utf-8');

  // Chapters
  await fs.writeFile(path.join(chaptersDir, '001.txt'), '第一章正文', 'utf-8');
  await fs.writeFile(path.join(chaptersDir, '002.txt'), '第二章正文', 'utf-8');
  await fs.writeFile(path.join(chaptersDir, '003.txt'), '第三章正文', 'utf-8');

  // Create event cards
  for (const name of ['card-used.md', 'card-unused.md', 'card-multi.md']) {
    await fs.writeFile(path.join(cardsDir, name), `## 场景\n${name}测试`, 'utf-8');
  }

  // Chapter index with usedEventCards
  await fs.writeFile(
    path.join(chaptersDir, 'index.json'),
    JSON.stringify([
      {
        fileName: '001.txt',
        title: '觉醒',
        wordCount: 100,
        createdAt: '2026-01-01T00:00:00Z',
        userPrompt: '开始',
        usedEventCards: ['card-used.md'],
      },
      {
        fileName: '002.txt',
        title: '旅途',
        wordCount: 200,
        createdAt: '2026-01-02T00:00:00Z',
        userPrompt: '继续',
        usedEventCards: ['card-used.md', 'card-multi.md'],
      },
      {
        fileName: '003.txt',
        title: '终章',
        wordCount: 150,
        createdAt: '2026-01-03T00:00:00Z',
        userPrompt: '结束',
        // deliberately no usedEventCards — old chapter
      },
    ]),
  );

  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'sk-test';
  process.env.SESSION_SECRET = 'test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
});

afterAll(async () => {
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function agent() {
  const a = request.agent(app);
  await a.post('/api/auth/login').send({ pin: '0000' });
  return a;
}

describe('P-X3: 事件卡使用状态与追溯', () => {
  it('已使用的事件卡显示 used 状态', async () => {
    const a = await agent();
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    expect(res.status).toBe(200);
    const cards = res.body.cards || [];
    const used = cards.find(c => c.cardName === 'card-used.md');
    expect(used).toBeDefined();
    expect(used.usage).toBeDefined();
    expect(used.usage.status).toBe('used');
    expect(used.usage.count).toBe(2);
    expect(used.usage.chapters.length).toBe(2);
  });

  it('多章节使用的事件卡显示多个章节', async () => {
    const a = await agent();
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    const cards = res.body.cards || [];
    const multi = cards.find(c => c.cardName === 'card-multi.md');
    expect(multi).toBeDefined();
    expect(multi.usage.status).toBe('used');
    expect(multi.usage.chapters.some(ch => ch.chapter === '002.txt')).toBe(true);
    expect(multi.usage.chapters[0].title).toBe('旅途');
  });

  it('未使用的事件卡显示 unused 状态', async () => {
    const a = await agent();
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    const cards = res.body.cards || [];
    const unused = cards.find(c => c.cardName === 'card-unused.md');
    expect(unused).toBeDefined();
    expect(unused.usage).toBeDefined();
    expect(unused.usage.status).toBe('unused');
    expect(unused.usage.count).toBe(0);
    expect(unused.usage.chapters).toEqual([]);
  });

  it('没有 usedEventCards 的老章节不报错', async () => {
    const a = await agent();
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    expect(res.status).toBe(200);
    // card-multi.md should only show 1 chapter (002.txt), not crash on chapter 003
    const cards = res.body.cards || [];
    const multi = cards.find(c => c.cardName === 'card-multi.md');
    expect(multi.usage.count).toBe(1);
  });

  it('删除事件卡后列表不再显示该卡', async () => {
    const a = await agent();
    await a.delete('/api/projects/测试项目/materials/event-cards/card-unused.md');
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    const cards = res.body.cards || [];
    expect(cards.find(c => c.cardName === 'card-unused.md')).toBeUndefined();
  });

  it('index.json 引用已删除事件卡不导致崩溃', async () => {
    // Delete a card that IS referenced in index.json
    const a = await agent();
    await a.delete('/api/projects/测试项目/materials/event-cards/card-used.md');
    const res = await a.get('/api/projects/测试项目/materials/event-cards');
    expect(res.status).toBe(200);
    const cards = res.body.cards || [];
    expect(cards.find(c => c.cardName === 'card-used.md')).toBeUndefined();
    // Other cards still show
    expect(cards.some(c => c.cardName === 'card-multi.md')).toBe(true);
  });

  it('P-X1 CRUD 仍正常', async () => {
    const a = await agent();
    // Create
    const c = await a.post('/api/projects/测试项目/materials/event-cards')
      .send({ title: '新卡', cardName: 'new.md', content: '## 场景\n测试' });
    expect(c.status).toBe(201);
    // Read
    const r = await a.get('/api/projects/测试项目/materials/event-cards');
    expect(r.status).toBe(200);
    expect(r.body.cards.some(c => c.cardName === 'new.md')).toBe(true);
  });

  it('P-X2 selectedEventCards 仍正常', async () => {
    const a = await agent();
    const res = await a.post('/api/generate').send({
      projectName: '测试项目',
      userPrompt: '继续写',
      model: 'deepseek-v4-flash',
      selectedEventCards: ['card-multi.md'],
    });
    // Expected: 500 (fake API key) — request should not 400
    expect(res.status).not.toBe(400);
  });
});
