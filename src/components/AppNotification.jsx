export default function AppNotification({ notification, onClose }) {
  if (!notification) return null;

  return (
    <div className="notification-card">
      <div className="notification-header">
        <span className="notification-title">{notification.title}</span>
        {/* 关闭通知：只清除前端通知状态，不影响项目数据。 */}
        <button className="notification-close" onClick={onClose}>×</button>
      </div>
      <div className="notification-body">{notification.message}</div>
    </div>
  );
}
