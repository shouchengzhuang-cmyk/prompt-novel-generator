/**
 * 通用 SSE 流读取器 — 从 ReadableStream reader 中逐行解析 SSE data: JSON。
 * onReadCycle 在每次 read() 完成后调用，用于 generate 路径的冗余渲染刷新。
 */
export async function parseSSEStream(reader, { onChunk, onDone, onError, onReadCycle }) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      try {
        const event = JSON.parse(trimmed.slice(6));
        if (event.type === 'chunk') {
          onChunk?.(event.content || '');
        } else if (event.type === 'done') {
          onDone?.(event);
        } else if (event.type === 'error') {
          onError?.(event.message || '生成失败');
        }
      } catch (error) {
        if (error?.message && !error.message.includes('JSON')) {
          throw error;
        }
      }
    }

    onReadCycle?.();
  }
}
