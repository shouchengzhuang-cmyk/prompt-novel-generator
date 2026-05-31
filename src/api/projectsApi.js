import { apiFetch, safeJsonFetch } from '../api';

// ========== 项目 CRUD ==========

/** 获取项目列表 */
export function fetchProjects() {
  return safeJsonFetch('/api/projects');
}

/** 获取单个项目详情（包含章节列表） */
export function fetchProjectDetails(name) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`);
}

/** 创建新项目 */
export function createProject({ projectName, world, characters, style, summary }) {
  return safeJsonFetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectName, world, characters, style, summary }),
  });
}

/** 删除项目 */
export function deleteProject(name) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

/** 重命名项目 */
export function renameProject(name, newName) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(name)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName }),
  });
}

/** 更新项目设定 */
export function updateProjectSettings(name, settings) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

// ========== 章节操作 ==========

/** 读取章节内容 */
export function getChapterContent(projectName, fileName) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}`
  );
}

/** 删除章节 */
export function deleteChapter(projectName, fileName) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}`,
    { method: 'DELETE' }
  );
}

/** 保存章节标题 */
export function saveChapterTitle(projectName, fileName, title) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/title`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }
  );
}

/** 保存章节正文内容 */
export function saveChapterContent(projectName, fileName, { title, content }) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/content`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    }
  );
}

// ========== 生成 / 续写 ==========

/** 流式生成下一章 */
export function generateChapterStream(params) {
  return apiFetch('/api/generate-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

/** 非流式生成下一章（回退方案） */
export function generateChapter(params) {
  return safeJsonFetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    timeout: 180000,
  });
}

/** 流式重写指定章节 */
export function regenerateChapterStream(projectName, fileName, params) {
  return apiFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/regenerate-stream`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
}

// ========== 候选版本（Variants） ==========

/** 获取指定章节的候选版本列表 */
export function loadVariants(projectName, fileName) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/variants`
  );
}

/** 应用某个候选版本 */
export function applyVariant(projectName, fileName, variantId) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/variants/${encodeURIComponent(variantId)}/apply`,
    { method: 'PUT' }
  );
}

/** 确认保留被标记为“待检查”的章节 */
export function confirmKeepChapter(projectName, fileName) {
  return safeJsonFetch(
    `/api/projects/${encodeURIComponent(projectName)}/chapters/${encodeURIComponent(fileName)}/stale/confirm`,
    { method: 'PUT' }
  );
}

// ========== 大纲 ==========

/** 读取项目大纲 */
export function loadOutline(projectName) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/outline`);
}

/** 保存项目大纲 */
export function saveOutline(projectName, outline) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/outline`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outline }),
  });
}

// ========== 导出 / 备份 ==========

/** 导出全文 */
export function exportProject(projectName) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/export`);
}

/** 下载项目备份（返回 Response 需要手动处理 blob） */
export function backupProject(projectName) {
  return apiFetch(`/api/projects/${encodeURIComponent(projectName)}/backup`);
}

// ========== 摘要 / 索引 ==========

/** 重建剧情摘要 */
export function rebuildSummary(projectName) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/summary/rebuild`, {
    method: 'POST',
  });
}

/** 重建章节索引 */
export function rebuildChapterIndex(projectName) {
  return safeJsonFetch(`/api/projects/${encodeURIComponent(projectName)}/chapters/rebuild-index`, {
    method: 'POST',
  });
}
