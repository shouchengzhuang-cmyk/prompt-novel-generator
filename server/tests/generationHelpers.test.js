import { describe, expect, it } from 'vitest';

const {
  resolveGenerationModel,
  getNextChapterNumber,
  formatChapterFileName,
  buildGeneratedChapterIndexEntry,
  appendAndExtractSseLines,
  parseDeepSeekSseLine,
} = require('../services/generationHelpers');

describe('generationHelpers', () => {
  it('保持生成模型白名单和默认模型行为', () => {
    expect(resolveGenerationModel('deepseek-v4-flash')).toBe('deepseek-v4-flash');
    expect(resolveGenerationModel('deepseek-v4-pro')).toBe('deepseek-v4-pro');
    expect(resolveGenerationModel('unknown')).toBe('deepseek-v4-flash');
    expect(resolveGenerationModel(undefined)).toBe('deepseek-v4-flash');
  });

  it('按现有章节文件计算下一编号并忽略非章节文件', () => {
    expect(getNextChapterNumber([])).toBe(1);
    expect(getNextChapterNumber(['index.json', '001.txt', '002.txt', 'notes.txt'])).toBe(3);
    expect(getNextChapterNumber(['001.txt', '010.txt', 'variants'])).toBe(11);
  });

  it('保持三位章节文件名格式且不截断更大编号', () => {
    expect(formatChapterFileName(1)).toBe('001.txt');
    expect(formatChapterFileName(12)).toBe('012.txt');
    expect(formatChapterFileName(1000)).toBe('1000.txt');
  });

  it('构造与现有生成逻辑一致的章节索引项', () => {
    expect(buildGeneratedChapterIndexEntry({
      fileName: '003.txt',
      title: '第三章',
      userPrompt: '继续写',
      wordCount: 123,
      createdAt: '2026-06-12T00:00:00.000Z',
    })).toEqual({
      fileName: '003.txt',
      title: '第三章',
      createdAt: '2026-06-12T00:00:00.000Z',
      userPrompt: '继续写',
      activeVersionId: 'v-original',
      wordCount: 123,
      versions: [{
        id: 'v-original',
        title: '第三章',
        userPrompt: '继续写',
        createdAt: '2026-06-12T00:00:00.000Z',
      }],
    });
  });

  it('拼接跨网络 chunk 的 SSE buffer 并只返回完整行', () => {
    const first = appendAndExtractSseLines('', 'data: {"choices":[{"del');
    expect(first).toEqual({ lines: [], buffer: 'data: {"choices":[{"del' });

    const second = appendAndExtractSseLines(first.buffer, 'ta":{"content":"ok"}}]}\n\ndata: [DONE]\n');
    expect(second.lines).toEqual([
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
      '',
      'data: [DONE]',
    ]);
    expect(second.buffer).toBe('');
  });

  it('解析 DeepSeek data 行、[DONE] 并忽略无效输入', () => {
    expect(parseDeepSeekSseLine('data: {"choices":[{"delta":{"content":"片段"}}]}')).toEqual({
      done: false,
      content: '片段',
    });
    expect(parseDeepSeekSseLine('data: [DONE]')).toEqual({ done: true });
    expect(parseDeepSeekSseLine('event: message')).toBeNull();
    expect(parseDeepSeekSseLine('data: invalid-json')).toBeNull();
    expect(parseDeepSeekSseLine('data: {"choices":[{"delta":{}}]}')).toBeNull();
  });
});
