import { describe, expect, it, vi } from 'vitest';
import { parseSSEStream } from './sseReader';

const encoder = new TextEncoder();

function createFakeReader(chunks) {
  let i = 0;
  return {
    read: async () => {
      if (i < chunks.length) {
        return { done: false, value: encoder.encode(chunks[i++]) };
      }
      return { done: true };
    },
  };
}

function sseLine(obj) {
  return 'data: ' + JSON.stringify(obj) + '\n';
}

describe('parseSSEStream', () => {
  it('分派 chunk 事件', async () => {
    const onChunk = vi.fn();
    const reader = createFakeReader([
      sseLine({ type: 'chunk', content: '你' }) +
      sseLine({ type: 'chunk', content: '好' }),
    ]);

    await parseSSEStream(reader, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenNthCalledWith(1, '你');
    expect(onChunk).toHaveBeenNthCalledWith(2, '好');
  });

  it('分派 done 事件', async () => {
    const onDone = vi.fn();
    const event = { type: 'done', fileName: '001.txt', content: '完成', title: '第一章' };
    const reader = createFakeReader([sseLine(event)]);

    await parseSSEStream(reader, { onDone });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(event);
  });

  it('分派 error 事件并抛出', async () => {
    const onError = vi.fn((msg) => { throw new Error(msg); });
    const reader = createFakeReader([
      sseLine({ type: 'error', message: '生成失败' }),
    ]);

    await expect(
      parseSSEStream(reader, { onError })
    ).rejects.toThrow('生成失败');
    expect(onError).toHaveBeenCalledWith('生成失败');
  });

  it('跨 read 拼接半包 JSON', async () => {
    const onChunk = vi.fn();
    // 单个 data 行被切在两段 read 之间
    const reader = createFakeReader([
      'data: {"type":"chunk","content":"半',
      '包"}\n',
    ]);

    await parseSSEStream(reader, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('半包');
  });

  it('忽略空行和非 data 行', async () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const reader = createFakeReader([
      '\n' +
      'event: message\n' +
      ':comment\n' +
      '无关文本\n' +
      sseLine({ type: 'chunk', content: '正文' }) +
      '\n' +
      sseLine({ type: 'done', fileName: '003.txt' }),
    ]);

    await parseSSEStream(reader, { onChunk, onDone });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('正文');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('每次 read 后调用 onReadCycle', async () => {
    const onReadCycle = vi.fn();
    const reader = createFakeReader([
      sseLine({ type: 'chunk', content: 'a' }),
      sseLine({ type: 'chunk', content: 'b' }),
      sseLine({ type: 'chunk', content: 'c' }),
    ]);

    await parseSSEStream(reader, { onReadCycle });

    // 3 次 read (有 value) → 3 次 onReadCycle；最后 done 不触发
    expect(onReadCycle).toHaveBeenCalledTimes(3);
  });

  it('chunk 缺少 content 时传空字符串', async () => {
    const onChunk = vi.fn();
    const reader = createFakeReader([
      sseLine({ type: 'chunk' }),
    ]);

    await parseSSEStream(reader, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('');
  });

  it('malformed JSON 静默忽略不抛出', async () => {
    const onChunk = vi.fn();
    const reader = createFakeReader([
      'data: {broken\n' +
      sseLine({ type: 'chunk', content: '正常' }),
    ]);

    await parseSSEStream(reader, { onChunk });

    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onChunk).toHaveBeenCalledWith('正常');
  });

  it('单次 read 内含多种事件', async () => {
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const reader = createFakeReader([
      sseLine({ type: 'chunk', content: '你好' }) +
      sseLine({ type: 'done', fileName: '002.txt', content: '完成' }),
    ]);

    await parseSSEStream(reader, { onChunk, onDone });

    expect(onChunk).toHaveBeenCalledWith('你好');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('onError 不传 message 时使用默认文案', async () => {
    const onError = vi.fn((msg) => { throw new Error(msg); });
    const reader = createFakeReader([
      sseLine({ type: 'error' }),
    ]);

    await expect(
      parseSSEStream(reader, { onError })
    ).rejects.toThrow('生成失败');
  });

  it('所有回调都可选，不传不报错', async () => {
    const reader = createFakeReader([
      sseLine({ type: 'chunk', content: '测试' }),
      sseLine({ type: 'done', fileName: '004.txt' }),
      sseLine({ type: 'error', message: 'err' }),
    ]);

    // 不传任何回调 → 不抛错（error 事件需要 onError 抛才抛）
    await parseSSEStream(reader, {});
  });
});
