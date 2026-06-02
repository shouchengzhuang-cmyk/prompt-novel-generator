import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 在 import 模块前 mock fetch
let mockFetch;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);

  // 默认环境变量不设置（使 checkConfig 返回 false）
  delete process.env.XMX_FEISHU_WEBHOOK;
  delete process.env.XMX_FEISHU_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ----------------------------------------------------------------
// checkConfig
// ----------------------------------------------------------------
describe('checkConfig', () => {
  it('环境变量缺失时返回 ok: false', async () => {
    const { checkConfig } = await import('../services/feishuNotifier.js');
    const result = checkConfig();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('XMX_FEISHU_WEBHOOK');
  });

  it('WEBHOOK 配置但 SECRET 缺失时返回 ok: false', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    const { checkConfig } = await import('../services/feishuNotifier.js');
    const result = checkConfig();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('XMX_FEISHU_SECRET');
  });

  it('全部配置时返回 ok: true', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret-value';
    const mod = await import('../services/feishuNotifier.js');
    // 每次调用 import 会返回同一模块，需要用 refetch
    const result = mod.checkConfig();
    expect(result.ok).toBe(true);
  });
});

// ----------------------------------------------------------------
// formatReportMessage
// ----------------------------------------------------------------
describe('formatReportMessage', () => {
  it('构建标准 XMX_REPORT 前缀', async () => {
    const { formatReportMessage } = await import('../services/feishuNotifier.js');
    const msg = formatReportMessage('构建通过，测试通过', '收尾报告');

    expect(msg).toContain('XMX_REPORT');
    expect(msg).toContain('项目：小墨匣');
    expect(msg).toContain('助手：莉莉丝');
    expect(msg).toContain('类型：收尾报告');
    expect(msg).toContain('构建通过，测试通过');
  });

  it('不传 type 时默认收尾报告', async () => {
    const { formatReportMessage } = await import('../services/feishuNotifier.js');
    const msg = formatReportMessage('测试内容');
    expect(msg).toContain('类型：收尾报告');
  });

  it('传 type 时可自定义报告类型', async () => {
    const { formatReportMessage } = await import('../services/feishuNotifier.js');
    const msg = formatReportMessage('测试内容', '构建报告');
    expect(msg).toContain('类型：构建报告');
  });

  it('空内容不炸', async () => {
    const { formatReportMessage } = await import('../services/feishuNotifier.js');
    const msg = formatReportMessage('');
    expect(msg).toContain('XMX_REPORT');
  });
});

// ----------------------------------------------------------------
// sendFeishuMessage
// ----------------------------------------------------------------
describe('sendFeishuMessage', () => {
  it('环境变量缺失时不调用 fetch，返回 ok: false', async () => {
    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('发送成功时返回 ok: true', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret';

    mockFetch.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ code: 0 })),
    });

    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('飞书返回业务错误时返回 ok: false', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret';

    mockFetch.mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ code: 10003, msg: 'invalid sign' })),
    });

    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('10003');
  });

  it('HTTP 错误时返回 ok: false', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret';

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      text: vi.fn().mockResolvedValue('Forbidden'),
    });

    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('403');
  });

  it('错误消息不暴露 webhook URL', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret';

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    });

    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.error).not.toContain('open.feishu.cn');
    expect(result.error).not.toContain('webhook');
  });

  it('网络异常时返回 ok: false 且不抛未捕获异常', async () => {
    process.env.XMX_FEISHU_WEBHOOK = 'https://open.feishu.cn/webhook/test';
    process.env.XMX_FEISHU_SECRET = 'test-secret';

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const { sendFeishuMessage } = await import('../services/feishuNotifier.js');
    const result = await sendFeishuMessage('测试消息');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});
