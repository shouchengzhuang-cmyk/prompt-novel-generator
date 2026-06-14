export default function DesktopMainNav({ desktopView, onDesktopNav }) {
  return (
    <nav className="desktop-mainnav" aria-label="主导航">
      {[
        ['⌂', '工作台', true],
        ['▣', '项目库'],
        ['◎', '世界观'],
        ['♙', '人物'],
        ['☷', '章节'],
        ['◇', '素材'],
        ['☰', '大纲'],
        ['⚙', '设置'],
      ].map(([icon, label]) => {
        const navActive =
          (label === '工作台' && desktopView === 'workbench') ||
          (label === '项目库' && desktopView === 'projects') ||
          (label === '世界观' && desktopView === 'world') ||
          (label === '人物' && desktopView === 'characters') ||
          (label === '章节' && desktopView === 'workbench') ||
          (label === '素材' && desktopView === 'materials') ||
          (label === '大纲' && desktopView === 'outline') ||
          (label === '设置' && desktopView === 'settings');
        return (
          /* 桌面主导航：根据 label 切换前端工作区视图；未实现项只显示开发中提示。 */
          <button
            key={label}
            className={navActive ? 'active' : ''}
            type="button"
            onClick={() => onDesktopNav(label)}
          >
            <span>{icon}</span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
