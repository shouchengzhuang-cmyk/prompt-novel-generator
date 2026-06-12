import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';

let app;
let request;
let tmpDir;
let agent;
let streamResponses;

const encoder = new TextEncoder();

function createStreamResponse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function createErroringStreamResponse(firstChunk, message = 'stream failed') {
  let sent = false;
  return new Response(new ReadableStream({
    pull(controller) {
      if (!sent && firstChunk) {
        sent = true;
        controller.enqueue(encoder.encode(firstChunk));
        return;
      }
      controller.error(new Error(message));
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function createDeferredStreamResponse() {
  let controller;
  const response = new Response(new ReadableStream({
    start(value) {
      controller = value;
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  return {
    response,
    finish(content) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  };
}

function parseSse(raw) {
  return raw
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => {
      expect(frame.startsWith('data: ')).toBe(true);
      return JSON.parse(frame.slice(6));
    });
}

function postGenerate(projectName, onData) {
  return agent
    .post('/api/generate-stream')
    .send({ projectName, userPrompt: '继续写', model: 'deepseek-v4-flash' })
    .buffer(true)
    .parse((res, callback) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
        onData?.(raw);
      });
      res.on('end', () => callback(null, raw));
    });
}

async function createProject(projectName) {
  const projectDir = path.join(tmpDir, projectName);
  const chaptersDir = path.join(projectDir, 'chapters');
  await fs.mkdir(chaptersDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(projectDir, 'world.md'), '测试世界观', 'utf8'),
    fs.writeFile(path.join(projectDir, 'characters.md'), '测试人物', 'utf8'),
    fs.writeFile(path.join(projectDir, 'style.md'), '测试文风', 'utf8'),
    fs.writeFile(path.join(projectDir, 'summary.md'), '测试摘要', 'utf8'),
    fs.writeFile(path.join(projectDir, 'editorial-memory.md'), '', 'utf8'),
    fs.writeFile(path.join(chaptersDir, 'index.json'), '[]', 'utf8'),
  ]);
  return { projectDir, chaptersDir };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-generate-stream-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.SESSION_SECRET = 'generate-stream-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.stream) {
      const next = streamResponses.shift();
      if (!next) throw new Error('missing mocked stream response');
      return next;
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '后台更新内容' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));

  request = (await import('supertest')).default;
  app = (await import('../index.js')).default;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ pin: '0000' });
});

beforeEach(() => {
  streamResponses = [];
  vi.mocked(fetch).mockClear();
});

afterAll(async () => {
  // Successful streams schedule summary/editorial-memory work after the SSE response ends.
  await new Promise((resolve) => setTimeout(resolve, 100));
  vi.unstubAllGlobals();
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('POST /api/generate-stream', () => {
  it('保持 SSE header、chunk/done 帧格式，并在 done 前完成正文和索引落盘', async () => {
    const { chaptersDir } = await createProject('stream-success');
    const firstPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: '# 第一章\n' } }] })}\n\n`;
    const secondPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: '正文 内容' } }] })}\n\n`;
    streamResponses.push(createStreamResponse([firstPayload, secondPayload, 'data: [DONE]\n\n']));

    let doneSnapshot;
    const res = await postGenerate('stream-success', (raw) => {
      if (!doneSnapshot && raw.includes('"type":"done"')) {
        doneSnapshot = {
          content: fsSync.readFileSync(path.join(chaptersDir, '001.txt'), 'utf8'),
          index: JSON.parse(fsSync.readFileSync(path.join(chaptersDir, 'index.json'), 'utf8')),
        };
      }
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(doneSnapshot.content).toBe('# 第一章\n正文 内容');
    expect(doneSnapshot.index).toHaveLength(1);
    expect(doneSnapshot.index[0]).toMatchObject({
      fileName: '001.txt',
      title: '第一章',
      activeVersionId: 'v-original',
      wordCount: 8,
    });

    const events = parseSse(res.body);
    expect(events.map((event) => event.type)).toEqual(['chunk', 'chunk', 'done']);
    expect(events[0]).toEqual({ type: 'chunk', content: '# 第一章\n' });
    expect(events[1]).toEqual({ type: 'chunk', content: '正文 内容' });
    expect(events[2]).toMatchObject({
      type: 'done',
      fileName: '001.txt',
      title: '第一章',
      content: '# 第一章\n正文 内容',
      wordCount: 8,
    });
  });

  it('能拼接被拆在多个网络 chunk 中的 DeepSeek JSON，并忽略 [DONE]', async () => {
    await createProject('split-json');
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: '拆包成功' } }] })}\n\n`;
    streamResponses.push(createStreamResponse([
      payload.slice(0, 11),
      payload.slice(11, 25),
      payload.slice(25),
      'data: [DONE]\n\n',
    ]));

    const res = await postGenerate('split-json');
    const events = parseSse(res.body);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'chunk', content: '拆包成功' });
    expect(events[1]).toMatchObject({ type: 'done', content: '拆包成功' });
  });

  it('上游非 200 时发送 error event，结束响应并释放项目锁', async () => {
    await createProject('upstream-error');
    streamResponses.push(new Response(JSON.stringify({ error: { message: 'upstream rejected' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }));
    const failed = await postGenerate('upstream-error');
    expect(parseSse(failed.body)).toEqual([{ type: 'error', message: 'upstream rejected' }]);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '重试成功' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    const retried = await postGenerate('upstream-error');
    expect(retried.status).toBe(200);
    expect(parseSse(retried.body).at(-1)).toMatchObject({ type: 'done', content: '重试成功' });
  });

  it('空流发送 error event，不落盘，并释放项目锁', async () => {
    const { chaptersDir } = await createProject('empty-stream');
    streamResponses.push(createStreamResponse(['data: [DONE]\n\n']));
    const failed = await postGenerate('empty-stream');
    expect(parseSse(failed.body)).toEqual([{ type: 'error', message: 'API 返回内容为空' }]);
    expect(await fs.readdir(chaptersDir)).toEqual(['index.json']);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '锁已释放' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postGenerate('empty-stream')).status).toBe(200);
  });

  it('读取上游流中途异常时发送 error event，并释放项目锁', async () => {
    await createProject('stream-exception');
    const firstChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: '半段内容' } }] })}\n\n`;
    streamResponses.push(createErroringStreamResponse(firstChunk, 'network interrupted'));
    const failed = await postGenerate('stream-exception');
    expect(parseSse(failed.body)).toEqual([
      { type: 'chunk', content: '半段内容' },
      { type: 'error', message: 'network interrupted' },
    ]);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '异常后重试' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postGenerate('stream-exception')).status).toBe(200);
  });

  it('同一项目并发生成保持既有 409 冲突行为，首个请求完成后释放锁', async () => {
    await createProject('concurrent-stream');
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ pin: '0000' });
    const deferred = createDeferredStreamResponse();
    streamResponses.push(deferred.response);

    const firstRequest = postGenerate('concurrent-stream').then((response) => response);
    while (vi.mocked(fetch).mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const conflict = await secondAgent
      .post('/api/generate-stream')
      .send({ projectName: 'concurrent-stream', userPrompt: '再次生成', model: 'deepseek-v4-flash' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toContain('当前项目正在生成或保存');

    deferred.finish('首个请求完成');
    const first = await firstRequest;
    expect(parseSse(first.body).at(-1)).toMatchObject({ type: 'done', content: '首个请求完成' });

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '后续请求' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postGenerate('concurrent-stream')).status).toBe(200);
  });
});
