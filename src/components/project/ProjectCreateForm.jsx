export default function ProjectCreateForm({
  form,
  onSubmit,
  onCancel,
  className = '',
  actionsClass = 'form-actions',
  submitLabel = '创建项目',
}) {
  return (
    <section className={className}>
      <h2>创建新项目</h2>
      <label>项目名</label>
      <input value={form.newProjectName} onChange={(e) => form.setNewProjectName(e.target.value)} placeholder="输入项目名称" />
      <label>世界观设定</label>
      <textarea value={form.newWorld} onChange={(e) => form.setNewWorld(e.target.value)} placeholder="描述世界观设定..." rows={4} />
      <label>人物设定</label>
      <textarea value={form.newCharacters} onChange={(e) => form.setNewCharacters(e.target.value)} placeholder="描述主要人物..." rows={4} />
      <label>写作规则 / 风格要求</label>
      <textarea value={form.newStyle} onChange={(e) => form.setNewStyle(e.target.value)} placeholder="文风要求、篇幅要求、写作规则…" rows={4} />
      <label>剧情摘要（可选）</label>
      <textarea value={form.newSummary} onChange={(e) => form.setNewSummary(e.target.value)} placeholder="剧情摘要…" rows={3} />
      {form.createError && <div className="error">{form.createError}</div>}
      <div className={actionsClass}>
        <button className="btn" disabled={form.creating} onClick={onSubmit}>
          {form.creating ? '创建中...' : submitLabel}
        </button>
        <button className="btn btn-secondary" disabled={form.creating} onClick={onCancel}>取消</button>
      </div>
    </section>
  );
}
