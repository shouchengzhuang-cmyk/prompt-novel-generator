export default function ProjectCard({ project, isActive, onSelect, onDelete }) {
  return (
    <div key={project.name} className="project-item-wrap">
      <div
        className={'project-item' + (isActive ? ' active' : '')}
        onClick={() => onSelect(project.name)}
      >
        <span className="project-name">{project.name}</span>
      </div>
      <button className="delete-btn project-delete" onClick={(e) => onDelete(project.name, e)}>删除</button>
    </div>
  );
}
