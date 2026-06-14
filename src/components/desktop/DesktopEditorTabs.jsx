export default function DesktopEditorTabs({
  desktopEditorTab,
  onSetDesktopEditorTab,
  onOpenSettings,
}) {
  return (
    <div className="desktop-tabs">
      {['总览', '写作', '设定', '版本记录'].map((tab) => {
        const tabKey = tab === '总览' ? 'overview' : tab === '写作' ? 'writing' : tab === '设定' ? 'settings' : 'versions';
        return (
          <button
            key={tab}
            className={desktopEditorTab === tabKey ? 'active' : ''}
            type="button"
            onClick={() => {
              onSetDesktopEditorTab(tabKey);
              if (tabKey === 'settings') onOpenSettings();
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
