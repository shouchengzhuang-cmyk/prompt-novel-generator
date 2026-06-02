import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Import CJS module via vitest's interop
import * as storage from '../services/storage.js';

/** Create a temp directory for each test group */
let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ----------------------------------------------------------------
// atomicWrite
// ----------------------------------------------------------------
describe('atomicWrite', () => {
  it('写入字符串后内容正确', async () => {
    const filePath = path.join(tmpDir, 'hello.txt');
    await storage.atomicWrite(filePath, '你好，小墨匣');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('你好，小墨匣');
  });

  it('写入 Buffer 后内容正确', async () => {
    const filePath = path.join(tmpDir, 'data.bin');
    const buf = Buffer.from([0x00, 0x66, 0xff]);
    await storage.atomicWrite(filePath, buf);
    const result = await fs.readFile(filePath);
    expect([...result]).toEqual([0x00, 0x66, 0xff]);
  });

  it('写入后 .tmp 临时文件被清除', async () => {
    const filePath = path.join(tmpDir, 'clean.txt');
    await storage.atomicWrite(filePath, 'no trace');
    const tmpPath = path.join(tmpDir, '.clean.txt.tmp');
    await expect(fs.access(tmpPath)).rejects.toThrow();
  });

  it('覆盖已有文件不丢内容', async () => {
    const filePath = path.join(tmpDir, 'override.txt');
    await storage.atomicWrite(filePath, 'version 1');
    await storage.atomicWrite(filePath, 'version 2 覆盖版本');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('version 2 覆盖版本');
  });

  it('大文本写入后读取完整', async () => {
    const filePath = path.join(tmpDir, 'large.txt');
    const bigData = 'x'.repeat(100_000);
    await storage.atomicWrite(filePath, bigData);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content.length).toBe(100_000);
  });

  it('不存在的目录写入时抛异常（不破坏原文件）', async () => {
    const filePath = path.join(tmpDir, 'nonexistent', 'file.txt');
    await expect(storage.atomicWrite(filePath, '数据')).rejects.toThrow();
    // 原始文件本就不存在，无破坏可言
    // 验证异常类型为 ENOENT
    try {
      await storage.atomicWrite(filePath, '数据');
    } catch (err) {
      expect(err.code).toBe('ENOENT');
    }
  });
});

// ----------------------------------------------------------------
// writeJson / readJson
// ----------------------------------------------------------------
describe('writeJson / readJson', () => {
  it('写入后读取一致（含中文）', async () => {
    const filePath = path.join(tmpDir, 'data.json');
    const obj = { name: '小墨匣', version: 1, tags: ['小说', 'AI'] };
    await storage.writeJson(filePath, obj);
    const loaded = await storage.readJson(filePath);
    expect(loaded).toEqual(obj);
  });

  it('空对象序列化正常', async () => {
    const filePath = path.join(tmpDir, 'empty.json');
    await storage.writeJson(filePath, {});
    const loaded = await storage.readJson(filePath);
    expect(loaded).toEqual({});
  });

  it('数组写入读取正常', async () => {
    const filePath = path.join(tmpDir, 'arr.json');
    const arr = [{ id: 1 }, { id: 2 }];
    await storage.writeJson(filePath, arr);
    const loaded = await storage.readJson(filePath);
    expect(loaded).toEqual(arr);
  });

  it('输出为 pretty-printed JSON（含换行和缩进）', async () => {
    const filePath = path.join(tmpDir, 'pretty.json');
    await storage.writeJson(filePath, { a: 1, b: 2 });
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toContain('\n');
    expect(raw).toContain('  ');
  });
});

// ----------------------------------------------------------------
// writeText / readText
// ----------------------------------------------------------------
describe('writeText / readText', () => {
  it('写入后读取一致（含多行中文）', async () => {
    const filePath = path.join(tmpDir, 'article.txt');
    await storage.writeText(filePath, '第一章 觉醒\n\n阳光透过窗帘洒进来。');
    const loaded = await storage.readText(filePath);
    expect(loaded).toBe('第一章 觉醒\n\n阳光透过窗帘洒进来。');
  });

  it('空字符串写入读取正常', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    await storage.writeText(filePath, '');
    const loaded = await storage.readText(filePath);
    expect(loaded).toBe('');
  });
});
