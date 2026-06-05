import { describe, it, expect, beforeEach } from 'vitest';

const {
  acquireProjectLock,
  releaseProjectLock,
  withProjectLock,
  ProjectLockError,
} = require('../services/projectLocks');

describe('ProjectLockError', () => {
  it('包含 statusCode 409', () => {
    const err = new ProjectLockError('冲突');
    expect(err.message).toBe('冲突');
    expect(err.statusCode).toBe(409);
    expect(err.name).toBe('ProjectLockError');
  });
});

describe('acquireProjectLock / releaseProjectLock', () => {
  beforeEach(() => {
    // Clean all locks between tests by releasing every known project
    // Since the lock map is module-scoped and we can't access it directly,
    // we rely on explicit release in tests.
  });

  it('首次获取成功', () => {
    const got = acquireProjectLock('test-project-a', 'test-task');
    expect(got).toBe(true);
    releaseProjectLock('test-project-a');
  });

  it('同一项目第二次获取返回 false', () => {
    acquireProjectLock('test-project-b', 'task-1');
    const got = acquireProjectLock('test-project-b', 'task-2');
    expect(got).toBe(false);
    releaseProjectLock('test-project-b');
  });

  it('不同项目互不阻塞', () => {
    acquireProjectLock('project-1', 'task-1');
    const got = acquireProjectLock('project-2', 'task-2');
    expect(got).toBe(true);
    releaseProjectLock('project-1');
    releaseProjectLock('project-2');
  });

  it('释放后可以再次获取', () => {
    acquireProjectLock('test-project-c', 'task-1');
    releaseProjectLock('test-project-c');
    const got = acquireProjectLock('test-project-c', 'task-2');
    expect(got).toBe(true);
    releaseProjectLock('test-project-c');
  });
});

describe('withProjectLock', () => {
  it('正常执行 fn 并返回结果', async () => {
    const result = await withProjectLock('p-1', 'task', async () => {
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('锁冲突时抛出 ProjectLockError', async () => {
    acquireProjectLock('p-2', 'blocker');
    try {
      await withProjectLock('p-2', 'new-task', async () => {
        return 'should not run';
      });
      expect.unreachable('应该抛异常');
    } catch (err) {
      expect(err).toBeInstanceOf(ProjectLockError);
      expect(err.statusCode).toBe(409);
    } finally {
      releaseProjectLock('p-2');
    }
  });

  it('fn 抛出异常时锁仍然释放，后续可重入', async () => {
    try {
      await withProjectLock('p-3', 'fail-task', async () => {
        throw new Error('fn 内部错误');
      });
    } catch {
      // expected
    }
    // 锁应已释放，可以重新获取
    const got = await withProjectLock('p-3', 'retry', async () => {
      return 'retried';
    });
    expect(got).toBe('retried');
  });

  it('projectName 为空时抛出普通 Error', async () => {
    try {
      await withProjectLock('', 'task', async () => 'x');
      expect.unreachable('应该抛异常');
    } catch (err) {
      expect(err).not.toBeInstanceOf(ProjectLockError);
      expect(err.message).toContain('invalid projectName');
    }
  });
});
