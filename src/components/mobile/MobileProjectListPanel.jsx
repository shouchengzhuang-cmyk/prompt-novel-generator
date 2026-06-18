export default function MobileProjectListPanel({
  projects,
  allProjectDetails,
  getProjectIntro,
  formatProjectUpdatedAt,
  getProjectChapterCount,
  onOpenProject,
  onDeleteProject,
}) {
  if (projects.length === 0) {
    return <div className="mobile-outline-empty">还没有项目，先创建一个故事吧。</div>;
  }

  return (
    <div className="mobile-all-projects-list">
      {[...projects].sort((a, b) => b.updatedAt - a.updatedAt).map((project) => {
        const details = allProjectDetails[project.name];
        return (
          /* 打开项目：加载所选项目详情并进入移动端项目页，会改变当前项目状态。 */
          <div
            className="mobile-all-project-card"
            key={project.name}
            onClick={() => onOpenProject(project.name)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenProject(project.name);
              }
            }}
          >
            <span className="mobile-project-initial">{project.name.charAt(0)}</span>
            <div className="mobile-all-project-card-main">
              <strong>{project.name}</strong>
              <em>{formatProjectUpdatedAt(project.updatedAt)} · 第 {getProjectChapterCount(project)} 章</em>
              <p>{getProjectIntro(project, details)}</p>
            </div>
            {onDeleteProject && (
              <button
                className="mobile-all-project-delete"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteProject(project.name);
                }}
              >
                删除
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
