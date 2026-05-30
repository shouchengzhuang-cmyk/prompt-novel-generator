export default function MobileAllProjectsPage({
  sortedProjects,
  allProjectDetails,
  getProjectIntro,
  formatProjectUpdatedAt,
  getProjectChapterCount,
  onHomeProjectOpen,
  onBackClick,
}) {
  return (
    <div className="panel panel-main mobile-all-projects-view">
      {/* 返回上一层：走应用内返回逻辑，只切换移动端视图。 */}
      <button className="mobile-back-btn" onClick={onBackClick}>
        ← 返回
      </button>
      <header className="mobile-outline-header">
        <span>小墨匣</span>
        <h2>全部项目</h2>
      </header>
      {sortedProjects.length === 0 ? (
        <div className="mobile-outline-empty">还没有项目，先创建一个故事吧。</div>
      ) : (
        <div className="mobile-all-projects-list">
          {[...sortedProjects].sort((a, b) => b.updatedAt - a.updatedAt).map((project) => {
            const details = allProjectDetails[project.name];
            return (
              /* 打开项目：加载所选项目详情并进入移动端项目页，会改变当前项目状态。 */
              <button
                className="mobile-all-project-card"
                key={project.name}
                type="button"
                onClick={() => onHomeProjectOpen(project.name)}
              >
                <span className="mobile-project-initial">{project.name.charAt(0)}</span>
                <div>
                  <strong>{project.name}</strong>
                  <em>{formatProjectUpdatedAt(project.updatedAt)} · 第 {getProjectChapterCount(project)} 章</em>
                  <p>{getProjectIntro(details)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
