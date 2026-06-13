import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmpDir;
let helpers;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-shared-helpers-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.SESSION_SECRET = 'test-session-secret-no-real';
  process.env.XIAOMOXIA_PIN = '0000';
  process.env.DEEPSEEK_API_KEY = 'test-key-no-real-request';

  const app = (await import('../index.js')).default;
  helpers = app.__testHelpers;
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(async () => {
  const entries = await fs.readdir(tmpDir);
  await Promise.all(entries.map((entry) => fs.rm(path.join(tmpDir, entry), {
    recursive: true,
    force: true,
  })));
});

afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  delete process.env.DEEPSEEK_API_KEY;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createChaptersDir(projectName = 'helper-project') {
  const chaptersDir = path.join(tmpDir, projectName, 'chapters');
  await fs.mkdir(chaptersDir, { recursive: true });
  return chaptersDir;
}

describe('active chapter content helpers', () => {
  it('reads the chapter text when no active variant is available', async () => {
    const chaptersDir = await createChaptersDir();
    await fs.writeFile(path.join(chaptersDir, '001.txt'), 'chapter text', 'utf8');

    await expect(helpers.readActiveChapterContent(chaptersDir, { fileName: '001.txt' }))
      .resolves.toBe('chapter text');
  });

  it('reads the selected candidate and falls back to chapter text when it is missing', async () => {
    const chaptersDir = await createChaptersDir();
    await fs.writeFile(path.join(chaptersDir, '001.txt'), 'chapter text', 'utf8');
    await helpers.writeVariants(chaptersDir, '001.txt', [
      { id: 'v-original', content: 'original snapshot' },
      { id: 'v-2', content: 'candidate text' },
    ]);

    await expect(helpers.readActiveChapterContent(chaptersDir, {
      fileName: '001.txt',
      activeVersionId: 'v-2',
    })).resolves.toBe('candidate text');
    await expect(helpers.readActiveChapterContent(chaptersDir, {
      fileName: '001.txt',
      activeVersionId: 'v-missing',
    })).resolves.toBe('chapter text');
  });

  it('uses the stored v-original content without changing the variant list', async () => {
    const chaptersDir = await createChaptersDir();
    await fs.writeFile(path.join(chaptersDir, '001.txt'), 'chapter text', 'utf8');
    const variants = [{ id: 'v-original', content: 'original snapshot' }];
    await helpers.writeVariants(chaptersDir, '001.txt', variants);

    await expect(helpers.readActiveChapterContent(chaptersDir, {
      fileName: '001.txt',
      activeVersionId: 'v-original',
    })).resolves.toBe('original snapshot');
    await expect(helpers.readVariants(chaptersDir, '001.txt')).resolves.toEqual(variants);
  });

  it('preserves invalid-name and missing-file failures', async () => {
    const chaptersDir = await createChaptersDir();

    await expect(helpers.readActiveChapterContent(chaptersDir, { fileName: '../001.txt' }))
      .rejects.toThrow();
    await expect(helpers.readActiveChapterContent(chaptersDir, { fileName: '999.txt' }))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('chapter index helpers', () => {
  it('returns an empty index for missing or invalid index files', async () => {
    const chaptersDir = await createChaptersDir();
    await expect(helpers.readChapterIndex(chaptersDir)).resolves.toEqual([]);

    await fs.writeFile(path.join(chaptersDir, 'index.json'), '{invalid', 'utf8');
    await expect(helpers.readChapterIndex(chaptersDir)).resolves.toEqual([]);
  });

  it('round-trips the index structure without dropping metadata', async () => {
    const chaptersDir = await createChaptersDir();
    const entries = [{
      fileName: '001.txt',
      title: 'Title',
      activeVersion: 'v-2',
      activeVersionId: 'v-2',
      versions: [{ id: 'v-original' }, { id: 'v-2' }],
      usedEventCards: ['card-a'],
    }];

    await helpers.writeChapterIndex(chaptersDir, entries);
    await expect(helpers.readChapterIndex(chaptersDir)).resolves.toEqual(entries);
  });

  it('updates only wordCount and preserves version and event-card fields', async () => {
    const chaptersDir = await createChaptersDir();
    await fs.writeFile(path.join(chaptersDir, '001.txt'), 'one two\nthree', 'utf8');
    const entry = {
      fileName: '001.txt',
      activeVersionId: 'v-2',
      versions: [{ id: 'v-original' }, { id: 'v-2' }],
      usedEventCards: ['card-a'],
      staleAfterRewrite: true,
    };
    await helpers.writeChapterIndex(chaptersDir, [entry]);

    await expect(helpers.updateChapterWordCount(chaptersDir, '001.txt')).resolves.toBe(11);
    await expect(helpers.readChapterIndex(chaptersDir)).resolves.toEqual([{
      ...entry,
      wordCount: 11,
    }]);
    await expect(helpers.updateChapterWordCount(chaptersDir, 'missing.txt')).resolves.toBe(0);
  });

  it('clears stale fields and marks only following entries while preserving metadata', () => {
    const staleAt = 123456;
    const chapters = [
      { fileName: '001.txt', usedEventCards: ['before'] },
      {
        fileName: '002.txt',
        staleAfterRewrite: true,
        staleReason: 'old',
        staleFromFileName: '001.txt',
        staleAt: 1,
        activeVersionId: 'v-2',
      },
      { fileName: '003.txt', versions: [{ id: 'v-original' }], usedEventCards: ['after'] },
    ];

    const result = helpers.markChaptersStaleAfterRewrite(chapters, '002.txt', staleAt);
    expect(result[0]).toEqual(chapters[0]);
    expect(result[1]).toEqual({ fileName: '002.txt', activeVersionId: 'v-2' });
    expect(result[2]).toMatchObject({
      fileName: '003.txt',
      versions: [{ id: 'v-original' }],
      usedEventCards: ['after'],
      staleAfterRewrite: true,
      staleFromFileName: '002.txt',
      staleAt,
    });
    expect(helpers.markChaptersStaleAfterRewrite(chapters, '999.txt', staleAt)).toBe(chapters);

    const entry = { fileName: '004.txt', staleAfterRewrite: true, staleReason: 'x', staleAt: 2 };
    helpers.clearRewriteStaleMarker(entry);
    expect(entry).toEqual({ fileName: '004.txt' });
  });
});

describe('variant storage helpers', () => {
  it('returns an empty list for missing or malformed variant files', async () => {
    const chaptersDir = await createChaptersDir();
    await expect(helpers.readVariants(chaptersDir, '001.txt')).resolves.toEqual([]);

    const variantsDir = path.join(chaptersDir, 'variants');
    await fs.mkdir(variantsDir, { recursive: true });
    await fs.writeFile(path.join(variantsDir, '001.json'), JSON.stringify({ variants: {} }), 'utf8');
    await expect(helpers.readVariants(chaptersDir, '001.txt')).resolves.toEqual([]);
  });

  it('writes the existing envelope and preserves versions and usedEventCards exactly', async () => {
    const chaptersDir = await createChaptersDir();
    const variants = [
      { id: 'v-original', content: 'original', usedEventCards: ['card-a'] },
      { id: 'v-2', content: 'candidate', usedEventCards: ['card-b'] },
    ];

    await helpers.writeVariants(chaptersDir, '001.txt', variants);
    const raw = JSON.parse(await fs.readFile(path.join(chaptersDir, 'variants', '001.json'), 'utf8'));
    expect(raw).toEqual({ fileName: '001.txt', variants });
    expect(raw.variants.filter((variant) => variant.id === 'v-original')).toHaveLength(1);
    await expect(helpers.readVariants(chaptersDir, '001.txt')).resolves.toEqual(variants);
  });

  it('keeps variant paths inside the variants directory', async () => {
    const chaptersDir = await createChaptersDir();
    expect(helpers.variantsFilePath(chaptersDir, '001.txt'))
      .toBe(path.join(chaptersDir, 'variants', '001.json'));
    await expect(helpers.writeVariants(chaptersDir, '../001.txt', []))
      .rejects.toThrow();
  });
});

describe('text and path helpers', () => {
  it('accepts only the current chapter filename format', () => {
    expect(helpers.isValidChapterFileName('001.txt')).toBe(true);
    expect(helpers.isValidChapterFileName('1000.txt')).toBe(true);
    expect(helpers.isValidChapterFileName('01.txt')).toBe(false);
    expect(helpers.isValidChapterFileName('../001.txt')).toBe(false);
    expect(helpers.isValidChapterFileName('001.json')).toBe(false);
  });

  it('keeps title extraction and whitespace-free character counting behavior', () => {
    expect(helpers.extractTitleFromContent('\n## Stable Title\nBody', 1)).toBe('Stable Title');
    expect(helpers.countChars(' one two\nthree\t')).toBe(11);
    expect(helpers.countChars('')).toBe(0);
  });

  it('keeps project paths inside NOVELS_DIR', () => {
    expect(helpers.safeProjectDir('valid-project')).toBe(path.join(tmpDir, 'valid-project'));
    expect(() => helpers.safeProjectDir('../outside')).toThrow();
    expect(() => helpers.safeProjectDir('bad/name')).toThrow();
  });
});

describe('editorial memory helpers', () => {
  it('creates the default file when missing and reads and writes the same project path', async () => {
    const expectedPath = path.join(tmpDir, 'memory-project', 'editorial-memory.md');
    expect(helpers.getEditorialMemoryPath('memory-project')).toBe(expectedPath);
    await expect(helpers.readEditorialMemory('memory-project'))
      .resolves.toBe(helpers.DEFAULT_EDITORIAL_MEMORY);
    await expect(fs.readFile(expectedPath, 'utf8')).resolves.toBe(helpers.DEFAULT_EDITORIAL_MEMORY);

    await helpers.writeEditorialMemory('memory-project', 'custom memory');
    await expect(helpers.readEditorialMemory('memory-project')).resolves.toBe('custom memory');
  });

  it('replaces an existing chapter block and appends a missing block', () => {
    const oldBlock = '<!-- chapter-memory:start 001.txt -->\nold\n<!-- chapter-memory:end 001.txt -->';
    const newBlock = '<!-- chapter-memory:start 001.txt -->\nnew\n<!-- chapter-memory:end 001.txt -->';
    const memory = `Header\n\n${oldBlock}\n\nTail`;
    expect(helpers.replaceChapterMemoryBlock(memory, '001.txt', newBlock))
      .toBe(`Header\n\n${newBlock}\n\nTail`);

    const appended = helpers.replaceChapterMemoryBlock('Header', '002.txt',
      '<!-- chapter-memory:start 002.txt -->\nnext\n<!-- chapter-memory:end 002.txt -->');
    expect(appended).toContain('<!-- chapter-memory:start 002.txt -->');
  });

  it('keeps prompt selection bounded and retains recent chapter blocks', () => {
    const blocks = [1, 2, 3, 4].map((number) => (
      `<!-- chapter-memory:start 00${number}.txt -->\nblock-${number}\n` +
      `<!-- chapter-memory:end 00${number}.txt -->`
    ));
    const memory = `Header\n\n## chapter section\n\n${blocks.join('\n\n')}`;
    const selected = helpers.selectEditorialMemoryForPrompt(memory, 220);
    expect(selected.length).toBeLessThanOrEqual(220 + 50);
    expect(selected).toContain('block-4');
  });

  it('uses a local AI mock when updating memory and never makes a real request', async () => {
    const chaptersDir = await createChaptersDir('ai-memory-project');
    await fs.writeFile(path.join(chaptersDir, '001.txt'), 'chapter content', 'utf8');
    await helpers.writeChapterIndex(chaptersDir, [{ fileName: '001.txt', title: 'Chapter One' }]);
    await helpers.writeEditorialMemory('ai-memory-project', 'Memory header');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'mocked editorial note' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await helpers.updateEditorialMemoryForChapter('ai-memory-project', '001.txt');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = await fs.readFile(path.join(tmpDir, 'ai-memory-project', 'editorial-memory.md'), 'utf8');
    expect(saved).toContain('<!-- chapter-memory:start 001.txt -->');
    expect(saved).toContain('mocked editorial note');
    expect(saved).toContain('<!-- chapter-memory:end 001.txt -->');
  });
});
