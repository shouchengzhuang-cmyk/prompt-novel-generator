import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const { createGenerationContextService } = require('../services/generationContextService');
const { resolveGenerationModel } = require('../services/generationHelpers');

let tmpDir;
let projectDir;
let chaptersDir;

async function readChapterIndex(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf-8'));
  } catch {
    return [];
  }
}

async function readVariants(dir, fileName) {
  try {
    const base = fileName.replace(/\.txt$/, '');
    const data = JSON.parse(await fs.readFile(path.join(dir, 'variants', `${base}.json`), 'utf-8'));
    return data.variants || [];
  } catch {
    return [];
  }
}

function createService(overrides = {}) {
  return createGenerationContextService({
    safeProjectDir: () => projectDir,
    ensureDir: (dir) => fs.mkdir(dir, { recursive: true }),
    readEditorialMemory: async () => '',
    selectEditorialMemoryForPrompt: (content) => content,
    readOutline: async () => [],
    readChapterIndex,
    readVariants,
    buildPrompt: async (_taskType, context) => ({
      systemContent: 'system',
      userContent: `## 世界观设定\n${context.world}\n\n## 最近章节\n${context.recentChapters}\n\n## 本次续写要求\n${context.userPrompt}`,
      templateId: 'test-template',
      templateTitle: '测试模板',
      usedFallback: false,
    }),
    resolveGenerationModel,
    recentChapterLimit: 10,
    ...overrides,
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-generation-context-'));
  projectDir = path.join(tmpDir, 'test-project');
  chaptersDir = path.join(projectDir, 'chapters');
  await fs.mkdir(projectDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('generationContextService', () => {
  it('settings 和 chapters 缺失时保持空字符串 fallback 与返回结构', async () => {
    const { prepareGenerationContext } = createService();
    const result = await prepareGenerationContext({
      projectName: 'test-project',
      userPrompt: '  继续写  ',
      model: 'unknown-model',
    });

    expect(result).toEqual({
      projectDir,
      chaptersDir,
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: '## 世界观设定\n\n\n## 最近章节\n\n\n## 本次续写要求\n继续写' },
      ],
      effectiveModel: 'deepseek-v4-flash',
      debugPromptInfo: {
        taskType: 'novel.generateChapter',
        templateId: 'test-template',
        templateTitle: '测试模板',
        usedFallback: false,
      },
    });
    await expect(fs.stat(chaptersDir)).resolves.toBeDefined();
  });

  it('最近章节保持文件名顺序，跳过 stale，并读取 active variant 内容', async () => {
    await fs.mkdir(path.join(chaptersDir, 'variants'), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(projectDir, 'world.md'), '世界', 'utf-8'),
      fs.writeFile(path.join(chaptersDir, '001.txt'), '第一章原文', 'utf-8'),
      fs.writeFile(path.join(chaptersDir, '002.txt'), '第二章原文', 'utf-8'),
      fs.writeFile(path.join(chaptersDir, '003.txt'), '第三章原文', 'utf-8'),
      fs.writeFile(path.join(chaptersDir, 'index.json'), JSON.stringify([
        { fileName: '001.txt', activeVersionId: 'v-original' },
        { fileName: '002.txt', staleAfterRewrite: true },
        { fileName: '003.txt', activeVersionId: 'v-active' },
      ]), 'utf-8'),
      fs.writeFile(path.join(chaptersDir, 'variants', '003.json'), JSON.stringify({
        fileName: '003.txt',
        variants: [{ id: 'v-active', content: '第三章候选正文' }],
      }), 'utf-8'),
    ]);

    const buildPrompt = vi.fn(async (_taskType, context) => ({
      systemContent: 'system',
      userContent: `## 最近章节\n${context.recentChapters}\n\n## 本次续写要求\n${context.userPrompt}`,
      templateId: null,
      templateTitle: null,
      usedFallback: true,
    }));
    const { prepareGenerationContext } = createService({ buildPrompt });
    const result = await prepareGenerationContext({ projectName: 'test-project', userPrompt: '继续', model: 'deepseek-v4-pro' });

    expect(buildPrompt).toHaveBeenCalledWith('novel.generateChapter', expect.objectContaining({
      world: '世界',
      recentChapters: '--- 001.txt ---\n第一章原文\n\n--- 003.txt ---\n第三章候选正文',
      userPrompt: '继续',
    }));
    expect(result.effectiveModel).toBe('deepseek-v4-pro');
    expect(result.debugPromptInfo.usedFallback).toBe(true);
  });

  it('保持编辑记忆先于最近章节、outline 先于续写要求的注入顺序', async () => {
    await fs.mkdir(chaptersDir, { recursive: true });
    await fs.writeFile(path.join(chaptersDir, '001.txt'), '第一章', 'utf-8');
    const { prepareGenerationContext } = createService({
      readEditorialMemory: async () => '长期记忆',
      selectEditorialMemoryForPrompt: (content, maxChars) => `${content}-${maxChars}`,
      readOutline: async () => [{
        number: 2,
        goal: '推进主线',
        keyEvents: ['相遇', '冲突'],
        characterChanges: '关系缓和',
        status: 'planned',
      }],
    });

    const result = await prepareGenerationContext({ projectName: 'test-project', userPrompt: '继续', model: undefined });
    const userContent = result.messages[1].content;
    const memoryIndex = userContent.indexOf('## 项目编辑记忆');
    const chaptersIndex = userContent.indexOf('## 最近章节');
    const planIndex = userContent.indexOf('## 本章规划');
    const promptIndex = userContent.indexOf('## 本次续写要求');

    expect(memoryIndex).toBeGreaterThan(-1);
    expect(memoryIndex).toBeLessThan(chaptersIndex);
    expect(userContent).toContain('长期记忆-2000');
    expect(planIndex).toBeGreaterThan(chaptersIndex);
    expect(planIndex).toBeLessThan(promptIndex);
    expect(userContent).toContain('关键事件：\n- 相遇\n- 冲突');
    expect(userContent).toContain('人物变化：关系缓和');
    expect(userContent).toContain('状态：planned');
  });

  it('保持缺少项目名和续写要求的 400 错误', async () => {
    const { prepareGenerationContext } = createService();
    await expect(prepareGenerationContext({ projectName: '', userPrompt: '继续' }))
      .rejects.toMatchObject({ message: '缺少项目名', statusCode: 400 });
    await expect(prepareGenerationContext({ projectName: 'test-project', userPrompt: '  ' }))
      .rejects.toMatchObject({ message: '缺少续写要求', statusCode: 400 });
  });
});
