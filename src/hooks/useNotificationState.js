import { useCallback, useEffect, useState } from 'react';

export function useNotificationState() {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 10000);
    return () => clearTimeout(timer);
  }, [notification]);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return {
    notification,
    setNotification,
    clearNotification,
  };
}
