export default function ProjectCard({ project, isActive, onSelect, onDelete }) {
  return (
    <div key={project.name} className="project-item-wrap">
      <div
        className={'project-item' + (isActive ? ' active' : '')}
        onClick={() => onSelect(project.name)}
      >
        <span className="project-name">{project.name}</span>
      </div>
      {/* 删除项目：调用父级删除流程，预期会触发后端删除项目；确认逻辑由父级 handler 负责。 */}
      <button className="delete-btn project-delete" onClick={(e) => onDelete(project.name, e)}>删除</button>
    </div>
  );
}
