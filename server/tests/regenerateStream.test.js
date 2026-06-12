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

function postRegenerate(projectName, fileName = '001.txt', onData) {
  return agent
    .post(`/api/projects/${encodeURIComponent(projectName)}/chapters/${fileName}/regenerate-stream`)
    .send({ model: 'deepseek-v4-pro', userPrompt: '  改写这一章  ' })
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
  const variantsDir = path.join(chaptersDir, 'variants');
  await fs.mkdir(variantsDir, { recursive: true });

  const originalContent = '# 原标题\n原始正文';
  const index = [
    {
      fileName: '001.txt',
      title: '原标题',
      createdAt: '2026-01-01T00:00:00.000Z',
      userPrompt: '原始要求',
      activeVersionId: 'v-existing',
      wordCount: 6,
      usedEventCards: ['existing-card.md'],
      versions: [
        { id: 'v-original', title: '原标题', userPrompt: '原始要求', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'v-existing', title: '已有候选', userPrompt: '已有要求', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    },
    {
      fileName: '002.txt',
      title: '后续章节',
      createdAt: '2026-01-03T00:00:00.000Z',
      activeVersionId: 'v-original',
      staleAfterRewrite: true,
      staleReason: '既有 stale 标记',
      staleFromFileName: '001.txt',
      staleAt: 123456,
    },
  ];
  const variants = {
    fileName: '001.txt',
    variants: [
      {
        id: 'v-original',
        createdAt: '2026-01-01T00:00:00.000Z',
        model: 'original',
        userPrompt: '原始要求',
        content: originalContent,
      },
      {
        id: 'v-existing',
        createdAt: '2026-01-02T00:00:00.000Z',
        model: 'deepseek-v4-flash',
        userPrompt: '已有要求',
        title: '已有候选',
        content: '已有候选正文',
        usedEventCards: ['existing-card.md'],
      },
    ],
  };

  await Promise.all([
    fs.writeFile(path.join(projectDir, 'world.md'), '测试世界观', 'utf8'),
    fs.writeFile(path.join(projectDir, 'characters.md'), '测试人物', 'utf8'),
    fs.writeFile(path.join(projectDir, 'style.md'), '测试文风', 'utf8'),
    fs.writeFile(path.join(chaptersDir, '001.txt'), originalContent, 'utf8'),
    fs.writeFile(path.join(chaptersDir, '002.txt'), '# 后续章节\n正文', 'utf8'),
    fs.writeFile(path.join(chaptersDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8'),
    fs.writeFile(path.join(variantsDir, '001.json'), JSON.stringify(variants, null, 2), 'utf8'),
  ]);
  return { chaptersDir, originalContent };
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiaomoxia-regenerate-stream-'));
  process.env.NODE_ENV = 'test';
  process.env.NOVELS_DIR = tmpDir;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.SESSION_SECRET = 'regenerate-stream-test-secret';
  process.env.XIAOMOXIA_PIN = '0000';

  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (!body.stream) throw new Error('unexpected non-stream request');
    const next = streamResponses.shift();
    if (!next) throw new Error('missing mocked stream response');
    return next;
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
  vi.unstubAllGlobals();
  delete process.env.NODE_ENV;
  delete process.env.NOVELS_DIR;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.SESSION_SECRET;
  delete process.env.XIAOMOXIA_PIN;
  await fs.rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('POST /api/projects/:projectName/chapters/:fileName/regenerate-stream', () => {
  it('保持 SSE 协议，并在 variants 与 index 落盘后发送 done', async () => {
    const { chaptersDir, originalContent } = await createProject('rewrite-success');
    const firstPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: '# 新标题\n' } }] })}\n\n`;
    const secondPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: '候选 正文' } }] })}\n\n`;
    streamResponses.push(createStreamResponse([firstPayload, secondPayload, 'data: [DONE]\n\n']));

    let doneSnapshot;
    const res = await postRegenerate('rewrite-success', '001.txt', (raw) => {
      if (!doneSnapshot && raw.includes('"type":"done"')) {
        doneSnapshot = {
          chapter: fsSync.readFileSync(path.join(chaptersDir, '001.txt'), 'utf8'),
          variants: JSON.parse(fsSync.readFileSync(path.join(chaptersDir, 'variants', '001.json'), 'utf8')),
          index: JSON.parse(fsSync.readFileSync(path.join(chaptersDir, 'index.json'), 'utf8')),
        };
      }
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(doneSnapshot.chapter).toBe(originalContent);
    expect(doneSnapshot.variants.fileName).toBe('001.txt');
    expect(doneSnapshot.variants.variants.filter((variant) => variant.id === 'v-original')).toHaveLength(1);

    const savedVariant = doneSnapshot.variants.variants.at(-1);
    expect(savedVariant).toMatchObject({
      model: 'deepseek-v4-pro',
      userPrompt: '改写这一章',
      title: '新标题',
      content: '# 新标题\n候选 正文',
    });
    expect(savedVariant.id).toMatch(/^v-\d+$/);
    expect(savedVariant.createdAt).toEqual(expect.any(String));
    expect(savedVariant).not.toHaveProperty('wordCount');

    const rewrittenEntry = doneSnapshot.index[0];
    expect(rewrittenEntry.activeVersionId).toBe('v-existing');
    expect(rewrittenEntry.wordCount).toBe(6);
    expect(rewrittenEntry.usedEventCards).toEqual(['existing-card.md']);
    expect(rewrittenEntry.versions.filter((version) => version.id === 'v-original')).toHaveLength(1);
    expect(rewrittenEntry.versions.at(-1)).toMatchObject({
      id: savedVariant.id,
      title: '新标题',
      userPrompt: '改写这一章',
      createdAt: savedVariant.createdAt,
    });
    expect(doneSnapshot.index[1]).toMatchObject({
      staleAfterRewrite: true,
      staleReason: '既有 stale 标记',
      staleFromFileName: '001.txt',
      staleAt: 123456,
    });

    const events = parseSse(res.body);
    expect(events.map((event) => event.type)).toEqual(['chunk', 'chunk', 'done']);
    expect(events[0]).toEqual({ type: 'chunk', content: '# 新标题\n' });
    expect(events[1]).toEqual({ type: 'chunk', content: '候选 正文' });
    expect(events[2]).toEqual({
      type: 'done',
      variant: savedVariant,
      debugPromptInfo: {
        taskType: 'novel.rewriteChapter',
        templateId: 'novel-rewrite',
        templateTitle: '章节重写',
        usedFallback: false,
      },
    });
  });

  it('能拼接跨网络 chunk 的 JSON，并忽略 [DONE]', async () => {
    await createProject('rewrite-split-json');
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: '拆包成功' } }] })}\n\n`;
    streamResponses.push(createStreamResponse([
      payload.slice(0, 10),
      payload.slice(10, 24),
      payload.slice(24),
      'data: [DONE]\n\n',
    ]));

    const events = parseSse((await postRegenerate('rewrite-split-json')).body);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'chunk', content: '拆包成功' });
    expect(events[1]).toMatchObject({ type: 'done', variant: { content: '拆包成功' } });
  });

  it('上游非 200 时发送 error，并在之后释放项目锁', async () => {
    await createProject('rewrite-upstream-error');
    streamResponses.push(new Response(JSON.stringify({ error: { message: 'upstream rejected' } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }));
    const failed = await postRegenerate('rewrite-upstream-error');
    expect(parseSse(failed.body)).toEqual([{ type: 'error', message: 'upstream rejected' }]);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '重试成功' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect(parseSse((await postRegenerate('rewrite-upstream-error')).body).at(-1))
      .toMatchObject({ type: 'done', variant: { content: '重试成功' } });
  });

  it('空流发送 error、不写入候选，并释放项目锁', async () => {
    const { chaptersDir } = await createProject('rewrite-empty-stream');
    const variantsPath = path.join(chaptersDir, 'variants', '001.json');
    const before = await fs.readFile(variantsPath, 'utf8');
    streamResponses.push(createStreamResponse(['data: [DONE]\n\n']));
    const failed = await postRegenerate('rewrite-empty-stream');
    expect(parseSse(failed.body)).toEqual([{ type: 'error', message: 'API 返回内容为空' }]);
    expect(await fs.readFile(variantsPath, 'utf8')).toBe(before);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '空流后重试' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postRegenerate('rewrite-empty-stream')).status).toBe(200);
  });

  it('读取上游流中途异常时发送 error，并释放项目锁', async () => {
    await createProject('rewrite-stream-error');
    const firstChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: '半段内容' } }] })}\n\n`;
    streamResponses.push(createErroringStreamResponse(firstChunk, 'network interrupted'));
    const failed = await postRegenerate('rewrite-stream-error');
    expect(parseSse(failed.body)).toEqual([
      { type: 'chunk', content: '半段内容' },
      { type: 'error', message: 'network interrupted' },
    ]);

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '异常后重试' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postRegenerate('rewrite-stream-error')).status).toBe(200);
  });

  it('同一项目并发重写保持既有 409 行为，完成后可再次获取锁', async () => {
    await createProject('rewrite-concurrent');
    const secondAgent = request.agent(app);
    await secondAgent.post('/api/auth/login').send({ pin: '0000' });
    const deferred = createDeferredStreamResponse();
    streamResponses.push(deferred.response);

    const firstRequest = postRegenerate('rewrite-concurrent').then((response) => response);
    while (vi.mocked(fetch).mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const conflict = await secondAgent
      .post('/api/projects/rewrite-concurrent/chapters/001.txt/regenerate-stream')
      .send({ model: 'deepseek-v4-flash', userPrompt: '再次改写' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toContain('当前项目正在生成或保存');

    deferred.finish('首个请求完成');
    expect(parseSse((await firstRequest).body).at(-1))
      .toMatchObject({ type: 'done', variant: { content: '首个请求完成' } });

    streamResponses.push(createStreamResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: '后续请求' } }] })}\n\n`,
      'data: [DONE]\n\n',
    ]));
    expect((await postRegenerate('rewrite-concurrent')).status).toBe(200);
  });
});
