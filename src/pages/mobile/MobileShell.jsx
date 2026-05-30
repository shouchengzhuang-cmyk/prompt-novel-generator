export default function MobileShell({ isSidebarCollapsed, children }) {
  return (
    <div className={`container app-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {/* 旧 app-shell：现在只在移动端渲染，避免桌面端与 ProjectWorkspacePage 重复。 */}
      {children}
    </div>
  );
}
