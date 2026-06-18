export default function DesktopProjectLibrary({
  sortedProjects,
  currentProject,
  onHandleSelectProject,
  onSetDesktopView,
  onSetShowCreateForm,
  onSetCreateError,
  onRenameProject,
  onDeleteProject,
  formatProjectUpdatedAt,
  getProjectChapterCount,
}) {
  return (
    <section className="desktop-card desktop-project-library">
      <div className="desktop-editor-head">
        <div>
          <h2>项目库</h2>
          <div className="desktop-tabs">
            {/* 全部项目标签：当前是静态选中态，不触发请求或切换逻辑。 */}
            <button className="active" type="button">全部项目</button>
          </div>
        </div>
      </div>
      <div className="desktop-library-list">
        {sortedProjects.length > 0 ? sortedProjects.map((project) => (
          <div key={project.name} className="desktop-library-item">
            {/* 打开项目：加载项目详情并切回工作台，会改变当前项目状态。 */}
            <button
              type="button"
              className={"desktop-library-item-main" + (currentProject === project.name ? ' active' : '')}
              onClick={() => {
                onHandleSelectProject(project.name);
                onSetDesktopView('workbench');
              }}
            >
              <strong>{project.name}</strong>
              <span>{formatProjectUpdatedAt(project.updatedAt)} · {getProjectChapterCount(project)} 章 · {(Number(project.totalWords) || 0).toLocaleString()} 字</span>
            </button>
            <div className="desktop-library-item-actions">
              {/* 重命名项目：弹窗编辑项目名，不会立即请求后端。 */}
              <button type="button" className="desktop-library-action" title="重命名" onClick={(e) => {
                e.stopPropagation();
                const newName = window.prompt(`将「${project.name}」重命名为：`, project.name);
                if (newName && newName.trim() !== project.name) {
                  onRenameProject(project.name, newName.trim());
                }
              }}>✎</button>
              {/* 删除项目：二次确认后移入回收区。 */}
              <button type="button" className="desktop-library-action danger" title="删除项目" aria-label={`删除项目 ${project.name}`} onClick={(e) => {
                onDeleteProject(project.name, e);
              }}>✕</button>
            </div>
          </div>
        )) : (
          <p className="desktop-empty">暂无项目，请先创建一个小说项目。</p>
        )}
      </div>
    </section>
  );
}
