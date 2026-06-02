import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir;
let buildPrompt;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
  process.env.VAULT_DIR = tmpDir;
  const mod = await import('../services/promptBuilder.js');
  buildPrompt = mod.buildPrompt;
});

afterAll(async () => {
  delete process.env.VAULT_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ----------------------------------------------------------------
// 硬编码 fallback（templates.json 不存在）
// ----------------------------------------------------------------
describe('templates.json 不存在时走硬编码 fallback', () => {
  it('generate 类型 fallback 包含关键段落', async () => {
    const result = await buildPrompt('novel.generateChapter', {
      world: '一个魔法世界',
      characters: '勇者、魔王',
      style: '轻松幽默',
      summary: '勇者踏上旅途',
      recentChapters: '第一章：出发',
      userPrompt: '写第二章',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.systemContent).toContain('长篇小说写作助手');
    expect(result.systemContent).toContain('轻松幽默');
    expect(result.userContent).toContain('一个魔法世界');
    expect(result.userContent).toContain('勇者、魔王');
    expect(result.userContent).toContain('写第二章');
  });

  it('rewrite 类型 fallback 包含正确指令', async () => {
    const result = await buildPrompt('novel.rewriteChapter', {
      world: '修仙世界',
      recentChapters: '前文内容',
      userPrompt: '改写此章',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.systemContent).toContain('新分支版本');
    expect(result.userContent).toContain('前文内容');
    expect(result.userContent).toContain('改写此章');
    expect(result.userContent).toContain('不要做任何解释说明');
  });

  it('未知 taskType 走 generate fallback', async () => {
    const result = await buildPrompt('unknown.task', {
      userPrompt: '测试',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.systemContent).toContain('续写接下来的内容');
  });

  it('最小 context 不炸', async () => {
    const result = await buildPrompt('novel.generateChapter', {
      userPrompt: '写一章',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.userContent).toContain('写一章');
  });
});

// ----------------------------------------------------------------
// Vault 模板变量替换
// ----------------------------------------------------------------
describe('Vault 模板变量替换', () => {
  beforeEach(async () => {
    // 写一个有效模板
    await fs.writeFile(
      path.join(tmpDir, 'templates.json'),
      JSON.stringify([
        {
          id: 'tpl-1',
          taskType: 'novel.generateChapter',
          title: '通用生成',
          systemTemplate: '你是 {{role}}。\n写作风格：{{style}}。\n背景：{{world}}',
          userTemplate: '续写：{{userPrompt}}\n\n前文摘要：{{summary}}',
        },
        {
          id: 'tpl-2',
          taskType: 'novel.rewriteChapter',
          title: '改写模板',
          systemTemplate: '重写以下章节。风格：{{style}}',
          userTemplate: '原文：{{originalChapter}}\n要求：{{userPrompt}}',
        },
      ]),
    );
  });

  it('变量被正确替换', async () => {
    const result = await buildPrompt('novel.generateChapter', {
      role: '长篇作家',
      style: '幽默',
      world: '现代都市',
      userPrompt: '写一段对话',
      summary: '两人相遇',
    });

    expect(result.usedFallback).toBe(false);
    expect(result.templateId).toBe('tpl-1');
    expect(result.systemContent).toBe('你是 长篇作家。\n写作风格：幽默。\n背景：现代都市');
    expect(result.userContent).toContain('写一段对话');
    expect(result.userContent).toContain('两人相遇');
  });

  it('缺失的变量保持 {{var}} 原文（不炸）', async () => {
    const result = await buildPrompt('novel.generateChapter', {
      style: '严肃',
      userPrompt: '无世界设定',
    });

    // renderTemplate 只替换 context 中存在的变量，未提供的保持 {{var}} 原文
    expect(result.systemContent).toBe('你是 {{role}}。\n写作风格：严肃。\n背景：{{world}}');
    expect(result.userContent).toContain('无世界设定');
  });

  it('rewrite 模板独立路由', async () => {
    const result = await buildPrompt('novel.rewriteChapter', {
      style: '悬疑',
      originalChapter: '第一章正文',
      userPrompt: '改得更紧张',
    });

    expect(result.usedFallback).toBe(false);
    expect(result.templateId).toBe('tpl-2');
    expect(result.systemContent).toContain('悬疑');
    expect(result.userContent).toContain('第一章正文');
    expect(result.userContent).toContain('改得更紧张');
  });
});

// ----------------------------------------------------------------
// 缺失模板时走硬编码 fallback
// ----------------------------------------------------------------
describe('Vault 缺失模板时走 fallback', () => {
  beforeEach(async () => {
    // 写一个模板 JSON，但不包含目标 taskType
    await fs.writeFile(
      path.join(tmpDir, 'templates.json'),
      JSON.stringify([
        {
          id: 'tpl-other',
          taskType: 'some.other.task',
          title: '不相关模板',
          systemTemplate: 'irrelevant',
          userTemplate: 'irrelevant',
        },
      ]),
    );
  });

  it('templates.json 存在但无匹配模板时走 fallback', async () => {
    const result = await buildPrompt('novel.generateChapter', {
      world: 'fallback 世界',
      userPrompt: 'fallback 提示',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.templateId).toBeNull();
    expect(result.userContent).toContain('fallback 世界');
    expect(result.userContent).toContain('fallback 提示');
  });
});

// ----------------------------------------------------------------
// templates.json 解析错误
// ----------------------------------------------------------------
describe('templates.json 解析错误', () => {
  beforeEach(async () => {
    // 写一个非法 JSON
    await fs.writeFile(path.join(tmpDir, 'templates.json'), 'not-json{', 'utf-8');
  });

  it('JSON 语法错误时抛出明确错误', async () => {
    await expect(
      buildPrompt('novel.generateChapter', { userPrompt: 'test' }),
    ).rejects.toThrow('templates.json 解析失败');
  });
});
