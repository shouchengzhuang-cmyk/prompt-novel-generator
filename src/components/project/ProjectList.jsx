import ProjectCard from './ProjectCard';

export default function ProjectList({
  projects,
  currentProject,
  projectSort,
  isCollapsed,
  onSortChange,
  onSelect,
  onDelete,
  onCreate,
  onRefresh,
  onToggle,
}) {
  return (
    <section className="sidebar-section">
      <div className="sidebar-section-header">
        <h2>项目</h2>
        <div className="sidebar-section-actions">
          {!isCollapsed && <button className="btn" onClick={onRefresh}>刷新</button>}
          <button className="btn btn-secondary" onClick={onToggle}>
            {isCollapsed ? '展开' : '收起'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="sidebar-section-body">
          <div className="project-sort-controls">
            <select
              className="project-sort-field"
              value={projectSort.field}
              onChange={(e) => onSortChange((prev) => ({ ...prev, field: e.target.value }))}
            >
              <option value="updatedAt">按修改日期</option>
              <option value="name">按名称</option>
              <option value="size">按大小</option>
            </select>
            <select
              className="project-sort-order"
              value={projectSort.order}
              onChange={(e) => onSortChange((prev) => ({ ...prev, order: e.target.value }))}
            >
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
          <div className="project-list project-list-scroll">
            {projects.length === 0 && (
              <p className="hint">暂无项目，请创建一个</p>
            )}
            {projects.map((p) => (
              <ProjectCard
                key={p.name}
                project={p}
                isActive={currentProject === p.name}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
          </div>

          <button className="btn btn-secondary" onClick={onCreate}>
            + 创建项目
          </button>
        </div>
      )}
    </section>
  );
}
