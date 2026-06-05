/**
 * 项目级轻量并发锁
 * 同一项目串行高风险写入，不同项目互不阻塞。
 * 冲突返回 409，不做队列。
 */
const locks = new Map();

class ProjectLockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProjectLockError';
    this.statusCode = 409;
  }
}

function acquireProjectLock(projectName, taskName) {
  if (locks.has(projectName)) {
    const existing = locks.get(projectName);
    console.warn(`[项目锁] 冲突 project=${projectName} 现有=${existing.taskName} 新=${taskName}`);
    return false;
  }
  locks.set(projectName, { taskName, acquiredAt: Date.now() });
  console.log(`[项目锁] 已获取 project=${projectName} task=${taskName}`);
  return true;
}

function releaseProjectLock(projectName) {
  const entry = locks.get(projectName);
  if (entry) {
    console.log(`[项目锁] 已释放 project=${projectName} task=${entry.taskName}`);
    locks.delete(projectName);
  }
}

/**
 * 获取锁 → 执行 fn → finally 释放锁。
 * 锁冲突时抛 ProjectLockError（statusCode 409）。
 * fn 自身的异常会正常冒泡，锁仍在 finally 中释放。
 */
async function withProjectLock(projectName, taskName, fn) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('projectLocks: invalid projectName');
  }
  if (!acquireProjectLock(projectName, taskName)) {
    throw new ProjectLockError('当前项目正在生成或保存，请稍后再试');
  }
  try {
    return await fn();
  } finally {
    releaseProjectLock(projectName);
  }
}

module.exports = { acquireProjectLock, releaseProjectLock, withProjectLock, ProjectLockError };
