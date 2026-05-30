export default function MobileOutlinePage({
  currentProject,
  projectDetails,
  outline,
  formatOutlinePlan,
  openSettingsEditor,
  navigateTo,
  onSetShowOutline,
  onBackClick,
}) {
  const sections = [
    ['剧情摘要', projectDetails?.summary],
    ['编辑记忆', projectDetails?.editorialMemory],
    ['世界观', projectDetails?.world],
    ['写作规则', projectDetails?.style],
  ].filter(([, value]) => value && String(value).trim());
  const plan = formatOutlinePlan(outline);

  return (
    <div className="panel panel-main mobile-outline-view">
      {/* 返回项目页：走应用内返回逻辑，不保存大纲或设定。 */}
      <button className="mobile-back-btn" onClick={onBackClick}>
        ← 返回
      </button>
      <header className="mobile-outline-header">
        <span>{currentProject}</span>
        <h2>大纲</h2>
      </header>
      {sections.length === 0 && plan.length === 0 ? (
        <div className="mobile-outline-empty">还没有剧情摘要，去编辑设定里补一点。</div>
      ) : (
        <div className="mobile-outline-sections">
          {sections.map(([title, value]) => (
            <section className="mobile-outline-card" key={title}>
              <h3>{title}</h3>
              <p>{value}</p>
            </section>
          ))}
          {plan.length > 0 && (
            <section className="mobile-outline-card">
              <h3>章节规划</h3>
              <div className="mobile-outline-plan">
                {plan.map((item) => (
                  <div className="mobile-outline-plan-item" key={item.number}>
                    <span>{item.number}</span>
                    <div>
                      <strong>{item.title}</strong>
                      {item.detail && <p>{item.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <div className="mobile-outline-actions">
        {/* 编辑剧情摘要：打开项目设定编辑并定位摘要，不会立即保存。 */}
        <button className="btn" onClick={() => { openSettingsEditor(projectDetails, currentProject, 'summary'); navigateTo('project'); }}>
          编辑剧情摘要
        </button>
        {/* 编辑章节规划：切换到项目页并打开大纲编辑面板，不会立即保存。 */}
        <button className="btn btn-secondary" onClick={() => { onSetShowOutline(true); navigateTo('project'); }}>
          编辑章节规划
        </button>
      </div>
    </div>
  );
}
