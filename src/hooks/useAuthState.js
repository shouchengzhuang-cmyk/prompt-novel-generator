import { useState, useEffect, useCallback } from 'react';
import { safeJsonFetch, setOnAuthExpired } from '../api';

export function useAuthState() {
  const [authenticated, setAuthenticated] = useState(null);
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginPinVisible, setLoginPinVisible] = useState(false);

  const authChecking = authenticated === null;

  useEffect(() => {
    safeJsonFetch('/api/auth/me')
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));

    setOnAuthExpired(() => {
      setAuthenticated(false);
      setLoginPin('');
      setLoginPinVisible(false);
      setLoginError('登录已过期，请重新输入 PIN');
    });
  }, []);

  const handleLogin = useCallback(async () => {
    if (loginPin.length !== 4) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      await safeJsonFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: loginPin }),
      });
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err.message || '密码错误');
    } finally {
      setLoginLoading(false);
    }
  }, [loginPin]);

  const handleLogout = useCallback(async () => {
    try {
      await safeJsonFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    setAuthenticated(false);
    setLoginPin('');
    setLoginPinVisible(false);
  }, []);

  return {
    isAuthenticated: authenticated,
    authChecking,
    password: loginPin,
    setPassword: setLoginPin,
    showPassword: loginPinVisible,
    setShowPassword: setLoginPinVisible,
    loginError,
    setLoginError,
    loginLoading,
    handleLogin,
    handleLogout,
  };
}
