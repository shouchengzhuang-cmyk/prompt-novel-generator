const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function apiFetch(url, options) {
  return fetch(API_BASE + url, options);
}

export async function safeJsonFetch(url, options) {
  const response = await apiFetch(url, options);
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('接口返回了非 JSON，可能是代理或后端路由未命中');
  }

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}
