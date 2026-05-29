const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Track global auth callback so any component can register it
let onAuthExpired = null;

export function setOnAuthExpired(cb) {
  onAuthExpired = cb;
}

async function handleResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('接口返回了非 JSON，可能是代理或后端路由未命中');
  }

  if (response.status === 401) {
    // Notify auth layer to redirect to login page
    if (onAuthExpired) onAuthExpired();
    throw new Error(data.error || '登录已过期，请重新输入 PIN');
  }

  if (!response.ok) {
    throw new Error(data.error || '请求失败');
  }

  return data;
}

export async function apiFetch(url, options) {
  return fetch(API_BASE + url, {
    credentials: 'include',
    ...options,
  });
}

export async function safeJsonFetch(url, options) {
  const response = await apiFetch(url, options);
  return handleResponse(response);
}
