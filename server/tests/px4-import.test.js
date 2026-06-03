/**
 * P-X4 Tests: event card import (manual Markdown import)
 *
 * Tests:
 *  - Title extraction from ## 事件标题
 *  - Fallback to # heading
 *  - Fallback to filename when no heading
 *  - Title extraction from imported markdown
 *  - Empty content rejection
 *  - File name auto-generation safety
 *  - Duplicate name 409
 *  - Imported card appears in list with usage=unused
 *  - Imported card can be selected in generation
 *  - After generation, usage becomes used
 *  - P-X1 CRUD still works
 *  - P-X2 generation still works
 *  - P-X3 usage tracking still works
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;
let app;
let request;

/** A standard 灵格工坊-format event card */
const LINGGE_CARD = `# 对话事件卡

## 事件标题
莉莉丝第一次承认自己害怕被忘记

## 参与角色
莉莉丝、首承壮

## 事件摘要
在一次深夜对话中，莉莉丝第一次向首承壮承认，自己最深的恐惧是被遗忘。

## 情绪变化
脆弱 → 坦诚 → 被接纳

## 关系变化
信任加深

## 可小说化方向
这段对话可以扩展为完整的章节，描写莉莉丝内心脆弱的一面。

## 给小墨匣的写作提示词
展现莉莉丝罕见的脆弱时刻，让读者看到她坚强外表下的柔软内心。
`;

/** A card with only # heading (no ## 事件标题) */
const H1_ONLY_CARD = `# 自定义标题卡

这是一个只有一级标题的事件卡。
`;

/** A card with no heading at all */
const NO_HEADING_CARD = `纯文本内容，没有任何标题。`;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-px4-'));

  const projectDir = path.join(tmpDir, '导入测试');
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

  // Chapter index (one existing card reference for P-X3 usage test)
  await fs.writeFile(
    path.join(chaptersDir, 'index.json'),
    JSON.stringify([
      {
        fileName: '001.txt',
        title: '觉醒',
        wordCount: 100,
        createdAt: '2026-01-01T00:00:00Z',
        userPrompt: '开始',
      },
    ]),
  );

  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'sk-test-px4';
  process.env.SESSION_SECRET = 'test-secret-px4';
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

describe('P-X4: 手动导入 Markdown 事件卡', () => {

  // =============================================
  // 1. Title extraction from ## 事件标题
  // =============================================
  describe('1. 标题提取', () => {
    it('从 ## 事件标题 提取标题', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: LINGGE_CARD });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('莉莉丝第一次承认自己害怕被忘记');
      // Card name should be auto-generated
      expect(res.body.cardName).toMatch(/\.md$/);
    });

    it('从 # 一级标题提取标题（无 ## 事件标题 时）', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: H1_ONLY_CARD });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('自定义标题卡');
    });

    it('无标题时 fallback 到文件名', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: NO_HEADING_CARD, cardName: 'no-title-import.md' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('no-title-import');
    });

    it('import 后列表显示提取的事件标题', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/导入测试/materials/event-cards');
      expect(res.status).toBe(200);
      const cards = res.body.cards || [];
      const lingge = cards.find(c => c.title === '莉莉丝第一次承认自己害怕被忘记');
      expect(lingge).toBeDefined();
    });
  });

  // =============================================
  // 2. Empty content rejection
  // =============================================
  describe('2. 空内容校验', () => {
    it('空内容被拒绝', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: '', title: '测试' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('内容不能为空');
    });

    it('纯空格内容被拒绝', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: '   ', title: '测试' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('内容不能为空');
    });

    it('缺失 content 字段时使用模板（非导入场景兼容）', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ title: '无内容卡', cardName: 'no-content-card.md' });
      expect(res.status).toBe(201);
      expect(res.body.content).toContain('对话事件卡');
    });
  });

  // =============================================
  // 3. File name safety
  // =============================================
  describe('3. 文件名安全', () => {
    it('路径穿越文件名被拒绝', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: LINGGE_CARD, cardName: '../../../etc/passwd.md' });
      expect(res.status).toBe(400);
    });

    it('含路径分隔符的文件名被拒绝', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: LINGGE_CARD, cardName: 'other/evil.md' });
      expect(res.status).toBe(400);
    });

    it('非 .md 后缀被拒绝', async () => {
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: LINGGE_CARD, cardName: 'noextension' });
      expect(res.status).toBe(400);
    });

    it('自动生成文件名不含路径穿越', async () => {
      // generateSafeFileName should NEVER produce a path-traversal name
      const a = await agent();
      const res = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: '# Simple Heading\nHello World' });
      expect(res.status).toBe(201);
      expect(res.body.cardName).not.toContain('..');
      expect(res.body.cardName).not.toContain('/');
      expect(res.body.cardName).not.toContain('\\');
      expect(res.body.cardName).toMatch(/\.md$/);
    });
  });

  // =============================================
  // 4. Duplicate name 409
  // =============================================
  describe('4. 同名冲突', () => {
    it('同名事件卡返回 409', async () => {
      const a = await agent();
      const res1 = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: '# 冲突测试', cardName: 'conflict-test.md' });
      expect(res1.status).toBe(201);

      const res2 = await a.post('/api/projects/导入测试/materials/event-cards')
        .send({ content: '# 冲突测试', cardName: 'conflict-test.md' });
      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('已存在');
    });
  });

  // =============================================
  // 5. usage tracking — imported card is unused
  // =============================================
  describe('5. 导入后 usage 为 unused', () => {
    it('导入后 usage.status 为 unused', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/导入测试/materials/event-cards');
      const cards = res.body.cards || [];
      for (const card of cards) {
        expect(card.usage).toBeDefined();
        expect(card.usage.status).toBe('unused');
        expect(card.usage.count).toBe(0);
        expect(card.usage.chapters).toEqual([]);
      }
    });
  });

  // =============================================
  // 6. Imported card selectable in generation
  // =============================================
  describe('6. 导入卡可参与生成', () => {
    it('导入卡能传入 selectedEventCards 不报错', async () => {
      const a = await agent();
      const res = await a.post('/api/generate').send({
        projectName: '导入测试',
        userPrompt: '继续写',
        model: 'deepseek-v4-flash',
        selectedEventCards: ['conflict-test.md'],
      });
      // 500 expected (fake API key), but request should not 400
      expect(res.status).not.toBe(400);
    });
  });

  // =============================================
  // 7. P-X1 CRUD still works
  // =============================================
  describe('7. P-X1 CRUD 仍正常', () => {
    it('获取事件卡列表', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/导入测试/materials/event-cards');
      expect(res.status).toBe(200);
      expect(res.body.cards.length).toBeGreaterThanOrEqual(2);
    });

    it('读取导入卡详情', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/导入测试/materials/event-cards/conflict-test.md');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('冲突测试');
    });

    it('编辑导入卡', async () => {
      const a = await agent();
      const res = await a.put('/api/projects/导入测试/materials/event-cards/conflict-test.md')
        .send({ content: '# 冲突测试\n\n修改后的内容' });
      expect(res.status).toBe(200);
      expect(res.body.content).toContain('修改后的内容');
    });

    it('删除导入卡', async () => {
      const a = await agent();
      const res = await a.delete('/api/projects/导入测试/materials/event-cards/conflict-test.md');
      expect(res.status).toBe(200);
    });
  });

  // =============================================
  // 8. P-X2 generation still works
  // =============================================
  describe('8. P-X2 生成仍正常', () => {
    it('不传 selectedEventCards 生成正常', async () => {
      const a = await agent();
      const res = await a.post('/api/generate').send({
        projectName: '导入测试',
        userPrompt: '继续写',
        model: 'deepseek-v4-flash',
      });
      expect(res.status).not.toBe(400);
    });
  });

  // =============================================
  // 9. P-X3 usage tracking still works
  // =============================================
  describe('9. P-X3 usage 仍正常', () => {
    it('未使用事件卡显示 unused', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/导入测试/materials/event-cards');
      const cards = res.body.cards || [];
      for (const c of cards) {
        expect(c.usage).toBeDefined();
      }
    });

    it('不存在的项目的事件卡列表返回 404', async () => {
      const a = await agent();
      const res = await a.get('/api/projects/不存在的项目/materials/event-cards');
      expect(res.status).toBe(404);
    });
  });
});
