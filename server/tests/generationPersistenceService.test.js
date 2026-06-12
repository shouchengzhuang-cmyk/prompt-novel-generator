import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import generationPersistenceModule from '../services/generationPersistenceService.js';
import generationHelpersModule from '../services/generationHelpers.js';
import storage from '../services/storage.js';

const { createGenerationPersistenceService } = generationPersistenceModule;
const {
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
} = generationHelpersModule;

let tmpDir;
let chaptersDir;

function countChars(text) {
  return text ? text.replace(/\s/g, '').length : 0;
}

function extractTitleFromContent(content, chapterNumber) {
  const heading = content.split('\n').find((line) => /^#{1,3}\s+/.test(line.trim()));
  return heading ? heading.trim().replace(/^#{1,3}\s+/, '') : `第${chapterNumber}章`;
}

function createService(overrides = {}) {
  return createGenerationPersistenceService({
    ensureDir: (dir) => fs.mkdir(dir, { recursive: true }),
    readChapterIndex: async (dir) => {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8'));
      } catch {
        return [];
      }
    },
    writeChapterIndex: (dir, entries) => storage.writeJson(path.join(dir, 'index.json'), entries),
    extractTitleFromContent,
    countChars,
    getNextChapterNumber,
    formatChapterFileName,
    buildGeneratedChapterIndexEntry,
    now: () => '2026-06-12T00:00:00.000Z',
    ...overrides,
  });
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-generation-persistence-'));
  chaptersDir = path.join(tmpDir, 'chapters');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('generationPersistenceService', () => {
  it('写入正文、更新 index，并返回 done 所需的完整元数据', async () => {
    await fs.mkdir(chaptersDir, { recursive: true });
    await fs.writeFile(path.join(chaptersDir, '001.txt'), '旧章节', 'utf8');
    await storage.writeJson(path.join(chaptersDir, 'index.json'), [{ fileName: '001.txt', title: '旧章节' }]);

    const { persistGeneratedChapter } = createService();
    const result = await persistGeneratedChapter({
      chaptersDir,
      content: '# 新标题\n正文 内容',
      userPrompt: ' 继续写下一章 ',
    });

    expect(await fs.readFile(path.join(chaptersDir, '002.txt'), 'utf8')).toBe('# 新标题\n正文 内容');
    const indexEntries = JSON.parse(await fs.readFile(path.join(chaptersDir, 'index.json'), 'utf8'));
    expect(indexEntries).toHaveLength(2);
    expect(indexEntries[1]).toEqual({
      fileName: '002.txt',
      title: '新标题',
      createdAt: '2026-06-12T00:00:00.000Z',
      userPrompt: '继续写下一章',
      activeVersionId: 'v-original',
      wordCount: 8,
      versions: [{
        id: 'v-original',
        title: '新标题',
        userPrompt: '继续写下一章',
        createdAt: '2026-06-12T00:00:00.000Z',
      }],
    });
    expect(result).toEqual({
      fileName: '002.txt',
      title: '新标题',
      wordCount: 8,
      chapterNumber: 2,
      chapterEntry: indexEntries[1],
      finalContent: '# 新标题\n正文 内容',
    });
  });

  it('没有现有章节时保持 001.txt 和 v-original 行为', async () => {
    const { persistGeneratedChapter } = createService();
    const result = await persistGeneratedChapter({ chaptersDir, content: '正文', userPrompt: undefined });

    expect(result.fileName).toBe('001.txt');
    expect(result.chapterNumber).toBe(1);
    expect(result.chapterEntry).toMatchObject({
      activeVersionId: 'v-original',
      userPrompt: '',
      versions: [{ id: 'v-original', userPrompt: '' }],
    });
  });

  it('正文写入失败时抛错且不写入 index', async () => {
    const writeChapterIndex = vi.fn();
    const writeError = new Error('write failed');
    const { persistGeneratedChapter } = createService({
      writeChapterIndex,
      storageService: { writeText: vi.fn().mockRejectedValue(writeError) },
    });

    await expect(persistGeneratedChapter({ chaptersDir, content: '正文', userPrompt: '继续' }))
      .rejects.toBe(writeError);
    expect(writeChapterIndex).not.toHaveBeenCalled();
  });

  it('index 写入失败时抛错，不静默成功', async () => {
    const indexError = new Error('index failed');
    const { persistGeneratedChapter } = createService({
      writeChapterIndex: vi.fn().mockRejectedValue(indexError),
    });

    await expect(persistGeneratedChapter({ chaptersDir, content: '正文', userPrompt: '继续' }))
      .rejects.toBe(indexError);
  });
});
